-- =============================================================================
-- 0038 · Turnos de caja por sucursal (apertura → movimientos → cierre)
--
-- Reemplaza cash_register_closes (nunca se usó). Un turno:
--   · se abre con un fondo inicial (una sola caja abierta por sucursal),
--   · registra ingresos y egresos de efectivo (gastos, retiros, sencillo),
--   · al cerrarse guarda lo esperado por método (calculado en el servidor con
--     las ventas cobradas en la sucursal durante el turno), lo contado y la
--     diferencia.
-- Las tres acciones son operaciones del POS (pos_apply): funcionan sin internet
-- y se sincronizan al volver la conexión.
-- =============================================================================
drop table if exists cash_register_closes;

create table cash_sessions (
  id            uuid primary key,
  tenant_id     uuid not null references tenants (id) on delete cascade,
  branch_id     uuid not null,
  status        text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  opened_at     timestamptz not null,
  opened_by     text not null default '',
  opening_float numeric(12,2) not null default 0 check (opening_float >= 0),
  closed_at     timestamptz,
  closed_by     text,
  expected      jsonb,  -- { efectivo: 820.5, yape: 120, ... } (efectivo incluye fondo y movimientos)
  counted       jsonb,  -- lo contado por método
  difference    numeric(12,2),
  notes         text not null default '',
  updated_at    timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id)
);
create unique index cash_sessions_one_open on cash_sessions (branch_id) where status = 'abierta';
create index cash_sessions_branch_idx on cash_sessions (tenant_id, branch_id, opened_at desc);
create index cash_sessions_updated_idx on cash_sessions (tenant_id, updated_at);
create trigger cash_sessions_touch before update on cash_sessions
  for each row execute function app.touch_updated_at();

create table cash_movements (
  id         uuid primary key,
  tenant_id  uuid not null references tenants (id) on delete cascade,
  session_id uuid not null references cash_sessions (id) on delete cascade,
  kind       text not null check (kind in ('ingreso', 'egreso')),
  amount     numeric(12,2) not null check (amount > 0),
  reason     text not null default '',
  actor      text not null default '',
  created_at timestamptz not null default now()
);
create index cash_movements_session_idx on cash_movements (session_id);

-- Un movimiento cambia el turno (delta de sincronización).
create or replace function app.cash_movements_touch() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  update cash_sessions set updated_at = now() where id = new.session_id;
  return null;
end $$;
create trigger cash_movements_touch after insert on cash_movements
  for each row execute function app.cash_movements_touch();

alter table cash_sessions enable row level security;
alter table cash_movements enable row level security;
-- Lectura para el personal del restaurante; las escrituras van por pos_apply.
create policy cash_sessions_read on cash_sessions for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));
create policy cash_movements_read on cash_movements for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));

-- Esperado del turno: ventas cobradas en la sucursal entre la apertura y el
-- cierre, por método; el efectivo suma el fondo inicial y los movimientos.
create or replace function app.cash_expected(s cash_sessions, p_until timestamptz) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with sales as (
    select coalesce(paid_method::text, 'efectivo') m, sum(paid_total) t
    from orders
    where tenant_id = s.tenant_id and branch_id = s.branch_id and status = 'cobrada'
      and closed_at >= s.opened_at and closed_at <= p_until
    group by 1
  ),
  moves as (
    select coalesce(sum(case kind when 'ingreso' then amount else -amount end), 0) net
    from cash_movements where session_id = s.id
  )
  select jsonb_build_object('efectivo',
           round(s.opening_float + (select net from moves) + coalesce((select t from sales where m = 'efectivo'), 0), 2))
         || coalesce((select jsonb_object_agg(m, round(t, 2)) from sales where m <> 'efectivo'), '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- Operaciones de caja dentro de pos_exec (se envuelve la función existente)
-- ---------------------------------------------------------------------------
alter function app.pos_exec(uuid, jsonb) rename to pos_exec_core;

create or replace function app.pos_exec(p_tenant uuid, op jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_type  text := op ->> 'type';
  v_at    timestamptz := least(coalesce((op ->> 'at')::timestamptz, now()), now());
  v_actor text := coalesce(nullif(op ->> 'actor', ''), 'POS');
  s       cash_sessions;
  v_exp   jsonb;
  v_cnt   jsonb;
  v_diff  numeric;
  v_branch uuid;
begin
  if v_type not like 'cash.%' then
    return app.pos_exec_core(p_tenant, op);
  end if;

  if v_type = 'cash.open' then
    if exists (select 1 from cash_sessions where id = (op ->> 'session_id')::uuid and tenant_id = p_tenant) then
      return '{}'::jsonb; -- reintento
    end if;
    v_branch := coalesce(
      (select id from branches where id = nullif(op ->> 'branch_id', '')::uuid and tenant_id = p_tenant),
      app.root_branch(p_tenant));
    if exists (select 1 from cash_sessions where branch_id = v_branch and status = 'abierta') then
      raise exception 'Ya hay una caja abierta en esta sucursal.' using errcode = 'P0001';
    end if;
    insert into cash_sessions (id, tenant_id, branch_id, opened_at, opened_by, opening_float)
    values ((op ->> 'session_id')::uuid, p_tenant, v_branch, v_at, v_actor,
            greatest(0, coalesce((op ->> 'opening_float')::numeric, 0)));
    perform app.pos_log(p_tenant, v_actor, format('Abrió caja con fondo S/ %s', to_char(coalesce((op ->> 'opening_float')::numeric, 0), 'FM999999990.00')));
    return '{}'::jsonb;
  end if;

  select * into s from cash_sessions where id = (op ->> 'session_id')::uuid and tenant_id = p_tenant for update;
  if not found then
    raise exception 'La caja ya no existe.' using errcode = 'P0001';
  end if;

  if v_type = 'cash.move' then
    if s.status <> 'abierta' then
      raise exception 'La caja ya fue cerrada.' using errcode = 'P0001';
    end if;
    insert into cash_movements (id, tenant_id, session_id, kind, amount, reason, actor, created_at)
    values ((op ->> 'movement_id')::uuid, p_tenant, s.id, op ->> 'kind', (op ->> 'amount')::numeric,
            coalesce(op ->> 'reason', ''), v_actor, v_at)
    on conflict (id) do nothing;
    perform app.pos_log(p_tenant, v_actor, format('Caja: %s S/ %s · %s', op ->> 'kind',
      to_char((op ->> 'amount')::numeric, 'FM999999990.00'), coalesce(op ->> 'reason', '')));
    return '{}'::jsonb;
  end if;

  if v_type = 'cash.close' then
    if s.status = 'cerrada' then
      return jsonb_build_object('expected', s.expected, 'difference', s.difference); -- reintento
    end if;
    v_exp := app.cash_expected(s, v_at);
    v_cnt := coalesce(op -> 'counted', '{}'::jsonb);
    select round(coalesce(sum(coalesce((v_cnt ->> k)::numeric, 0) - (v_exp ->> k)::numeric), 0), 2)
      into v_diff
    from jsonb_object_keys(v_exp) k;
    update cash_sessions set
      status = 'cerrada', closed_at = v_at, closed_by = v_actor,
      expected = v_exp, counted = v_cnt, difference = v_diff,
      notes = coalesce(op ->> 'notes', '')
    where id = s.id;
    perform app.pos_log(p_tenant, v_actor, format('Cerró caja · diferencia S/ %s', to_char(v_diff, 'FM999999990.00')));
    return jsonb_build_object('expected', v_exp, 'difference', v_diff);
  end if;

  raise exception 'Operación desconocida: %', v_type using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- pos_snapshot incluye las cajas abiertas (y en delta, las que cambiaron)
-- ---------------------------------------------------------------------------
alter function public.pos_snapshot(uuid, uuid, timestamptz) rename to pos_snapshot_core;
revoke execute on function public.pos_snapshot_core(uuid, uuid, timestamptz) from authenticated, anon, public;

create or replace function public.pos_snapshot(p_tenant uuid, p_branch uuid default null, p_since timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  return public.pos_snapshot_core(p_tenant, p_branch, p_since) || jsonb_build_object(
    'cash', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'branch_id', c.branch_id, 'status', c.status, 'opened_at', c.opened_at,
        'opened_by', c.opened_by, 'opening_float', c.opening_float, 'closed_at', c.closed_at,
        'closed_by', c.closed_by, 'expected', c.expected, 'counted', c.counted,
        'difference', c.difference, 'notes', c.notes,
        'movements', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', m.id, 'kind', m.kind, 'amount', m.amount, 'reason', m.reason,
            'actor', m.actor, 'at', m.created_at) order by m.created_at), '[]'::jsonb)
          from cash_movements m where m.session_id = c.id)
      ) order by c.opened_at), '[]'::jsonb)
      from cash_sessions c
      where c.tenant_id = p_tenant
        and (p_branch is null or c.branch_id = p_branch)
        and (case when p_since is null then c.status = 'abierta' else c.updated_at > p_since end)));
end $$;

grant execute on function public.pos_snapshot(uuid, uuid, timestamptz) to authenticated;

-- Realtime: que el turno de caja se vea en todos los equipos.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cash_sessions') then
    alter publication supabase_realtime add table public.cash_sessions;
  end if;
end $$;
