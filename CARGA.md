# Wayra POS — Prueba de carga

**Objetivo:** saber cuántos restaurantes aguanta la base antes de que el mesero
note lentitud, y encontrar problemas de concurrencia antes que los clientes.

Se probó lo que más trabaja en producción, con **RLS y el rol `authenticated`
de verdad** (igual que PostgREST en Supabase):

| Escenario | Qué simula | Peso |
| --- | --- | --- |
| `ciclo_mesa.sql` | Un mesero atiende una mesa completa: abrir + 2 platos, enviar a cocina, 1 plato más, 2.ª comanda, cobrar (**5 llamadas a `pos_apply`, 7 operaciones**; descuenta insumos por receta) | 10 |
| `sync_delta.sql` | Un equipo pide los cambios de los últimos 10 s de su sucursal (`pos_snapshot` delta, lo que hace al recibir un aviso de Realtime) | 40 |
| `report.sql` | El dueño abre Reportes: consolidado del mes (`branch_report`) | 2 |
| `sync_full.sql` | Un equipo arranca y baja el estado completo de su sucursal | aparte |

Datos: **300 restaurantes, 600 equipos** (principal + 1 sucursal c/u), 20 mesas
por local, 30 platos con receta, 12 insumos. Las mesas se eligen al azar, así que
a veces dos meseros abren la misma mesa a la vez (caso real que el sistema une).

## Resultados (27/09/2026)

Máquina: **4 vCPU, 16 GB, PostgreSQL 16.13** con configuración por defecto
(`shared_buffers` 128 MB) — pgbench corría en la misma máquina, compitiendo por CPU.

| Concurrencia | Transacciones/s | Mesas cobradas/s | Llamada `pos_apply` (prom.) | Ciclo de mesa p50 / p95 / p99 | Sincronización p50 / p95 / p99 | Fallidas |
| --- | --- | --- | --- | --- | --- | --- |
| 8 conexiones | **1 039** | **198** | 1.1 – 2.7 ms | 25 / 39 / 75 ms | 3.4 / 6.5 / 8.9 ms | 0 |
| 32 conexiones | 933 | 181 | 3 – 7 ms | 110 / 178 / 242 ms | 15 / 33 / 46 ms | 0 |
| 64 conexiones | 940 | 182 | 6 – 13 ms | ≈ 220 ms prom. | ≈ 31 ms prom. | 0 |

- Arranque de equipos (estado completo): **965/s**, 33 ms promedio con 32 conexiones.
- Reporte consolidado del mes: p50 **4.6 ms** (8 conexiones), 19 ms (32).
- 177 121 operaciones aplicadas en ~3 min, **0 errores técnicos**. Hubo 103
  rechazos «El pedido ya fue cobrado en otro dispositivo»: son dos meseros
  simulados cobrando la misma mesa unida — el sistema hace lo correcto.
- Con 8→64 conexiones el throughput se mantiene (~940/s): el límite es la CPU,
  no bloqueos. Más conexiones solo agregan espera; por eso en producción conviene
  el **pooler de Supabase (Supavisor, modo transacción)**.

### Qué significa para el negocio

Un restaurante lleno cobra ~60 mesas/hora en hora punta. **300 restaurantes ×
2 locales × 60 = 36 000 mesas/hora = 10 mesas/s**. La base probada cobra
**~180–198 mesas/s**: unas **18 veces** la hora punta de 300 restaurantes, o
del orden de **5 000 locales** en esta máquina antes de saturarse.

La latencia que siente el mesero es la de la red (Lima ↔ Supabase São Paulo,
~40–70 ms) + 1–3 ms de base con carga normal. Y como el POS es *offline-first*,
el mesero no espera al servidor: la pantalla responde al instante y la cola
sincroniza por detrás.

## Problema encontrado y corregido

La primera corrida (32+ conexiones) produjo **5 interbloqueos (deadlocks)**:
«abrir mesa» bloqueaba MESA → PEDIDO y «cobrar» bloqueaba PEDIDO → MESA. En
producción se habría visto como un cobro que falla y se reintenta.

Corrección en `supabase/migrations/0043_pos_orden_de_bloqueo.sql`: toda
operación sobre un pedido bloquea primero la mesa y después el pedido, y el
descuento de insumos se hace en orden de id. Segunda corrida: **0 deadlocks,
0 transacciones fallidas**.

## Cómo repetirla

**Nunca contra producción** (crea cientos de restaurantes de prueba).

```bash
# Base local con todas las migraciones (o un proyecto de staging de Supabase,
# con la cadena de conexión directa o del pooler en PG* / PGDATABASE).
export PGHOST=... PGPORT=5432 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=...
N=300 DURATION=60 CLIENTS="8 32 64" scripts/load/run.sh
# → scripts/load/resultados-<fecha>.txt
```

Para percentiles: agregar `-l --log-prefix=...` a pgbench (ver `run.sh`); la
columna 3 del log es la latencia en µs.

Recomendaciones al pasar a producción:

1. Usar el **pooler en modo transacción** (puerto 6543) para las Edge Functions
   y cualquier cliente con muchas conexiones cortas.
2. Plan de cómputo: *Small* (2 vCPU) alcanza para los primeros cientos de
   restaurantes; repetir esta prueba en staging antes de cada salto de 5×.
3. Vigilar en Supabase → Reports: CPU > 70 % sostenido o `pos_apply` > 50 ms p95
   son la señal para subir de plan.
