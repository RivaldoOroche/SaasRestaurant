-- Reservas y lista de espera: enriquecemos las tablas base con contacto, fecha,
-- sucursal y estado para poder gestionarlas desde el POS.

alter table reservations add column if not exists phone     text;
alter table reservations add column if not exists res_date  date not null default current_date;
alter table reservations add column if not exists status    text not null default 'pendiente'; -- pendiente|confirmada|sentada|cancelada
alter table reservations add column if not exists branch_id uuid references branches(id) on delete set null;
alter table reservations add column if not exists notes     text;
alter table reservations add column if not exists created_at timestamptz not null default now();
create index if not exists reservations_tenant_date_idx on reservations (tenant_id, res_date);

alter table waitlist add column if not exists phone     text;
alter table waitlist add column if not exists status    text not null default 'esperando'; -- esperando|llamado|sentado|retirado
alter table waitlist add column if not exists branch_id uuid references branches(id) on delete set null;
alter table waitlist add column if not exists created_at timestamptz not null default now();
create index if not exists waitlist_tenant_idx on waitlist (tenant_id, created_at);
