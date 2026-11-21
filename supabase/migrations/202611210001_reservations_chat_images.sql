-- KostCycle: reservation cancel + expiry, buyer/seller chat, listing images in
-- Supabase Storage, and saved onboarding interests.
-- Apply once, after 202610260001_binus_student_email.sql. Additive: existing
-- rows are kept. Every new table/function opts in to the Data API explicitly
-- (no default grants are relied on; see the 2026-10-30 Supabase change).
begin;

-- ---------------------------------------------------------------------------
-- 1. Reservations: cancel and expiry
-- ---------------------------------------------------------------------------
alter table public.reservations
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles(id) on delete set null,
  add column expires_at timestamptz not null default now() + interval '48 hours';
comment on column public.reservations.expires_at is
  'Unconfirmed pickups are released after this time by expire_overdue_reservations().';

-- The original status checks were auto-named, and listing_id was UNIQUE (one
-- reservation per listing forever). Replace both so a cancelled or expired
-- reservation stays as history while the item can be reserved again.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.reservations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.reservations drop constraint %I', c.conname);
  end loop;
  for c in
    select conname from pg_constraint
    where conrelid = 'public.reservations'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (listing_id)'
  loop
    execute format('alter table public.reservations drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.reservations
  add constraint reservations_status_check
    check (status in ('RESERVED','COMPLETED','CANCELLED','EXPIRED')),
  add constraint reservations_lifecycle_check check (
    (status = 'RESERVED' and completed_at is null and cancelled_at is null)
    or (status = 'COMPLETED' and completed_at is not null and cancelled_at is null)
    or (status in ('CANCELLED','EXPIRED') and cancelled_at is not null and completed_at is null));
create unique index reservations_one_live_per_listing
  on public.reservations(listing_id) where status in ('RESERVED','COMPLETED');
create index reservations_expiry_idx on public.reservations(expires_at) where status = 'RESERVED';

-- 48 hours, but never before the end of the day after the chosen pickup date
-- (Jakarta time), so a "This weekend" pickup is not released early.
create function kostcycle_private.set_reservation_expiry() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.expires_at := greatest(
    now() + interval '48 hours',
    (new.pickup_date + 2)::timestamp at time zone 'Asia/Jakarta');
  return new;
end;
$$;
create trigger reservations_set_expiry before insert on public.reservations
  for each row execute function kostcycle_private.set_reservation_expiry();

-- Shared release step: end the reservation, delete its pickup code, reopen the listing.
create function kostcycle_private.release_reservation(p_id uuid, p_status text, p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.reservations%rowtype;
begin
  if p_status not in ('CANCELLED','EXPIRED') then raise exception 'Invalid release status.'; end if;
  update public.reservations
    set status = p_status, cancelled_at = now(), cancelled_by = p_by
    where id = p_id and status = 'RESERVED'
    returning * into v;
  if not found then return; end if;
  delete from kostcycle_private.pickup_secrets where reservation_id = p_id;
  update public.listings set status = 'AVAILABLE' where id = v.listing_id and status = 'RESERVED';
end;
$$;

-- Buyer or seller may cancel while the pickup is still pending.
create function public.cancel_reservation(p_listing_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v public.reservations%rowtype;
begin
  if v_user is null then raise exception 'Sign in to cancel a reservation.'; end if;
  -- Same lock order as reserve_item/confirm_handoff: listing first, then reservation.
  perform 1 from public.listings where id = p_listing_id for update;
  select * into v from public.reservations
    where listing_id = p_listing_id and status = 'RESERVED' for update;
  if not found then raise exception 'There is no active reservation to cancel.'; end if;
  if v_user not in (v.buyer_id, v.seller_id) then
    raise exception 'Only the buyer or seller can cancel this reservation.';
  end if;
  perform kostcycle_private.release_reservation(v.id, 'CANCELLED', v_user);
  return v.id;
end;
$$;

-- Releases every overdue pickup. Safe for anyone to call (it only ever expires
-- reservations whose time is up); the app calls it on its 30 s reconcile, so
-- no pg_cron job is needed. Rows locked by a concurrent handoff are skipped.
create function public.expire_overdue_reservations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, listing_id from public.reservations
    where status = 'RESERVED' and expires_at <= now()
    order by expires_at limit 200
  loop
    perform 1 from public.listings where id = r.listing_id for update skip locked;
    if not found then continue; end if;
    perform 1 from public.reservations
      where id = r.id and status = 'RESERVED' and expires_at <= now() for update skip locked;
    if not found then continue; end if;
    perform kostcycle_private.release_reservation(r.id, 'EXPIRED', null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- reserve_item now clears overdue pickups first, so an expired item can be
-- reserved again straight away. Body otherwise identical to 202609210001.
create or replace function public.reserve_item(p_listing_id uuid, p_pickup_period text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_id uuid;
  v_code text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_pickup_date date;
begin
  if v_user is null then raise exception 'Sign in to reserve an item.'; end if;
  perform public.expire_overdue_reservations();
  if not exists(select 1 from public.profiles where id = v_user) then raise exception 'Your student profile is not ready.'; end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'AVAILABLE' then raise exception 'This item is no longer available to reserve.'; end if;
  if v_listing.seller_id = v_user then raise exception 'You cannot reserve your own listing.'; end if;
  if p_pickup_period is null or not (p_pickup_period = any(v_listing.pickup)) then raise exception 'Choose an available pickup period.'; end if;
  v_pickup_date := case p_pickup_period when 'Today' then v_today when 'Tomorrow' then v_today + 1
    else v_today + case when extract(isodow from v_today)::int >= 6 then 0 else 6 - extract(isodow from v_today)::int end end;
  insert into public.reservations(listing_id,buyer_id,seller_id,pickup_location,pickup_period,pickup_date,estimated_weight)
    values(v_listing.id,v_user,v_listing.seller_id,
      case when v_listing.residence = 'Other' then 'Residence common area' else v_listing.residence || ' lobby' end,
      p_pickup_period,v_pickup_date,v_listing.estimated_weight) returning id into v_id;
  v_code := (1000 + (('x' || substr(replace(gen_random_uuid()::text,'-',''),1,4))::bit(16)::int % 9000))::text;
  insert into kostcycle_private.pickup_secrets(reservation_id,code) values(v_id,v_code);
  update public.listings set status = 'RESERVED' where id = v_listing.id;
  return v_id;
end;
$$;

revoke all on function public.cancel_reservation(uuid), public.expire_overdue_reservations()
  from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid) to authenticated;
grant execute on function public.expire_overdue_reservations() to anon, authenticated;
revoke all on function public.reserve_item(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_item(uuid,text) to authenticated;
revoke all on function kostcycle_private.release_reservation(uuid,text,uuid),
  kostcycle_private.set_reservation_expiry() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Buyer and seller chat, one thread per reservation
-- ---------------------------------------------------------------------------
create table public.reservation_messages (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index reservation_messages_thread_idx on public.reservation_messages(reservation_id, created_at);
comment on table public.reservation_messages is
  'Visible only to that reservation''s buyer and seller, while RESERVED or up to 7 days after it ends.';

alter table public.reservation_messages enable row level security;
create policy reservation_messages_read on public.reservation_messages for select to authenticated
  using (exists(
    select 1 from public.reservations r
    where r.id = reservation_id
      and (select auth.uid()) in (r.buyer_id, r.seller_id)
      and (r.status = 'RESERVED' or coalesce(r.completed_at, r.cancelled_at) > now() - interval '7 days')));
create policy reservation_messages_insert on public.reservation_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists(
      select 1 from public.reservations r
      where r.id = reservation_id
        and (select auth.uid()) in (r.buyer_id, r.seller_id)
        and (r.status = 'RESERVED' or coalesce(r.completed_at, r.cancelled_at) > now() - interval '7 days')));
-- sender_id and created_at are server-set: clients may only write the thread and the text.
revoke all on public.reservation_messages from public, anon, authenticated;
grant select on public.reservation_messages to authenticated;
grant insert(reservation_id, body) on public.reservation_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Listing photos in Supabase Storage (old base64 image_data keeps working)
-- ---------------------------------------------------------------------------
alter table public.listings add column image_url text check (
  image_url is null or (
    char_length(image_url) <= 600
    and image_url ~ '^(https://[a-z0-9-]+\.supabase\.co|http://(127\.0\.0\.1|localhost):54321)/storage/v1/object/public/listing-images/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
    and strpos(image_url, '/listing-images/' || seller_id::text || '/') > 0));
comment on column public.listings.image_url is
  'Public URL in the listing-images bucket, inside the seller''s own folder.';
grant insert(image_url), update(image_url) on public.listings to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage not found: skipped the listing-images bucket.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('listing-images', 'listing-images', true, 2097152,
      array['image/webp','image/jpeg','image/png'])
    on conflict (id) do update set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists kostcycle_listing_images_read on storage.objects';
  execute 'drop policy if exists kostcycle_listing_images_insert on storage.objects';
  execute 'drop policy if exists kostcycle_listing_images_delete on storage.objects';
  execute $p$create policy kostcycle_listing_images_read on storage.objects
    for select to anon, authenticated using (bucket_id = 'listing-images')$p$;
  execute $p$create policy kostcycle_listing_images_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'listing-images'
      and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute $p$create policy kostcycle_listing_images_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'listing-images'
      and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Onboarding interests, private to their owner
-- ---------------------------------------------------------------------------
-- Kept out of public.profiles on purpose: profiles are readable by everyone.
create table public.profile_preferences (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  interests jsonb not null check (jsonb_typeof(interests) = 'object' and pg_column_size(interests) <= 4000),
  updated_at timestamptz not null default now()
);
alter table public.profile_preferences enable row level security;
create policy profile_preferences_read_self on public.profile_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy profile_preferences_insert_self on public.profile_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profile_preferences_update_self on public.profile_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger profile_preferences_updated before update on public.profile_preferences
  for each row execute function kostcycle_private.touch_updated_at();
revoke all on public.profile_preferences from public, anon, authenticated;
grant select on public.profile_preferences to authenticated;
grant insert(user_id, interests), update(interests) on public.profile_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: chat messages stream to participants (RLS still applies).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists(select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservation_messages') then
    alter publication supabase_realtime add table public.reservation_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
