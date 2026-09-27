-- Verificador del PIN del personal para ingresar sin internet: PBKDF2-SHA256
-- (sal = id del trabajador), calculado en el equipo al definir el PIN. El PIN
-- nunca se guarda. pin_hash (SHA-256 sin sal, trivial de revertir con 4
-- dígitos) deja de usarse y se borra.
alter table staff_members add column if not exists pin_verifier text;
update staff_members set pin_hash = null where pin_hash is not null;
comment on column staff_members.pin_hash is 'Obsoleto: reemplazado por pin_verifier (0037).';
