-- Régimen de impuesto del restaurante. Los precios de la carta incluyen el
-- impuesto (Ley 29571); el POS desglosa base e IGV según el régimen:
--   general          → tax_rate configurado (18 %).
--   mype_restaurante → tasa reducida de la Ley 31556 / 32219 según el año
--                      (10 % 2025, 10,5 % 2026, 12 % 2027; luego general).
alter table business_settings
  add column if not exists tax_regime text not null default 'general'
    check (tax_regime in ('general', 'mype_restaurante'));
