-- Métodos de pago Yape/Plin y configuración de pagos por tenant.
alter type pay_method add value if not exists 'yape';
alter type pay_method add value if not exists 'plin';

alter table business_settings add column if not exists yape_number text;
alter table business_settings add column if not exists plin_number text;
alter table business_settings add column if not exists card_provider text not null default 'ninguno';
alter table business_settings add column if not exists card_public_key text;
