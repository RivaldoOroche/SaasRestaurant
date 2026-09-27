-- Dueño/gerente abre Reportes: consolidado del mes de todas sus sucursales.
\set ctx random(1, :equipos)
select tenant, usr from load_ctx where i = :ctx \gset
begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select count(*) from branch_report(':tenant', date_trunc('month', now()), null);
commit;
