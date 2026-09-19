-- Sequential, unique fiscal folios per tenant + serie (replaces random folios).
create table folio_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  serie     text not null,
  last      integer not null default 1000,
  primary key (tenant_id, serie)
);
alter table folio_counters enable row level security;
create policy tenant_rw on folio_counters
  for all using (app.has_tenant(tenant_id)) with check (app.has_tenant(tenant_id));

-- Atomic next-folio: row lock via upsert guarantees no duplicates under concurrency.
create or replace function app.next_folio(tid uuid, p_serie text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare n integer;
begin
  insert into folio_counters (tenant_id, serie, last)
    values (tid, p_serie, 1001)
    on conflict (tenant_id, serie)
    do update set last = folio_counters.last + 1
    returning last into n;
  return p_serie || '-' || lpad(n::text, 4, '0');
end $$;

-- Enforce folio uniqueness at the DB level as a backstop.
create unique index if not exists comprobantes_folio_unique on comprobantes (tenant_id, folio);
