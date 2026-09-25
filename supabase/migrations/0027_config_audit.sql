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
