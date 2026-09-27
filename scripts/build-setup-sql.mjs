// Genera los scripts de instalación de Supabase a partir de supabase/migrations:
//
//   supabase/instalar.sql  Todo el esquema (las migraciones en orden) en UN solo
//                          script reejecutable: registra cada migración en
//                          public.wayra_migraciones y omite las que ya estén
//                          (también las aplicadas con la CLI de Supabase o a mano).
//                          No crea datos ficticios.
//   supabase/demo.sql      Opcional: restaurantes y datos de prueba (seed.sql).
//
// Uso: npm run db:bundle   (un test en CI falla si quedaron desactualizados)
import { readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const LINE = "-- =============================================================================";

function migrations(root) {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, version: f.slice(0, 4), sql: readFileSync(join(dir, f), "utf8").trimEnd() }));
}

// ---------------------------------------------------------------------------
// Detección de bases ya instaladas SIN registro (migraciones pegadas a mano):
// cada migración tiene "marcadores" = objetos que SOLO ella crea y que ninguna
// posterior borra o renombra. La más reciente cuyo marcador existe indica
// hasta dónde llegó la base; todas las anteriores se dan por aplicadas y NO se
// vuelven a ejecutar (así una migración vieja no pisa funciones más nuevas).
// ---------------------------------------------------------------------------
const clean = (sql) => sql.replace(/--[^\n]*/g, "");
const norm = (n) => n.replace(/"/g, "").toLowerCase();

function candidates(sql) {
  const out = [];
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) out.push({ k: "rel", n: norm(m[1]) });
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) out.push({ k: "rel", n: norm(m[1]) });
  for (const m of sql.matchAll(/create\s+type\s+([\w."]+)/gi)) out.push({ k: "type", n: norm(m[1]) });
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi)) out.push({ k: "fn", n: norm(m[1]) });
  for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([\w."]+)\s+([^;]*)/gi)) {
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([\w"]+)/gi)) out.push({ k: "col", t: norm(m[1]), n: norm(c[1]) });
  }
  return out;
}
const keyOf = (c) => (c.k === "col" ? `col:${c.t}.${c.n}` : `${c.k}:${c.n}`);

export function markers(list) {
  const sqls = list.map((m) => clean(m.sql));
  const all = sqls.map(candidates);
  return list.map((_, i) => {
    const later = sqls.slice(i + 1).join("\n");
    return all[i].filter((c) => {
      if (all.slice(0, i).some((prev) => prev.some((o) => keyOf(o) === keyOf(c)))) return false;
      const nm = c.n.split(".").pop();
      const gone =
        c.k === "col"
          ? new RegExp(`drop\\s+column\\s+(if\\s+exists\\s+)?${nm}\\b|rename\\s+column\\s+${nm}\\b`, "i")
          : new RegExp(
              `drop\\s+(table|view|type|function)\\s+(if\\s+exists\\s+)?([\\w.]*\\.)?${nm}\\b|alter\\s+(table|function|view|type)\\s+([\\w.]*\\.)?${nm}\\b[^;]*rename\\s+to`,
              "i",
            );
      return !gone.test(later);
    });
  });
}

function markerSql(c) {
  const [schema, name] = c.n.includes(".") ? c.n.split(".") : ["public", c.n];
  if (c.k === "rel") return `to_regclass('${schema}.${name}') is not null`;
  if (c.k === "type") return `to_regtype('${schema}.${name}') is not null`;
  if (c.k === "fn")
    return `exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = '${schema}' and p.proname = '${name}')`;
  const [ts, tn] = c.t.includes(".") ? c.t.split(".") : ["public", c.t];
  return `exists (select 1 from information_schema.columns where table_schema = '${ts}' and table_name = '${tn}' and column_name = '${name}')`;
}

export function buildInstaller(root = process.cwd()) {
  const list = migrations(root);
  const marks = markers(list);
  const last = list[list.length - 1];
  const out = [
    LINE,
    "-- Wayra POS · INSTALADOR COMPLETO DE LA BASE DE DATOS (Supabase)",
    LINE,
    `-- Contiene las ${list.length} migraciones (0001 → ${last.version}). ARCHIVO GENERADO: no editar a mano`,
    "-- (npm run db:bundle).",
    "--",
    "-- CÓMO USARLO",
    "--   1. Supabase → SQL Editor → New query → pega TODO este archivo → Run.",
    "--   2. Al final verás una tabla con cada migración y su estado.",
    "--   3. Crea tu usuario en Authentication → Users y hazte administrador de la",
    "--      plataforma (último bloque de este archivo).",
    "--",
    "-- ES SEGURO VOLVER A CORRERLO",
    "--   · Cada migración se anota en public.wayra_migraciones y no se repite.",
    "--   · Si tu base ya tenía migraciones (con la CLI de Supabase o pegadas a mano),",
    "--     las detecta y las omite (estado «ya existía»).",
    "--   · Todo corre en una sola transacción: si algo falla, no queda nada a medias.",
    "--   · Al final verifica que existan las piezas clave; si falta alguna, se",
    "--     cancela todo y te dice qué falta.",
    "--",
    "-- No crea restaurantes ni datos de prueba. Para probar con datos ficticios,",
    "-- corre después supabase/demo.sql (opcional).",
    LINE,
    "",
    "create table if not exists public.wayra_migraciones (",
    "  version     text primary key,",
    "  nombre      text not null,",
    "  estado      text not null,          -- aplicada | ya existía | registrada por la CLI",
    "  detalle     text,",
    "  aplicada_en timestamptz not null default now()",
    ");",
    "alter table public.wayra_migraciones enable row level security; -- sin políticas: solo el dueño de la base",
    "revoke all on public.wayra_migraciones from anon, authenticated;",
    "",
    "-- Aplica una migración si no está registrada. Si sus objetos ya existían",
    "-- (aplicada antes sin registro), se deshace solo ese intento y se anota.",
    "create or replace function pg_temp.wayra_migrar(p_version text, p_nombre text, p_sql text) returns void",
    "language plpgsql as $wayra_fn$",
    "declare",
    "  v_cli boolean := false;",
    "begin",
    "  if exists (select 1 from public.wayra_migraciones where version = p_version) then",
    "    raise notice '%  omitida (ya registrada)', p_nombre;",
    "    return;",
    "  end if;",
    "  if to_regclass('supabase_migrations.schema_migrations') is not null then",
    "    execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)' into v_cli using p_version;",
    "    if v_cli then",
    "      insert into public.wayra_migraciones (version, nombre, estado) values (p_version, p_nombre, 'registrada por la CLI');",
    "      raise notice '%  omitida (aplicada con la CLI de Supabase)', p_nombre;",
    "      return;",
    "    end if;",
    "  end if;",
    "  begin",
    "    execute p_sql;",
    "    insert into public.wayra_migraciones (version, nombre, estado) values (p_version, p_nombre, 'aplicada');",
    "    raise notice '%  aplicada', p_nombre;",
    "  exception",
    "    when duplicate_table or duplicate_object or duplicate_column or duplicate_function",
    "      or duplicate_schema or undefined_column or undefined_table or undefined_object or undefined_function then",
    "      insert into public.wayra_migraciones (version, nombre, estado, detalle)",
    "      values (p_version, p_nombre, 'ya existía', sqlerrm);",
    "      raise notice '%  ya existía (%)', p_nombre, sqlerrm;",
    "  end;",
    "end $wayra_fn$;",
  ];
  const rows = list
    .map((m, i) => `    ('${m.version}', '${m.file}', ${marks[i].length ? marks[i].map(markerSql).join("\n      or ") : "false"})`)
    .join(",\n");
  out.push(
    "",
    "-- Base ya instalada sin registro: detecta hasta qué migración llegó y da por",
    "-- aplicadas todas las anteriores (no se re-ejecutan).",
    "do $wayra_base$",
    "declare",
    "  v_base text;",
    "begin",
    "  if exists (select 1 from public.wayra_migraciones) or to_regclass('public.tenants') is null then",
    "    return; -- base nueva o ya registrada",
    "  end if;",
    "  create temp table wayra_detect (version text, nombre text, presente boolean) on commit drop;",
    "  insert into wayra_detect values",
    rows + ";",
    "  select max(version) into v_base from wayra_detect where presente;",
    "  insert into public.wayra_migraciones (version, nombre, estado, detalle)",
    "  select version, nombre, 'ya existía', 'base anterior detectada hasta la migración ' || v_base",
    "  from wayra_detect where version <= v_base;",
    "  raise notice 'Base existente detectada: tenía hasta la migración %. Se aplican solo las siguientes.', v_base;",
    "end $wayra_base$;",
  );
  for (const m of list) {
    const tag = `$wayra_${m.version}$`;
    if (m.sql.includes(tag)) throw new Error(`${m.file} contiene el delimitador ${tag}`);
    out.push("", LINE, `-- ${m.file}`, LINE, `select pg_temp.wayra_migrar('${m.version}', '${m.file}', ${tag}`, m.sql, `${tag});`);
  }
  out.push(
    "",
    LINE,
    "-- Verificación final: si falta algo, se cancela TODO el script.",
    LINE,
    "do $wayra_check$",
    "declare",
    "  faltan text[] := '{}';",
    "  t text;",
    "begin",
    "  foreach t in array array['tenants', 'branches', 'memberships', 'staff_members', 'orders', 'order_lines',",
    "    'kitchen_tickets', 'comprobantes', 'cash_sessions', 'cash_movements', 'menu_items', 'menu_item_branch',",
    "    'inventory_items', 'inventory_movements', 'inventory_stock', 'recipes', 'subscription_plans',",
    "    'subscription_charges', 'legal_acceptances', 'v_tenants', 'inventory_kardex'] loop",
    "    if to_regclass('public.' || t) is null then faltan := faltan || t; end if;",
    "  end loop;",
    "  foreach t in array array['public.pos_apply(uuid,text,jsonb)', 'public.pos_snapshot(uuid,uuid,timestamptz)',",
    "    'public.branch_quota(uuid)', 'public.branch_report(uuid,timestamptz,timestamptz)', 'public.public_menu(text)',",
    "    'app.plan_monthly_total(uuid)'] loop",
    "    if to_regprocedure(t) is null then faltan := faltan || t; end if;",
    "  end loop;",
    "  if not exists (select 1 from information_schema.columns where table_name = 'v_tenants' and column_name = 'plan_total') then",
    "    faltan := faltan || 'v_tenants.plan_total'::text;",
    "  end if;",
    "  if (select count(*) from subscription_plans) < 3 then faltan := faltan || 'planes (Básico, Pro, Enterprise)'::text; end if;",
    "  if array_length(faltan, 1) > 0 then",
    "    raise exception 'Instalación incompleta. Falta: %', array_to_string(faltan, ', ')",
    "      using hint = 'Revisa en la tabla de resultados qué migraciones figuran como «ya existía»: tu base tenía una versión anterior. Escríbenos con ese detalle.';",
    "  end if;",
    "  raise notice 'Wayra POS: base de datos lista.';",
    "end $wayra_check$;",
    "",
    "-- Resultado (lo que ves en el SQL Editor al terminar):",
    "select version, nombre, estado, coalesce(detalle, '') as detalle, aplicada_en",
    "from public.wayra_migraciones order by version;",
    "",
    LINE,
    "-- PASO 2 · Tu cuenta de administrador de la plataforma (una sola vez)",
    LINE,
    "-- 1. Authentication → Users → Add user → tu correo y contraseña.",
    "-- 2. Nueva consulta en el SQL Editor, cambia el correo y ejecuta:",
    "--",
    "--    insert into memberships (user_id, tenant_id, role)",
    "--    select id, null, 'saas' from auth.users where email = 'tu-correo@ejemplo.com'",
    "--    on conflict do nothing;",
    "--",
    "-- 3. Entra a la app con ese correo: verás la consola SaaS. Desde «Tenants»",
    "--    creas cada restaurante y le envías su enlace de activación.",
    LINE,
    "",
  );
  return out.join("\n");
}

export function buildDemo(root = process.cwd()) {
  return [
    LINE,
    "-- Wayra POS · DATOS DE DEMOSTRACIÓN (OPCIONAL)",
    LINE,
    "-- Crea restaurantes ficticios (La Higuera y otros 5), carta, mesas, inventario y",
    "-- comprobantes de ejemplo para probar la app. NO lo corras en tu base de",
    "-- producción con clientes reales.",
    "-- Requisito: haber corrido antes supabase/instalar.sql.",
    "--",
    "-- Para quitar la demo después (borra cada restaurante con todo lo suyo):",
    "--   delete from tenants where slug in ('la-higuera', 'cevicheria-el-muelle', 'sushi-nami',",
    "--     'tacos-el-farol', 'cafe-aurora', 'brasas-del-sur');",
    "-- ARCHIVO GENERADO desde supabase/seed.sql (npm run db:bundle).",
    LINE,
    "",
    readFileSync(join(root, "supabase", "seed.sql"), "utf8").trimEnd(),
    "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  writeFileSync(join(root, "supabase", "instalar.sql"), buildInstaller(root));
  writeFileSync(join(root, "supabase", "demo.sql"), buildDemo(root));
  const legacy = join(root, "supabase", "setup_all.sql");
  if (existsSync(legacy)) rmSync(legacy); // reemplazado por instalar.sql + demo.sql
  console.log("supabase/instalar.sql y supabase/demo.sql actualizados");
}
