-- =====================================================================
-- Wayra POS - Script unico de instalacion (todo en uno)
-- =====================================================================
-- Concatena las migraciones (0001 -> ultima) + seed.sql. Pegar UNA vez
-- en el SQL Editor de Supabase y Run. Luego Auth + memberships (SUPABASE_SETUP.md).
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
-- seed.sql
-- ==================================================================

-- ============================================================================
-- Wayra POS — datos de prueba (seed) para un proyecto Supabase nuevo.
-- Ejecuta este archivo UNA VEZ, después de aplicar todas las migraciones
-- (0001 … 0017). Es idempotente donde hay claves únicas; para volver a
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
insert into subscription_plans (tier, price, features) values
  ('Básico', 699,  'POS + 1 sucursal'),
  ('Pro', 1499, 'POS + inventario + reportes + 3 sucursales'),
  ('Enterprise', 4800, 'Todo + multi-sucursal + soporte prioritario')
on conflict (tier) do update set price = excluded.price, features = excluded.features;

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
insert into tenants (id, name, slug, owner_name, plan, mrr, status, since) values
  ('11111111-1111-1111-1111-111111111111', 'La Higuera', 'la-higuera', 'Mónica R.', 'Pro', 1499, 'Activo', '2025-03-01'),
  ('a0000000-0000-0000-0000-000000000002', 'Cevichería El Muelle', 'cevicheria-el-muelle', 'Andrés Ríos', 'Enterprise', 4800, 'Activo', '2024-06-01'),
  ('a0000000-0000-0000-0000-000000000003', 'Sushi Nami', 'sushi-nami', 'Keiko Tanaka', 'Pro', 1499, 'Activo', '2025-11-01'),
  ('a0000000-0000-0000-0000-000000000004', 'Tacos El Farol', 'tacos-el-farol', 'Raúl Méndez', 'Básico', 699, 'Activo', '2025-01-01'),
  ('a0000000-0000-0000-0000-000000000005', 'Café Aurora', 'cafe-aurora', 'Paula Vega', 'Pro', 0, 'Prueba', '2026-02-01'),
  ('a0000000-0000-0000-0000-000000000006', 'Brasas del Sur', 'brasas-del-sur', 'Jorge Salas', 'Básico', 0, 'Suspendido', '2025-09-01')
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
-- 5) Sucursales del tenant demo (IDs fijos para asignar mesas)
-- ---------------------------------------------------------------------------
insert into branches (id, tenant_id, name, city) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Miraflores', 'Lima'),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'San Isidro', 'Lima')
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
  case when n <= 12 then '22222222-0000-0000-0000-000000000001'
       else '22222222-0000-0000-0000-000000000002' end,
  z.zone, n, case when z.zone = 'Barra' then 2 else 4 end, 'libre'
from (values ('Terraza', 1, 6), ('Salón principal', 7, 16), ('Barra', 17, 20)) as z(zone, lo, hi)
cross join lateral generate_series(z.lo, z.hi) as n
on conflict (tenant_id, number) do nothing;

-- ---------------------------------------------------------------------------
-- 9) Inventario (con costo por unidad para food cost)
-- ---------------------------------------------------------------------------
insert into inventory_items (tenant_id, name, unit, stock, par, cost) values
  ('11111111-1111-1111-1111-111111111111', 'Pescado fresco', 'kg', 18, 20, 28.00),
  ('11111111-1111-1111-1111-111111111111', 'Lomo de res', 'kg', 15, 12, 32.00),
  ('11111111-1111-1111-1111-111111111111', 'Papa amarilla', 'kg', 40, 25, 3.50),
  ('11111111-1111-1111-1111-111111111111', 'Ají amarillo', 'kg', 6, 8, 9.00),
  ('11111111-1111-1111-1111-111111111111', 'Culantro', 'atado', 8, 10, 1.50),
  ('11111111-1111-1111-1111-111111111111', 'Pisco', 'bot', 12, 6, 45.00),
  ('11111111-1111-1111-1111-111111111111', 'Limón', 'kg', 22, 15, 5.00)
on conflict do nothing;

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
