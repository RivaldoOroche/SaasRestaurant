-- Security hardening (review follow-up).

-- 1) next_folio must live in `public` to be callable via PostgREST rpc()
--    (0005 created it in `app`, which PostgREST does not expose). Recreate here.
drop function if exists app.next_folio(uuid, text);

create or replace function public.next_folio(tid uuid, p_serie text)
returns text
language plpgsql security definer set search_path = public, app as $$
declare n integer;
begin
  if not app.has_tenant(tid) then
    raise exception 'no autorizado';
  end if;
  insert into folio_counters (tenant_id, serie, last)
    values (tid, p_serie, 1001)
    on conflict (tenant_id, serie)
    do update set last = folio_counters.last + 1
    returning last into n;
  return p_serie || '-' || lpad(n::text, 4, '0');
end $$;

grant execute on function public.next_folio(uuid, text) to authenticated, anon;

-- 2) Comprobantes are immutable fiscal records: forbid direct UPDATE, and expose
--    a narrow RPC that changes ONLY the SUNAT status/error, tenant-scoped.
drop policy if exists upd_members on comprobantes;

create or replace function public.set_comprobante_status(cid uuid, new_status sunat_status, new_error text)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update comprobantes
    set status = new_status, error = new_error
    where id = cid and app.has_tenant(tenant_id);
end $$;

grant execute on function public.set_comprobante_status(uuid, sunat_status, text) to authenticated, anon;

-- 3) The SUNAT outbox is an internal queue (not a fiscal record); members must be
--    able to remove entries once synced. 0006 dropped its delete permission.
create policy del_members on sunat_outbox for delete using (app.has_tenant(tenant_id));
