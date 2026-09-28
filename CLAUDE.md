# Supabase migrations: explicit GRANTs are mandatory

**Context.** From October 30, 2026, Supabase no longer automatically grants Data API access (supabase-js, PostgREST, GraphQL) to NEW tables in the `public` schema on existing projects. Existing tables keep their current grants; nothing changes for them. Any table created without explicit grants will be unreachable through the Data API and will return a `permission denied` error (the error message includes the exact GRANT statement to run).

This also applies to: new projects, preview branches, and local `supabase db reset`. Every migration that creates a table must therefore carry its own grants.

## Rules

1. Every migration that creates a table in `public` MUST include the GRANT statements in the same migration file, right after the `CREATE TABLE` and the RLS statements.
2. Always enable RLS and define policies. Grants only open the door to the Data API; RLS policies still decide who can see or change which rows. Never rely on grants alone for access control.
3. Grant the minimum roles needed:
   * `authenticated`: normally `select, insert, update, delete` (narrow it down if the table is read-only for users).
   * `service_role`: `all` (used by server-side code and Workers with the service key).
   * `anon`: ONLY if the table must be publicly readable/writable without login. Default is NOT to grant it.
4. Recreated tables lose their grants. If a migration does `DROP TABLE` + `CREATE TABLE` (or otherwise recreates a table), treat it as a new table and re-add all grants. Also re-check grants after any rename-and-replace pattern.
5. Sequences. If a table uses `serial`/`bigserial` (sequence-backed) columns and `authenticated` must insert into it, also grant `usage, select` on the sequence. Tables using `uuid` defaults (`gen_random_uuid()`) or identity columns do not need this step, but verify if an insert fails.
6. Other objects. The Supabase notice only covers tables. For new views and functions exposed through the API, check the Supabase docs for the current behaviour before assuming they are covered.
7. Never apply migrations from Claude Code. The migration SQL is produced for review and applied manually in the Supabase SQL Editor. After applying, regenerate types with `npx supabase gen types typescript` and keep `routeTree.gen.ts` unstaged.

## Migration template

```sql
-- 1. Table
create table public.example_table (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
  -- ...columns
);

-- 2. RLS (mandatory)
alter table public.example_table enable row level security;

-- 3. Policies (adapt to the real access model)
-- create policy "..." on public.example_table for select to authenticated using (...);

-- 4. Explicit grants (mandatory from 2026-10-30)
grant select, insert, update, delete on public.example_table to authenticated;
grant all on public.example_table to service_role;
-- grant select on public.example_table to anon;  -- ONLY if it must be public

-- 5. If the table uses a sequence and authenticated inserts into it:
-- grant usage, select on sequence public.example_table_id_seq to authenticated;
```

## Pre-delivery checklist (Claude Code must verify before handing over any migration)

* [ ] Every `CREATE TABLE` in `public` has matching `GRANT` statements in the same file.
* [ ] RLS is enabled and policies exist for every role that was granted access.
* [ ] `anon` is granted only if the table is intentionally public.
* [ ] Any `DROP` + `CREATE` of an existing table re-adds its grants.
* [ ] The diff is shown for review; nothing is applied or pushed automatically.

## Optional: one-off audit of existing projects

Not required (existing tables keep their grants), but useful to know what each table currently has. Run in the SQL Editor of each Supabase project, one query at a time:

```sql
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
```
