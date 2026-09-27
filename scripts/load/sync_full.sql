-- Arranque de un equipo: estado completo de su sucursal.
\set ctx random(1, :equipos)
select tenant, usr, branch from load_ctx where i = :ctx \gset
begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select length(pos_snapshot(':tenant', ':branch', null)::text);
commit;
