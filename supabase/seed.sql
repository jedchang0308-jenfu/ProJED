-- Supabase seed.sql
-- ?雓?????蝘??????? AI RAG ?鞈對????????翰??????????荒???????雓???-- ???壯???鞎??`supabase start` ??`supabase db reset` ?頩???鞈???賹???ㄞ擗?????
-- 1. ?璇??????謚??伍??? (Email: test@example.com / ?謖??? password123)
-- ?頛舀????雓? bcrypt ?頩? 'password123'
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', -- ????謚???謆折?擳???ID
  'authenticated',
  'authenticated',
  'test@example.com',
  '$2a$10$9zWTm9mKM7eKrzUufXJGieVyZ6289YD5fJ7XYpWsBVwYMy31hX9vi', -- 'password123' ??bcrypt ?頩?
  now(),
  '',
  '',
  '',
  '',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"email_verified": true}'::jsonb,
  false,
  now(),
  now()
) ON CONFLICT DO NOTHING;

-- 2. Seed auth identity for local email login
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id, -- ??爸??????謜???賃狀?
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
  'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5',
  jsonb_build_object('sub', 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'email', 'test@example.com'),
  'email',
  'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', -- ??id/user_id ???
  now(),
  now(),
  now()
) ON CONFLICT DO NOTHING;


-- 3. ?璇???蹎?????制??Profile
INSERT INTO public.profiles (id, email, display_name, created_at, updated_at)
VALUES ('e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'test@example.com', 'AI Test User', now(), now())
ON CONFLICT DO NOTHING;

-- 4. ?璇??????謚???Tenant (Workspace)
INSERT INTO public.tenants (id, name, created_at, updated_at)
VALUES ('a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1', '??? AI ?謚???????', now(), now())
ON CONFLICT DO NOTHING;

-- 5. ?蹎剁????????????頩?Tenant ???? (RLS ????撠??)
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, created_at, updated_at)
VALUES ('a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1', 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'owner', 'active', now(), now())
ON CONFLICT DO NOTHING;

-- 6. ?璇??????謚???Project (Board)
INSERT INTO public.projects (id, tenant_id, name, created_at, updated_at)
VALUES ('b2b2b2b2-c2c2-d2d2-e2e2-f2f2f2f2f2f2', 'a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1', 'AI ?????蹎??', now(), now())
ON CONFLICT DO NOTHING;

-- 7. ?蹎剁????????????頩?Project ????
INSERT INTO public.project_members (project_id, tenant_id, user_id, role, created_at, updated_at)
VALUES ('b2b2b2b2-c2c2-d2d2-e2e2-f2f2f2f2f2f2', 'a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1', 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'owner', now(), now())
ON CONFLICT DO NOTHING;

-- 8. ?璇???謚???RAG ?????? (Documents)
INSERT INTO public.documents (id, tenant_id, project_id, source_type, title, visibility, rag_enabled, created_at, updated_at)
VALUES ('c3c3c3c3-d3d3-e3e3-f3f3-a3a3a3a3a3a3', 'a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1', 'b2b2b2b2-c2c2-d2d2-e2e2-f2f2f2f2f2f2', 'project_note', 'ProJED Test Knowledge Base', 'project', true, now(), now())
ON CONFLICT DO NOTHING;

-- 9. ?璇????? Chunk
INSERT INTO public.document_chunks (id, tenant_id, document_id, chunk_index, content, created_at)
VALUES (
  'd4d4d4d4-e4e4-f4f4-a4a4-b4b4b4b4b4b4', 
  'a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1', 
  'c3c3c3c3-d3d3-e3e3-f3f3-a3a3a3a3a3a3', 
  0, 
  'ProJED test chunk for local P9 RAG verification. This note covers React, Supabase, WBS tasks, citations, and project knowledge retrieval.',
  now()
)
ON CONFLICT DO NOTHING;

-- 10. ?璇?? 3072 ????????雓??Embedding (?謜蹎剁??鞈? Placeholder ???)
INSERT INTO public.document_embeddings (id, tenant_id, chunk_id, provider, model, dimensions, embedding, created_at)
VALUES (
  'e5e5e5e5-f5f5-a5a5-b5b5-c5c5c5c5c5c5', 
  'a1a1a1a1-b1b1-c1c1-d1d1-e1e1e1e1e1e1', 
  'd4d4d4d4-e4e4-f4f4-a4a4-b4b4b4b4b4b4', 
  'google', 
  'gemini-embedding-001', 
  3072, 
  array_fill(0.0::double precision, ARRAY[3072])::vector, 
  now()
)
ON CONFLICT DO NOTHING;
