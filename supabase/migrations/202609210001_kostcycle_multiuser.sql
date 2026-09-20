-- Run this entire migration in the Supabase SQL Editor, once, as the project owner.
-- No frontend secret keys are required. Existing auth users are backfilled below.
begin;

create schema if not exists kostcycle_private;
revoke all on schema kostcycle_private from public, anon, authenticated;

create function public.kostcycle_category_weight(category text)
returns numeric language sql immutable set search_path = '' as $$
  select case category when 'Fans' then 2.5 when 'Lamps' then 1.0
    when 'Storage' then 1.2 when 'Furniture' then 5.0 when 'Kitchen' then 1.0
    when 'Electronics' then 1.5 else 1.0 end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  university text not null default 'BINUS University' check (char_length(university) between 1 and 120),
  campus text not null default 'Alam Sutera' check (char_length(campus) between 1 and 120),
  residence text not null default 'Newton Kost' check (char_length(residence) between 1 and 120),
  verified boolean not null default true,
  verification_type text not null default 'simulated' check (verification_type = 'simulated'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.verified is 'Simulated MVP status only. Not university identity verification.';

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text not null check (category in ('Fans','Lamps','Storage','Furniture','Kitchen','Electronics','Other Essentials')),
  condition text not null check (condition in ('Like New','Good','Fair')),
  price bigint not null check (price between 0 and 100000000),
  is_free boolean generated always as (price = 0) stored,
  university text not null default 'BINUS University' check (char_length(university) between 1 and 120),
  campus text not null default 'Alam Sutera' check (char_length(campus) between 1 and 120),
  residence text not null check (residence in ('Newton Kost','Silkwood Residence','Rukita Alam Sutera','The Prominence','Other')),
  distance integer not null default 150 check (distance between 0 and 100000),
  pickup text[] not null check (cardinality(pickup) between 1 and 3 and pickup <@ array['Today','Tomorrow','This weekend']::text[] and array_position(pickup,null) is null),
  description text not null check (char_length(btrim(description)) between 1 and 1500),
  image_index integer not null default 0 check (image_index between 0 and 11),
  image_data text check (image_data is null or (octet_length(image_data) <= 1700000 and image_data ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','RESERVED','COMPLETED')),
  estimated_weight numeric generated always as (public.kostcycle_category_weight(category)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.listings.distance is 'Static residence-based estimate, not GPS or a measured user-relative distance.';
comment on column public.listings.estimated_weight is 'Category estimate in kilograms; not measured environmental impact.';

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  pickup_location text not null,
  pickup_period text not null check (pickup_period in ('Today','Tomorrow','This weekend')),
  pickup_date date not null,
  status text not null default 'RESERVED' check (status in ('RESERVED','COMPLETED')),
  estimated_weight numeric not null check (estimated_weight > 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check ((status = 'RESERVED' and completed_at is null) or (status = 'COMPLETED' and completed_at is not null))
);
comment on table public.reservations is 'One transaction per listing; completion and impact are derived from this single record.';

-- Not exposed by the Data API or included in the realtime publication.
create table kostcycle_private.pickup_secrets (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  failed_attempts integer not null default 0,
  locked_until timestamptz
);
alter table kostcycle_private.pickup_secrets enable row level security;
revoke all on kostcycle_private.pickup_secrets from public, anon, authenticated;

create table public.saved_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, listing_id)
);

create index listings_seller_idx on public.listings(seller_id);
create index listings_browse_idx on public.listings(status, distance);
create index listings_created_idx on public.listings(created_at desc);
create index reservations_buyer_idx on public.reservations(buyer_id, created_at desc);
create index reservations_seller_idx on public.reservations(seller_id, created_at desc);
create index saved_items_listing_idx on public.saved_items(listing_id);

create function kostcycle_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function kostcycle_private.touch_updated_at();
create trigger listings_updated before update on public.listings for each row execute function kostcycle_private.touch_updated_at();
create trigger reservations_updated before update on public.reservations for each row execute function kostcycle_private.touch_updated_at();

create function kostcycle_private.create_student_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,name,university,campus,residence)
  values (new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Student'),80),
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'university'),''),'BINUS University'),120),
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'campus'),''),'Alam Sutera'),120),
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'residence'),''),'Newton Kost'),120));
  return new;
end;
$$;
create trigger kostcycle_auth_user_created after insert on auth.users
for each row execute function kostcycle_private.create_student_profile();

-- Backfill accounts created before this migration; email addresses are never copied.
insert into public.profiles(id,name,university,campus,residence)
select id,
  left(coalesce(nullif(btrim(raw_user_meta_data->>'name'),''),'Student'),80),
  left(coalesce(nullif(btrim(raw_user_meta_data->>'university'),''),'BINUS University'),120),
  left(coalesce(nullif(btrim(raw_user_meta_data->>'campus'),''),'Alam Sutera'),120),
  left(coalesce(nullif(btrim(raw_user_meta_data->>'residence'),''),'Newton Kost'),120)
from auth.users on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.reservations enable row level security;
alter table public.saved_items enable row level security;

-- Public profile fields are intentionally limited to marketplace identity, no email.
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy listings_read on public.listings for select to anon, authenticated using (true);
create policy listings_insert_self on public.listings for insert to authenticated
  with check ((select auth.uid()) = seller_id and status = 'AVAILABLE');
create policy listings_update_self_available on public.listings for update to authenticated
  using ((select auth.uid()) = seller_id and status = 'AVAILABLE')
  with check ((select auth.uid()) = seller_id and status = 'AVAILABLE');
create policy listings_delete_self_available on public.listings for delete to authenticated
  using ((select auth.uid()) = seller_id and status = 'AVAILABLE');
create policy reservations_participants_read on public.reservations for select to authenticated
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);
create policy saved_items_read_self on public.saved_items for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_items_insert_self on public.saved_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy saved_items_delete_self on public.saved_items for delete to authenticated using ((select auth.uid()) = user_id);

-- RLS is complemented by column privileges. No client can set lifecycle or identity fields.
revoke all on public.profiles, public.listings, public.reservations, public.saved_items from public, anon, authenticated;
grant select on public.profiles, public.listings to anon, authenticated;
grant update(name,university,campus,residence) on public.profiles to authenticated;
grant insert(seller_id,name,category,condition,price,university,campus,residence,distance,pickup,description,image_index,image_data) on public.listings to authenticated;
grant update(name,category,condition,price,residence,distance,pickup,description,image_index,image_data) on public.listings to authenticated;
grant delete on public.listings to authenticated;
grant select on public.reservations to authenticated;
grant select,delete on public.saved_items to authenticated;
grant insert(user_id,listing_id) on public.saved_items to authenticated;

create function public.reserve_item(p_listing_id uuid, p_pickup_period text)
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
  if not exists(select 1 from public.profiles where id = v_user) then raise exception 'Your student profile is not ready.'; end if;
  -- Lock serializes competing buyers; the losing request sees RESERVED after waiting.
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
  -- Cryptographically random UUID entropy, reduced to a four-digit presentation code.
  v_code := (1000 + (('x' || substr(replace(gen_random_uuid()::text,'-',''),1,4))::bit(16)::int % 9000))::text;
  insert into kostcycle_private.pickup_secrets(reservation_id,code) values(v_id,v_code);
  update public.listings set status = 'RESERVED' where id = v_listing.id;
  return v_id;
end;
$$;

create function public.my_pickup_codes()
returns table(listing_id uuid, code text) language sql security definer stable set search_path = '' as $$
  select r.listing_id,s.code from public.reservations r
  join kostcycle_private.pickup_secrets s on s.reservation_id = r.id
  where r.buyer_id = (select auth.uid()) and r.status = 'RESERVED';
$$;

create function public.confirm_handoff(p_listing_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_reservation public.reservations%rowtype;
  v_secret kostcycle_private.pickup_secrets%rowtype;
begin
  if v_user is null then raise exception 'Sign in to confirm a handoff.'; end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found or v_listing.seller_id <> v_user then raise exception 'Only this listing''s seller can confirm the handoff.'; end if;
  if v_listing.status <> 'RESERVED' then raise exception 'This handoff is no longer awaiting confirmation.'; end if;
  select * into v_reservation from public.reservations where listing_id = p_listing_id and status = 'RESERVED' for update;
  if not found then raise exception 'No active reservation exists.'; end if;
  select * into v_secret from kostcycle_private.pickup_secrets where reservation_id = v_reservation.id for update;
  if not found then raise exception 'Pickup verification is unavailable. Contact the project administrator.'; end if;
  if v_secret.locked_until > now() then
    return jsonb_build_object('ok',false,'message','Too many attempts. Wait 15 minutes after the last failed attempt, then try again.');
  end if;
  if v_secret.locked_until is not null then
    update kostcycle_private.pickup_secrets set failed_attempts = 0, locked_until = null where reservation_id = v_reservation.id;
    v_secret.failed_attempts := 0;
  end if;
  if p_code is null or p_code !~ '^[0-9]{4}$' or p_code <> v_secret.code then
    -- Return, rather than raise, so failed-attempt accounting commits.
    update kostcycle_private.pickup_secrets set failed_attempts = v_secret.failed_attempts + 1,
      locked_until = case when v_secret.failed_attempts >= 4 then now() + interval '15 minutes' else null end
    where reservation_id = v_reservation.id;
    return jsonb_build_object('ok',false,'message',case when v_secret.failed_attempts >= 4 then 'Too many attempts. Try again in 15 minutes.' else 'Code does not match this reservation.' end);
  end if;
  update public.reservations set status = 'COMPLETED', completed_at = now() where id = v_reservation.id;
  update public.listings set status = 'COMPLETED' where id = v_listing.id;
  delete from kostcycle_private.pickup_secrets where reservation_id = v_reservation.id;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.reserve_item(uuid,text), public.confirm_handoff(uuid,text), public.my_pickup_codes() from public, anon, authenticated;
grant execute on function public.reserve_item(uuid,text), public.confirm_handoff(uuid,text), public.my_pickup_codes() to authenticated;
revoke all on function kostcycle_private.create_student_profile(), kostcycle_private.touch_updated_at() from public, anon, authenticated;
revoke all on function public.kostcycle_category_weight(text) from public;
grant execute on function public.kostcycle_category_weight(text) to anon, authenticated;

-- No codes or secrets are ever published. RLS filters reservation events to participants.
do $$
declare table_name text;
begin
  if not exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach table_name in array array['profiles','listings','reservations','saved_items'] loop
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
