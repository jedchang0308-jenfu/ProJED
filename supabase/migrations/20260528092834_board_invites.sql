-- Board-first email invite data model.
-- Tokens must be generated outside the database and stored only as hashes.

do $$
begin
  create type public.board_invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception
  when duplicate_object then null;
end $$;

create unique index if not exists projects_tenant_id_id_uidx
on public.projects (tenant_id, id);

create table if not exists public.board_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  invited_by uuid references public.profiles(id) on delete set null,
  status public.board_invite_status not null default 'pending',
  default_role public.tenant_role not null default 'member',
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_invites_email_not_blank check (length(trim(email)) > 0),
  constraint board_invites_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint board_invites_status_timestamps check (
    (status <> 'accepted' or accepted_at is not null)
    and (status <> 'revoked' or revoked_at is not null)
  )
);

create or replace function public.normalize_board_invite_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists board_invites_normalize_email on public.board_invites;
create trigger board_invites_normalize_email
before insert or update of email on public.board_invites
for each row execute function public.normalize_board_invite_email();

drop trigger if exists board_invites_touch_updated_at on public.board_invites;
create trigger board_invites_touch_updated_at
before update on public.board_invites
for each row execute function public.touch_updated_at();

create index if not exists board_invites_tenant_project_status_idx
on public.board_invites (tenant_id, project_id, status, created_at desc);

create index if not exists board_invites_token_hash_idx
on public.board_invites (token_hash);

create unique index if not exists board_invites_one_pending_per_email_idx
on public.board_invites (project_id, lower(email))
where status = 'pending';

alter table public.board_invites enable row level security;

drop policy if exists "board managers read invites" on public.board_invites;
drop policy if exists "board managers create invites" on public.board_invites;
drop policy if exists "board managers update invites" on public.board_invites;
drop policy if exists "service role manages invites" on public.board_invites;

create policy "board managers read invites"
on public.board_invites for select to authenticated
using (private.current_user_can_manage_project(tenant_id, project_id));

create policy "board managers create invites"
on public.board_invites for insert to authenticated
with check (
  private.current_user_can_manage_project(tenant_id, project_id)
  and invited_by = (select auth.uid())
  and status = 'pending'
  and default_role = 'member'
  and accepted_at is null
  and revoked_at is null
  and expires_at > now()
);

create policy "board managers update invites"
on public.board_invites for update to authenticated
using (private.current_user_can_manage_project(tenant_id, project_id))
with check (private.current_user_can_manage_project(tenant_id, project_id));

create policy "service role manages invites"
on public.board_invites for all to service_role
using (true)
with check (true);

grant select, insert, update on public.board_invites to authenticated;
grant select, insert, update, delete on public.board_invites to service_role;

create or replace function public.accept_board_invite(invite_token_hash text)
returns public.board_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(trim(auth.jwt() ->> 'email'));
  target_invite public.board_invites;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if current_email is null or current_email = '' then
    raise exception 'authenticated user email is required';
  end if;

  select *
    into target_invite
  from public.board_invites
  where token_hash = invite_token_hash
  for update;

  if not found then
    raise exception 'board invite not found';
  end if;

  if target_invite.status <> 'pending' then
    raise exception 'board invite is no longer pending';
  end if;

  if target_invite.expires_at <= now() then
    update public.board_invites
       set status = 'expired',
           updated_at = now()
     where id = target_invite.id
     returning * into target_invite;
    raise exception 'board invite has expired';
  end if;

  if target_invite.email <> current_email then
    raise exception 'board invite email does not match authenticated user';
  end if;

  insert into public.profiles (id, email, display_name)
  values (
    current_user_id,
    current_email,
    coalesce(auth.jwt() ->> 'name', current_email)
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();

  insert into public.tenant_members (tenant_id, user_id, role, status)
  values (target_invite.tenant_id, current_user_id, 'member', 'active')
  on conflict (tenant_id, user_id) do update
    set status = 'active',
        updated_at = now();

  insert into public.project_members (tenant_id, project_id, user_id, role)
  values (target_invite.tenant_id, target_invite.project_id, current_user_id, target_invite.default_role)
  on conflict (project_id, user_id) do update
    set role = public.project_members.role,
        updated_at = now();

  update public.board_invites
     set status = 'accepted',
         accepted_at = now(),
         updated_at = now()
   where id = target_invite.id
   returning * into target_invite;

  begin
    insert into public.audit_logs (
      tenant_id,
      actor_id,
      action,
      entity_table,
      entity_id,
      before_data,
      after_data
    )
    values (
      target_invite.tenant_id,
      current_user_id,
      'invite_accepted',
      'board_invites',
      target_invite.id,
      jsonb_build_object(
        'inviteId', target_invite.id,
        'email', target_invite.email,
        'status', 'pending',
        'defaultRole', target_invite.default_role,
        'projectId', target_invite.project_id
      ),
      jsonb_build_object(
        'inviteId', target_invite.id,
        'email', target_invite.email,
        'status', target_invite.status,
        'defaultRole', target_invite.default_role,
        'acceptedUserId', current_user_id,
        'projectId', target_invite.project_id
      )
    );
  exception
    when others then
      null;
  end;

  return target_invite;
end;
$$;

grant execute on function public.accept_board_invite(text) to authenticated;
