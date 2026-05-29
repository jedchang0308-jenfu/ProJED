-- Tighten function grants/search_path and add the FK index surfaced by Supabase advisors.

create or replace function public.normalize_board_invite_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

revoke all on function public.normalize_board_invite_email() from public, anon, authenticated;

revoke execute on function public.accept_board_invite(text) from public, anon;
grant execute on function public.accept_board_invite(text) to authenticated;

revoke execute on function public.log_activity_event(uuid, uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_activity_event(uuid, uuid, text, text, uuid, jsonb) to authenticated, service_role;

revoke execute on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb) to authenticated, service_role;

create index if not exists board_invites_invited_by_idx
on public.board_invites (invited_by);
