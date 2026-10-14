import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const FIXTURES_DIR = path.join(ROOT, 'mock/fixtures');

// Supabase가 기본으로 깔아 두는 역할·auth 스키마만 흉내 낸다.
// auth.uid()는 요청마다 set_config로 넣는 JWT sub를 읽는다.
const SUPABASE_PRELUDE = `
set timezone to 'UTC';
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{"provider":"email"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/**
 * @description 메모리 Postgres를 띄우고 실제 migration과 fixture를 순서대로 넣는다.
 */
export async function createDatabase() {
  const db = new PGlite({ initialMemory: 128 * 1024 * 1024 });
  await db.exec(SUPABASE_PRELUDE);

  for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith('.sql')) continue;
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`migration 실패 ${file}: ${error.message}`);
    }
  }

  if (fs.existsSync(FIXTURES_DIR)) {
    for (const file of fs.readdirSync(FIXTURES_DIR).sort()) {
      if (!file.endsWith('.sql')) continue;
      try {
        await db.exec(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
      } catch (error) {
        throw new Error(`fixture 실패 ${file}: ${error.message}`);
      }
    }
  }

  return db;
}
