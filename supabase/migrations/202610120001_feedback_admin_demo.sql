-- Additive upgrade. Apply after 202609210001; do not rerun the original migration.
begin;

-- Reviewed for the 2026-10-30 Data API default-grant change:
-- this upgrade creates NO public tables/views/sequences. Existing table and
-- column grants from 202609210001 remain valid (including SELECT of new columns).
-- New RPCs opt in explicitly below; no ALL TABLES/default-privilege grants.

alter table public.profiles
  add column role text not null default 'student' check (role in ('student','admin')),
  add column is_demo boolean not null default false;
alter table public.listings
  add column is_demo boolean not null default false,
  add column seed_key text unique,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id);
create index listings_visible_idx on public.listings(status,created_at desc) where archived_at is null;
comment on column public.profiles.role is 'Managed only by a trusted database administrator, never signup metadata.';
comment on column public.listings.is_demo is 'Synthetic catalog content; cannot participate in real reservations or impact.';

create function public.is_kostcycle_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and not is_demo);
$$;
revoke all on function public.is_kostcycle_admin() from public,anon,authenticated;
grant execute on function public.is_kostcycle_admin() to anon,authenticated;

-- Existing profile column grants deliberately do NOT include role/is_demo.
-- Existing student policies are tightened; no real records are deleted or rewritten.
alter policy listings_read on public.listings
  using (archived_at is null or seller_id = (select auth.uid()) or (select public.is_kostcycle_admin()));
alter policy listings_update_self_available on public.listings
  using (seller_id = (select auth.uid()) and status = 'AVAILABLE' and archived_at is null and not is_demo)
  with check (seller_id = (select auth.uid()) and status = 'AVAILABLE' and archived_at is null and not is_demo);
alter policy listings_delete_self_available on public.listings
  using (seller_id = (select auth.uid()) and status = 'AVAILABLE' and archived_at is null and not is_demo);
create policy reservations_admin_read on public.reservations for select to authenticated
  using ((select public.is_kostcycle_admin()));
create policy listings_admin_moderate on public.listings for update to authenticated
  using ((select public.is_kostcycle_admin())) with check ((select public.is_kostcycle_admin()));
grant update(archived_at,archived_by) on public.listings to authenticated;

-- Optional NODE-ONLY seed: declare its minimum Data API privileges explicitly.
-- service_role is a trusted server/local administrator, NEVER a browser role/key.
-- Existing wider service_role grants are preserved; no student gains these grants.
grant usage on schema public to service_role;
grant select(id,role,is_demo), update(is_demo) on public.profiles to service_role;
grant select(seed_key,is_demo,seller_id,archived_at) on public.listings to service_role;
grant insert(seller_id,name,category,condition,price,university,campus,residence,
  distance,pickup,description,image_index,image_data,is_demo,seed_key)
  on public.listings to service_role;
grant execute on function public.kostcycle_category_weight(text) to service_role;

-- RLS policies combine with OR, so a trigger also protects moderation columns
-- and prevents admins from using their policy to edit somebody else's content.
create function kostcycle_private.guard_listing_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    if (to_jsonb(new) - array['archived_at','archived_by','updated_at','is_free','estimated_weight']) is distinct from
       (to_jsonb(old) - array['archived_at','archived_by','updated_at','is_free','estimated_weight']) then
      if old.seller_id <> auth.uid() or old.status <> 'AVAILABLE' or old.archived_at is not null or old.is_demo then
        raise exception 'Only the seller can edit available, unarchived student listings.';
      end if;
    end if;
    if new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by then
      if not public.is_kostcycle_admin() then raise exception 'Admin access required.'; end if;
      if old.status <> 'AVAILABLE' then raise exception 'Only available listings can be archived or restored.'; end if;
      new.archived_by := case when new.archived_at is null then null else auth.uid() end;
      new.archived_at := case when new.archived_at is null then null else now() end;
    end if;
  end if;
  return new;
end;
$$;
create trigger listings_moderation_guard before update on public.listings
  for each row execute function kostcycle_private.guard_listing_changes();

create function public.moderate_listing(p_listing_id uuid, p_archive boolean) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_kostcycle_admin() then raise exception 'Admin access required.'; end if;
  if p_archive is null then raise exception 'Choose archive or restore.'; end if;
  update public.listings set archived_at = case when p_archive then now() else null end,
    archived_by = case when p_archive then auth.uid() else null end
    where id = p_listing_id and status = 'AVAILABLE';
  if not found then raise exception 'Listing is missing or already reserved.'; end if;
end;
$$;
revoke all on function public.moderate_listing(uuid,boolean) from public,anon,authenticated;
grant execute on function public.moderate_listing(uuid,boolean) to authenticated;

-- This protects the ORIGINAL reserve_item RPC too, without rewriting it.
-- Its listing row lock is shared with archive updates, serializing both actions.
create function kostcycle_private.guard_reservation_catalog() returns trigger
language plpgsql security definer set search_path = '' as $$
declare item public.listings%rowtype;
begin
  select * into item from public.listings where id = new.listing_id for update;
  if item.archived_at is not null then raise exception 'This listing has been archived.'; end if;
  if item.is_demo or exists(select 1 from public.profiles where id in (new.buyer_id,new.seller_id) and is_demo) then
    raise exception 'Demo listings are for browsing only. Reserve a student listing to arrange a real pickup.';
  end if;
  return new;
end;
$$;
create trigger reservations_catalog_guard before insert on public.reservations
  for each row execute function kostcycle_private.guard_reservation_catalog();
revoke all on function kostcycle_private.guard_listing_changes(), kostcycle_private.guard_reservation_catalog() from public,anon,authenticated;

-- New columns travel with existing table Realtime events. Pickup secrets stay private.
notify pgrst, 'reload schema';
commit;
