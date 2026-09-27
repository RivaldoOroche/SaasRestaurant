-- Un equipo pide los cambios de los últimos 10 s de su sucursal (lo que hace
-- el POS al recibir un aviso de Realtime o al reconectar).
\set ctx random(1, :equipos)
select tenant, usr, branch from load_ctx where i = :ctx \gset
begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select length(pos_snapshot(':tenant', ':branch', now() - interval '10 seconds')::text);
commit;
