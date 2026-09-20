-- Persistencia del resultado SUNAT: XML firmado, CDR (constancia) y ticket.
--
-- El XML firmado y el CDR son la evidencia legal del comprobante; se guardan
-- para poder descargarlos/reenviarlos. El ticket se usa en envíos asíncronos
-- (resumen diario / comunicación de baja).

alter table comprobantes add column if not exists signed_xml   text;
alter table comprobantes add column if not exists cdr          text; -- base64 del ZIP del CDR
alter table comprobantes add column if not exists sunat_ticket text;

-- RPC ampliada: además del estado/error, guarda XML firmado y CDR. Mantiene la
-- inmutabilidad (no hay UPDATE directo desde el cliente) y el tenant-scoping.
create or replace function public.set_comprobante_result(
  cid uuid, new_status sunat_status, new_error text, new_xml text, new_cdr text
)
returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update comprobantes
    set status = new_status,
        error  = new_error,
        signed_xml = coalesce(new_xml, signed_xml),
        cdr        = coalesce(new_cdr, cdr)
    where id = cid and app.has_tenant(tenant_id);
end $$;

grant execute on function public.set_comprobante_result(uuid, sunat_status, text, text, text)
  to authenticated, anon;
