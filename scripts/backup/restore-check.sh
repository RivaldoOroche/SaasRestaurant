#!/usr/bin/env bash
# Prueba de restauración: descifra un respaldo, lo restaura en una base vacía
# y verifica que los datos esenciales están y que la app puede operar.
# Un respaldo que nunca se restauró no es un respaldo.
#
#   BACKUP_FILE         ruta al .dump.gpg
#   BACKUP_PASSPHRASE   clave usada al cifrar
#   RESTORE_DB_URL      base vacía de pruebas (p. ej. un Postgres de CI)
set -euo pipefail

: "${BACKUP_FILE:?Falta BACKUP_FILE}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
: "${RESTORE_DB_URL:?Falta RESTORE_DB_URL}"

if [ -f "$BACKUP_FILE.sha256" ]; then
  (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256")
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
  --decrypt --output "$TMP/db.dump" "$BACKUP_FILE"

# Supabase trae roles y extensiones propias; en una base de pruebas los creamos si faltan.
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create extension if not exists pgcrypto;
SQL

# El esquema public ya existe en cualquier base nueva: se omite su CREATE.
pg_restore --list "$TMP/db.dump" | grep -v " SCHEMA - public " > "$TMP/list"
pg_restore --no-owner --no-privileges --exit-on-error --use-list="$TMP/list" --dbname="$RESTORE_DB_URL" "$TMP/db.dump" \
  || { echo "La restauración falló"; exit 1; }

# Verificaciones: tablas clave con filas y funciones críticas presentes.
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
select 'tenants=' || count(*) from public.tenants;
select 'branches=' || count(*) from public.branches;
select 'orders=' || count(*) from public.orders;
select 'comprobantes=' || count(*) from public.comprobantes;
select 'menu_items=' || count(*) from public.menu_items;
do $$ begin
  if (select count(*) from public.tenants) = 0 then raise exception 'Respaldo sin restaurantes'; end if;
  if to_regprocedure('public.pos_apply(uuid,text,jsonb)') is null then raise exception 'Falta pos_apply'; end if;
  if to_regprocedure('public.pos_snapshot(uuid,uuid,timestamptz)') is null then raise exception 'Falta pos_snapshot'; end if;
  -- Cada restaurante conserva su sede principal.
  if exists (select 1 from public.tenants t where not exists (select 1 from public.branches b where b.tenant_id = t.id and b.parent_id is null)) then
    raise exception 'Hay restaurantes sin sede principal';
  end if;
end $$;
SQL
echo "✔ Restauración verificada"
