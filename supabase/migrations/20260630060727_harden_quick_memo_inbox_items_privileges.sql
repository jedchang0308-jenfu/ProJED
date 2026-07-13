-- DEV-039 hardening: ensure quick memo inbox Data API access is authenticated-only.

revoke all on table public.inbox_items from public;
revoke all on table public.inbox_items from anon;
revoke all on table public.inbox_items from authenticated;

grant select, insert, update, delete on table public.inbox_items to authenticated;

notify pgrst, 'reload schema';;
