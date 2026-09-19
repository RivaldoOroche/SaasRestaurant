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

All phases implemented and verified in-browser (mock backend):

- **Phase 0** — scaffold, Nocturne design system (light/dark, responsive, print),
  Supabase schema + RLS, auth + role gating, app shell.
- **Phase 1** — Pedido, Mesas, Cocina (KDS with SLA timers), Cobro (checkout math
  + receipt). Order → kitchen → payment end-to-end.
- **Phase 2** — Cuentas, transfer/merge, void-with-reason, Inventario + recipe
  deduction, Clientes + loyalty, Carta/Editor, En línea, Ajustes, Reportes, Caja,
  Panel, Dueño (branches + bitácora).
- **Phase 3** — SUNAT comprobantes (boleta/factura), offline queue with auto-sync
  and retry, Monitor SUNAT. Real timbrado stubbed behind `data/sunat/gateway.ts`.
- **Phase 4** — SaaS console: Resumen, Tenants (detail, impersonation, onboarding
  links, charge→factura), Retención, Ingresos, Planes, Soporte.
- **Phase 5** — tenant Plan/Suscripción screen, chart code-splitting, this doc.

**Stubbed integrations** (swap for real providers, no UI changes):
`data/sunat/gateway.ts` (SUNAT PSE/OSE timbrado) and SaaS payment charging.
Retention/dunning analytics in the SaaS console are representative — real cohort
computation belongs in a backend analytics job.

The app runs fully in demo mode without a backend; connect Supabase (steps above)
for real multi-tenant persistence.
