#!/usr/bin/env bash
# Prueba de carga de la base (lo que más trabaja en producción: pos_apply,
# pos_snapshot y reportes), con RLS y el rol `authenticated` de verdad.
#
#   PGDATABASE / PGHOST / PGPORT / PGUSER   base de pruebas con las migraciones aplicadas
#   N          restaurantes a generar (por defecto 300 → 600 equipos)
#   DURATION   segundos por escenario (por defecto 60)
#   CLIENTS    lista de concurrencias (por defecto "8 32 64")
#
# NUNCA contra producción: genera cientos de restaurantes de prueba.
set -euo pipefail
cd "$(dirname "$0")"
N="${N:-300}"; DURATION="${DURATION:-60}"; CLIENTS="${CLIENTS:-8 32 64}"
OUT="${OUT:-./resultados-$(date +%F).txt}"
if [ "${SKIP_SEED:-0}" != "1" ]; then psql -q -v n="$N" -f seed.sql; fi
EQ=$(psql -Atc "select count(*) from load_ctx")
{
  echo "# Prueba de carga Wayra POS — $(date -u +%FT%TZ)"
  echo "# $(psql -Atc 'select version()')"
  echo "# restaurantes=$N equipos=$EQ duración=${DURATION}s por escenario"
} > "$OUT"
for C in $CLIENTS; do
  echo "== Mezcla de hora punta: $C conexiones (1 ciclo de mesa : 4 sincronizaciones : 0.2 reportes)" | tee -a "$OUT"
  pgbench -n -c "$C" -j "$(nproc)" -T "$DURATION" -D equipos="$EQ" \
    -r -f ciclo_mesa.sql@10 -f sync_delta.sql@40 -f report.sql@2 2>&1 | tee -a "$OUT"
done
echo "== Arranque de equipos (estado completo), 32 conexiones" | tee -a "$OUT"
pgbench -n -c 32 -j "$(nproc)" -T 20 -D equipos="$EQ" -r -f sync_full.sql 2>&1 | tee -a "$OUT"
psql -Atc "select 'operaciones: ' || count(*) || ' ok=' || count(*) filter (where status = 'ok') || ' error=' || count(*) filter (where status = 'error') from pos_ops" | tee -a "$OUT"
psql -Atc "select 'errores: ' || coalesce(string_agg(distinct error, ' | '), 'ninguno') from pos_ops where status = 'error'" | tee -a "$OUT"
echo "Resultados en $OUT"
