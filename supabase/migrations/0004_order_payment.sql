-- Record how an order was paid, so cash close-out (Caja) can derive expected
-- totals by method from real transactions instead of hardcoded figures.
alter table orders add column if not exists paid_method pay_method;
alter table orders add column if not exists paid_total numeric(12,2);
