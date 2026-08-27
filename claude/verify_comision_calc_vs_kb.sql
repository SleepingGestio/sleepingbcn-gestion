-- Verification for the "% based commission vs KB's real imported figure" round.
--
-- Replicates the app's `comision` useMemo in SQL:
--   base  = COALESCE(kb."Cargo estancia",0) + COALESCE(g."PagadoLimpieza",0)
--   pOta  = g."PctComisionOTA" / 100      pCobro = g."PctPorCobro" / 100
--   bruto (Booking / aplicaCobro):  calc_total = (pOta + pCobro) * base
--                                   compare vs kb."Comisiones"  (bundled OTA+cobro)
--   neto  (Airbnb / Expedia):       calc_ota   = pOta * base / (1 - pOta)
--                                   compare vs kb."Comisiones retenidas"
--
-- Goal: (a) confirm the "kb.Comisiones is a bundled figure" theory for bruto,
--       (b) confirm neto lines up against Comisiones retenidas,
--       (c) size the rounding tolerance (epsilon) from the real spread.

with j as (
  select
    kb."Número",
    kb."Portal",
    coalesce(c.modo_comision, 'bruto')                                        as modo,
    kb."Cargo estancia"                                                       as cargo_estancia,
    g."PagadoLimpieza"                                                        as pagado_limpieza,
    g."PctComisionOTA"                                                        as pct_ota,
    g."PctPorCobro"                                                           as pct_cobro,
    kb."Comisiones"                                                           as kb_comisiones,
    kb."Comisiones retenidas"                                                 as kb_retenidas,
    coalesce(kb."Cargo estancia", 0) + coalesce(g."PagadoLimpieza", 0)        as base
  from reservas_kb kb
  join reservas_gestio g on g."Número" = kb."Número"
  left join canales_reserva c on c.nombre = kb."Portal"
  where g."PctComisionOTA" is not null
),
calc as (
  select
    j.*,
    case when modo <> 'neto'
      then ((pct_ota + coalesce(pct_cobro, 0)) / 100.0) * base
      else case when pct_ota < 100 then ((pct_ota / 100.0) * base) / (1 - pct_ota / 100.0) end
    end                                                                       as calc_comparable,
    case when modo <> 'neto' then kb_comisiones else kb_retenidas end          as kb_comparable
  from j
)
-- Q1 — worst mismatches first (both modos), for eyeballing the theory
select
  "Número", "Portal", modo,
  cargo_estancia, pagado_limpieza, pct_ota, pct_cobro, round(base, 2) as base,
  round(kb_comparable, 2)                        as kb_real,
  round(calc_comparable, 2)                      as calculado,
  round(kb_comparable - calc_comparable, 3)      as diff
from calc
where kb_comparable is not null and kb_comparable <> 0
order by abs(kb_comparable - calc_comparable) desc nulls last
limit 60;

-- Q2 — abs(diff) distribution per modo → sizes the epsilon
with j as (
  select
    kb."Número", coalesce(c.modo_comision, 'bruto') as modo,
    g."PctComisionOTA" as pct_ota, g."PctPorCobro" as pct_cobro,
    kb."Comisiones" as kb_comisiones, kb."Comisiones retenidas" as kb_retenidas,
    coalesce(kb."Cargo estancia", 0) + coalesce(g."PagadoLimpieza", 0) as base
  from reservas_kb kb
  join reservas_gestio g on g."Número" = kb."Número"
  left join canales_reserva c on c.nombre = kb."Portal"
  where g."PctComisionOTA" is not null
),
d as (
  select modo,
    case when modo <> 'neto' then kb_comisiones else kb_retenidas end as kb_real,
    case when modo <> 'neto'
      then ((pct_ota + coalesce(pct_cobro,0)) / 100.0) * base
      else case when pct_ota < 100 then ((pct_ota/100.0) * base) / (1 - pct_ota/100.0) end
    end as calc
  from j
)
select
  modo,
  count(*)                                              as filas,
  count(*) filter (where abs(kb_real - calc) <= 0.01)   as le_1c,
  count(*) filter (where abs(kb_real - calc) > 0.01 and abs(kb_real - calc) <= 0.05) as c1_5,
  count(*) filter (where abs(kb_real - calc) > 0.05 and abs(kb_real - calc) <= 0.50) as c5_50,
  count(*) filter (where abs(kb_real - calc) > 0.50 and abs(kb_real - calc) <= 2.00) as e50_2,
  count(*) filter (where abs(kb_real - calc) > 2.00)    as gt_2e,
  round(min(abs(kb_real - calc))::numeric, 3)           as min_abs,
  round(max(abs(kb_real - calc))::numeric, 3)           as max_abs,
  round((percentile_cont(0.5) within group (order by abs(kb_real - calc)))::numeric, 3) as p50,
  round((percentile_cont(0.9) within group (order by abs(kb_real - calc)))::numeric, 3) as p90
from d
where kb_real is not null and kb_real <> 0
group by modo;

-- Q3 — how many rows the comparison would SKIP, and why
select
  coalesce(c.modo_comision, 'bruto')                                        as modo,
  count(*)                                                                  as filas_con_pct_ota,
  count(*) filter (where kb."Comisiones" is null or kb."Comisiones" = 0)     as kb_comisiones_0_null,
  count(*) filter (where kb."Comisiones retenidas" is null
                      or kb."Comisiones retenidas" = 0)                      as kb_retenidas_0_null,
  count(*) filter (where g."PctPorCobro" is null)                            as sin_pct_cobro
from reservas_kb kb
join reservas_gestio g on g."Número" = kb."Número"
left join canales_reserva c on c.nombre = kb."Portal"
where g."PctComisionOTA" is not null
group by coalesce(c.modo_comision, 'bruto');
