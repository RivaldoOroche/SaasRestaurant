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
