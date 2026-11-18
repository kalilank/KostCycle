-- KostCycle: only @binus.ac.id addresses may create or move to an account.
-- Pairs with Supabase "Confirm email" (dashboard setting) so the student must
-- also prove they own the inbox. Existing accounts are not modified.
-- Demo seed accounts (app_metadata.seed_namespace, settable only with the
-- service-role key) are exempt so `npm run seed:demo` keeps working.
begin;

create schema if not exists kostcycle_private;

create or replace function kostcycle_private.require_binus_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  if coalesce(new.raw_app_meta_data->>'seed_namespace', '') = 'kostcycle-demo-v1' then
    return new;
  end if;
  if new.email is null or lower(btrim(new.email)) !~ '^[^@[:space:]]+@binus\.ac\.id$' then
    raise exception 'binus_email_required: KostCycle accounts need a @binus.ac.id email'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists kostcycle_require_binus_email on auth.users;
create trigger kostcycle_require_binus_email before insert or update of email on auth.users
for each row execute function kostcycle_private.require_binus_email();

commit;
