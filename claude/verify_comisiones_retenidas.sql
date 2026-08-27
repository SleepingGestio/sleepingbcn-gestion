-- Verification for the "Pagado estancia" prefill fix
-- Premise to test: reservas_kb."Comisiones retenidas" is consistently 0/NULL for
-- bruto channels (Booking) and consistently non-zero for neto channels (Airbnb/Expedia).
-- If Booking ever carries a non-zero value, the "universal, no branching" formula
-- breaks and we gate by modo_comision instead.

-- Q0 — exact Portal strings present
select distinct "Portal", count(*) as filas
from reservas_kb
group by "Portal"
order by filas desc;

-- Q1 — distribution of "Comisiones retenidas" by Portal (raw)
select
  "Portal",
  count(*)                                                 as filas,
  count(*) filter (where "Comisiones retenidas" is null)   as val_null,
  count(*) filter (where "Comisiones retenidas" = 0)       as val_cero,
  count(*) filter (where "Comisiones retenidas" > 0)       as val_positivo,
  count(*) filter (where "Comisiones retenidas" < 0)       as val_negativo,
  round(min("Comisiones retenidas")::numeric, 2)           as minimo,
  round(max("Comisiones retenidas")::numeric, 2)           as maximo
from reservas_kb
group by "Portal"
order by filas desc;

-- Q2 — same, grouped by the app's modo_comision (join Portal = canales_reserva.nombre)
select
  coalesce(c.modo_comision, '(sin canal)')                  as modo_comision,
  r."Portal",
  count(*)                                                  as filas,
  count(*) filter (where r."Comisiones retenidas" is null)  as val_null,
  count(*) filter (where r."Comisiones retenidas" = 0)      as val_cero,
  count(*) filter (where r."Comisiones retenidas" > 0)      as val_positivo
from reservas_kb r
left join canales_reserva c on c.nombre = r."Portal"
group by c.modo_comision, r."Portal"
order by modo_comision, filas desc;

-- Q3 — reconstruction sanity check on rows that DO carry a withheld commission:
--      Cargo_estancia + Comisiones_retenidas = reconstructed gross; implied % rate
select
  r."Portal",
  r."Número",
  r."Cargo estancia",
  r."Comisiones retenidas",
  r."Comisiones",
  (r."Cargo estancia" + coalesce(r."Comisiones retenidas", 0))                                as bruto_reconstruido,
  round((r."Comisiones retenidas" / nullif(r."Cargo estancia" + r."Comisiones retenidas", 0))::numeric, 4) as pct_comision_implicito
from reservas_kb r
where r."Comisiones retenidas" is not null and r."Comisiones retenidas" <> 0
order by r."Portal", r."Check in" desc
limit 40;

-- Q4 — the cited reservation (Alina Barsteher, 7-10 Aug): expect Comisiones retenidas ~ 86.30
select "Número", "Referencia", "Portal", "Check in", "Check-out",
       "Cargo estancia", "Comisiones", "Comisiones retenidas"
from reservas_kb
where "Referencia" ilike '%barsteher%' or "Referencia" ilike '%alina%';
