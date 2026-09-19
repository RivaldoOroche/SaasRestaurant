# NubePOS — setup

React + TypeScript (Vite) frontend on Supabase (Postgres + Auth + RLS).

## 1. Install & run (works offline in demo mode)

```bash
npm install
npm run dev
```

With no `.env`, the app runs in **demo mode**: PIN login against mock users
(1111 Dueña · 2222 Gerente · 3333/4444 Mesero · 0000 SaaS), no backend needed.
Good for UI work.

## 2. Connect Supabase (real backend)

1. Create a project at https://supabase.com.
2. Copy `.env.example` to `.env` and fill in:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   VITE_USE_MOCK=false
   ```
3. Apply the schema in order (SQL editor or `supabase db push`):
   - `supabase/migrations/0001_core_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/seed.sql` (demo data)

## 3. Create accounts

SQL can't create auth users, so:

1. In **Auth → Users**, create the platform owner and each tenant owner
   (email + password).
2. Insert matching `memberships` rows linking each `auth.users.id` to a role
   (and a `tenant_id`, except the platform owner whose `tenant_id` is null):
   ```sql
   -- platform owner
   insert into memberships (user_id, tenant_id, role)
   values ('<auth-user-id>', null, 'saas');
   -- tenant owner (La Higuera)
   insert into memberships (user_id, tenant_id, role)
   values ('<auth-user-id>', '11111111-1111-1111-1111-111111111111', 'dueno');
   ```

Owners log in with email + password; in-tenant staff (Gerente/Mesero) log in
with a PIN on an already-authenticated device (staff PIN verification against
`staff_members.pin_hash` lands in Phase 1).

## Scripts

| command | what |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build |
| `npm run typecheck` | types only |
| `npm run test` | unit tests (Vitest) |

## Status

**Phase 0 complete:** scaffold, Nocturne design system (light/dark, responsive,
print), Supabase schema + RLS, auth + role gating, app shell with all screens
stubbed and correctly gated per role. Next phases are described in the plan.
