#!/usr/bin/env bash
# Respaldo lógico cifrado de la base de Supabase.
#
#   SUPABASE_DB_URL     postgres://postgres.<ref>:<clave>@<host>:5432/postgres (Session pooler)
#   BACKUP_PASSPHRASE   clave para cifrar (AES-256, gpg simétrico). Guárdala fuera de GitHub también.
#   OUT_DIR             carpeta de salida (por defecto ./backups)
#
# Produce: wayra-<fecha>.dump.gpg (formato custom de pg_dump, restaurable
# tabla por tabla) + su .sha256. Solo los esquemas con datos del negocio:
# public, app y auth (usuarios); no el esquema de storage ni los internos.
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
OUT_DIR="${OUT_DIR:-./backups}"
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/wayra-$STAMP.dump"

pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --schema=public --schema=app --schema=auth \
  --file="$RAW"

# Verifica que el archivo es legible antes de cifrar.
pg_restore --list "$RAW" > /dev/null

gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
  --symmetric --cipher-algo AES256 --output "$RAW.gpg" "$RAW"
rm -f "$RAW"
sha256sum "$RAW.gpg" > "$RAW.gpg.sha256"

echo "Respaldo listo: $RAW.gpg ($(du -h "$RAW.gpg" | cut -f1))"
