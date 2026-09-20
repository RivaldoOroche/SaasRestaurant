-- Costo por unidad de insumo, para calcular food cost y márgenes por platillo.
alter table inventory_items add column if not exists cost numeric(12,2);
