revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from public;
revoke execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) from anon;
grant execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) to authenticated;
