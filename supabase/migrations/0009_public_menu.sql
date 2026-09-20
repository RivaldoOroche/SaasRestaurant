-- Carta pública por slug, sin exponer tablas a anónimos: una función
-- SECURITY DEFINER devuelve solo lo necesario (nombre, moneda, categorías e
-- ítems disponibles). Así no filtramos MRR/dueño/estado del tenant.

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
      from menu_items i where i.tenant_id = t.id and i.available), '[]'::jsonb)
  ) end
  from (select id, name from tenants where slug = p_slug) t
  left join business_settings bs on bs.tenant_id = t.id;
$$;

grant execute on function public.public_menu(text) to anon, authenticated;
