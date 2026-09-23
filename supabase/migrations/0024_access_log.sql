-- Auditoría de accesos: registra los inicios de sesión (para el dueño del SaaS).
-- El 2FA (TOTP) se maneja con el MFA nativo de Supabase Auth (no requiere tabla).

create table if not exists access_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  email      text,
  role       text,
  event      text not null default 'login',   -- login | logout | 2fa_enroll | 2fa_disable
  user_agent text,
  at         timestamptz not null default now()
);
create index if not exists access_log_at_idx on access_log (at desc);

alter table access_log enable row level security;
-- Cada usuario inserta sus propios eventos; la plataforma (y el propio usuario) los leen.
create policy access_log_insert on access_log
  for insert with check (auth.uid() = user_id);
create policy access_log_read on access_log
  for select using (app.is_platform_admin() or auth.uid() = user_id);
