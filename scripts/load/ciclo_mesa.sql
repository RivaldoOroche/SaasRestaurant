-- Un mesero atiende una mesa de punta a punta, cada toque es una llamada
-- a pos_apply (como en línea): abrir + 2 platos, enviar a cocina, 1 plato más,
-- segunda comanda, cobrar. 5 llamadas/ciclo, 7 operaciones.
\set ctx random(1, :equipos)
\set mesa random(1, 20)
\set p1 random(1, 30)
\set p2 random(1, 30)
\set p3 random(1, 30)
select tenant, usr, tables[:mesa] as mesa, items[:p1] as i1, prices[:p1] as pr1,
       items[:p2] as i2, prices[:p2] as pr2, items[:p3] as i3, prices[:p3] as pr3,
       gen_random_uuid() as oid
from load_ctx where i = :ctx \gset

begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select pos_apply(':tenant', 'carga', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'actor', 'Carga', 'type', 'order.open', 'order_id', ':oid', 'table_id', ':mesa'),
  jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'actor', 'Carga', 'type', 'line.add', 'line_id', gen_random_uuid(), 'order_id', ':oid',
    'item_id', ':i1', 'name', 'Plato', 'qty', 2, 'unit_price', :pr1, 'extra_price', 0, 'modifiers', '')
));
commit;

begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select pos_apply(':tenant', 'carga', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'actor', 'Carga', 'type', 'line.add', 'line_id', gen_random_uuid(), 'order_id', ':oid',
    'item_id', ':i2', 'name', 'Plato', 'qty', 1, 'unit_price', :pr2, 'extra_price', 0, 'modifiers', 'Sin cebolla')
));
commit;

begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select pos_apply(':tenant', 'carga', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'actor', 'Carga', 'type', 'order.send', 'order_id', ':oid', 'ticket_id', gen_random_uuid())
));
commit;

begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select pos_apply(':tenant', 'carga', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'actor', 'Carga', 'type', 'line.add', 'line_id', gen_random_uuid(), 'order_id', ':oid',
    'item_id', ':i3', 'name', 'Plato', 'qty', 1, 'unit_price', :pr3, 'extra_price', 0, 'modifiers', ''),
  jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'actor', 'Carga', 'type', 'order.send', 'order_id', ':oid', 'ticket_id', gen_random_uuid())
));
commit;

begin;
select set_config('request.jwt.claim.sub', ':usr', true);
set local role authenticated;
select pos_apply(':tenant', 'carga', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'actor', 'Carga', 'type', 'order.pay', 'order_id', ':oid', 'method', 'efectivo',
    'total', (2 * :pr1 + :pr2 + :pr3))
));
commit;
