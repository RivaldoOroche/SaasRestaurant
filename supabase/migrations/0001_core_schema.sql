-- NubePOS core schema.
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
