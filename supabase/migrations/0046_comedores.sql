-- =============================================================================
-- 0046 · Comedores (colegios y empresas)
--
-- Wayra trabaja con dos tipos de negocio: restaurantes y comedores. Un comedor
-- atiende a comensales registrados (alumnos, docentes, colaboradores) que
-- pagan con saldo prepago, con un abono mensual o por convenio (lo paga el
-- colegio o la empresa), y las familias lo siguen desde un enlace privado.
--
--   · Planes como texto (antes enum plan_tier: un enum no se puede ampliar y
--     usar en la misma instalación) + planes de comedor por comensales activos.
--   · tenants.business_type: 'restaurante' | 'comedor'.
--   · responsables, comensales (monedero), comedor_wallet (movimientos),
--     comedor_menus (menú del día), comedor_reservas, comedor_consumos.
--   · RPC atómicas: comedor_recargar, comedor_ajustar, comedor_despachar,
--     comedor_set_reserva y el portal de familias (public_familia*).
--   · Reglas iguales a src/lib/comedor.ts.
-- Montos con IGV; fechas de servicio en hora de Lima.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Planes como texto
-- ---------------------------------------------------------------------------
drop view if exists v_tenants;
drop trigger if exists tenants_plan_guard on tenants;

alter table subscription_plans alter column tier type text using tier::text;
alter table tenants alter column plan drop default;
alter table tenants alter column plan type text using plan::text;
alter table tenants alter column plan set default 'Pro';
alter table subscription_charges alter column plan type text using plan::text;
alter table plan_change_requests alter column from_plan type text using from_plan::text;
alter table plan_change_requests alter column to_plan type text using to_plan::text;

drop function if exists app.plan_max_branches(plan_tier);
drop function if exists app.plan_limit_message(plan_tier, int);

create or replace function app.plan_max_branches(p_plan text) returns int
language sql stable security definer set search_path = public, app as $$
  select max_branches from subscription_plans where tier = p_plan;
$$;

create or replace function app.plan_limit_message(p_plan text, p_max int) returns text
language sql immutable as $$
  select case
    when p_max = 0 then format('Tu plan %s es para un solo local. Pasa al plan Pro para agregar sucursales.', p_plan)
    else format('Tu plan %s permite hasta %s locales (la sede principal y %s sucursales). Mejora tu plan para agregar más.',
                p_plan, p_max + 1, p_max)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tipo de negocio y planes de comedor
-- ---------------------------------------------------------------------------
alter table tenants add column if not exists business_type text not null default 'restaurante'
  check (business_type in ('restaurante', 'comedor'));
alter table subscription_plans add column if not exists business_type text not null default 'restaurante'
  check (business_type in ('restaurante', 'comedor'));
alter table subscription_plans add column if not exists max_comensales int;
alter table subscription_plans add column if not exists included_comensales int;
-- Precio mensual por cada bloque de 100 comensales activos sobre los incluidos.
alter table subscription_plans add column if not exists extra_comensales_price numeric(10,2);

insert into subscription_plans (tier, business_type, price, annual_price, max_branches, included_branches, extra_branch_price,
                                max_comensales, included_comensales, extra_comensales_price, features) values
  ('Comedor', 'comedor', 249, 2490, 0, null, null, 300, null, null,
   'Un comedor o cafetería con hasta 300 comensales activos: despacho, monedero prepago, abonos, menú del día con reservas, kiosko saludable, portal de familias y comprobantes SUNAT'),
  ('Comedor Pro', 'comedor', 449, 4490, 2, null, null, 1000, null, null,
   'Hasta 1 000 comensales activos y 3 sedes: todo lo del plan Comedor, convenios, reportes por sede y soporte prioritario'),
  ('Comedor Institucional', 'comedor', 899, 8990, null, null, null, null, 2000, 35,
   'Para redes de colegios, universidades y empresas: 2 000 comensales incluidos, S/ 35 por cada 100 adicionales, sedes ilimitadas y asesor dedicado')
on conflict (tier) do update set
  business_type = excluded.business_type, price = excluded.price, annual_price = excluded.annual_price,
  max_branches = excluded.max_branches, included_branches = excluded.included_branches,
  extra_branch_price = excluded.extra_branch_price, max_comensales = excluded.max_comensales,
  included_comensales = excluded.included_comensales, extra_comensales_price = excluded.extra_comensales_price,
  features = excluded.features;

alter table tenants add constraint tenants_plan_fk foreign key (plan) references subscription_plans (tier) on update cascade;

-- El plan debe ser del mismo tipo de negocio que el tenant.
create or replace function app.tenants_plan_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_type text;
  v_max  int;
  v_used int;
begin
  select business_type into v_type from subscription_plans where tier = new.plan;
  if v_type is distinct from new.business_type then
    raise exception 'El plan % es para %; este negocio es %.', new.plan,
      case v_type when 'comedor' then 'comedores' else 'restaurantes' end,
      case new.business_type when 'comedor' then 'un comedor' else 'un restaurante' end
      using errcode = 'P0001', hint = 'plan_type';
  end if;
  if tg_op = 'UPDATE' and new.plan is distinct from old.plan then
    v_max := app.plan_max_branches(new.plan);
    if v_max is not null then
      v_used := app.active_child_branches(new.id);
      if v_used > v_max then
        raise exception 'El plan % permite % y el % tiene % sucursales activas. Desactiva % antes de cambiar de plan.',
          new.plan, case when v_max = 0 then 'un solo local' else format('hasta %s sucursales', v_max) end,
          case new.business_type when 'comedor' then 'comedor' else 'restaurante' end, v_used, v_used - v_max
          using errcode = 'P0001', hint = 'plan_limit';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger tenants_plan_guard
  before insert or update of plan, business_type on tenants
  for each row execute function app.tenants_plan_guard();

create or replace function app.branches_quota_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_plan text;
  v_max  int;
begin
  if new.parent_id is null or not new.active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.active and old.parent_id is not null then
    return new;
  end if;
  select plan into v_plan from tenants where id = new.tenant_id for update;
  v_max := app.plan_max_branches(v_plan);
  if v_max is not null and app.active_child_branches(new.tenant_id, new.id) >= v_max then
    raise exception '%', app.plan_limit_message(v_plan, v_max) using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Ajustes del comedor y octógonos en la carta
-- ---------------------------------------------------------------------------
alter table business_settings
  add column if not exists comedor_mode text not null default 'escolar' check (comedor_mode in ('escolar', 'empresa')),
  add column if not exists bloquear_octogonos boolean not null default true,
  add column if not exists permitir_sin_reserva boolean not null default true,
  add column if not exists cierre_reservas text not null default '09:30' check (cierre_reservas ~ '^[0-2][0-9]:[0-5][0-9]$'),
  add column if not exists menu_price numeric(10,2) not null default 12 check (menu_price >= 0),
  add column if not exists saldo_minimo numeric(10,2) not null default 10 check (saldo_minimo >= 0),
  add column if not exists default_daily_limit numeric(10,2) check (default_daily_limit is null or default_daily_limit >= 0);

alter table menu_items add column if not exists octogonos smallint not null default 0 check (octogonos between 0 and 4);

-- ---------------------------------------------------------------------------
-- 4. Comensales, responsables y monedero
-- ---------------------------------------------------------------------------
create table responsables (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  phone        text not null default '',
  email        text not null default '',
  portal_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at   timestamptz not null default now(),
  unique (tenant_id, id)
);
create index responsables_tenant_idx on responsables (tenant_id);

create table comensales (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants (id) on delete cascade,
  branch_id            uuid,
  code                 text not null check (length(trim(code)) > 0),
  name                 text not null check (length(trim(name)) > 0),
  tipo                 text not null default 'alumno' check (tipo in ('alumno', 'docente', 'colaborador', 'otro')),
  grupo                text not null default '',
  plan                 text not null default 'prepago' check (plan in ('prepago', 'abono', 'convenio')),
  abono_hasta          date,
  balance              numeric(12,2) not null default 0 check (balance >= 0),
  daily_limit          numeric(10,2) check (daily_limit is null or daily_limit >= 0),
  blocked_category_ids uuid[] not null default '{}',
  allergies            text not null default '',
  responsable_id       uuid,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id),
  foreign key (tenant_id, responsable_id) references responsables (tenant_id, id)
);
create index comensales_tenant_idx on comensales (tenant_id, active);
create index comensales_responsable_idx on comensales (responsable_id);
create trigger comensales_touch before update on comensales
  for each row execute function app.touch_updated_at();

create table comedor_wallet (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  comensal_id   uuid not null,
  kind          text not null check (kind in ('recarga', 'consumo', 'ajuste', 'abono')),
  amount        numeric(12,2) not null,
  method        text,
  detail        text not null default '',
  actor         text not null default '',
  balance_after numeric(12,2) not null,
  created_at    timestamptz not null default now(),
  foreign key (tenant_id, comensal_id) references comensales (tenant_id, id) on delete cascade
);
create index comedor_wallet_idx on comedor_wallet (tenant_id, created_at desc);
create index comedor_wallet_comensal_idx on comedor_wallet (comensal_id, created_at desc);

create table comedor_menus (
  tenant_id  uuid not null references tenants (id) on delete cascade,
  date       date not null,
  entrada    text not null default '',
  fondo      text not null default '',
  postre     text not null default '',
  bebida     text not null default '',
  price      numeric(10,2) not null check (price >= 0),
  raciones   int not null default 0 check (raciones >= 0),
  allergens  text not null default '',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, date)
);

create table comedor_reservas (
  tenant_id   uuid not null references tenants (id) on delete cascade,
  comensal_id uuid not null,
  date        date not null,
  by          text not null default 'comedor' check (by in ('familia', 'comedor')),
  created_at  timestamptz not null default now(),
  primary key (comensal_id, date),
  foreign key (tenant_id, comensal_id) references comensales (tenant_id, id) on delete cascade
);
create index comedor_reservas_date_idx on comedor_reservas (tenant_id, date);

create table comedor_consumos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  branch_id     uuid,
  comensal_id   uuid references comensales (id) on delete set null,
  comensal_name text not null default '',
  grupo         text not null default '',
  kind          text not null check (kind in ('menu', 'kiosko')),
  items         jsonb not null default '[]',
  total         numeric(12,2) not null check (total >= 0),
  pago          text not null check (pago in ('saldo', 'abono', 'convenio', 'efectivo', 'yape', 'plin', 'tarjeta')),
  actor         text not null default '',
  service_date  date not null,
  created_at    timestamptz not null default now()
);
create index comedor_consumos_idx on comedor_consumos (tenant_id, service_date desc);
-- Una ración del menú por comensal y día, garantizado por la base.
create unique index comedor_consumos_una_racion on comedor_consumos (comensal_id, service_date) where kind = 'menu' and comensal_id is not null;

-- RLS: el personal lee; los responsables del negocio editan el padrón y el
-- menú. El dinero (monedero, consumos) solo se mueve por las RPC.
alter table responsables enable row level security;
alter table comensales enable row level security;
alter table comedor_wallet enable row level security;
alter table comedor_menus enable row level security;
alter table comedor_reservas enable row level security;
alter table comedor_consumos enable row level security;

create policy resp_read on responsables for select using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[])));
create policy resp_ins on responsables for insert with check (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));
create policy resp_upd on responsables for update using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]))) with check (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));
create policy resp_del on responsables for delete using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));

create policy com_read on comensales for select using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[])));
create policy com_ins on comensales for insert with check (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])) and balance = 0);
create policy com_upd on comensales for update using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]))) with check (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));
create policy com_del on comensales for delete using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));

create policy cw_read on comedor_wallet for select using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[])));
create policy cm_read on comedor_menus for select using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[])));
create policy cm_ins on comedor_menus for insert with check (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));
create policy cm_upd on comedor_menus for update using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]))) with check (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));
create policy cm_del on comedor_menus for delete using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[])));
create policy cr_read on comedor_reservas for select using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[])));
create policy cc_read on comedor_consumos for select using (((select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[])));

-- El saldo nunca se edita directo: solo las RPC (security definer) lo mueven.
create or replace function app.comensales_balance_guard() returns trigger
language plpgsql as $$
begin
  if new.balance is distinct from old.balance and current_setting('app.wallet', true) is distinct from 'on' then
    raise exception 'El saldo solo cambia con recargas, consumos o ajustes.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger comensales_balance_guard before update of balance on comensales
  for each row execute function app.comensales_balance_guard();

-- ---------------------------------------------------------------------------
-- 5. Cuota de comensales por plan
-- ---------------------------------------------------------------------------
create or replace function app.active_comensales(p_tenant uuid) returns int
language sql stable security definer set search_path = public, app as $$
  select count(*)::int from comensales where tenant_id = p_tenant and active;
$$;

create or replace function app.comensales_quota_guard() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_plan text;
  v_max  int;
begin
  if not new.active or (tg_op = 'UPDATE' and old.active) then
    return new;
  end if;
  select t.plan, p.max_comensales into v_plan, v_max
  from tenants t join subscription_plans p on p.tier = t.plan where t.id = new.tenant_id for update of t;
  if v_max is not null and app.active_comensales(new.tenant_id) >= v_max then
    raise exception 'Tu plan % permite hasta % comensales activos. Desactiva a quienes ya no comen aquí o mejora tu plan.', v_plan, v_max
      using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;
create trigger comensales_quota_guard before insert or update of active on comensales
  for each row execute function app.comensales_quota_guard();

-- Bloques de 100 comensales activos sobre los incluidos (Comedor Institucional).
create or replace function app.plan_extra_comensal_blocks(p_tenant uuid) returns int
language sql stable security definer set search_path = public, app as $$
  select coalesce(ceil(greatest(app.active_comensales(p_tenant) - p.included_comensales, 0) / 100.0)::int, 0)
  from tenants t join subscription_plans p on p.tier = t.plan
  where t.id = p_tenant and p.included_comensales is not null and p.extra_comensales_price is not null;
$$;

create or replace function app.plan_monthly_total(p_tenant uuid) returns numeric
language sql stable security definer set search_path = public, app as $$
  select round(p.price
    + coalesce(app.plan_extra_branches(t.id), 0) * coalesce(p.extra_branch_price, 0)
    + coalesce(app.plan_extra_comensal_blocks(t.id), 0) * coalesce(p.extra_comensales_price, 0), 2)
  from tenants t join subscription_plans p on p.tier = t.plan
  where t.id = p_tenant;
$$;

create view v_tenants with (security_invoker = true) as
select
  t.*,
  coalesce(app.plan_monthly_total(t.id), 0)::numeric(10,2) as plan_total,
  case when t.status = 'Activo' then coalesce(app.plan_monthly_total(t.id), 0) else 0 end::numeric(10,2) as mrr,
  (select count(*)::int from branches b where b.tenant_id = t.id and b.active) as branches_count,
  (select count(*)::int from comensales c where c.tenant_id = t.id and c.active) as comensales_count
from tenants t;
grant select on v_tenants to authenticated;

-- Uso de la cuota de comensales (pantalla Plan y Comensales).
create or replace function public.comensales_quota(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  p subscription_plans;
begin
  if not ((select app.is_platform_admin()) or p_tenant = any (app.my_tenant_ids())) then
    raise exception 'Sin acceso a este comedor.' using errcode = '42501';
  end if;
  select sp.* into p from tenants t join subscription_plans sp on sp.tier = t.plan where t.id = p_tenant;
  return jsonb_build_object(
    'plan', p.tier,
    'used', app.active_comensales(p_tenant),
    'max', p.max_comensales,
    'included', p.included_comensales,
    'extra_price', p.extra_comensales_price,
    'extra_blocks', app.plan_extra_comensal_blocks(p_tenant),
    'monthly_total', app.plan_monthly_total(p_tenant)
  );
end $$;
grant execute on function public.comensales_quota(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Operaciones del comedor (atómicas)
-- ---------------------------------------------------------------------------
create or replace function app.lima_today() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

-- Efectivo recibido en el comedor: entra a la caja abierta de la sede.
create or replace function app.comedor_cash_in(p_tenant uuid, p_branch uuid, p_amount numeric, p_reason text, p_actor text)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_session uuid;
begin
  select id into v_session from cash_sessions
  where tenant_id = p_tenant and status = 'abierta'
    and (branch_id = p_branch or p_branch is null)
  order by opened_at desc limit 1;
  if v_session is null then
    raise exception 'Abre la caja para recibir efectivo.' using errcode = 'P0001', hint = 'caja_cerrada';
  end if;
  insert into cash_movements (id, tenant_id, session_id, kind, amount, reason, actor)
  values (gen_random_uuid(), p_tenant, v_session, 'ingreso', p_amount, p_reason, p_actor);
end $$;

create or replace function app.wallet_json(w comedor_wallet, p_name text) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', w.id, 'comensal_id', w.comensal_id, 'comensal_name', p_name, 'kind', w.kind,
    'amount', w.amount, 'method', w.method, 'detail', w.detail, 'actor', w.actor,
    'balance_after', w.balance_after, 'at', w.created_at);
$$;

-- Recarga de saldo, o pago de un abono (extiende la cobertura, no suma saldo).
create or replace function public.comedor_recargar(
  p_tenant uuid, p_comensal uuid, p_amount numeric, p_method text, p_note text, p_actor text,
  p_branch uuid default null, p_abono_hasta date default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  c comensales;
  w comedor_wallet;
begin
  if not ((select app.is_platform_admin()) or p_tenant = any (app.my_tenant_ids())) then
    raise exception 'Sin acceso a este comedor.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.' using errcode = 'P0001';
  end if;
  if p_method not in ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta') then
    raise exception 'Medio de pago no válido.' using errcode = 'P0001';
  end if;
  select * into c from comensales where id = p_comensal and tenant_id = p_tenant for update;
  if not found then raise exception 'Comensal no encontrado.' using errcode = 'P0001'; end if;
  if p_method = 'efectivo' then
    perform app.comedor_cash_in(p_tenant, coalesce(p_branch, c.branch_id), p_amount,
      case when p_abono_hasta is null then 'Recarga · ' else 'Abono · ' end || c.name, p_actor);
  end if;
  perform set_config('app.wallet', 'on', true);
  if p_abono_hasta is not null then
    update comensales set plan = 'abono', abono_hasta = greatest(coalesce(abono_hasta, p_abono_hasta), p_abono_hasta)
    where id = c.id;
    insert into comedor_wallet (tenant_id, comensal_id, kind, amount, method, detail, actor, balance_after)
    values (p_tenant, c.id, 'abono', p_amount, p_method,
      coalesce(nullif(p_note, ''), 'Abono hasta ' || to_char(p_abono_hasta, 'DD/MM/YYYY')), p_actor, c.balance)
    returning * into w;
  else
    update comensales set balance = balance + p_amount where id = c.id returning * into c;
    insert into comedor_wallet (tenant_id, comensal_id, kind, amount, method, detail, actor, balance_after)
    values (p_tenant, c.id, 'recarga', p_amount, p_method, coalesce(nullif(p_note, ''), 'Recarga'), p_actor, c.balance)
    returning * into w;
  end if;
  perform set_config('app.wallet', 'off', true);
  return app.wallet_json(w, c.name);
end $$;
grant execute on function public.comedor_recargar(uuid, uuid, numeric, text, text, text, uuid, date) to authenticated;

-- Ajuste de saldo (devolución o corrección). Solo gerencia.
create or replace function public.comedor_ajustar(p_tenant uuid, p_comensal uuid, p_amount numeric, p_reason text, p_actor text)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  c comensales;
  w comedor_wallet;
begin
  if not ((select app.is_platform_admin()) or p_tenant = any ((select app.my_managed_tenant_ids())::uuid[])) then
    raise exception 'Solo el dueño o el gerente pueden ajustar saldos.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indica el motivo del ajuste.' using errcode = 'P0001'; end if;
  select * into c from comensales where id = p_comensal and tenant_id = p_tenant for update;
  if not found then raise exception 'Comensal no encontrado.' using errcode = 'P0001'; end if;
  if c.balance + p_amount < 0 then
    raise exception 'El ajuste dejaría el saldo en negativo (tiene S/ %).', c.balance using errcode = 'P0001';
  end if;
  perform set_config('app.wallet', 'on', true);
  update comensales set balance = balance + p_amount where id = c.id returning * into c;
  perform set_config('app.wallet', 'off', true);
  insert into comedor_wallet (tenant_id, comensal_id, kind, amount, method, detail, actor, balance_after)
  values (p_tenant, c.id, 'ajuste', p_amount, null, p_reason, p_actor, c.balance)
  returning * into w;
  return app.wallet_json(w, c.name);
end $$;
grant execute on function public.comedor_ajustar(uuid, uuid, numeric, text, text) to authenticated;

-- Entrega del menú del día o venta de kiosko. Reglas de src/lib/comedor.ts:
--   · kiosko con comensal: sin octógonos (colegio), sin categorías bloqueadas,
--     dentro del tope diario y del saldo. Precios de la carta (no del cliente).
--   · menú: una ración por día; reserva o raciones libres; paga con convenio,
--     abono vigente o saldo.
--   · venta al paso (sin comensal): efectivo, Yape, Plin o tarjeta.
create or replace function public.comedor_despachar(p_tenant uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  s          business_settings;
  c          comensales;
  m          comedor_menus;
  v_today    date := app.lima_today();
  v_kind     text := p->>'kind';
  v_branch   uuid := nullif(p->>'branch_id', '')::uuid;
  v_actor    text := coalesce(p->>'actor', '');
  v_items    jsonb := '[]';
  v_total    numeric(12,2) := 0;
  v_pago     text;
  v_cargo    numeric(12,2) := 0;
  v_spent    numeric(12,2);
  v_res      boolean;
  v_served   int;
  v_pending  int;
  v_row      comedor_consumos;
  it         record;
begin
  if not ((select app.is_platform_admin()) or p_tenant = any (app.my_tenant_ids())) then
    raise exception 'Sin acceso a este comedor.' using errcode = '42501';
  end if;
  if v_kind not in ('menu', 'kiosko') then raise exception 'Tipo de despacho no válido.' using errcode = 'P0001'; end if;
  select * into s from business_settings where tenant_id = p_tenant;

  if nullif(p->>'comensal_id', '') is not null then
    select * into c from comensales where id = (p->>'comensal_id')::uuid and tenant_id = p_tenant for update;
    if not found then raise exception 'Comensal no encontrado.' using errcode = 'P0001'; end if;
    if not c.active then raise exception '% está inactivo.', c.name using errcode = 'P0001'; end if;
  end if;

  if v_kind = 'kiosko' then
    -- Ítems con el precio, la categoría y los octógonos de la carta.
    for it in
      select mi.id, mi.name, mi.category_id, mi.octogonos,
             coalesce(mb.price, mi.price) as price, greatest(1, coalesce((x->>'qty')::int, 1)) as qty
      from jsonb_array_elements(coalesce(p->'items', '[]')) x
      join menu_items mi on mi.id = (x->>'menu_item_id')::uuid and mi.tenant_id = p_tenant and not mi.archived
      left join menu_item_branch mb on mb.item_id = mi.id and mb.branch_id = v_branch
    loop
      if s.bloquear_octogonos and it.octogonos > 0 then
        raise exception '«%» tiene octógonos y no se vende en el colegio.', it.name using errcode = 'P0001', hint = 'octogonos';
      end if;
      if c.id is not null and it.category_id = any (c.blocked_category_ids) then
        raise exception 'La familia bloqueó esta categoría para % («%»).', c.name, it.name using errcode = 'P0001', hint = 'bloqueado';
      end if;
      v_items := v_items || jsonb_build_object('menu_item_id', it.id, 'name', it.name, 'qty', it.qty, 'price', it.price);
      v_total := v_total + it.qty * it.price;
    end loop;
    if jsonb_array_length(v_items) = 0 then raise exception 'Agrega al menos un producto.' using errcode = 'P0001'; end if;
    if jsonb_array_length(v_items) <> jsonb_array_length(coalesce(p->'items', '[]')) then
      raise exception 'Un producto ya no está en la carta. Actualiza la pantalla.' using errcode = 'P0001';
    end if;
    if c.id is not null then
      select coalesce(sum(total), 0) into v_spent from comedor_consumos
      where comensal_id = c.id and service_date = v_today and kind = 'kiosko';
      if c.daily_limit is not null and v_spent + v_total > c.daily_limit then
        raise exception 'Supera el tope diario de S/ %: le quedan S/ % hoy.', c.daily_limit, greatest(c.daily_limit - v_spent, 0)
          using errcode = 'P0001', hint = 'tope';
      end if;
      if v_total > c.balance then
        raise exception 'Saldo insuficiente: tiene S/ % y la compra es S/ %.', c.balance, v_total using errcode = 'P0001', hint = 'saldo';
      end if;
      v_pago := 'saldo';
      v_cargo := v_total;
    end if;
  else
    select * into m from comedor_menus where tenant_id = p_tenant and date = v_today for update;
    if not found then raise exception 'Hoy no hay menú publicado.' using errcode = 'P0001'; end if;
    v_items := jsonb_build_array(jsonb_build_object('name', 'Menú del día', 'qty', 1, 'price', m.price));
    v_total := m.price;
    select count(*) into v_served from comedor_consumos where tenant_id = p_tenant and service_date = v_today and kind = 'menu';
    select count(*) into v_pending from comedor_reservas r
    where r.tenant_id = p_tenant and r.date = v_today
      and not exists (select 1 from comedor_consumos k where k.comensal_id = r.comensal_id and k.service_date = v_today and k.kind = 'menu');
    if c.id is not null then
      if exists (select 1 from comedor_consumos where comensal_id = c.id and service_date = v_today and kind = 'menu') then
        raise exception '% ya recibió su menú hoy.', c.name using errcode = 'P0001', hint = 'servido';
      end if;
      v_res := exists (select 1 from comedor_reservas where comensal_id = c.id and date = v_today);
      if not v_res then
        if not s.permitir_sin_reserva then
          raise exception '% no reservó el menú de hoy.', c.name using errcode = 'P0001', hint = 'reserva';
        end if;
        if m.raciones - v_served - v_pending <= 0 then
          raise exception 'No quedan raciones libres: las que quedan están reservadas.' using errcode = 'P0001', hint = 'raciones';
        end if;
      end if;
      if c.plan = 'convenio' then
        v_pago := 'convenio'; v_total := 0;
      elsif c.plan = 'abono' and c.abono_hasta >= v_today then
        v_pago := 'abono'; v_total := 0;
      elsif m.price > c.balance then
        raise exception 'Saldo insuficiente%: tiene S/ % y el menú cuesta S/ %.',
          case when c.plan = 'abono' then ' (su abono venció)' else '' end, c.balance, m.price
          using errcode = 'P0001', hint = 'saldo';
      else
        v_pago := 'saldo'; v_cargo := m.price;
      end if;
    elsif m.raciones - v_served - v_pending <= 0 then
      raise exception 'No quedan raciones libres: las que quedan están reservadas.' using errcode = 'P0001', hint = 'raciones';
    end if;
  end if;

  if c.id is null then
    v_pago := p->>'pago';
    if v_pago not in ('efectivo', 'yape', 'plin', 'tarjeta') then
      raise exception 'Elige cómo paga la venta al paso.' using errcode = 'P0001';
    end if;
    if v_pago = 'efectivo' then
      perform app.comedor_cash_in(p_tenant, v_branch, v_total, 'Venta al paso · comedor', v_actor);
    end if;
  end if;

  if v_cargo > 0 then
    perform set_config('app.wallet', 'on', true);
    update comensales set balance = balance - v_cargo where id = c.id returning * into c;
    perform set_config('app.wallet', 'off', true);
    insert into comedor_wallet (tenant_id, comensal_id, kind, amount, method, detail, actor, balance_after)
    values (p_tenant, c.id, 'consumo', -v_cargo, 'saldo',
      case when v_kind = 'menu' then 'Menú del día' else (select string_agg((x->>'qty') || '× ' || (x->>'name'), ', ') from jsonb_array_elements(v_items) x) end,
      v_actor, c.balance);
  end if;

  insert into comedor_consumos (tenant_id, branch_id, comensal_id, comensal_name, grupo, kind, items, total, pago, actor, service_date)
  values (p_tenant, coalesce(v_branch, c.branch_id), c.id, coalesce(c.name, 'Venta al paso'), coalesce(c.grupo, ''),
          v_kind, v_items, v_total, v_pago, v_actor, v_today)
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'comensal_id', v_row.comensal_id, 'comensal_name', v_row.comensal_name,
    'grupo', v_row.grupo, 'kind', v_row.kind, 'items', v_row.items, 'total', v_row.total, 'pago', v_row.pago,
    'actor', v_row.actor, 'branch_id', v_row.branch_id, 'date', v_row.service_date, 'at', v_row.created_at,
    'balance', c.balance);
end $$;
grant execute on function public.comedor_despachar(uuid, jsonb) to authenticated;

-- Reserva o anula el menú de un día (personal del comedor; sin hora límite).
create or replace function public.comedor_set_reserva(p_tenant uuid, p_comensal uuid, p_date date, p_on boolean)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not ((select app.is_platform_admin()) or p_tenant = any (app.my_tenant_ids())) then
    raise exception 'Sin acceso a este comedor.' using errcode = '42501';
  end if;
  if not exists (select 1 from comensales where id = p_comensal and tenant_id = p_tenant) then
    raise exception 'Comensal no encontrado.' using errcode = 'P0001';
  end if;
  if p_on then
    insert into comedor_reservas (tenant_id, comensal_id, date, by) values (p_tenant, p_comensal, p_date, 'comedor')
    on conflict (comensal_id, date) do nothing;
  else
    delete from comedor_reservas where comensal_id = p_comensal and date = p_date;
  end if;
end $$;
grant execute on function public.comedor_set_reserva(uuid, uuid, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Portal de familias (enlace privado, sin cuenta)
-- ---------------------------------------------------------------------------
create or replace function public.public_familia(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  r responsables;
  s business_settings;
  v_today date := app.lima_today();
begin
  if length(coalesce(p_token, '')) < 24 then return null; end if;
  select * into r from responsables where portal_token = p_token;
  if not found then return null; end if;
  select * into s from business_settings where tenant_id = r.tenant_id;
  return jsonb_build_object(
    'tenant_name', (select name from tenants where id = r.tenant_id),
    'responsable', r.name,
    'yape', (select yape_number from business_settings where tenant_id = r.tenant_id),
    'plin', (select plin_number from business_settings where tenant_id = r.tenant_id),
    'cierre_reservas', s.cierre_reservas,
    'saldo_minimo', s.saldo_minimo,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort)
                            from menu_categories where tenant_id = r.tenant_id), '[]'),
    'menus', coalesce((select jsonb_agg(to_jsonb(m) - 'tenant_id' - 'updated_at' order by m.date)
                       from comedor_menus m where m.tenant_id = r.tenant_id and m.date between v_today and v_today + 13), '[]'),
    'comensales', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'grupo', c.grupo, 'plan', c.plan, 'abono_hasta', c.abono_hasta,
        'balance', c.balance, 'daily_limit', c.daily_limit, 'blocked_category_ids', c.blocked_category_ids,
        'allergies', c.allergies,
        'reservas', coalesce((select jsonb_agg(x.date order by x.date) from comedor_reservas x
                              where x.comensal_id = c.id and x.date >= v_today), '[]'),
        'consumos', coalesce((select jsonb_agg(jsonb_build_object('date', k.service_date, 'at', k.created_at,
                                'detail', (select string_agg((i->>'qty') || '× ' || (i->>'name'), ', ') from jsonb_array_elements(k.items) i),
                                'total', k.total, 'pago', k.pago) order by k.created_at desc)
                              from (select * from comedor_consumos where comensal_id = c.id order by created_at desc limit 20) k), '[]'),
        'recargas', coalesce((select jsonb_agg(jsonb_build_object('at', w.created_at, 'amount', w.amount, 'method', w.method, 'detail', w.detail)
                                order by w.created_at desc)
                              from (select * from comedor_wallet where comensal_id = c.id and kind in ('recarga', 'abono', 'ajuste')
                                    order by created_at desc limit 10) w), '[]')
      ) order by c.name)
      from comensales c where c.responsable_id = r.id and c.active), '[]')
  );
end $$;
grant execute on function public.public_familia(text) to anon, authenticated;

create or replace function app.familia_comensal(p_token text, p_comensal uuid) returns comensales
language plpgsql stable security definer set search_path = public, app as $$
declare
  c comensales;
begin
  select c2.* into c from comensales c2 join responsables r on r.id = c2.responsable_id
  where r.portal_token = p_token and length(p_token) >= 24 and c2.id = p_comensal and c2.active;
  if not found then raise exception 'Enlace no válido.' using errcode = '42501'; end if;
  return c;
end $$;

-- La familia reserva o anula hasta la hora de cierre del mismo día.
create or replace function public.public_familia_reservar(p_token text, p_comensal uuid, p_date date, p_on boolean)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  c comensales := app.familia_comensal(p_token, p_comensal);
  v_cierre text;
  v_now timestamp := now() at time zone 'America/Lima';
begin
  select cierre_reservas into v_cierre from business_settings where tenant_id = c.tenant_id;
  if p_date < v_now::date or (p_date = v_now::date and v_now::time >= v_cierre::time) then
    raise exception 'Las reservas de ese día ya cerraron (%).', v_cierre using errcode = 'P0001';
  end if;
  if p_on then
    if not exists (select 1 from comedor_menus where tenant_id = c.tenant_id and date = p_date) then
      raise exception 'Aún no hay menú publicado para ese día.' using errcode = 'P0001';
    end if;
    insert into comedor_reservas (tenant_id, comensal_id, date, by) values (c.tenant_id, c.id, p_date, 'familia')
    on conflict (comensal_id, date) do nothing;
  else
    delete from comedor_reservas where comensal_id = c.id and date = p_date;
  end if;
end $$;
grant execute on function public.public_familia_reservar(text, uuid, date, boolean) to anon, authenticated;

-- La familia ajusta el tope diario, las categorías bloqueadas y las alergias.
create or replace function public.public_familia_ajustes(p_token text, p_comensal uuid, p_daily_limit numeric,
  p_blocked uuid[], p_allergies text)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  c comensales := app.familia_comensal(p_token, p_comensal);
begin
  if p_daily_limit is not null and (p_daily_limit < 0 or p_daily_limit > 1000) then
    raise exception 'El tope diario debe estar entre S/ 0 y S/ 1 000.' using errcode = 'P0001';
  end if;
  update comensales set
    daily_limit = p_daily_limit,
    blocked_category_ids = coalesce((select array_agg(x) from unnest(p_blocked) x
                                     where x in (select id from menu_categories where tenant_id = c.tenant_id)), '{}'),
    allergies = left(coalesce(p_allergies, ''), 300)
  where id = c.id;
end $$;
grant execute on function public.public_familia_ajustes(text, uuid, numeric, uuid[], text) to anon, authenticated;
