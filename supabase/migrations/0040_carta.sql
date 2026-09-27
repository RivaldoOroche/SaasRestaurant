-- =============================================================================
-- 0040 · Carta administrable y por sucursal
--   · Platos archivables (no se borran si tienen ventas: el historial los usa).
--   · Precio y disponibilidad por sucursal (menu_item_branch). Sin fila = el
--     precio y la disponibilidad generales del plato.
--   · La carta pública oculta lo archivado.
-- =============================================================================
alter table menu_items add column if not exists archived boolean not null default false;
drop index if exists menu_items_category_idx; -- duplicado de menu_items_category_id_idx

create table menu_item_branch (
  tenant_id  uuid not null references tenants (id) on delete cascade,
  branch_id  uuid not null,
  item_id    uuid not null references menu_items (id) on delete cascade,
  price      numeric(10,2) check (price is null or price >= 0), -- null = precio general
  available  boolean,                                          -- null = disponibilidad general
  updated_at timestamptz not null default now(),
  primary key (branch_id, item_id),
  foreign key (tenant_id, branch_id) references branches (tenant_id, id) on delete cascade
);
create index menu_item_branch_item_idx on menu_item_branch (item_id);
create index menu_item_branch_tenant_idx on menu_item_branch (tenant_id);

alter table menu_item_branch enable row level security;
create policy mib_read on menu_item_branch for select using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_tenant_ids())::uuid[]));
create policy mib_write on menu_item_branch for all using (
  (select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]))
  with check ((select app.is_platform_admin()) or tenant_id = any ((select app.my_managed_tenant_ids())::uuid[]));

-- Categorías: clave única por restaurante (la app la genera desde el nombre).
create unique index if not exists menu_categories_tenant_key on menu_categories (tenant_id, key);

-- Carta pública (QR): sin platos archivados.
create or replace function public.public_menu(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when t.id is null then null else jsonb_build_object(
    'tenant_name', t.name,
    'currency', coalesce(bs.currency::text, 'PEN'),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'key', c.key, 'name', c.name,
        'icon', c.icon, 'subtitle', c.subtitle, 'sort', c.sort) order by c.sort)
      from menu_categories c where c.tenant_id = t.id), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'category_id', i.category_id,
        'name', i.name, 'description', i.description, 'price', i.price, 'emoji', i.emoji,
        'badge', i.badge, 'is_veg', i.is_veg, 'is_spicy', i.is_spicy, 'is_gf', i.is_gf,
        'is_meat', i.is_meat, 'available', i.available, 'sort', i.sort) order by i.sort)
      from menu_items i where i.tenant_id = t.id and i.available and not i.archived), '[]'::jsonb)
  ) end
  from (select id, name from tenants where slug = p_slug) t
  left join business_settings bs on bs.tenant_id = t.id;
$$;
