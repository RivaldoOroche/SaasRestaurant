-- Notas de crédito electrónicas (SUNAT tipo 07) + resumen diario de boletas.
--
-- Una nota de crédito referencia un comprobante ya emitido (boleta/factura) y
-- lo modifica o anula. Se guarda en la misma tabla `comprobantes` con
-- tipo = 'NotaCredito', el folio del documento de referencia y el motivo.
--
-- Nota: `alter type ... add value` es seguro dentro de la transacción de la
-- migración porque el nuevo valor no se USA en el mismo archivo (solo se agregan
-- columnas, sin insertar filas 'NotaCredito').

alter type comprobante_tipo add value if not exists 'NotaCredito';

alter table comprobantes add column if not exists ref_folio text;
alter table comprobantes add column if not exists motivo    text;

comment on column comprobantes.ref_folio is 'Folio del comprobante que modifica (para notas de crédito).';
comment on column comprobantes.motivo    is 'Motivo de la nota de crédito.';
