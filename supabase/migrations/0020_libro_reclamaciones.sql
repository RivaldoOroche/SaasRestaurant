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
