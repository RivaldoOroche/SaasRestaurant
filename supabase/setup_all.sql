-- =====================================================================
-- Wayra POS - Script unico de instalacion (todo en uno)
-- =====================================================================
-- Concatena las migraciones (0001 -> ultima) + seed.sql. Pegar UNA vez
-- en el SQL Editor de Supabase y Run. Luego Auth + memberships (SUPABASE_SETUP.md).
-- ARCHIVO GENERADO: no editar a mano (npm run db:bundle).
-- =====================================================================


-- ==================================================================
-- Migracion 0001_core_schema.sql
-- ==================================================================

-- Wayra POS core schema.
-- Multi-tenant, single shared database. Every tenant-scoped table carries
-- tenant_id; isolation is enforced by RLS (see 0002_rls.sql). Platform-level
-- tables (tenants, plans, saas_invoices, support_tickets, platform_activity)
-- are readable only by platform admins.

create extension if not exists "pgcrypto";

-- Helper schema for security-definer functions used by RLS.
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type app_role as enum ('saas', 'dueno', 'admin', 'mesero');
create type plan_tier as enum ('Básico', 'Pro', 'Enterprise');
create type tenant_status as enum ('Activo', 'Prueba', 'Suspendido');
create type table_status as enum ('libre', 'ocupada', 'cuenta', 'reservada');
create type order_status as enum ('abierta', 'en_cocina', 'servida', 'cobrada', 'anulada');
create type kds_column as enum ('nuevos', 'preparacion', 'listos', 'entregado');
create type comprobante_tipo as enum ('Boleta', 'Factura');
create type sunat_status as enum ('encola', 'enviando', 'aceptada', 'rechazada');
create type currency_code as enum ('PEN', 'USD', 'EUR');
create type pay_method as enum ('efectivo', 'tarjeta', 'transferencia');

-- ---------------------------------------------------------------------------
-- Platform tables (no tenant_id)
-- ---------------------------------------------------------------------------
create table subscription_plans (
  id          uuid primary key default gen_random_uuid(),
  tier        plan_tier not null unique,
  price       numeric(10,2) not null,
  features    text not null default '',
  created_at  timestamptz not null default now()
);

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  owner_name  text not null,
  plan        plan_tier not null default 'Pro',
  mrr         numeric(10,2) not null default 0,
  status      tenant_status not null default 'Prueba',
  since       date not null default now(),
  created_at  timestamptz not null default now()
);

-- Links a Supabase auth user to a tenant + account role. Platform admins have
-- tenant_id = null and role = 'saas'. This is the backbone of RLS scoping.
create table memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid references tenants(id) on delete cascade,
  role        app_role not null,
  created_at  timestamptz not null default now(),
  unique (user_id, tenant_id)
);
create index on memberships (user_id);
create index on memberships (tenant_id);

create table saas_invoices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  folio       text not null,
  amount      numeric(10,2) not null,
  igv         numeric(10,2) not null default 0,
  method      pay_method,
  paid        boolean not null default false,
  issued_at   timestamptz not null default now()
);

create table support_tickets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  subject     text not null,
  priority    text not null default 'Media',
  status      text not null default 'Abierto',
  created_at  timestamptz not null default now()
);

create table onboarding_links (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  token_hash  text not null,          -- store a hash, not the raw token
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table platform_activity (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tenant core
-- ---------------------------------------------------------------------------
create table branches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  city        text not null default '',
  created_at  timestamptz not null default now()
);

-- In-tenant staff. Each maps to a distinct identity (fixes the prototype's
-- per-role identity bug). PIN is stored hashed. Owner accounts also get a row
-- for attribution + reporting.
create table staff_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  initials    text not null default '',
  role        app_role not null,
  pin_hash    text,
  active       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on staff_members (tenant_id);

create table business_settings (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  name        text not null,
  currency    currency_code not null default 'PEN',
  tax_rate    numeric(5,2) not null default 18,   -- IGV %
  tip_presets integer[] not null default '{10,15,18}',
  online_orders boolean not null default true,
  auto_tip    boolean not null default true,
  ruc         text,
  address     text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table menu_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  key         text not null,
  name        text not null,
  icon        text not null default '',
  subtitle    text not null default '',
  sort        integer not null default 0
);
create index on menu_categories (tenant_id);

create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  category_id  uuid not null references menu_categories(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  price        numeric(10,2) not null,
  emoji        text not null default '',
  badge        text,
  is_veg       boolean not null default false,
  is_spicy     boolean not null default false,
  is_gf        boolean not null default false,
  is_meat      boolean not null default false,
  available    boolean not null default true,   -- false = 86'd
  sort         integer not null default 0
);
create index on menu_items (tenant_id);
create index on menu_items (category_id);

create table modifier_extras (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  key         text not null,
  name        text not null,
  price       numeric(10,2) not null default 0
);

create table modifier_prefs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  key         text not null,
  name        text not null
);

create table menu_change_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null,          -- price | new | 86 | description
  item_name   text not null,
  detail      text not null default '',
  status      text not null default 'pendiente',   -- pendiente | aprobado | rechazado
  requested_by uuid references staff_members(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Service floor
-- ---------------------------------------------------------------------------
create table restaurant_tables (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  branch_id   uuid references branches(id) on delete set null,
  zone        text not null default '',
  number      integer not null,
  seats       integer not null default 2,
  status      table_status not null default 'libre',
  waiter_id   uuid references staff_members(id),
  unique (tenant_id, number)
);
create index on restaurant_tables (tenant_id);

create table reservations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  party_size  integer not null default 2,
  zone        text not null default '',
  at_time     text not null default ''
);

create table waitlist (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  party_size  integer not null default 2,
  wait_label  text not null default ''
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  phone       text not null default '',
  visits      integer not null default 0,
  spent       numeric(12,2) not null default 0,
  points      integer not null default 0,
  tier        text not null default 'Bronce',
  created_at  timestamptz not null default now()
);
create index on customers (tenant_id);

create table orders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  branch_id   uuid references branches(id) on delete set null,
  table_id    uuid references restaurant_tables(id) on delete set null,
  waiter_id   uuid references staff_members(id),
  customer_id uuid references customers(id),
  status      order_status not null default 'abierta',
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz
);
create index on orders (tenant_id);
create index on orders (table_id);

create table order_lines (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  name        text not null,          -- snapshot at time of order
  qty         integer not null default 1,
  unit_price  numeric(10,2) not null,
  extra_price numeric(10,2) not null default 0,
  modifiers   text not null default '',
  split_payer integer,                -- for split-by-item (P1..Pn)
  created_at  timestamptz not null default now()
);
create index on order_lines (order_id);

create table void_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  line_name     text not null,
  reason        text not null,
  actor_id      uuid references staff_members(id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Kitchen
-- ---------------------------------------------------------------------------
create table kitchen_tickets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  order_id    uuid references orders(id) on delete cascade,
  table_label text not null default '',
  col         kds_column not null default 'nuevos',
  entered_at  timestamptz not null default now(),
  note        text not null default '',
  done        boolean not null default false
);
create index on kitchen_tickets (tenant_id);

create table ticket_lines (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references kitchen_tickets(id) on delete cascade,
  qty         integer not null default 1,
  name        text not null
);

-- ---------------------------------------------------------------------------
-- Inventory + recipes
-- ---------------------------------------------------------------------------
create table inventory_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  unit        text not null default 'kg',
  stock       numeric(12,3) not null default 0,
  par         numeric(12,3) not null default 0
);
create index on inventory_items (tenant_id);

create table recipes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  menu_item_id   uuid not null references menu_items(id) on delete cascade,
  inventory_id   uuid not null references inventory_items(id) on delete cascade,
  qty_per_unit   numeric(12,4) not null
);

-- ---------------------------------------------------------------------------
-- CRM loyalty ledger (replaces in-place point mutation)
-- ---------------------------------------------------------------------------
create table loyalty_transactions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  points_delta integer not null,      -- negative = redeemed, positive = earned
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fiscal (SUNAT)
-- ---------------------------------------------------------------------------
create table comprobantes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  folio       text not null,
  tipo        comprobante_tipo not null,
  buyer_ruc   text,
  buyer_name  text,
  subtotal    numeric(12,2) not null default 0,
  igv         numeric(12,2) not null default 0,
  total       numeric(12,2) not null,
  reference   text not null default '',
  status      sunat_status not null default 'encola',
  error       text,
  issued_at   timestamptz not null default now()
);
create index on comprobantes (tenant_id);

create table sunat_outbox (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  comprobante_id uuid not null references comprobantes(id) on delete cascade,
  attempts      integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error    text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cash close-out
-- ---------------------------------------------------------------------------
create table cash_register_closes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  branch_id     uuid references branches(id) on delete set null,
  by_method     jsonb not null default '{}'::jsonb,  -- expected, derived from transactions
  counted_cash  numeric(12,2) not null default 0,
  difference    numeric(12,2) not null default 0,
  closed_by     uuid references staff_members(id),
  closed_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------
create table payroll_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  staff_id    uuid references staff_members(id) on delete set null,
  hours       numeric(8,2) not null default 0,
  rate        numeric(10,2) not null default 0,
  tips        numeric(10,2) not null default 0,
  period      text not null default ''
);

-- ---------------------------------------------------------------------------
-- Tenant audit log (bitácora)
-- ---------------------------------------------------------------------------
create table activity_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  actor       text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);
create index on activity_log (tenant_id);

-- ==================================================================
-- Migracion 0002_rls.sql
-- ==================================================================

-- Row-Level Security.
-- Access is decided by the `memberships` table: a user may read/write a tenant's
-- rows if they have a membership for that tenant, or if they are a platform
-- admin (role='saas', tenant_id null). Helper functions are SECURITY DEFINER so
-- they read `memberships` without triggering its own RLS (no recursion).

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.role = 'saas'
  );
$$;

create or replace function app.has_tenant(tid uuid)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_platform_admin() or exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.tenant_id = tid
  );
$$;

-- Account-level role of the current user within a tenant (owner/manager/etc.).
create or replace function app.tenant_role(tid uuid)
returns app_role
language sql stable security definer set search_path = public, app as $$
  select role from memberships m
  where m.user_id = auth.uid() and m.tenant_id = tid
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS + tenant-scoped policy on every tenant table
-- ---------------------------------------------------------------------------
do $$
declare t text;
  tenant_tables text[] := array[
    'branches','staff_members','business_settings','menu_categories','menu_items',
    'modifier_extras','modifier_prefs','menu_change_requests','restaurant_tables',
    'reservations','waitlist','customers','orders','order_lines','void_events',
    'kitchen_tickets','inventory_items','recipes','loyalty_transactions',
    'comprobantes','sunat_outbox','cash_register_closes','payroll_entries','activity_log'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$
      create policy tenant_rw on %I
        for all
        using (app.has_tenant(tenant_id))
        with check (app.has_tenant(tenant_id));
    $p$, t);
  end loop;
end $$;

-- ticket_lines has no tenant_id column; scope via its parent ticket.
alter table ticket_lines enable row level security;
create policy tenant_rw on ticket_lines
  for all
  using (exists (select 1 from kitchen_tickets k where k.id = ticket_id and app.has_tenant(k.tenant_id)))
  with check (exists (select 1 from kitchen_tickets k where k.id = ticket_id and app.has_tenant(k.tenant_id)));

-- ---------------------------------------------------------------------------
-- Platform tables
-- ---------------------------------------------------------------------------
alter table tenants enable row level security;
create policy platform_all on tenants
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy tenant_read_self on tenants
  for select using (app.has_tenant(id));

alter table memberships enable row level security;
create policy own_membership on memberships
  for select using (user_id = auth.uid() or app.is_platform_admin());
create policy platform_manage_membership on memberships
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

alter table subscription_plans enable row level security;
create policy plans_read_all on subscription_plans
  for select using (auth.uid() is not null);
create policy plans_admin_write on subscription_plans
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

alter table saas_invoices enable row level security;
create policy saas_inv_platform on saas_invoices
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy saas_inv_tenant_read on saas_invoices
  for select using (app.has_tenant(tenant_id));

alter table support_tickets enable row level security;
create policy tickets_platform on support_tickets
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy tickets_tenant_rw on support_tickets
  for all using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));

alter table onboarding_links enable row level security;
create policy onboarding_platform on onboarding_links
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

alter table platform_activity enable row level security;
create policy platform_activity_admin on platform_activity
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ==================================================================
-- Migracion 0003_online_orders.sql
-- ==================================================================

-- Online / delivery orders (Rappi, PedidosYa, WhatsApp, Web). Added in Phase 2.
create table online_orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  channel       text not null,
  customer_name text not null default '',
  items         text not null default '',
  total         numeric(12,2) not null default 0,
  eta           text not null default '',
  status        text not null default 'nuevo',
  created_at    timestamptz not null default now()
);
create index on online_orders (tenant_id);

alter table online_orders enable row level security;
create policy tenant_rw on online_orders
  for all
  using (app.has_tenant(tenant_id))
  with check (app.has_tenant(tenant_id));

-- ==================================================================
-- Migracion 0004_order_payment.sql
-- ==================================================================

-- Record how an order was paid, so cash close-out (Caja) can derive expected
-- totals by method from real transactions instead of hardcoded figures.
alter table orders add column if not exists paid_method pay_method;
alter table orders add column if not exists paid_total numeric(12,2);

-- ==================================================================
-- Migracion 0005_folio_counters.sql
-- ==================================================================

-- Sequential, unique fiscal folios per tenant + serie (replaces random folios).
create table folio_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  serie     text not null,
  last      integer not null default 1000,
  primary key (tenant_id, serie)
);
alter table folio_counters enable row level security;
create policy tenant_rw on folio_counters
  for all using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));

-- Atomic next-folio: row lock via upsert guarantees no duplicates under concurrency.
create or replace function app.next_folio(tid uuid, p_serie text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare n integer;
begin
  insert into folio_counters (tenant_id, serie, last)
    values (tid, p_serie, 1001)
    on conflict (tenant_id, serie)
    do update set last = folio_counters.last + 1
    returning last into n;
  return p_serie || '-' || lpad(n::text, 4, '0');
end $$;

-- Enforce folio uniqueness at the DB level as a backstop.
create unique index if not exists comprobantes_folio_unique on comprobantes (tenant_id, folio);

-- ==================================================================
-- Migracion 0006_rls_role_gating.sql
-- ==================================================================

-- Enforce role restrictions at the security boundary, not just in client nav.
-- Previously every membership had full read/write on all tenant tables, so a
-- waiter could edit prices, payroll, settings or delete comprobantes via the API.
-- Here: waiters keep operational access; management-only tables become read-only
-- (or hidden) for waiters, writable only by admin/dueño (or the platform owner).

create or replace function app.can_manage(tid uuid)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_platform_admin() or app.tenant_role(tid) in ('admin', 'dueno');
$$;

-- Group A — everyone in the tenant may read; only managers may write.
do $$
declare t text;
  managed text[] := array[
    'business_settings','menu_categories','menu_items','modifier_extras',
    'modifier_prefs','inventory_items','recipes','menu_change_requests',
    'staff_members','branches'
  ];
begin
  foreach t in array managed loop
    execute format('drop policy if exists tenant_rw on %I;', t);
    execute format('create policy read_members on %I for select using (app.has_tenant(tenant_id));', t);
    execute format('create policy write_mgr_ins on %I for insert with check (app.can_manage(tenant_id));', t);
    execute format('create policy write_mgr_upd on %I for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));', t);
    execute format('create policy write_mgr_del on %I for delete using (app.can_manage(tenant_id));', t);
  end loop;
end $$;

-- Group B — managers only, even for reads (payroll, cash close-outs).
do $$
declare t text;
  mgr_only text[] := array['payroll_entries','cash_register_closes'];
begin
  foreach t in array mgr_only loop
    execute format('drop policy if exists tenant_rw on %I;', t);
    execute format('create policy mgr_all on %I for all using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));', t);
  end loop;
end $$;

-- Fiscal — any member may read, emit and update status, but nobody may DELETE
-- a comprobante (immutable fiscal record).
do $$
declare t text;
  fiscal text[] := array['comprobantes','sunat_outbox'];
begin
  foreach t in array fiscal loop
    execute format('drop policy if exists tenant_rw on %I;', t);
    execute format('create policy read_members on %I for select using (app.has_tenant(tenant_id));', t);
    execute format('create policy ins_members on %I for insert with check (app.has_tenant(tenant_id));', t);
    execute format('create policy upd_members on %I for update using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));', t);
    -- no delete policy => deletes are denied for tenant members
  end loop;
end $$;

-- Operational tables (orders, order_lines, kitchen_tickets, tables, reservations,
-- waitlist, customers, loyalty_transactions, void_events, activity_log,
-- online_orders) keep the original full tenant_rw policy — waiters need them.

-- ==================================================================
-- Migracion 0007_security_hardening.sql
-- ==================================================================

-- Security hardening (review follow-up).

-- 1) next_folio must live in `public` to be callable via PostgREST rpc()
--    (0005 created it in `app`, which PostgREST does not expose). Recreate here.
drop function if exists app.next_folio(uuid, text);

create or replace function public.next_folio(tid uuid, p_serie text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare n integer;
begin
  if not app.has_tenant(tid) then
    raise exception 'no autorizado';
  end if;
  insert into folio_counters (tenant_id, serie, last)
    values (tid, p_serie, 1001)
    on conflict (tenant_id, serie)
    do update set last = folio_counters.last + 1
    returning last into n;
  return p_serie || '-' || lpad(n::text, 4, '0');
end $$;

grant execute on function public.next_folio(uuid, text) to authenticated, anon;

-- 2) Comprobantes are immutable fiscal records: forbid direct UPDATE, and expose
--    a narrow RPC that changes ONLY the SUNAT status/error, tenant-scoped.
drop policy if exists upd_members on comprobantes;

create or replace function public.set_comprobante_status(cid uuid, new_status sunat_status, new_error text)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update comprobantes
    set status = new_status, error = new_error
    where id = cid and app.has_tenant(tenant_id);
end $$;

grant execute on function public.set_comprobante_status(uuid, sunat_status, text) to authenticated, anon;

-- 3) The SUNAT outbox is an internal queue (not a fiscal record); members must be
--    able to remove entries once synced. 0006 dropped its delete permission.
create policy del_members on sunat_outbox for delete using (app.has_tenant(tenant_id));

-- ==================================================================
-- Migracion 0008_sunat_credentials.sql
-- ==================================================================

-- Credenciales de facturación electrónica por tenant (para producción multi-tenant).
-- Contiene secretos (clave SOL, certificado, llave privada), así que la tabla queda
-- CON RLS habilitada y SIN políticas: ningún cliente puede leerla. Solo la Edge
-- Function `sunat-emitir` la lee con el service role (que evade RLS).
--
-- Para la homologación beta puedes omitir esta tabla y usar los secrets del
-- proyecto (SUNAT_RUC=20000000001, SUNAT_SOL_USER=MODDATOS, etc.); ver README.

create type sunat_mode as enum ('beta', 'produccion');

create table sunat_credentials (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  mode        sunat_mode not null default 'beta',
  endpoint    text not null default 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  ruc         text not null,
  sol_user    text not null default 'MODDATOS',
  sol_pass    text not null default 'MODDATOS',
  cert_pem    text,   -- certificado X.509 (PEM)
  key_pem     text,   -- llave privada PKCS#8 (PEM)
  serie_factura text not null default 'F001',
  serie_boleta  text not null default 'B001',
  updated_at  timestamptz not null default now()
);

alter table sunat_credentials enable row level security;
-- Sin políticas: acceso denegado a clientes; solo service role (Edge Function).

-- ==================================================================
-- Migracion 0009_public_menu.sql
-- ==================================================================

-- Carta pública por slug, sin exponer tablas a anónimos: una función
-- SECURITY DEFINER devuelve solo lo necesario (nombre, moneda, categorías e
-- ítems disponibles). Así no filtramos MRR/dueño/estado del tenant.

create or replace function public.public_menu(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when t.id is null then null else jsonb_build_object(
    'tenant_name', t.name,
    'currency', coalesce(bs.currency::text, 'PEN'),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'key', c.key, 'name', c.name,
        'icon', c.icon, 'subtitle', c.subtitle, 'sort', c.sort) order by c.sort)
      from menu_categories c where c.tenant_id = t.id), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'category_id', i.category_id,
        'name', i.name, 'description', i.description, 'price', i.price, 'emoji', i.emoji,
        'badge', i.badge, 'is_veg', i.is_veg, 'is_spicy', i.is_spicy, 'is_gf', i.is_gf,
        'is_meat', i.is_meat, 'available', i.available, 'sort', i.sort) order by i.sort)
      from menu_items i where i.tenant_id = t.id and i.available), '[]'::jsonb)
  ) end
  from (select id, name from tenants where slug = p_slug) t
  left join business_settings bs on bs.tenant_id = t.id;
$$;

grant execute on function public.public_menu(text) to anon, authenticated;

-- ==================================================================
-- Migracion 0010_inventory_cost.sql
-- ==================================================================

-- Costo por unidad de insumo, para calcular food cost y márgenes por platillo.
alter table inventory_items add column if not exists cost numeric(12,2);

-- ==================================================================
-- Migracion 0011_payments.sql
-- ==================================================================

-- Métodos de pago Yape/Plin y configuración de pagos por tenant.
alter type pay_method add value if not exists 'yape';
alter type pay_method add value if not exists 'plin';

alter table business_settings add column if not exists yape_number text;
alter table business_settings add column if not exists plin_number text;
alter table business_settings add column if not exists card_provider text not null default 'ninguno';
alter table business_settings add column if not exists card_public_key text;

-- ==================================================================
-- Migracion 0012_payment_credentials.sql
-- ==================================================================

-- Credenciales secretas de la pasarela de tarjeta por tenant.
-- Contiene la llave secreta del proveedor, así que se puede ESCRIBIR pero no
-- LEER desde el cliente: RLS con INSERT/UPDATE para managers y sin SELECT. La
-- Edge Function de cobro la lee con el service role.

create table payment_credentials (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  provider    text not null default 'culqi',
  secret_key  text,          -- llave secreta del proveedor (nunca se devuelve al cliente)
  updated_at  timestamptz not null default now()
);

alter table payment_credentials enable row level security;
-- Managers pueden establecer/actualizar (no leer) las credenciales de su tenant.
create policy set_creds_ins on payment_credentials
  for insert with check (app.can_manage(tenant_id));
create policy set_creds_upd on payment_credentials
  for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
-- Sin policy de SELECT: el cliente nunca lee la llave secreta.

-- ==================================================================
-- Migracion 0013_notas_credito.sql
-- ==================================================================

-- Notas de crédito electrónicas (SUNAT tipo 07) + resumen diario de boletas.
--
-- Una nota de crédito referencia un comprobante ya emitido (boleta/factura) y
-- lo modifica o anula. Se guarda en la misma tabla `comprobantes` con
-- tipo = 'NotaCredito', el folio del documento de referencia y el motivo.
--
-- Nota: `alter type ... add value` es seguro dentro de la transacción de la
-- migración porque el nuevo valor no se USA en el mismo archivo (solo se agregan
-- columnas, sin insertar filas 'NotaCredito').

alter type comprobante_tipo add value if not exists 'NotaCredito';

alter table comprobantes add column if not exists ref_folio text;
alter table comprobantes add column if not exists motivo    text;

comment on column comprobantes.ref_folio is 'Folio del comprobante que modifica (para notas de crédito).';
comment on column comprobantes.motivo    is 'Motivo de la nota de crédito.';

-- ==================================================================
-- Migracion 0014_facturacion.sql
-- ==================================================================

-- Configuración de facturación electrónica por tenant.
--
-- Datos del emisor (RUC, razón social, dirección, ubigeo) y proveedor de
-- facturación (SUNAT directo u OSE/PSE). Los datos NO secretos van en
-- business_settings; las credenciales secretas (clave SOL, certificado, llave
-- privada, token del OSE) van en fiscal_credentials, que es de solo-escritura
-- desde el cliente (igual que payment_credentials).

alter table business_settings add column if not exists razon_social     text;
alter table business_settings add column if not exists ubigeo           text;
alter table business_settings add column if not exists billing_provider text not null default 'ninguno';
alter table business_settings add column if not exists sunat_mode       text not null default 'beta';
alter table business_settings add column if not exists sol_user         text;
alter table business_settings add column if not exists billing_endpoint text;

-- Credenciales secretas de facturación: se pueden ESCRIBIR pero no LEER desde
-- el cliente. La Edge Function las lee con el service role para firmar y enviar.
create table if not exists fiscal_credentials (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  provider   text not null default 'sunat_directo',
  sol_pass   text,   -- clave SOL (SUNAT directo)
  cert_pem   text,   -- certificado X.509 (PEM)
  key_pem    text,   -- llave privada PKCS#8 (PEM)
  api_token  text,   -- token/API key del OSE/PSE
  updated_at timestamptz not null default now()
);

alter table fiscal_credentials enable row level security;
-- Managers pueden establecer/actualizar (no leer) las credenciales de su tenant.
create policy set_fiscal_ins on fiscal_credentials
  for insert with check (app.can_manage(tenant_id));
create policy set_fiscal_upd on fiscal_credentials
  for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
-- Sin policy de SELECT: el cliente nunca lee las credenciales secretas.

-- ==================================================================
-- Migracion 0015_cdr_xml.sql
-- ==================================================================

-- Persistencia del resultado SUNAT: XML firmado, CDR (constancia) y ticket.
--
-- El XML firmado y el CDR son la evidencia legal del comprobante; se guardan
-- para poder descargarlos/reenviarlos. El ticket se usa en envíos asíncronos
-- (resumen diario / comunicación de baja).

alter table comprobantes add column if not exists signed_xml   text;
alter table comprobantes add column if not exists cdr          text; -- base64 del ZIP del CDR
alter table comprobantes add column if not exists sunat_ticket text;

-- RPC ampliada: además del estado/error, guarda XML firmado y CDR. Mantiene la
-- inmutabilidad (no hay UPDATE directo desde el cliente) y el tenant-scoping.
create or replace function public.set_comprobante_result(
  cid uuid, new_status sunat_status, new_error text, new_xml text, new_cdr text
)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update comprobantes
    set status = new_status,
        error  = new_error,
        signed_xml = coalesce(new_xml, signed_xml),
        cdr        = coalesce(new_cdr, cdr)
    where id = cid and app.has_tenant(tenant_id);
end $$;

grant execute on function public.set_comprobante_result(uuid, sunat_status, text, text, text)
  to authenticated, anon;

-- ==================================================================
-- Migracion 0016_kds_branch.sql
-- ==================================================================

-- Sucursal en las comandas de cocina, para filtrar el KDS por sucursal activa.
alter table kitchen_tickets add column if not exists branch_id uuid references branches(id) on delete set null;
create index if not exists kitchen_tickets_branch on kitchen_tickets (branch_id);

-- ==================================================================
-- Migracion 0017_platform_settings.sql
-- ==================================================================

-- Datos del emisor del SaaS (tu empresa) para facturar a los tenants.
-- Tabla de una sola fila, accesible solo por el dueño de la plataforma.
create table if not exists platform_settings (
  id            boolean primary key default true,
  razon_social  text not null default '',
  ruc           text not null default '',
  direccion     text not null default '',
  billing_email text not null default '',
  updated_at    timestamptz not null default now(),
  constraint platform_settings_singleton check (id)
);

insert into platform_settings (id) values (true) on conflict do nothing;

alter table platform_settings enable row level security;
create policy platform_settings_admin on platform_settings
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ==================================================================
-- Migracion 0018_subscription_charges.sql
-- ==================================================================

-- Cobros de suscripción con aprobación previa (dunning con validación).
--
-- El cobro automático NO ejecuta el cargo directamente: primero genera una
-- PROPUESTA de cobro con los datos que irán en la factura (RUC, razón social,
-- plan, base, IGV, total, periodo). El dueño del SaaS revisa/valida esos datos
-- y recién al APROBAR se ejecuta el cargo (pasarela) y se emite la factura.

do $$ begin
  create type charge_status as enum ('pendiente', 'aprobada', 'rechazada', 'cobrada', 'fallida');
exception when duplicate_object then null; end $$;

create table if not exists subscription_charges (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  plan         plan_tier not null,
  base         numeric(10,2) not null default 0,
  igv          numeric(10,2) not null default 0,
  total        numeric(10,2) not null,
  -- Foto de los datos a facturar en el momento de proponer el cobro:
  ruc          text,
  razon_social text,
  period       text not null,          -- p.ej. "2026-09"
  status       charge_status not null default 'pendiente',
  note         text,
  invoice_id   uuid references saas_invoices(id) on delete set null,
  proposed_at  timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null
);
create index if not exists subscription_charges_status_idx on subscription_charges (status);
-- Una sola propuesta pendiente por tenant y periodo (idempotencia del dunning).
create unique index if not exists subscription_charges_open_unique
  on subscription_charges (tenant_id, period)
  where status in ('pendiente', 'aprobada');

alter table subscription_charges enable row level security;
create policy subcharges_admin on subscription_charges
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ==================================================================
-- Migracion 0019_payment_webhooks.sql
-- ==================================================================

-- Pasarelas de pago: credenciales extra (Izipay/Niubiz) y webhooks idempotentes.

-- Campos adicionales de credenciales para proveedores más allá de Culqi.
alter table payment_credentials add column if not exists public_key     text;  -- llave pública (Izipay/Niubiz)
alter table payment_credentials add column if not exists merchant_id    text;  -- código de comercio (Niubiz)
alter table payment_credentials add column if not exists webhook_secret text;  -- para verificar la firma de los webhooks
alter table payment_credentials add column if not exists extra          jsonb not null default '{}'::jsonb;

-- Registro idempotente de eventos de pasarela (webhooks). La Edge Function los
-- inserta con el service role; el unique (provider, event_id) garantiza que un
-- mismo evento no se procese dos veces aunque la pasarela lo reintente.
create table if not exists payment_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  provider    text not null,
  event_id    text not null,
  event_type  text,
  charge_id   text,
  amount      numeric(12,2),
  status      text,
  raw         jsonb,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);
create index if not exists payment_events_tenant_idx on payment_events (tenant_id);

alter table payment_events enable row level security;
-- Lectura: el tenant ve sus eventos; la plataforma ve todos. La escritura es
-- exclusiva de la Edge Function (service role), que evita el RLS.
create policy payment_events_read on payment_events
  for select using (app.has_tenant(tenant_id) or app.is_platform_admin());

-- ==================================================================
-- Migracion 0020_libro_reclamaciones.sql
-- ==================================================================

-- Libro de Reclamaciones digital (Indecopi) por tenant.
--
-- El consumidor presenta una Hoja de Reclamación desde una página pública; el
-- tenant la ve y responde desde el POS. La inserción pública va por una función
-- SECURITY DEFINER (no exponemos la tabla a anónimos). El tenant lee/actualiza
-- solo las suyas; la plataforma puede leerlas todas para soporte.

create table if not exists complaints (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  correlativo    integer not null,
  -- Consumidor
  consumer_name  text not null,
  consumer_doc_type text not null default 'DNI',
  consumer_doc   text not null,
  consumer_address text,
  consumer_phone text,
  consumer_email text,
  is_minor       boolean not null default false,
  -- Bien contratado
  item_type      text not null default 'servicio',  -- 'producto' | 'servicio'
  item_amount    numeric(12,2),
  item_description text,
  -- Detalle
  claim_type     text not null default 'reclamo',    -- 'reclamo' | 'queja'
  detail         text not null,
  request        text,                                -- pedido del consumidor
  -- Respuesta del proveedor
  status         text not null default 'pendiente',   -- 'pendiente' | 'respondido'
  response       text,
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (tenant_id, correlativo)
);
create index if not exists complaints_tenant_idx on complaints (tenant_id, created_at desc);

alter table complaints enable row level security;
create policy complaints_tenant_read on complaints
  for select using (app.has_tenant(tenant_id) or app.is_platform_admin());
create policy complaints_tenant_upd on complaints
  for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));

-- Datos públicos mínimos del emisor para encabezar la hoja de reclamación.
create or replace function public.public_tenant_info(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when t.id is null then null else jsonb_build_object(
    'tenant_name', t.name,
    'ruc', bs.ruc,
    'razon_social', coalesce(bs.razon_social, t.name),
    'address', bs.address
  ) end
  from (select id, name from tenants where slug = p_slug) t
  left join business_settings bs on bs.tenant_id = t.id;
$$;
grant execute on function public.public_tenant_info(text) to anon, authenticated;

-- Recepción pública de una hoja de reclamación. Devuelve el correlativo asignado.
create or replace function public.submit_complaint(p_slug text, payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_next   integer;
begin
  select id into v_tenant from tenants where slug = p_slug;
  if v_tenant is null then
    return jsonb_build_object('error', 'Local no encontrado');
  end if;
  select coalesce(max(correlativo), 0) + 1 into v_next from complaints where tenant_id = v_tenant;
  insert into complaints (
    tenant_id, correlativo, consumer_name, consumer_doc_type, consumer_doc,
    consumer_address, consumer_phone, consumer_email, is_minor,
    item_type, item_amount, item_description, claim_type, detail, request
  ) values (
    v_tenant, v_next,
    coalesce(payload->>'consumer_name', ''),
    coalesce(payload->>'consumer_doc_type', 'DNI'),
    coalesce(payload->>'consumer_doc', ''),
    payload->>'consumer_address',
    payload->>'consumer_phone',
    payload->>'consumer_email',
    coalesce((payload->>'is_minor')::boolean, false),
    coalesce(payload->>'item_type', 'servicio'),
    nullif(payload->>'item_amount', '')::numeric,
    payload->>'item_description',
    coalesce(payload->>'claim_type', 'reclamo'),
    coalesce(payload->>'detail', ''),
    payload->>'request'
  );
  return jsonb_build_object('correlativo', v_next);
end;
$$;
grant execute on function public.submit_complaint(text, jsonb) to anon, authenticated;

-- ==================================================================
-- Migracion 0021_platform_billing.sql
-- ==================================================================

-- Proveedor de facturación del SaaS (para las facturas de suscripción que la
-- plataforma emite a los tenants): SUNAT directo u OSE/PSE (Nubefact, etc.).

alter table platform_settings add column if not exists billing_provider text not null default 'sunat_directo';
alter table platform_settings add column if not exists sunat_mode       text not null default 'beta';
alter table platform_settings add column if not exists sol_user         text;
alter table platform_settings add column if not exists billing_endpoint text;

-- Credenciales secretas del emisor de la plataforma (write-only, como las del
-- tenant): clave SOL, certificado, llave privada, token del OSE. Fila única.
create table if not exists platform_fiscal_credentials (
  id         boolean primary key default true,
  provider   text not null default 'sunat_directo',
  sol_pass   text,
  cert_pem   text,
  key_pem    text,
  api_token  text,
  updated_at timestamptz not null default now(),
  constraint platform_fiscal_singleton check (id)
);
insert into platform_fiscal_credentials (id) values (true) on conflict do nothing;

alter table platform_fiscal_credentials enable row level security;
-- El dueño de la plataforma puede escribir/actualizar; nadie las LEE desde el
-- cliente (sin policy de SELECT). La Edge Function las lee con el service role.
create policy platform_fiscal_ins on platform_fiscal_credentials
  for insert with check (app.is_platform_admin());
create policy platform_fiscal_upd on platform_fiscal_credentials
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ==================================================================
-- Migracion 0022_reservas.sql
-- ==================================================================

-- Reservas y lista de espera: enriquecemos las tablas base con contacto, fecha,
-- sucursal y estado para poder gestionarlas desde el POS.

alter table reservations add column if not exists phone     text;
alter table reservations add column if not exists res_date  date not null default current_date;
alter table reservations add column if not exists status    text not null default 'pendiente'; -- pendiente|confirmada|sentada|cancelada
alter table reservations add column if not exists branch_id uuid references branches(id) on delete set null;
alter table reservations add column if not exists notes     text;
alter table reservations add column if not exists created_at timestamptz not null default now();
create index if not exists reservations_tenant_date_idx on reservations (tenant_id, res_date);

alter table waitlist add column if not exists phone     text;
alter table waitlist add column if not exists status    text not null default 'esperando'; -- esperando|llamado|sentado|retirado
alter table waitlist add column if not exists branch_id uuid references branches(id) on delete set null;
alter table waitlist add column if not exists created_at timestamptz not null default now();
create index if not exists waitlist_tenant_idx on waitlist (tenant_id, created_at);

-- ==================================================================
-- Migracion 0023_role_permissions.sql
-- ==================================================================

-- Permisos por rol configurables por el tenant (más allá de los roles fijos).
-- Cada fila define, para un rol, la lista de pantallas del POS a las que puede
-- acceder. Si no hay fila para un rol, se usan los permisos por defecto del rol.

create table if not exists role_permissions (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  role       app_role not null,
  screens    text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, role)
);

alter table role_permissions enable row level security;
-- Todos los miembros del tenant leen (para saber qué mostrar); solo dueño/admin escriben.
create policy role_perms_read on role_permissions
  for select using (app.has_tenant(tenant_id) or app.is_platform_admin());
create policy role_perms_write on role_permissions
  for all using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));

-- ==================================================================
-- Migracion 0024_access_log.sql
-- ==================================================================

-- Auditoría de accesos: registra los inicios de sesión (para el dueño del SaaS).
-- El 2FA (TOTP) se maneja con el MFA nativo de Supabase Auth (no requiere tabla).

create table if not exists access_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  email      text,
  role       text,
  event      text not null default 'login',   -- login | logout | 2fa_enroll | 2fa_disable
  user_agent text,
  at         timestamptz not null default now()
);
create index if not exists access_log_at_idx on access_log (at desc);

alter table access_log enable row level security;
-- Cada usuario inserta sus propios eventos; la plataforma (y el propio usuario) los leen.
create policy access_log_insert on access_log
  for insert with check (auth.uid() = user_id);
create policy access_log_read on access_log
  for select using (app.is_platform_admin() or auth.uid() = user_id);

-- ==================================================================
-- Migracion 0025_contact_messages.sql
-- ==================================================================

-- Mensajes de contacto de la landing (solicitudes de demo / leads).
-- La Edge Function `contacto` los inserta con el service role; solo la
-- plataforma los lee. No hay policy de insert para el cliente.

create table if not exists contact_messages (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  negocio    text,
  email      text not null,
  telefono   text,
  mensaje    text,
  origen     text not null default 'landing',
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_created_idx on contact_messages (created_at desc);

alter table contact_messages enable row level security;
create policy contact_read_admin on contact_messages
  for select using (app.is_platform_admin());
create policy contact_update_admin on contact_messages
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ==================================================================
-- Migracion 0026_plan_change_requests.sql
-- ==================================================================

-- Autoservicio de suscripción: el dueño del restaurante solicita un cambio de
-- plan y la plataforma lo aprueba (consistente con el modelo de aprobación).

do $$ begin
  create type plan_req_status as enum ('pendiente','aprobada','rechazada');
exception when duplicate_object then null; end $$;

create table if not exists plan_change_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  from_plan    plan_tier not null,
  to_plan      plan_tier not null,
  status       plan_req_status not null default 'pendiente',
  note         text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists plan_req_tenant_idx on plan_change_requests (tenant_id, status);
-- Una sola solicitud pendiente por tenant.
create unique index if not exists plan_req_open_unique on plan_change_requests (tenant_id) where status = 'pendiente';

alter table plan_change_requests enable row level security;
create policy planreq_tenant_ins on plan_change_requests
  for insert with check (app.can_manage(tenant_id));
create policy planreq_read on plan_change_requests
  for select using (app.has_tenant(tenant_id) or app.is_platform_admin());
create policy planreq_admin_upd on plan_change_requests
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ==================================================================
-- Migracion 0027_config_audit.sql
-- ==================================================================

-- Auditoría de cambios sensibles de configuración.
-- Se implementa con triggers de base de datos para capturar TODA modificación,
-- sin importar por qué ruta de código llegue (app, Edge Function, SQL directo).
-- Los valores de columnas secretas (contraseñas, certificados, tokens, llaves)
-- se enmascaran: se registra QUÉ cambió, nunca el secreto.

create table if not exists config_audit (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade, -- null = configuración de plataforma
  table_name   text not null,
  op           text not null,                                  -- INSERT | UPDATE | DELETE
  changed_by   uuid references auth.users(id) on delete set null,
  changed_email text,
  changed_keys text[] not null default '{}',                   -- columnas modificadas
  diff         jsonb not null default '{}'::jsonb,             -- { col: { old, new } } (secretos enmascarados)
  at           timestamptz not null default now()
);
create index if not exists config_audit_tenant_idx on config_audit (tenant_id, at desc);
create index if not exists config_audit_at_idx on config_audit (at desc);

alter table config_audit enable row level security;
-- Solo lectura para la plataforma y para el dueño del tenant; nadie escribe a mano
-- (lo escribe el trigger, que corre como SECURITY DEFINER).
create policy config_audit_read on config_audit
  for select using (
    app.is_platform_admin()
    or (tenant_id is not null and app.has_tenant(tenant_id))
  );

-- ---------------------------------------------------------------------------
-- Función de trigger genérica.
--   TG_ARGV[0] = nombre de la columna tenant_id, o 'none' para config de plataforma.
--   TG_ARGV[1] = columnas secretas separadas por coma (o '' si no hay).
-- ---------------------------------------------------------------------------
create or replace function app.audit_config()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_tenant     uuid;
  v_secret_arr text[] := case when TG_ARGV[1] = '' then '{}'::text[]
                              else string_to_array(TG_ARGV[1], ',') end;
  v_new        jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
  v_old        jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  v_keys       text[] := '{}';
  v_diff       jsonb := '{}'::jsonb;
  k            text;
  old_v        jsonb;
  new_v        jsonb;
  is_secret    boolean;
begin
  -- tenant_id
  if TG_ARGV[0] = 'none' then
    v_tenant := null;
  elsif TG_OP = 'DELETE' then
    v_tenant := (v_old ->> TG_ARGV[0])::uuid;
  else
    v_tenant := (v_new ->> TG_ARGV[0])::uuid;
  end if;

  -- Recorre la unión de claves de old y new y detecta las que cambian.
  for k in
    select distinct key from (
      select jsonb_object_keys(v_new) as key
      union
      select jsonb_object_keys(v_old) as key
    ) s
  loop
    old_v := v_old -> k;
    new_v := v_new -> k;
    if old_v is distinct from new_v then
      if k in ('updated_at') then
        continue; -- ruido: la marca de tiempo cambia siempre
      end if;
      is_secret := k = any(v_secret_arr);
      v_keys := array_append(v_keys, k);
      if is_secret then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object(
          'old', case when old_v is null or old_v = 'null'::jsonb then null else '***' end,
          'new', case when new_v is null or new_v = 'null'::jsonb then null else '***' end
        ));
      else
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('old', old_v, 'new', new_v));
      end if;
    end if;
  end loop;

  -- Nada relevante cambió (p. ej. sólo updated_at): no registres ruido.
  if TG_OP = 'UPDATE' and array_length(v_keys, 1) is null then
    return NEW;
  end if;

  insert into config_audit (tenant_id, table_name, op, changed_by, changed_email, changed_keys, diff)
  values (
    v_tenant, TG_TABLE_NAME, TG_OP, auth.uid(),
    (select email from auth.users where id = auth.uid()),
    v_keys, v_diff
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end $$;

-- ---------------------------------------------------------------------------
-- Enganche de triggers a las tablas sensibles.
-- ---------------------------------------------------------------------------
-- Config del negocio (incluye datos fiscales, modo SUNAT, proveedor de facturación).
drop trigger if exists audit_business_settings on business_settings;
create trigger audit_business_settings
  after insert or update or delete on business_settings
  for each row execute function app.audit_config('tenant_id', '');

-- Credenciales de pago del tenant (secretas).
drop trigger if exists audit_payment_credentials on payment_credentials;
create trigger audit_payment_credentials
  after insert or update or delete on payment_credentials
  for each row execute function app.audit_config('tenant_id', 'secret_key,webhook_secret');

-- Credenciales fiscales del tenant (secretas).
drop trigger if exists audit_fiscal_credentials on fiscal_credentials;
create trigger audit_fiscal_credentials
  after insert or update or delete on fiscal_credentials
  for each row execute function app.audit_config('tenant_id', 'sol_pass,cert_pem,key_pem,api_token');

-- Permisos por rol del tenant.
drop trigger if exists audit_role_permissions on role_permissions;
create trigger audit_role_permissions
  after insert or update or delete on role_permissions
  for each row execute function app.audit_config('tenant_id', '');

-- Configuración del emisor de la plataforma (sin tenant).
drop trigger if exists audit_platform_settings on platform_settings;
create trigger audit_platform_settings
  after insert or update or delete on platform_settings
  for each row execute function app.audit_config('none', '');

-- Credenciales fiscales del emisor de la plataforma (secretas, sin tenant).
drop trigger if exists audit_platform_fiscal_credentials on platform_fiscal_credentials;
create trigger audit_platform_fiscal_credentials
  after insert or update or delete on platform_fiscal_credentials
  for each row execute function app.audit_config('none', 'sol_pass,cert_pem,key_pem,api_token');

-- ==================================================================
-- Migracion 0028_push_subscriptions.sql
-- ==================================================================

-- Notificaciones push (Web Push / VAPID). Guarda la suscripción del navegador
-- de cada usuario para enviarle notificaciones (comanda lista, cobro aprobado,
-- alertas de SUNAT, etc.). El envío lo hace la Edge Function push-enviar con
-- las claves VAPID (secretas, solo en el servidor).

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references tenants(id) on delete cascade, -- null para usuarios de plataforma
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);
create index if not exists push_sub_tenant_idx on push_subscriptions (tenant_id);
create index if not exists push_sub_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
-- Cada usuario administra sus propias suscripciones; la plataforma puede leer
-- (para diagnóstico). El envío real usa la service role y omite RLS.
create policy push_sub_own_ins on push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy push_sub_own_del on push_subscriptions
  for delete using (auth.uid() = user_id);
create policy push_sub_read on push_subscriptions
  for select using (auth.uid() = user_id or app.is_platform_admin());

-- ==================================================================
-- Migracion 0029_delivery.sql
-- ==================================================================

-- Delivery: zonas de reparto, repartidores propios y pedidos a domicilio
-- (canales propios —teléfono, WhatsApp, web— y agregadores —Rappi, PedidosYa—).
-- El cliente sigue su pedido con un enlace público basado en un token secreto.

do $$ begin
  create type delivery_status as enum ('recibido','preparando','listo','en_camino','entregado','cancelado');
exception when duplicate_object then null; end $$;

-- Código visible para el cliente (D-1001, D-1002, …).
create sequence if not exists delivery_code_seq start 1001;

create table if not exists delivery_zones (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name      text not null,
  fee       numeric(10,2) not null default 0 check (fee >= 0),
  eta_min   int not null default 40 check (eta_min > 0),
  active    boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists delivery_zones_tenant_idx on delivery_zones (tenant_id);

create table if not exists delivery_drivers (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name      text not null,
  phone     text not null default '',
  vehicle   text not null default 'moto' check (vehicle in ('moto','bici','auto')),
  active    boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists delivery_drivers_tenant_idx on delivery_drivers (tenant_id);

create table if not exists delivery_orders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  branch_id      uuid references branches(id) on delete set null,
  code           text not null default ('D-' || nextval('delivery_code_seq')),
  -- 24 hex = 96 bits aleatorios: el enlace público no se puede adivinar.
  tracking_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  channel        text not null check (channel in ('telefono','whatsapp','web','rappi','pedidosya')),
  customer_name  text not null,
  customer_phone text not null default '',
  address        text not null default '',
  reference      text not null default '',
  zone_id        uuid references delivery_zones(id) on delete set null,
  zone_name      text not null default '',
  items          jsonb not null default '[]'::jsonb, -- [{name, qty, price}]
  subtotal       numeric(12,2) not null default 0,
  fee            numeric(10,2) not null default 0,
  total          numeric(12,2) not null default 0,
  pay_method     text not null check (pay_method in ('efectivo','yape','plin','tarjeta','pagado_app')),
  cash_for       numeric(12,2),
  status         delivery_status not null default 'recibido',
  driver_id      uuid references delivery_drivers(id) on delete set null,
  notes          text not null default '',
  cancel_reason  text,
  eta_min        int not null default 40,
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  ready_at       timestamptz,
  dispatched_at  timestamptz,
  delivered_at   timestamptz,
  cancelled_at   timestamptz
);
create index if not exists delivery_orders_tenant_idx on delivery_orders (tenant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Zonas y repartidores: todo el equipo los ve; solo gerente/dueño los gestiona.
alter table delivery_zones enable row level security;
create policy dz_read on delivery_zones for select using (app.has_tenant(tenant_id));
create policy dz_ins on delivery_zones for insert with check (app.can_manage(tenant_id));
create policy dz_upd on delivery_zones for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
create policy dz_del on delivery_zones for delete using (app.can_manage(tenant_id));

alter table delivery_drivers enable row level security;
create policy dd_read on delivery_drivers for select using (app.has_tenant(tenant_id));
create policy dd_ins on delivery_drivers for insert with check (app.can_manage(tenant_id));
create policy dd_upd on delivery_drivers for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
create policy dd_del on delivery_drivers for delete using (app.can_manage(tenant_id));

-- Pedidos: cualquier miembro del tenant los toma y avanza (meseros/cajeros
-- reciben pedidos por teléfono). No se borran: se cancelan con motivo.
alter table delivery_orders enable row level security;
create policy do_read on delivery_orders for select using (app.has_tenant(tenant_id));
create policy do_ins on delivery_orders for insert with check (app.has_tenant(tenant_id));
create policy do_upd on delivery_orders for update using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Seguimiento público (sin sesión). Devuelve solo lo necesario para el cliente:
-- NUNCA dirección, teléfono, montos ni el nombre completo del repartidor.
-- ---------------------------------------------------------------------------
create or replace function public.public_delivery_status(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenant_name',   t.name,
    'code',          d.code,
    'status',        d.status,
    'eta_min',       d.eta_min,
    'driver_name',   case when d.status in ('en_camino','entregado')
                          then split_part(dr.name, ' ', 1) end,
    'created_at',    d.created_at,
    'accepted_at',   d.accepted_at,
    'ready_at',      d.ready_at,
    'dispatched_at', d.dispatched_at,
    'delivered_at',  d.delivered_at,
    'cancelled_at',  d.cancelled_at
  )
  from delivery_orders d
  join tenants t on t.id = d.tenant_id
  left join delivery_drivers dr on dr.id = d.driver_id
  where length(p_token) >= 16 and d.tracking_token = p_token;
$$;

grant execute on function public.public_delivery_status(text) to anon, authenticated;

-- ==================================================================
-- Migracion 0030_enums_operacion.sql
-- ==================================================================

-- Valores de enum que usa la migración 0031. Van en un archivo aparte porque
-- Postgres no permite usar un valor de enum en la misma transacción en que se
-- agrega (cada migración corre en su propia transacción).

-- Pedidos de delivery pagados en la app del agregador (Rappi, PedidosYa).
alter type pay_method add value if not exists 'app';

-- ==================================================================
-- Migracion 0031_arquitectura.sql
-- ==================================================================

-- =============================================================================
-- 0031 · Arquitectura multi-sucursal, normalización y rendimiento
--
--  1. Sucursales como árbol: cada restaurante (tenant) tiene UNA sede principal
--     (raíz, parent_id null) y sucursales hijas. Se crea sola al dar de alta el
--     tenant. Integridad: sin ciclos, raíz única, hijos del mismo tenant.
--  2. Cuota por plan: subscription_plans.max_branches = sucursales además de la
--     principal (Básico 2 · Pro 10 · Enterprise sin límite). Se valida al crear
--     o reactivar sucursales y al bajar de plan.
--  3. branch_id obligatorio en la operación (por defecto, la sede principal) y
--     FK compuesta (tenant_id, branch_id): una fila nunca apunta a la sucursal
--     de otro restaurante.
--  4. Delivery unificado con pedidos: delivery_orders pasa a ser la extensión
--     1:1 de orders (misma id). Sus platos viven en order_lines, así el delivery
--     entra en reportes, caja, inventario y comprobantes como cualquier venta.
--  5. Inventario por sucursal: catálogo (inventory_items) + stock por sucursal
--     (inventory_stock) + kardex (inventory_movements). El stock es la suma
--     de movimientos, mantenida por trigger.
--  6. Limpieza: online_orders / sunat_credentials / payroll_entries (sin uso),
--     tenants.mrr (derivado del plan: vista v_tenants).
--  7. updated_at en tablas operativas (sincronización incremental offline).
--  8. Índices para las consultas reales y RLS con InitPlan (los helpers se
--     evalúan una vez por consulta, no una vez por fila).
--  9. Publicación de Realtime con las tablas operativas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers genéricos
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Tenants del usuario actual en un arreglo: permite escribir las políticas como
-- `tenant_id = any((select app.my_tenant_ids()))`, que Postgres evalúa una sola
-- vez por consulta (InitPlan) en lugar de llamar a una función por cada fila.
create or replace function app.my_tenant_ids() returns uuid[]
language sql stable security definer set search_path = public, app as $$
  select coalesce(array_agg(m.tenant_id), '{}')
  from memberships m
  where m.user_id = auth.uid() and m.tenant_id is not null;
$$;

create or replace function app.my_managed_tenant_ids() returns uuid[]
language sql stable security definer set search_path = public, app as $$
  select coalesce(array_agg(m.tenant_id), '{}')
  from memberships m
  where m.user_id = auth.uid() and m.tenant_id is not null and m.role in ('admin', 'dueno');
$$;

-- ---------------------------------------------------------------------------
-- 1. Árbol de sucursales
-- ---------------------------------------------------------------------------
alter table branches
  add column if not exists parent_id  uuid,
  add column if not exists active     boolean not null default true,
  add column if not exists address    text not null default '',
  add column if not exists phone      text not null default '',
  add column if not exists sort       int  not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table branches add constraint branches_tenant_id_id_key unique (tenant_id, id);
alter table branches add constraint branches_not_self check (parent_id is null or parent_id <> id);
-- NO ACTION (no RESTRICT): al borrar un tenant, la cascada elimina todo el árbol
-- en la misma sentencia y la FK se valida al final.
alter table branches add constraint branches_parent_fk
  foreign key (tenant_id, parent_id) references branches (tenant_id, id);

-- Tenants sin sucursales: se les crea su sede principal.
insert into branches (tenant_id, name, city)
select t.id, t.name, ''
from tenants t
where not exists (select 1 from branches b where b.tenant_id = t.id);

-- Tenants con sucursales: la más antigua es la principal; el resto, sus hijas.
with roots as (
  select distinct on (tenant_id) tenant_id, id
  from branches
  order by tenant_id, created_at, name
)
update branches b set parent_id = r.id
from roots r
where b.tenant_id = r.tenant_id and b.id <> r.id and b.parent_id is null;

create unique index branches_one_root on branches (tenant_id) where parent_id is null;
create index branches_parent_idx on branches (parent_id);

create or replace function app.root_branch(tid uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select id from branches where tenant_id = tid and parent_id is null;
$$;

-- Integridad del árbol: la principal no cuelga de nadie; sin ciclos; hasta 5 niveles.
create or replace function app.branches_tree_guard() returns trigger
language plpgsql as $$
declare
  cur   uuid := new.parent_id;
  depth int  := 0;
begin
  if tg_op = 'UPDATE' and old.parent_id is null and new.parent_id is not null then
    raise exception 'La sede principal no puede depender de otra sucursal.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.parent_id is not null and new.parent_id is null then
    raise exception 'Ya existe una sede principal; una sucursal no puede convertirse en principal.' using errcode = 'P0001';
  end if;
  while cur is not null loop
    if cur = new.id then
      raise exception 'Una sucursal no puede depender de sí misma ni de sus propias sucursales.' using errcode = 'P0001';
    end if;
    depth := depth + 1;
    if depth > 5 then
      raise exception 'El árbol de sucursales admite hasta 5 niveles.' using errcode = 'P0001';
    end if;
    select parent_id into cur from branches where id = cur;
  end loop;
  return new;
end $$;

create trigger branches_tree_guard
  before insert or update of parent_id on branches
  for each row execute function app.branches_tree_guard();

-- Borrado directo (no en cascada desde el tenant): nunca la principal, nunca
-- una sucursal con hijas o con historial. Para dejar de usarla: desactivarla.
create or replace function app.branches_delete_guard() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return old; -- cascada al eliminar el tenant completo
  end if;
  if old.parent_id is null then
    raise exception 'La sede principal no se puede eliminar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from branches where parent_id = old.id) then
    raise exception 'La sucursal tiene sucursales dependientes; muévelas primero.' using errcode = 'P0001';
  end if;
  if exists (select 1 from orders where branch_id = old.id)
     or exists (select 1 from restaurant_tables where branch_id = old.id) then
    raise exception 'La sucursal tiene mesas o ventas registradas; desactívala en lugar de eliminarla.' using errcode = 'P0001';
  end if;
  return old;
end $$;

create trigger branches_delete_guard
  before delete on branches
  for each row execute function app.branches_delete_guard();

create trigger branches_touch before update on branches
  for each row execute function app.touch_updated_at();

-- Alta de tenant → su sede principal (mismo nombre; se puede renombrar).
create or replace function app.tenants_create_root() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  insert into branches (tenant_id, name, city) values (new.id, new.name, '');
  return new;
end $$;

create trigger tenants_create_root
  after insert on tenants
  for each row execute function app.tenants_create_root();

-- ---------------------------------------------------------------------------
-- 2. Cuota de sucursales por plan
-- ---------------------------------------------------------------------------
alter table subscription_plans
  add column if not exists max_branches int check (max_branches is null or max_branches >= 0);
comment on column subscription_plans.max_branches is
  'Sucursales permitidas además de la sede principal. NULL = sin límite.';

update subscription_plans set max_branches = case tier
  when 'Básico' then 2
  when 'Pro' then 10
  else null
end;

create or replace function app.plan_max_branches(p_plan plan_tier) returns int
language sql stable security definer set search_path = public, app as $$
  select max_branches from subscription_plans where tier = p_plan;
$$;

create or replace function app.active_child_branches(tid uuid, except_id uuid default null) returns int
language sql stable security definer set search_path = public, app as $$
  select count(*)::int from branches
  where tenant_id = tid and parent_id is not null and active
    and (except_id is null or id <> except_id);
$$;

create or replace function app.branches_quota_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_plan plan_tier;
  v_max  int;
begin
  -- Solo cuenta al sumar una sucursal activa (alta o reactivación).
  if new.parent_id is null or not new.active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.active and old.parent_id is not null then
    return new;
  end if;
  -- Serializa altas concurrentes del mismo tenant.
  select plan into v_plan from tenants where id = new.tenant_id for update;
  v_max := app.plan_max_branches(v_plan);
  if v_max is not null and app.active_child_branches(new.tenant_id, new.id) >= v_max then
    raise exception 'Tu plan % permite la sede principal y hasta % sucursales. Mejora tu plan para agregar más.', v_plan, v_max
      using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;

create trigger branches_quota_guard
  before insert or update of active, parent_id on branches
  for each row execute function app.branches_quota_guard();

-- Bajar de plan no puede dejar más sucursales activas que las permitidas.
create or replace function app.tenants_plan_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_max  int := app.plan_max_branches(new.plan);
  v_used int;
begin
  if new.plan is distinct from old.plan and v_max is not null then
    v_used := app.active_child_branches(new.id);
    if v_used > v_max then
      raise exception 'El plan % permite hasta % sucursales y el restaurante tiene % activas. Desactiva % antes de cambiar de plan.',
        new.plan, v_max, v_used, v_used - v_max
        using errcode = 'P0001', hint = 'plan_limit';
    end if;
  end if;
  return new;
end $$;

create trigger tenants_plan_guard
  before update of plan on tenants
  for each row execute function app.tenants_plan_guard();

-- Uso de la cuota para la UI (Sucursales / Suscripción).
create or replace function public.branch_quota(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_plan plan_tier;
  v_max  int;
  v_used int;
begin
  if not ((select app.is_platform_admin()) or p_tenant = any (app.my_tenant_ids())) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;
  select plan into v_plan from tenants where id = p_tenant;
  v_max := app.plan_max_branches(v_plan);
  v_used := app.active_child_branches(p_tenant);
  return jsonb_build_object(
    'plan', v_plan,
    'max', v_max,
    'used', v_used,
    'remaining', case when v_max is null then null else greatest(v_max - v_used, 0) end
  );
end $$;
grant execute on function public.branch_quota(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. branch_id obligatorio + FK compuesta (tenant_id, branch_id)
-- ---------------------------------------------------------------------------
create or replace function app.fill_branch() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.branch_id is null then
    new.branch_id := app.root_branch(new.tenant_id);
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'restaurant_tables', 'kitchen_tickets', 'reservations',
                           'waitlist', 'cash_register_closes']
  loop
    execute format(
      'update %I x set branch_id = app.root_branch(x.tenant_id) where x.branch_id is null', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_branch_id_fkey');
    execute format('alter table %I alter column branch_id set not null', t);
    execute format(
      'alter table %I add constraint %I foreign key (tenant_id, branch_id) references branches (tenant_id, id)',
      t, t || '_branch_fk');
    execute format(
      'create trigger %I before insert on %I for each row execute function app.fill_branch()',
      t || '_fill_branch', t);
  end loop;
end $$;

-- Números de mesa únicos por sucursal (dos locales pueden tener su "Mesa 1").
alter table restaurant_tables drop constraint if exists restaurant_tables_tenant_id_number_key;
alter table restaurant_tables add constraint restaurant_tables_branch_number_key unique (branch_id, number);

-- ---------------------------------------------------------------------------
-- 4. Delivery = pedido (orders) + datos de reparto (delivery_orders, 1:1)
-- ---------------------------------------------------------------------------
create type order_kind as enum ('mesa', 'llevar', 'delivery');

alter table orders
  add column if not exists kind       order_kind not null default 'mesa',
  add column if not exists updated_at timestamptz not null default now();

alter table order_lines
  add column if not exists sent_qty int not null default 0 check (sent_qty >= 0);

-- Pedidos de delivery ya existentes → pedido + líneas (misma id).
insert into orders (id, tenant_id, branch_id, kind, status, opened_at, closed_at, paid_method, paid_total)
select d.id, d.tenant_id, coalesce(d.branch_id, app.root_branch(d.tenant_id)), 'delivery',
  case d.status
    when 'entregado' then 'cobrada'::order_status
    when 'cancelado' then 'anulada'::order_status
    when 'recibido'  then 'abierta'::order_status
    else 'en_cocina'::order_status
  end,
  d.created_at,
  coalesce(d.delivered_at, d.cancelled_at),
  case when d.status = 'entregado' then
    (case d.pay_method when 'pagado_app' then 'app' else d.pay_method end)::pay_method
  end,
  case when d.status = 'entregado' then d.total end
from delivery_orders d;

insert into order_lines (tenant_id, order_id, name, qty, unit_price, sent_qty, created_at)
select d.tenant_id, d.id, i ->> 'name', (i ->> 'qty')::int, (i ->> 'price')::numeric,
  case when d.status = 'recibido' then 0 else (i ->> 'qty')::int end, d.created_at
from delivery_orders d, jsonb_array_elements(d.items) i;

alter table delivery_orders
  add constraint delivery_orders_order_fk foreign key (id) references orders (id) on delete cascade,
  alter column id drop default,
  add column if not exists updated_at timestamptz not null default now();

drop index if exists delivery_orders_tenant_idx;
alter table delivery_orders
  drop column if exists branch_id,
  drop column if exists items,
  drop column if exists subtotal,
  drop column if exists total,
  drop column if exists created_at;

-- tenant_id se copia del pedido (redundancia controlada: RLS y filtro de Realtime).
create or replace function app.delivery_fill_tenant() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  select tenant_id into new.tenant_id from orders where id = new.id;
  if new.tenant_id is null then
    raise exception 'El pedido % no existe.', new.id using errcode = '23503';
  end if;
  return new;
end $$;

create trigger delivery_orders_fill_tenant
  before insert on delivery_orders
  for each row execute function app.delivery_fill_tenant();

-- Vista de lectura del tablero de delivery (respeta RLS del que consulta).
create view v_delivery_orders with (security_invoker = true) as
select
  d.id, d.tenant_id, o.branch_id, d.code, d.tracking_token, d.channel,
  d.customer_name, d.customer_phone, d.address, d.reference, d.zone_id, d.zone_name,
  coalesce(l.items, '[]'::jsonb) as items,
  coalesce(l.subtotal, 0)::numeric(12,2) as subtotal,
  d.fee,
  (coalesce(l.subtotal, 0) + d.fee)::numeric(12,2) as total,
  d.pay_method, d.cash_for, d.status, d.driver_id, dr.name as driver_name,
  d.notes, d.cancel_reason, d.eta_min,
  o.opened_at as created_at, d.accepted_at, d.ready_at, d.dispatched_at, d.delivered_at, d.cancelled_at,
  greatest(d.updated_at, o.updated_at) as updated_at
from delivery_orders d
join orders o on o.id = d.id
left join delivery_drivers dr on dr.id = d.driver_id
left join lateral (
  select
    jsonb_agg(jsonb_build_object('name', ol.name, 'qty', ol.qty, 'price', ol.unit_price + ol.extra_price)
              order by ol.created_at) as items,
    round(sum(ol.qty * (ol.unit_price + ol.extra_price)), 2) as subtotal
  from order_lines ol
  where ol.order_id = d.id
) l on true;

grant select on v_delivery_orders to authenticated;

-- Seguimiento público: ahora la fecha de creación viene del pedido.
create or replace function public.public_delivery_status(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenant_name',   t.name,
    'code',          d.code,
    'status',        d.status,
    'eta_min',       d.eta_min,
    'driver_name',   case when d.status in ('en_camino','entregado')
                          then split_part(dr.name, ' ', 1) end,
    'created_at',    o.opened_at,
    'accepted_at',   d.accepted_at,
    'ready_at',      d.ready_at,
    'dispatched_at', d.dispatched_at,
    'delivered_at',  d.delivered_at,
    'cancelled_at',  d.cancelled_at
  )
  from delivery_orders d
  join orders o on o.id = d.id
  join tenants t on t.id = d.tenant_id
  left join delivery_drivers dr on dr.id = d.driver_id
  where length(p_token) >= 16 and d.tracking_token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- 5. Inventario por sucursal: catálogo + stock + kardex
-- ---------------------------------------------------------------------------
create table inventory_stock (
  tenant_id  uuid not null references tenants (id) on delete cascade,
  branch_id  uuid not null,
  item_id    uuid not null references inventory_items (id) on delete cascade,
  qty        numeric(12,3) not null default 0,
  par        numeric(12,3), -- null = usa el par del catálogo
  updated_at timestamptz not null default now(),
  primary key (branch_id, item_id),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id) on delete cascade
);
create index inventory_stock_tenant_idx on inventory_stock (tenant_id);
create index inventory_stock_item_idx on inventory_stock (item_id);

create table inventory_movements (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  branch_id  uuid not null,
  item_id    uuid not null references inventory_items (id) on delete cascade,
  delta      numeric(12,3) not null,
  reason     text not null check (reason in ('inicial', 'venta', 'ajuste', 'merma', 'compra', 'traslado')),
  order_id   uuid references orders (id) on delete set null,
  actor      text not null default '',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id) on delete cascade
);
create index inventory_movements_branch_idx on inventory_movements (tenant_id, branch_id, created_at desc);
create index inventory_movements_item_idx on inventory_movements (item_id);
create index inventory_movements_order_idx on inventory_movements (order_id) where order_id is not null;
-- Una venta descuenta cada insumo una sola vez (reintentos idempotentes).
create unique index inventory_movements_sale_once on inventory_movements (order_id, item_id) where reason = 'venta';

-- El stock es la suma del kardex (puede quedar negativo: indica un conteo pendiente).
create or replace function app.inventory_apply_movement() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  insert into inventory_stock (tenant_id, branch_id, item_id, qty)
  values (new.tenant_id, new.branch_id, new.item_id, new.delta)
  on conflict (branch_id, item_id)
  do update set qty = inventory_stock.qty + excluded.qty, updated_at = now();
  return new;
end $$;

create trigger inventory_movements_apply
  after insert on inventory_movements
  for each row execute function app.inventory_apply_movement();

-- Stock actual → sede principal, registrado como movimiento inicial.
insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor)
select i.tenant_id, app.root_branch(i.tenant_id), i.item_id, i.stock, 'inicial', 'Migración'
from (select id as item_id, tenant_id, stock from inventory_items) i
where i.stock <> 0;

alter table inventory_items drop column if exists stock;
alter table inventory_items add column if not exists active boolean not null default true;

alter table inventory_stock enable row level security;
alter table inventory_movements enable row level security;
create policy stock_read on inventory_stock for select using (app.has_tenant(tenant_id));
create policy stock_par on inventory_stock for update using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));
create policy movements_read on inventory_movements for select using (app.has_tenant(tenant_id));
create policy movements_ins on inventory_movements for insert with check (app.can_manage(tenant_id));

-- ---------------------------------------------------------------------------
-- 6. ticket_lines con tenant_id (RLS directa, sin subconsulta por fila)
-- ---------------------------------------------------------------------------
alter table ticket_lines add column if not exists tenant_id uuid references tenants (id) on delete cascade;
update ticket_lines tl set tenant_id = k.tenant_id from kitchen_tickets k where k.id = tl.ticket_id;
alter table ticket_lines alter column tenant_id set not null;

create or replace function app.ticket_lines_fill_tenant() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from kitchen_tickets where id = new.ticket_id;
  end if;
  return new;
end $$;

create trigger ticket_lines_fill_tenant
  before insert on ticket_lines
  for each row execute function app.ticket_lines_fill_tenant();

drop policy if exists tenant_rw on ticket_lines;
create policy tenant_rw on ticket_lines for all
  using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 7. Limpieza de redundancias
-- ---------------------------------------------------------------------------
drop table if exists online_orders;
drop table if exists sunat_credentials;
drop table if exists payroll_entries;

alter table tenants drop column if exists mrr;

-- MRR derivado: precio del plan si el tenant está activo.
create view v_tenants with (security_invoker = true) as
select
  t.*,
  case when t.status = 'Activo' then coalesce(p.price, 0) else 0 end::numeric(10,2) as mrr,
  (select count(*)::int from branches b where b.tenant_id = t.id and b.active) as branches_count
from tenants t
left join subscription_plans p on p.tier = t.plan;

grant select on v_tenants to authenticated;

-- ---------------------------------------------------------------------------
-- 8. updated_at (sincronización incremental) y "toque" del pedido
-- ---------------------------------------------------------------------------
alter table restaurant_tables add column if not exists updated_at timestamptz not null default now();
alter table kitchen_tickets   add column if not exists updated_at timestamptz not null default now();
alter table customers         add column if not exists updated_at timestamptz not null default now();
alter table menu_items        add column if not exists updated_at timestamptz not null default now();
alter table reservations      add column if not exists updated_at timestamptz not null default now();
alter table waitlist          add column if not exists updated_at timestamptz not null default now();

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'restaurant_tables', 'kitchen_tickets', 'delivery_orders', 'customers',
                           'menu_items', 'reservations', 'waitlist', 'inventory_stock']
  loop
    execute format(
      'create trigger %I before update on %I for each row execute function app.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;

-- Un cambio en las líneas marca el pedido como modificado: la sincronización
-- incremental trae el pedido completo (con sus líneas) y detecta borrados.
create or replace function app.order_lines_touch_order() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  update orders set updated_at = now()
  where id = case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  if tg_op = 'UPDATE' and new.order_id <> old.order_id then
    update orders set updated_at = now() where id = old.order_id;
  end if;
  return null;
end $$;

create trigger order_lines_touch_order
  after insert or update or delete on order_lines
  for each row execute function app.order_lines_touch_order();

-- ---------------------------------------------------------------------------
-- 9. Índices según los accesos reales
-- ---------------------------------------------------------------------------
-- Pedidos abiertos por sucursal (mesas, cuentas, sincronización).
create index orders_open_idx on orders (tenant_id, branch_id) where status not in ('cobrada', 'anulada');
-- Historial de ventas (reportes, caja, comparativa de sucursales).
create index orders_paid_idx on orders (tenant_id, closed_at desc) where status = 'cobrada';
-- Delta de sincronización.
create index orders_updated_idx on orders (tenant_id, updated_at);
create index orders_customer_idx on orders (customer_id) where customer_id is not null;
create index orders_waiter_idx on orders (waiter_id) where waiter_id is not null;
drop index if exists orders_tenant_id_idx; -- cubierto por los índices anteriores

create index order_lines_menu_item_idx on order_lines (menu_item_id) where menu_item_id is not null;

drop index if exists kitchen_tickets_branch;
create index kitchen_tickets_open_idx on kitchen_tickets (tenant_id, branch_id, entered_at) where col <> 'entregado';
create index kitchen_tickets_updated_idx on kitchen_tickets (tenant_id, updated_at);
create index kitchen_tickets_order_idx on kitchen_tickets (order_id) where order_id is not null;
create index ticket_lines_ticket_idx on ticket_lines (ticket_id);

create index delivery_orders_status_idx on delivery_orders (tenant_id, status);
create index delivery_orders_updated_idx on delivery_orders (tenant_id, updated_at);
create index delivery_orders_driver_idx on delivery_orders (driver_id) where driver_id is not null;

create index restaurant_tables_branch_idx on restaurant_tables (tenant_id, branch_id);

create index activity_log_tenant_created_idx on activity_log (tenant_id, created_at desc);
create index comprobantes_issued_idx on comprobantes (tenant_id, issued_at desc);
create index comprobantes_order_idx on comprobantes (order_id) where order_id is not null;
create index comprobantes_queue_idx on comprobantes (tenant_id) where status = 'encola';
create index sunat_outbox_cpe_idx on sunat_outbox (comprobante_id);
create index loyalty_tx_customer_idx on loyalty_transactions (customer_id);
create index loyalty_tx_order_idx on loyalty_transactions (order_id) where order_id is not null;
create index void_events_order_idx on void_events (order_id) where order_id is not null;
create index recipes_menu_item_idx on recipes (menu_item_id);
create index recipes_inventory_idx on recipes (inventory_id);
create index menu_items_category_idx on menu_items (category_id);
create index reservations_date_idx on reservations (tenant_id, res_date);
create index waitlist_created_idx on waitlist (tenant_id, created_at);
create index cash_closes_idx on cash_register_closes (tenant_id, branch_id, closed_at desc);

-- ---------------------------------------------------------------------------
-- 10. RLS con InitPlan: reescribe todas las políticas existentes.
--   app.has_tenant(x)       → ((select is_platform_admin()) or x = any((select my_tenant_ids())))
--   app.can_manage(x)       → ((select is_platform_admin()) or x = any((select my_managed_tenant_ids())))
--   app.is_platform_admin() → (select app.is_platform_admin())
--   auth.uid()              → (select auth.uid())
-- ---------------------------------------------------------------------------
create or replace function app.initplan_expr(e text) returns text
language plpgsql immutable as $$
begin
  if e is null then
    return null;
  end if;
  e := replace(e, 'auth.uid()', '(select auth.uid())');
  e := replace(e, 'app.is_platform_admin()', '(select app.is_platform_admin())');
  e := regexp_replace(e, 'app\.has_tenant\(([^()]+)\)',
    '((select app.is_platform_admin()) or \1 = any ((select app.my_tenant_ids())::uuid[]))', 'g');
  e := regexp_replace(e, 'app\.can_manage\(([^()]+)\)',
    '((select app.is_platform_admin()) or \1 = any ((select app.my_managed_tenant_ids())::uuid[]))', 'g');
  return e;
end $$;

do $$
declare
  p record;
  q text;
  c text;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    q := app.initplan_expr(p.qual);
    c := app.initplan_expr(p.with_check);
    if q is not distinct from p.qual and c is not distinct from p.with_check then
      continue;
    end if;
    execute format('alter policy %I on %I', p.policyname, p.tablename)
      || case when q is not null then format(' using (%s)', q) else '' end
      || case when c is not null then format(' with check (%s)', c) else '' end;
  end loop;
end $$;

drop function app.initplan_expr(text);

-- ---------------------------------------------------------------------------
-- 11. Realtime: tablas operativas en la publicación (sin esto no llegan eventos)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['orders', 'kitchen_tickets', 'restaurant_tables', 'delivery_orders']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ==================================================================
-- Migracion 0032_pos_ops.sql
-- ==================================================================

-- =============================================================================
-- 0032 · Operaciones del POS atómicas, idempotentes y aptas para offline
--
-- El dispositivo describe cada acción como una operación con id propio
-- ({id, type, at, actor, ...}). Si hay internet se envía al momento; si no, se
-- guarda en una cola local y se envía al volver la conexión. El servidor:
--   · aplica cada operación en su propia subtransacción (todo o nada),
--   · la registra en pos_ops: reenviarla nunca duplica una venta,
--   · respeta la hora real en que ocurrió (`at`) para reportes y caja,
--   · resuelve conflictos entre dispositivos (dos meseros abren la misma mesa
--     sin conexión → los pedidos se unen; cobrar un pedido ya cobrado → error
--     legible que el dispositivo muestra para revisión).
--
-- pos_snapshot entrega en UNA llamada el estado operativo (mesas, pedidos
-- abiertos con líneas, comandas, delivery), completo o solo lo cambiado desde
-- una marca de tiempo (sincronización incremental).
--
-- Terminales: cada caja que emite comprobantes tiene su propia serie SUNAT
-- (B001/F001, B002/F002…). Así numera sin conexión sin chocar con otra caja.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tablas de soporte
-- ---------------------------------------------------------------------------
create table pos_ops (
  id         uuid primary key,
  tenant_id  uuid not null references tenants (id) on delete cascade,
  device_id  text not null default '',
  type       text not null,
  status     text not null check (status in ('ok', 'error')),
  result     jsonb,
  error      text,
  client_at  timestamptz,
  applied_at timestamptz not null default now()
);
create index pos_ops_tenant_idx on pos_ops (tenant_id, applied_at desc);
alter table pos_ops enable row level security;
create policy pos_ops_read on pos_ops for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));

-- Pedido abierto sin conexión en una mesa que otro dispositivo ya había abierto:
-- sus operaciones se redirigen al pedido existente.
create table order_redirects (
  from_id    uuid primary key,
  to_id      uuid not null references orders (id) on delete cascade,
  tenant_id  uuid not null references tenants (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index order_redirects_to_idx on order_redirects (to_id);
alter table order_redirects enable row level security;
create policy order_redirects_read on order_redirects for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));

create table pos_terminals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  branch_id     uuid not null,
  device_id     text not null,
  name          text not null default '',
  serie_boleta  text not null check (serie_boleta ~ '^B[0-9A-Z]{3}$'),
  serie_factura text not null check (serie_factura ~ '^F[0-9A-Z]{3}$'),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (tenant_id, device_id),
  unique (tenant_id, serie_boleta),
  unique (tenant_id, serie_factura),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id)
);
alter table pos_terminals enable row level security;
create policy pos_terminals_read on pos_terminals for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));
create policy pos_terminals_mgr on pos_terminals for update using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]))
  with check ((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]));

-- ---------------------------------------------------------------------------
-- Folios: formato serie-correlativo sin truncar (lpad recortaba a 4 dígitos).
-- ---------------------------------------------------------------------------
create or replace function app.format_folio(p_serie text, n int) returns text
language sql immutable as $$
  select p_serie || '-' || lpad(n::text, greatest(4, length(n::text)), '0');
$$;

create or replace function public.next_folio(tid uuid, p_serie text) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  n integer;
begin
  if not app.has_tenant(tid) then
    raise exception 'no autorizado';
  end if;
  insert into folio_counters (tenant_id, serie, last)
  values (tid, p_serie, 1001)
  on conflict (tenant_id, serie) do update set last = folio_counters.last + 1
  returning last into n;
  return app.format_folio(p_serie, n);
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.pos_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_platform_admin() or p_tenant = any (app.my_tenant_ids());
$$;

create or replace function app.pos_log(p_tenant uuid, p_actor text, p_message text) returns void
language sql security definer set search_path = public, app as $$
  insert into activity_log (tenant_id, actor, message) values (p_tenant, coalesce(nullif(p_actor, ''), 'POS'), p_message);
$$;

-- Pedido abierto (resolviendo redirecciones), bloqueado para la operación.
create or replace function app.pos_open_order(p_tenant uuid, p_id uuid) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  o orders;
begin
  select * into o from orders
  where tenant_id = p_tenant
    and id = coalesce((select to_id from order_redirects where from_id = p_id and tenant_id = p_tenant), p_id)
  for update;
  if not found then
    raise exception 'El pedido ya no existe.' using errcode = 'P0001';
  end if;
  if o.status in ('cobrada', 'anulada') then
    raise exception 'El pedido ya fue % en otro dispositivo.', case o.status when 'cobrada' then 'cobrado' else 'anulado' end
      using errcode = 'P0001';
  end if;
  return o;
end $$;

-- Etiqueta visible de un pedido (mesa o código de delivery).
create or replace function app.order_label(o orders) returns text
language sql stable security definer set search_path = public, app as $$
  select case
    when o.kind = 'delivery' then '🛵 ' || coalesce((select code from delivery_orders where id = o.id), 'Delivery')
    when o.table_id is not null then 'Mesa ' || coalesce((select number::text from restaurant_tables where id = o.table_id), '—')
    else 'Para llevar'
  end;
$$;

-- Envía a cocina SOLO lo que falta enviar (qty - sent_qty) en una comanda nueva.
create or replace function app.pos_send_kitchen(o orders, p_ticket uuid, p_note text) returns int
language plpgsql security definer set search_path = public, app as $$
declare
  v_ticket uuid := coalesce(p_ticket, gen_random_uuid());
  n        int;
begin
  select count(*) into n from order_lines where order_id = o.id and qty > sent_qty;
  if n = 0 then
    return 0;
  end if;
  insert into kitchen_tickets (id, tenant_id, order_id, branch_id, table_label, col, note)
  values (v_ticket, o.tenant_id, o.id, o.branch_id, app.order_label(o), 'nuevos', coalesce(p_note, ''))
  on conflict (id) do nothing;
  if not found then
    return 0; -- reintento: la comanda ya existe
  end if;
  insert into ticket_lines (tenant_id, ticket_id, qty, name)
  select o.tenant_id, v_ticket, qty - sent_qty,
         name || case when modifiers <> '' then ' · ' || modifiers else '' end
  from order_lines
  where order_id = o.id and qty > sent_qty
  order by created_at;
  update order_lines set sent_qty = qty where order_id = o.id and qty > sent_qty;
  update orders set status = 'en_cocina' where id = o.id and status = 'abierta';
  return n;
end $$;

-- Descuenta insumos según receta en la sucursal del pedido (una sola vez por venta).
create or replace function app.pos_deduct_inventory(o orders) returns void
language sql security definer set search_path = public, app as $$
  insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, order_id, actor)
  select o.tenant_id, o.branch_id, r.inventory_id, -round(sum(r.qty_per_unit * ol.qty), 3), 'venta', o.id, 'Venta'
  from order_lines ol
  join recipes r on r.menu_item_id = ol.menu_item_id and r.tenant_id = o.tenant_id
  where ol.order_id = o.id
  group by r.inventory_id
  on conflict (order_id, item_id) where reason = 'venta' do nothing;
$$;

-- Libera la mesa si ya no le queda ningún pedido abierto.
create or replace function app.pos_free_table(p_table uuid) returns void
language sql security definer set search_path = public, app as $$
  update restaurant_tables t set status = 'libre'
  where t.id = p_table
    and not exists (select 1 from orders where table_id = p_table and status not in ('cobrada', 'anulada'));
$$;

-- ---------------------------------------------------------------------------
-- Ejecución de UNA operación
-- ---------------------------------------------------------------------------
create or replace function app.pos_exec(p_tenant uuid, op jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_type   text := op ->> 'type';
  v_at     timestamptz := least(coalesce((op ->> 'at')::timestamptz, now()), now());
  v_actor  text := coalesce(nullif(op ->> 'actor', ''), 'POS');
  o        orders;
  t        restaurant_tables;
  d        delivery_orders;
  k        kitchen_tickets;
  v_id     uuid;
  v_other  uuid;
  v_n      int;
  v_num    numeric;
  v_text   text;
  v_json   jsonb;
begin
  case v_type

  -- ── Mesas y pedidos ────────────────────────────────────────────────────────
  when 'order.open' then
    v_id := (op ->> 'order_id')::uuid;
    select * into t from restaurant_tables
    where id = (op ->> 'table_id')::uuid and tenant_id = p_tenant for update;
    if not found then
      raise exception 'La mesa ya no existe.' using errcode = 'P0001';
    end if;
    if exists (select 1 from orders where id = v_id and tenant_id = p_tenant) then
      return jsonb_build_object('order_id', v_id);
    end if;
    select id into v_other from orders
    where table_id = t.id and status not in ('cobrada', 'anulada')
    order by opened_at limit 1;
    if v_other is not null then
      insert into order_redirects (from_id, to_id, tenant_id) values (v_id, v_other, p_tenant)
      on conflict (from_id) do nothing;
      return jsonb_build_object('order_id', v_other, 'redirected', true);
    end if;
    insert into orders (id, tenant_id, branch_id, table_id, kind, status, opened_at)
    values (v_id, p_tenant, t.branch_id, t.id, 'mesa', 'abierta', v_at);
    update restaurant_tables set status = 'ocupada' where id = t.id;
    return jsonb_build_object('order_id', v_id);

  when 'line.add' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    insert into order_lines (id, tenant_id, order_id, menu_item_id, name, qty, unit_price, extra_price, modifiers, created_at)
    values (
      (op ->> 'line_id')::uuid, p_tenant, o.id, nullif(op ->> 'item_id', '')::uuid, op ->> 'name',
      greatest(1, (op ->> 'qty')::int), (op ->> 'unit_price')::numeric,
      coalesce((op ->> 'extra_price')::numeric, 0), coalesce(op ->> 'modifiers', ''), v_at)
    on conflict (id) do nothing;
    return jsonb_build_object('order_id', o.id);

  when 'line.qty', 'line.remove', 'line.void' then
    select ol.order_id, ol.name into v_id, v_text from order_lines ol
    where ol.id = (op ->> 'line_id')::uuid and ol.tenant_id = p_tenant;
    if v_id is null then
      return jsonb_build_object('skipped', 'line_gone'); -- otro dispositivo ya la quitó
    end if;
    o := app.pos_open_order(p_tenant, v_id);
    v_n := case when v_type = 'line.qty' then (op ->> 'qty')::int else 0 end;
    if v_n > 0 then
      update order_lines set qty = v_n, sent_qty = least(sent_qty, v_n) where id = (op ->> 'line_id')::uuid;
    else
      delete from order_lines where id = (op ->> 'line_id')::uuid;
    end if;
    if v_type = 'line.void' then
      insert into void_events (tenant_id, order_id, line_name, reason)
      values (p_tenant, o.id, v_text, coalesce(op ->> 'reason', ''));
      perform app.pos_log(p_tenant, v_actor, format('Anuló %s · %s', v_text, coalesce(op ->> 'reason', '')));
    end if;
    return '{}'::jsonb;

  when 'order.clear' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    delete from order_lines where order_id = o.id and sent_qty = 0;
    return '{}'::jsonb;

  when 'order.send' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    v_n := app.pos_send_kitchen(o, (op ->> 'ticket_id')::uuid, op ->> 'note');
    if v_n > 0 then
      perform app.pos_log(p_tenant, v_actor, format('Envió comanda de %s a cocina', app.order_label(o)));
    end if;
    return jsonb_build_object('lines', v_n);

  when 'order.pay' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    v_num := greatest(0, (op ->> 'total')::numeric - coalesce((op ->> 'redeem')::int, 0));
    update orders set
      status = 'cobrada',
      closed_at = v_at,
      paid_method = (op ->> 'method')::pay_method,
      paid_total = round(v_num, 2),
      customer_id = coalesce(nullif(op ->> 'customer_id', '')::uuid, customer_id)
    where id = o.id
    returning * into o;
    if o.table_id is not null then
      perform app.pos_free_table(o.table_id);
    end if;
    perform app.pos_deduct_inventory(o);
    if o.customer_id is not null then
      v_n := floor(v_num / 10);
      update customers set
        points = greatest(0, points - coalesce((op ->> 'redeem')::int, 0) + v_n),
        visits = visits + 1,
        spent = spent + v_num
      where id = o.customer_id and tenant_id = p_tenant;
      insert into loyalty_transactions (tenant_id, customer_id, order_id, points_delta)
      values (p_tenant, o.customer_id, o.id, v_n - coalesce((op ->> 'redeem')::int, 0));
    end if;
    perform app.pos_log(p_tenant, v_actor,
      format('Cobró %s · %s · S/ %s', app.order_label(o), op ->> 'method', to_char(v_num, 'FM999999990.00')));
    return jsonb_build_object('paid_total', o.paid_total);

  when 'order.transfer' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    select * into t from restaurant_tables
    where id = (op ->> 'to_table_id')::uuid and tenant_id = p_tenant for update;
    if not found then
      raise exception 'La mesa destino ya no existe.' using errcode = 'P0001';
    end if;
    if t.branch_id <> o.branch_id then
      raise exception 'Solo se puede transferir a una mesa de la misma sucursal.' using errcode = 'P0001';
    end if;
    if exists (select 1 from orders where table_id = t.id and status not in ('cobrada', 'anulada') and id <> o.id) then
      raise exception 'La Mesa % ya tiene un pedido; usa «Unir».', t.number using errcode = 'P0001';
    end if;
    v_other := o.table_id;
    update orders set table_id = t.id where id = o.id;
    update restaurant_tables set status = 'ocupada' where id = t.id;
    if v_other is not null then
      perform app.pos_free_table(v_other);
    end if;
    perform app.pos_log(p_tenant, v_actor, format('Transfirió pedido a Mesa %s', t.number));
    return '{}'::jsonb;

  when 'order.merge' then
    o := app.pos_open_order(p_tenant, (op ->> 'order_id')::uuid);
    select id into v_other from orders
    where table_id = (op ->> 'into_table_id')::uuid and tenant_id = p_tenant
      and status not in ('cobrada', 'anulada') and id <> o.id
    order by opened_at limit 1
    for update;
    if v_other is null then
      raise exception 'La mesa destino no tiene un pedido abierto.' using errcode = 'P0001';
    end if;
    update order_lines set order_id = v_other where order_id = o.id;
    update kitchen_tickets set order_id = v_other where order_id = o.id;
    update orders set status = 'anulada', closed_at = v_at where id = o.id;
    insert into order_redirects (from_id, to_id, tenant_id) values (o.id, v_other, p_tenant)
    on conflict (from_id) do update set to_id = excluded.to_id;
    if o.table_id is not null then
      perform app.pos_free_table(o.table_id);
    end if;
    perform app.pos_log(p_tenant, v_actor, format('Unió %s con otra mesa', app.order_label(o)));
    return jsonb_build_object('order_id', v_other);

  -- ── Cocina ─────────────────────────────────────────────────────────────────
  when 'ticket.advance' then
    select * into k from kitchen_tickets
    where id = (op ->> 'ticket_id')::uuid and tenant_id = p_tenant for update;
    if not found or k.col::text <> coalesce(op ->> 'from', k.col::text) then
      return jsonb_build_object('skipped', 'already_moved'); -- otro dispositivo ya la movió
    end if;
    update kitchen_tickets set
      col = case k.col when 'nuevos' then 'preparacion' when 'preparacion' then 'listos' else 'entregado' end::kds_column,
      entered_at = now(),
      done = k.col in ('preparacion', 'listos', 'entregado')
    where id = k.id;
    return '{}'::jsonb;

  -- ── Delivery ───────────────────────────────────────────────────────────────
  when 'delivery.create' then
    v_id := (op ->> 'order_id')::uuid;
    select * into d from delivery_orders where id = v_id and tenant_id = p_tenant;
    if found then
      return jsonb_build_object('code', d.code, 'tracking_token', d.tracking_token);
    end if;
    if coalesce(jsonb_array_length(op -> 'lines'), 0) = 0 then
      raise exception 'Agrega al menos un plato.' using errcode = 'P0001';
    end if;
    if coalesce(trim(op ->> 'customer_name'), '') = '' then
      raise exception 'Falta el nombre del cliente.' using errcode = 'P0001';
    end if;
    v_other := coalesce(
      (select id from branches where id = nullif(op ->> 'branch_id', '')::uuid and tenant_id = p_tenant),
      app.root_branch(p_tenant));
    insert into orders (id, tenant_id, branch_id, kind, status, opened_at)
    values (v_id, p_tenant, v_other, 'delivery', 'abierta', v_at);
    insert into order_lines (id, tenant_id, order_id, menu_item_id, name, qty, unit_price, created_at)
    select coalesce(nullif(l ->> 'line_id', '')::uuid, gen_random_uuid()), p_tenant, v_id,
           nullif(l ->> 'item_id', '')::uuid, l ->> 'name', greatest(1, (l ->> 'qty')::int), (l ->> 'price')::numeric, v_at
    from jsonb_array_elements(op -> 'lines') l;
    v_text := op ->> 'channel';
    if v_text in ('rappi', 'pedidosya') then
      insert into delivery_orders (id, channel, customer_name, customer_phone, address, reference,
                                   fee, pay_method, cash_for, notes, eta_min)
      values (v_id, v_text, trim(op ->> 'customer_name'), coalesce(op ->> 'customer_phone', ''),
              coalesce(op ->> 'address', ''), coalesce(op ->> 'reference', ''),
              0, coalesce(op ->> 'pay_method', 'pagado_app'), null, coalesce(op ->> 'notes', ''), 30)
      returning * into d;
    else
      if coalesce(trim(op ->> 'address'), '') = '' then
        raise exception 'Falta la dirección de entrega.' using errcode = 'P0001';
      end if;
      insert into delivery_orders (id, channel, customer_name, customer_phone, address, reference,
                                   zone_id, zone_name, fee, pay_method, cash_for, notes, eta_min)
      select v_id, v_text, trim(op ->> 'customer_name'), coalesce(op ->> 'customer_phone', ''),
             trim(op ->> 'address'), coalesce(op ->> 'reference', ''),
             z.id, z.name, z.fee, op ->> 'pay_method',
             case when op ->> 'pay_method' = 'efectivo' then nullif(op ->> 'cash_for', '')::numeric end,
             coalesce(op ->> 'notes', ''), z.eta_min
      from delivery_zones z
      where z.id = nullif(op ->> 'zone_id', '')::uuid and z.tenant_id = p_tenant and z.active
      returning * into d;
      if d.id is null then
        raise exception 'Elige una zona de reparto activa.' using errcode = 'P0001';
      end if;
    end if;
    perform app.pos_log(p_tenant, v_actor, format('Nuevo delivery %s (%s)', d.code, d.channel));
    return jsonb_build_object('code', d.code, 'tracking_token', d.tracking_token);

  when 'delivery.status' then
    select * into d from delivery_orders
    where id = (op ->> 'order_id')::uuid and tenant_id = p_tenant for update;
    if not found then
      raise exception 'El pedido de delivery ya no existe.' using errcode = 'P0001';
    end if;
    v_text := op ->> 'to';
    if d.status::text = v_text then
      return jsonb_build_object('skipped', 'same_status');
    end if;
    if d.status::text <> coalesce(op ->> 'from', d.status::text) then
      raise exception 'Otro usuario ya movió % a «%».', d.code, d.status using errcode = 'P0001';
    end if;
    if d.status in ('entregado', 'cancelado')
       or (v_text <> 'cancelado' and v_text <> case d.status
             when 'recibido' then 'preparando' when 'preparando' then 'listo'
             when 'listo' then 'en_camino' when 'en_camino' then 'entregado' end) then
      raise exception 'No se puede pasar de «%» a «%».', d.status, v_text using errcode = 'P0001';
    end if;
    select * into o from orders where id = d.id for update;
    if v_text = 'preparando' then
      d.accepted_at := v_at;
      perform app.pos_send_kitchen(o, (op ->> 'ticket_id')::uuid, d.notes);
    elsif v_text = 'listo' then
      d.ready_at := v_at;
    elsif v_text = 'en_camino' then
      d.driver_id := coalesce(nullif(op ->> 'driver_id', '')::uuid, d.driver_id);
      if d.channel not in ('rappi', 'pedidosya') then
        if d.driver_id is null then
          raise exception 'Asigna un repartidor para despachar.' using errcode = 'P0001';
        end if;
        if not exists (select 1 from delivery_drivers where id = d.driver_id and tenant_id = p_tenant and active) then
          raise exception 'Ese repartidor no está disponible.' using errcode = 'P0001';
        end if;
      end if;
      d.dispatched_at := v_at;
    elsif v_text = 'entregado' then
      d.delivered_at := v_at;
      update orders set
        status = 'cobrada',
        closed_at = v_at,
        paid_method = (case d.pay_method when 'pagado_app' then 'app' else d.pay_method end)::pay_method,
        paid_total = round((select coalesce(sum(qty * (unit_price + extra_price)), 0) from order_lines where order_id = o.id) + d.fee, 2)
      where id = o.id
      returning * into o;
      perform app.pos_deduct_inventory(o);
    elsif v_text = 'cancelado' then
      if coalesce(trim(op ->> 'cancel_reason'), '') = '' then
        raise exception 'Indica el motivo de la cancelación.' using errcode = 'P0001';
      end if;
      d.cancel_reason := trim(op ->> 'cancel_reason');
      d.cancelled_at := v_at;
      update orders set status = 'anulada', closed_at = v_at where id = o.id;
      update kitchen_tickets set col = 'entregado', done = true, note = 'CANCELADO · ' || d.cancel_reason
      where order_id = o.id and col <> 'entregado';
    end if;
    update delivery_orders set
      status = v_text::delivery_status,
      driver_id = d.driver_id,
      accepted_at = d.accepted_at, ready_at = d.ready_at, dispatched_at = d.dispatched_at,
      delivered_at = d.delivered_at, cancelled_at = d.cancelled_at, cancel_reason = d.cancel_reason
    where id = d.id;
    perform app.pos_log(p_tenant, v_actor,
      format('%s → %s%s', d.code, v_text, case when d.cancel_reason is not null then ' (' || d.cancel_reason || ')' else '' end));
    return '{}'::jsonb;

  -- ── Inventario ─────────────────────────────────────────────────────────────
  when 'inventory.adjust' then
    if not (app.is_platform_admin() or p_tenant = any (app.my_managed_tenant_ids())) then
      raise exception 'Solo gerencia puede ajustar el inventario.' using errcode = 'P0001';
    end if;
    select name into v_text from inventory_items where id = (op ->> 'item_id')::uuid and tenant_id = p_tenant;
    if v_text is null then
      raise exception 'El insumo ya no existe.' using errcode = 'P0001';
    end if;
    v_other := coalesce(
      (select id from branches where id = nullif(op ->> 'branch_id', '')::uuid and tenant_id = p_tenant),
      app.root_branch(p_tenant));
    v_num := (op ->> 'delta')::numeric;
    insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor, created_at)
    values (p_tenant, v_other, (op ->> 'item_id')::uuid, v_num,
            coalesce(nullif(op ->> 'reason', ''), 'ajuste'), v_actor, v_at);
    perform app.pos_log(p_tenant, v_actor,
      format('Ajustó %s (%s%s)', v_text, case when v_num > 0 then '+' else '' end, v_num));
    return '{}'::jsonb;

  -- ── Comprobantes (numeración de la terminal, válida sin conexión) ─────────
  when 'cpe.emit' then
    v_id := (op ->> 'cpe_id')::uuid;
    select jsonb_build_object('folio', folio, 'status', status) into v_json
    from comprobantes where id = v_id and tenant_id = p_tenant;
    if v_json is not null then
      return v_json;
    end if;
    v_text := op ->> 'serie';
    if v_text is null or v_text !~ '^[BF][0-9A-Z]{3}$' then
      raise exception 'Serie de comprobante inválida.' using errcode = 'P0001';
    end if;
    v_n := nullif(op ->> 'number', '')::int;
    -- Número propuesto por la terminal; si ya se usó, el servidor asigna el siguiente.
    if v_n is null or exists (select 1 from comprobantes where tenant_id = p_tenant and folio = app.format_folio(v_text, v_n)) then
      insert into folio_counters (tenant_id, serie, last) values (p_tenant, v_text, 1001)
      on conflict (tenant_id, serie) do update set last = folio_counters.last + 1
      returning last into v_n;
    else
      insert into folio_counters (tenant_id, serie, last) values (p_tenant, v_text, v_n)
      on conflict (tenant_id, serie) do update set last = greatest(folio_counters.last, excluded.last);
    end if;
    insert into comprobantes (id, tenant_id, order_id, folio, tipo, buyer_ruc, buyer_name,
                              subtotal, igv, total, reference, status, issued_at)
    values (v_id, p_tenant,
            (select id from orders where id = nullif(op ->> 'order_id', '')::uuid and tenant_id = p_tenant),
            app.format_folio(v_text, v_n), (op ->> 'tipo')::comprobante_tipo,
            nullif(op ->> 'buyer_ruc', ''), nullif(op ->> 'buyer_name', ''),
            (op ->> 'subtotal')::numeric, (op ->> 'igv')::numeric, (op ->> 'total')::numeric,
            coalesce(op ->> 'reference', ''), 'encola', v_at);
    insert into sunat_outbox (tenant_id, comprobante_id) values (p_tenant, v_id);
    perform app.pos_log(p_tenant, v_actor, format('Emitió %s %s · en cola', op ->> 'tipo', app.format_folio(v_text, v_n)));
    return jsonb_build_object('folio', app.format_folio(v_text, v_n), 'status', 'encola');

  else
    raise exception 'Operación desconocida: %', v_type using errcode = 'P0001';
  end case;
end $$;

-- ---------------------------------------------------------------------------
-- API: aplicar un lote de operaciones (en orden, cada una atómica)
-- ---------------------------------------------------------------------------
create or replace function public.pos_apply(p_tenant uuid, p_device text, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  op      jsonb;
  v_id    uuid;
  v_res   jsonb;
  v_prev  pos_ops;
  results jsonb := '[]'::jsonb;
begin
  if not app.pos_member(p_tenant) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'Lote inválido (máximo 200 operaciones).' using errcode = '22023';
  end if;

  for op in select value from jsonb_array_elements(p_ops)
  loop
    v_id := (op ->> 'id')::uuid;
    begin
      -- Reserva el id: un reenvío (o el mismo lote en paralelo) no se aplica dos veces.
      insert into pos_ops (id, tenant_id, device_id, type, status, client_at)
      values (v_id, p_tenant, coalesce(p_device, ''), op ->> 'type', 'ok', (op ->> 'at')::timestamptz)
      on conflict (id) do nothing;
      if not found then
        select * into v_prev from pos_ops where id = v_id and tenant_id = p_tenant;
        results := results || jsonb_build_array(jsonb_build_object(
          'id', v_id, 'status', coalesce(v_prev.status, 'error'), 'dup', true,
          'result', v_prev.result, 'error', case when v_prev.id is null then 'Id de operación inválido.' else v_prev.error end));
        continue;
      end if;

      v_res := app.pos_exec(p_tenant, op);
      update pos_ops set result = v_res where id = v_id;
      results := results || jsonb_build_array(jsonb_build_object('id', v_id, 'status', 'ok', 'result', v_res));
    exception
      -- Rechazos de negocio o de datos: definitivos. Se registran para que un
      -- reenvío devuelva la misma respuesta. Otros errores (bloqueos, caídas)
      -- abortan el lote y el dispositivo reintenta más tarde.
      when sqlstate 'P0001' or sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008'
        or sqlstate '23502' or sqlstate '23503' or sqlstate '23505' or sqlstate '23514' or sqlstate '42501' then
        insert into pos_ops (id, tenant_id, device_id, type, status, error, client_at)
        values (v_id, p_tenant, coalesce(p_device, ''), op ->> 'type', 'error', sqlerrm, (op ->> 'at')::timestamptz)
        on conflict (id) do nothing;
        results := results || jsonb_build_array(jsonb_build_object(
          'id', v_id, 'status', 'error', 'error', sqlerrm, 'code', sqlstate));
    end;
  end loop;
  return results;
end $$;

grant execute on function public.pos_apply(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- API: estado operativo (completo o incremental) en una sola llamada
-- ---------------------------------------------------------------------------
create or replace function public.pos_snapshot(p_tenant uuid, p_branch uuid default null, p_since timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima';
begin
  if not app.pos_member(p_tenant) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'server_time', now(),
    'full', p_since is null,

    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'zone', t.zone, 'number', t.number, 'seats', t.seats, 'status', t.status,
        'waiter_id', t.waiter_id, 'branch_id', t.branch_id) order by t.number), '[]'::jsonb)
      from restaurant_tables t
      where t.tenant_id = p_tenant
        and (p_branch is null or t.branch_id = p_branch)
        and (p_since is null or t.updated_at > p_since)),

    -- En incremental, la lista de ids permite detectar mesas eliminadas.
    'table_ids', case when p_since is null then null else (
      select coalesce(jsonb_agg(t.id), '[]'::jsonb) from restaurant_tables t
      where t.tenant_id = p_tenant and (p_branch is null or t.branch_id = p_branch)) end,

    'orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'table_id', o.table_id, 'table_number', t.number, 'seats', t.seats, 'zone', t.zone,
        'kind', o.kind, 'status', o.status, 'opened_at', o.opened_at, 'closed_at', o.closed_at,
        'paid_method', o.paid_method, 'paid_total', o.paid_total, 'branch_id', o.branch_id,
        'customer_id', o.customer_id,
        'lines', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id, 'item_id', l.menu_item_id, 'name', l.name, 'qty', l.qty,
            'unit_price', l.unit_price, 'extra_price', l.extra_price, 'modifiers', l.modifiers,
            'split_payer', l.split_payer, 'sent_qty', l.sent_qty) order by l.created_at), '[]'::jsonb)
          from order_lines l where l.order_id = o.id)
      ) order by o.opened_at), '[]'::jsonb)
      from orders o
      left join restaurant_tables t on t.id = o.table_id
      where o.tenant_id = p_tenant
        and o.kind <> 'delivery'
        and (p_branch is null or o.branch_id = p_branch)
        and (case when p_since is null then o.status not in ('cobrada', 'anulada')
                  else o.updated_at > p_since end)),

    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'order_id', k.order_id, 'table_label', k.table_label, 'col', k.col,
        'entered_at', k.entered_at, 'note', k.note, 'done', k.done, 'branch_id', k.branch_id,
        'lines', (
          select coalesce(jsonb_agg(jsonb_build_object('qty', tl.qty, 'name', tl.name)), '[]'::jsonb)
          from ticket_lines tl where tl.ticket_id = k.id)
      ) order by k.entered_at), '[]'::jsonb)
      from kitchen_tickets k
      where k.tenant_id = p_tenant
        and (p_branch is null or k.branch_id = p_branch)
        and (case when p_since is null then k.col <> 'entregado' else k.updated_at > p_since end)),

    'deliveries', (
      select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc), '[]'::jsonb)
      from v_delivery_orders v
      where v.tenant_id = p_tenant
        and (p_branch is null or v.branch_id = p_branch)
        and (case when p_since is null
                  then v.status in ('recibido', 'preparando', 'listo', 'en_camino') or v.created_at >= v_today
                  else v.updated_at > p_since end))
  );
end $$;

grant execute on function public.pos_snapshot(uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- API: registro de la terminal (caja) y su serie propia
-- ---------------------------------------------------------------------------
create or replace function public.pos_terminal(p_tenant uuid, p_device text, p_branch uuid default null, p_name text default '')
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  term pos_terminals;
  n    int;
begin
  if not app.pos_member(p_tenant) then
    raise exception 'Sin acceso a este restaurante.' using errcode = '42501';
  end if;
  if coalesce(length(p_device), 0) < 8 then
    raise exception 'Identificador de dispositivo inválido.' using errcode = '22023';
  end if;
  select * into term from pos_terminals where tenant_id = p_tenant and device_id = p_device;
  if not found then
    perform 1 from tenants where id = p_tenant for update; -- serializa la asignación de series
    select coalesce(max(substr(serie_boleta, 2)::int), 0) + 1 into n
    from pos_terminals where tenant_id = p_tenant and serie_boleta ~ '^B[0-9]{3}$';
    if n > 999 then
      raise exception 'Se alcanzó el máximo de terminales.' using errcode = 'P0001';
    end if;
    insert into pos_terminals (tenant_id, branch_id, device_id, name, serie_boleta, serie_factura)
    values (p_tenant,
            coalesce((select id from branches where id = p_branch and tenant_id = p_tenant), app.root_branch(p_tenant)),
            p_device, coalesce(nullif(p_name, ''), 'Caja ' || n),
            'B' || lpad(n::text, 3, '0'), 'F' || lpad(n::text, 3, '0'))
    returning * into term;
  else
    update pos_terminals set last_seen_at = now() where id = term.id;
  end if;
  return jsonb_build_object(
    'id', term.id, 'name', term.name, 'branch_id', term.branch_id,
    'serie_boleta', term.serie_boleta, 'serie_factura', term.serie_factura,
    'last_boleta', coalesce((select last from folio_counters where tenant_id = p_tenant and serie = term.serie_boleta), 1000),
    'last_factura', coalesce((select last from folio_counters where tenant_id = p_tenant and serie = term.serie_factura), 1000));
end $$;

grant execute on function public.pos_terminal(uuid, text, uuid, text) to authenticated;

-- ==================================================================
-- Migracion 0033_branch_sales.sql
-- ==================================================================

-- Ventas por sucursal agregadas en la base (antes: el cliente bajaba hasta 2000
-- pedidos y sumaba; con más ventas el resultado quedaba corto e iba lento).
-- Usa el índice parcial orders_paid_idx (tenant_id, closed_at) where cobrada.
create or replace function public.branch_sales(p_tenant uuid, p_from timestamptz default null)
returns table (branch_id uuid, sales numeric, orders int)
language sql stable security definer set search_path = public, app as $$
  select o.branch_id, round(coalesce(sum(o.paid_total), 0), 2), count(*)::int
  from orders o
  where app.pos_member(p_tenant)
    and o.tenant_id = p_tenant
    and o.status = 'cobrada'
    and (p_from is null or o.closed_at >= p_from)
  group by o.branch_id;
$$;

grant execute on function public.branch_sales(uuid, timestamptz) to authenticated;

-- ==================================================================
-- seed.sql
-- ==================================================================

-- ============================================================================
-- Wayra POS — datos de prueba (seed) para un proyecto Supabase nuevo.
-- Ejecuta este archivo UNA VEZ, después de aplicar todas las migraciones
-- (supabase/migrations). Es idempotente donde hay claves únicas; para volver a
-- sembrar desde cero, mejor recrea la base (o borra los datos del tenant demo).
--
-- Los usuarios de Auth NO se pueden crear por SQL: créalos en el dashboard
-- (Authentication → Users) y luego inserta sus `memberships` (ver la sección
-- final de este archivo y SUPABASE_SETUP.md).
-- ============================================================================

-- IDs fijos para poder referenciarlos entre tablas.
--   Tenant demo:            11111111-1111-1111-1111-111111111111
--   Sucursal Miraflores:    22222222-0000-0000-0000-000000000001
--   Sucursal San Isidro:    22222222-0000-0000-0000-000000000002

-- ---------------------------------------------------------------------------
-- 1) Planes de suscripción
-- ---------------------------------------------------------------------------
-- max_branches = sucursales además de la sede principal (null = sin límite).
insert into subscription_plans (tier, price, features, max_branches) values
  ('Básico', 699,  'POS, cocina, caja, delivery y comprobantes SUNAT', 2),
  ('Pro', 1499, 'Todo lo del Básico + inventario, recetas y reportes', 10),
  ('Enterprise', 4800, 'Todo lo del Pro + soporte prioritario', null)
on conflict (tier) do update set
  price = excluded.price, features = excluded.features, max_branches = excluded.max_branches;

-- ---------------------------------------------------------------------------
-- 2) Datos del emisor del SaaS (tu empresa)
-- ---------------------------------------------------------------------------
insert into platform_settings (id, razon_social, ruc, direccion, billing_email)
values (true, 'Wayra POS S.A.C.', '20601234567', 'Av. Javier Prado 1234, San Isidro, Lima', 'facturacion@wayrapos.pe')
on conflict (id) do update set
  razon_social = excluded.razon_social, ruc = excluded.ruc,
  direccion = excluded.direccion, billing_email = excluded.billing_email;

-- ---------------------------------------------------------------------------
-- 3) Tenants (el demo + otros para poblar la consola SaaS)
-- ---------------------------------------------------------------------------
-- Cada alta crea sola su sede principal (trigger tenants_create_root). El MRR
-- no se guarda: se deriva del plan en la vista v_tenants.
insert into tenants (id, name, slug, owner_name, plan, status, since) values
  ('11111111-1111-1111-1111-111111111111', 'La Higuera', 'la-higuera', 'Mónica R.', 'Pro', 'Activo', '2025-03-01'),
  ('a0000000-0000-0000-0000-000000000002', 'Cevichería El Muelle', 'cevicheria-el-muelle', 'Andrés Ríos', 'Enterprise', 'Activo', '2024-06-01'),
  ('a0000000-0000-0000-0000-000000000003', 'Sushi Nami', 'sushi-nami', 'Keiko Tanaka', 'Pro', 'Activo', '2025-11-01'),
  ('a0000000-0000-0000-0000-000000000004', 'Tacos El Farol', 'tacos-el-farol', 'Raúl Méndez', 'Básico', 'Activo', '2025-01-01'),
  ('a0000000-0000-0000-0000-000000000005', 'Café Aurora', 'cafe-aurora', 'Paula Vega', 'Pro', 'Prueba', '2026-02-01'),
  ('a0000000-0000-0000-0000-000000000006', 'Brasas del Sur', 'brasas-del-sur', 'Jorge Salas', 'Básico', 'Suspendido', '2025-09-01')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Configuración del negocio del tenant demo
-- ---------------------------------------------------------------------------
insert into business_settings
  (tenant_id, name, currency, tax_rate, ruc, address, razon_social, ubigeo,
   yape_number, plin_number, card_provider, billing_provider, sunat_mode)
values
  ('11111111-1111-1111-1111-111111111111', 'La Higuera', 'PEN', 18,
   '20512345678', 'Av. La Mar 1234, Miraflores, Lima', 'LA HIGUERA S.A.C.', '150122',
   '987 654 321', '987 654 321', 'ninguno', 'ninguno', 'beta')
on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5) Sucursales del tenant demo (árbol: Miraflores es la sede principal y
--    San Isidro depende de ella). IDs fijos para asignar mesas.
-- ---------------------------------------------------------------------------
update branches
set id = '22222222-0000-0000-0000-000000000001', name = 'Miraflores', city = 'Lima',
    address = 'Av. La Mar 1234, Miraflores'
where tenant_id = '11111111-1111-1111-1111-111111111111' and parent_id is null
  and id <> '22222222-0000-0000-0000-000000000001';
insert into branches (id, tenant_id, parent_id, name, city, address) values
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '22222222-0000-0000-0000-000000000001', 'San Isidro', 'Lima', 'Calle Las Begonias 450, San Isidro')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6) Personal (staff). El PIN se define desde la app (se guarda hasheado).
-- ---------------------------------------------------------------------------
insert into staff_members (tenant_id, name, initials, role) values
  ('11111111-1111-1111-1111-111111111111', 'Mónica R.', 'MR', 'dueno'),
  ('11111111-1111-1111-1111-111111111111', 'Iker Solís', 'IS', 'admin'),
  ('11111111-1111-1111-1111-111111111111', 'Ana Ruiz', 'AR', 'mesero'),
  ('11111111-1111-1111-1111-111111111111', 'Carlos Vega', 'CV', 'mesero')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 7) Carta: categorías + platos
-- ---------------------------------------------------------------------------
insert into menu_categories (tenant_id, key, name, icon, subtitle, sort) values
  ('11111111-1111-1111-1111-111111111111', 'entradas', 'Entradas', '🥑', 'Para empezar a compartir', 1),
  ('11111111-1111-1111-1111-111111111111', 'ceviches', 'Ceviches', '🐟', 'Frescos del día', 2),
  ('11111111-1111-1111-1111-111111111111', 'segundos', 'Segundos', '🍲', 'Criollos de la casa', 3),
  ('11111111-1111-1111-1111-111111111111', 'postres', 'Postres', '🍮', 'Dulces limeños', 4),
  ('11111111-1111-1111-1111-111111111111', 'bebidas', 'Barra', '🍹', 'Piscos y refrescos', 5)
on conflict do nothing;

insert into menu_items (tenant_id, category_id, name, description, price, emoji, badge, is_spicy, is_gf, is_meat, sort)
select '11111111-1111-1111-1111-111111111111', c.id, v.name, v.descr, v.price, v.emoji, v.badge, v.spicy, v.gf, v.meat, v.sort
from (values
  ('entradas', 'Causa limeña', 'Papa amarilla, palta, pollo', 28.0, '🥔', null, false, true, false, 1),
  ('entradas', 'Anticuchos', 'Corazón de res a la parrilla, papa dorada', 34.0, '🍢', null, true, true, true, 2),
  ('ceviches', 'Ceviche clásico', 'Pescado fresco, limón, ají limo, camote', 42.0, '🐟', 'Popular', true, true, false, 1),
  ('ceviches', 'Tiradito nikkei', 'Láminas de pescado, crema de rocoto', 46.0, '🐟', null, true, true, false, 2),
  ('segundos', 'Lomo saltado', 'Lomo de res, cebolla, tomate, papas fritas', 48.0, '🥩', 'Chef', false, false, true, 1),
  ('segundos', 'Ají de gallina', 'Gallina deshilachada en crema de ají amarillo', 38.0, '🍗', null, true, true, false, 2),
  ('postres', 'Suspiro a la limeña', 'Manjar blanco y merengue al oporto', 22.0, '🍮', null, false, true, false, 1),
  ('bebidas', 'Pisco sour', 'Pisco quebranta, limón, clara de huevo', 26.0, '🍸', 'Popular', false, true, false, 1),
  ('bebidas', 'Chicha morada', 'Maíz morado, piña, canela y clavo', 14.0, '🟣', null, false, true, false, 2)
) as v(catkey, name, descr, price, emoji, badge, spicy, gf, meat, sort)
join menu_categories c on c.key = v.catkey and c.tenant_id = '11111111-1111-1111-1111-111111111111'
on conflict do nothing;

-- Modificadores (extras y preferencias)
insert into modifier_extras (tenant_id, key, name, price) values
  ('11111111-1111-1111-1111-111111111111', 'extra-camote', 'Camote extra', 5),
  ('11111111-1111-1111-1111-111111111111', 'extra-choclo', 'Choclo extra', 4),
  ('11111111-1111-1111-1111-111111111111', 'doble-pisco', 'Doble de pisco', 8)
on conflict do nothing;
insert into modifier_prefs (tenant_id, key, name) values
  ('11111111-1111-1111-1111-111111111111', 'sin-cebolla', 'Sin cebolla'),
  ('11111111-1111-1111-1111-111111111111', 'sin-aji', 'Sin ají'),
  ('11111111-1111-1111-1111-111111111111', 'termino-medio', 'Término medio')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8) Mesas — 1..12 en Miraflores, 13..20 en San Isidro
-- ---------------------------------------------------------------------------
insert into restaurant_tables (tenant_id, branch_id, zone, number, seats, status)
select
  '11111111-1111-1111-1111-111111111111',
  case when n <= 12 then '22222222-0000-0000-0000-000000000001'::uuid
       else '22222222-0000-0000-0000-000000000002'::uuid end,
  z.zone, n, case when z.zone = 'Barra' then 2 else 4 end, 'libre'
from (values ('Terraza', 1, 6), ('Salón principal', 7, 16), ('Barra', 17, 20)) as z(zone, lo, hi)
cross join lateral generate_series(z.lo, z.hi) as n
on conflict (branch_id, number) do nothing;

-- ---------------------------------------------------------------------------
-- 9) Inventario (con costo por unidad para food cost)
-- ---------------------------------------------------------------------------
-- Catálogo de insumos (compartido por todas las sucursales) + stock inicial de
-- cada sucursal como movimiento de kardex (el stock es la suma de movimientos).
insert into inventory_items (tenant_id, name, unit, par, cost) values
  ('11111111-1111-1111-1111-111111111111', 'Pescado fresco', 'kg', 20, 28.00),
  ('11111111-1111-1111-1111-111111111111', 'Lomo de res', 'kg', 12, 32.00),
  ('11111111-1111-1111-1111-111111111111', 'Papa amarilla', 'kg', 25, 3.50),
  ('11111111-1111-1111-1111-111111111111', 'Ají amarillo', 'kg', 8, 9.00),
  ('11111111-1111-1111-1111-111111111111', 'Culantro', 'atado', 10, 1.50),
  ('11111111-1111-1111-1111-111111111111', 'Pisco', 'bot', 6, 45.00),
  ('11111111-1111-1111-1111-111111111111', 'Limón', 'kg', 15, 5.00)
on conflict do nothing;

insert into inventory_movements (tenant_id, branch_id, item_id, delta, reason, actor)
select '11111111-1111-1111-1111-111111111111', b.branch_id, inv.id, v.qty * b.factor, 'inicial', 'Seed'
from (values
  ('Pescado fresco', 18), ('Lomo de res', 15), ('Papa amarilla', 40), ('Ají amarillo', 6),
  ('Culantro', 8), ('Pisco', 12), ('Limón', 22)
) as v(insumo, qty)
join inventory_items inv on inv.name = v.insumo and inv.tenant_id = '11111111-1111-1111-1111-111111111111'
cross join (values
  ('22222222-0000-0000-0000-000000000001'::uuid, 1.0),
  ('22222222-0000-0000-0000-000000000002'::uuid, 0.5)
) as b(branch_id, factor)
where not exists (select 1 from inventory_movements m where m.item_id = inv.id);

-- ---------------------------------------------------------------------------
-- 10) Recetas (food cost) — enlaza plato ↔ insumo por nombre
-- ---------------------------------------------------------------------------
insert into recipes (tenant_id, menu_item_id, inventory_id, qty_per_unit)
select '11111111-1111-1111-1111-111111111111', mi.id, inv.id, r.qty
from (values
  ('Ceviche clásico', 'Pescado fresco', 0.25),
  ('Ceviche clásico', 'Limón', 0.10),
  ('Ceviche clásico', 'Culantro', 0.05),
  ('Tiradito nikkei', 'Pescado fresco', 0.20),
  ('Tiradito nikkei', 'Ají amarillo', 0.03),
  ('Lomo saltado', 'Lomo de res', 0.30),
  ('Lomo saltado', 'Papa amarilla', 0.20),
  ('Ají de gallina', 'Ají amarillo', 0.06),
  ('Causa limeña', 'Papa amarilla', 0.25),
  ('Pisco sour', 'Pisco', 0.08),
  ('Pisco sour', 'Limón', 0.05)
) as r(plato, insumo, qty)
join menu_items mi on mi.name = r.plato and mi.tenant_id = '11111111-1111-1111-1111-111111111111'
join inventory_items inv on inv.name = r.insumo and inv.tenant_id = '11111111-1111-1111-1111-111111111111'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 11) CRM (clientes de lealtad)
-- ---------------------------------------------------------------------------
insert into customers (tenant_id, name, phone, visits, spent, points, tier) values
  ('11111111-1111-1111-1111-111111111111', 'Lucía Fernández', '987 654 321', 14, 1820, 182, 'Oro'),
  ('11111111-1111-1111-1111-111111111111', 'Diego Rojas', '956 112 233', 6, 640, 64, 'Plata'),
  ('11111111-1111-1111-1111-111111111111', 'Valeria Chávez', '999 888 777', 2, 180, 18, 'Bronce')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 12) Consola SaaS: facturas, tickets y bitácora de plataforma
-- ---------------------------------------------------------------------------
insert into saas_invoices (tenant_id, folio, amount, igv, method, paid) values
  ('11111111-1111-1111-1111-111111111111', 'NP-F001-1001', 1499, 228.66, 'tarjeta', true),
  ('a0000000-0000-0000-0000-000000000002', 'NP-F001-1002', 4800, 732.20, 'tarjeta', true),
  ('a0000000-0000-0000-0000-000000000003', 'NP-F001-1003', 1499, 228.66, 'transferencia', true),
  ('a0000000-0000-0000-0000-000000000004', 'NP-F001-1004', 699, 106.63, 'tarjeta', true),
  ('a0000000-0000-0000-0000-000000000006', 'NP-F001-1005', 699, 106.63, 'tarjeta', false)
on conflict do nothing;

insert into support_tickets (tenant_id, subject, priority, status) values
  ('a0000000-0000-0000-0000-000000000003', 'Impresora no responde', 'Alta', 'Abierto'),
  ('a0000000-0000-0000-0000-000000000002', 'Duda sobre reportes por mesero', 'Media', 'Abierto'),
  ('a0000000-0000-0000-0000-000000000004', 'Solicitud de nueva sucursal', 'Baja', 'Abierto'),
  ('11111111-1111-1111-1111-111111111111', 'Capacitación de personal', 'Baja', 'Resuelto')
on conflict do nothing;

insert into platform_activity (actor, message) values
  ('Plataforma', 'Tenant Café Aurora creado · plan Pro (prueba 14 días)'),
  ('Plataforma', 'Suscripción de Brasas del Sur suspendida por falta de pago'),
  ('Plataforma', 'Plan Pro actualizado (precio S/ 1499)')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 13) Comprobantes de ejemplo (para que el Monitor SUNAT no salga vacío)
-- ---------------------------------------------------------------------------
insert into comprobantes (tenant_id, folio, tipo, buyer_ruc, buyer_name, subtotal, igv, total, reference, status)
values
  ('11111111-1111-1111-1111-111111111111', 'B001-1001', 'Boleta', null, 'CLIENTES VARIOS', 40.00, 7.20, 47.20, 'Mesa 7', 'aceptada'),
  ('11111111-1111-1111-1111-111111111111', 'F001-1001', 'Factura', '20512345678', 'CONTOSO SAC', 180.00, 32.40, 212.40, 'Mesa 3', 'aceptada')
on conflict do nothing;

-- Contadores de folio coherentes con los comprobantes de ejemplo.
insert into folio_counters (tenant_id, serie, last) values
  ('11111111-1111-1111-1111-111111111111', 'B001', 1001),
  ('11111111-1111-1111-1111-111111111111', 'F001', 1001)
on conflict (tenant_id, serie) do nothing;

-- ============================================================================
-- 14) Cuentas de acceso (se hace en el dashboard, NO por SQL)
-- ----------------------------------------------------------------------------
-- 1. Authentication → Users → Add user (email + password) para:
--      - el dueño de la plataforma (tú, SaaS)
--      - el dueño del tenant demo (Mónica / La Higuera)
-- 2. Copia el UUID de cada usuario y ejecuta:
--
--   -- Dueño de la plataforma (ve la consola SaaS):
--   insert into memberships (user_id, tenant_id, role)
--   values ('<uid-plataforma>', null, 'saas');
--
--   -- Dueño del tenant demo (ve el POS de La Higuera):
--   insert into memberships (user_id, tenant_id, role)
--   values ('<uid-monica>', '11111111-1111-1111-1111-111111111111', 'dueno');
--
-- El staff (Gerente/Mesero) entra por PIN en el dispositivo del local; sus PIN
-- se definen desde Dueño → Personal (se guardan hasheados).
-- ============================================================================
