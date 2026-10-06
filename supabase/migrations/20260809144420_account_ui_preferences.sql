-- Persist account-level UI preferences for long-term cross-device restoration.
alter table public.profiles
  add column if not exists ui_preferences jsonb not null default '{}'::jsonb;

-- Keep the exposed privileges explicit for the new profile data contract.
grant select, update on public.profiles to authenticated;
