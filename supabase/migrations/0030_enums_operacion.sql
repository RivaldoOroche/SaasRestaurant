-- Valores de enum que usa la migración 0031. Van en un archivo aparte porque
-- Postgres no permite usar un valor de enum en la misma transacción en que se
-- agrega (cada migración corre en su propia transacción).

-- Pedidos de delivery pagados en la app del agregador (Rappi, PedidosYa).
alter type pay_method add value if not exists 'app';
