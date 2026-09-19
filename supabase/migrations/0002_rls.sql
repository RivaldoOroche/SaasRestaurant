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
