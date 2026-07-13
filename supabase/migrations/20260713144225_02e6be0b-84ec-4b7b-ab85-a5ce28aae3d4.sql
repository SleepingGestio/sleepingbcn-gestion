-- Remove the manually-entered "Hora check-in/out confirmada" fields.
-- They're redundant: reservas_kb."Hora estimada de llegada"/"Hora estimada
-- de salida" (KB-synced) is blank until genuinely confirmed (Booking.com
-- channel sync or direct Krossbooking entry — never via this app), so
-- presence of that field alone already means "confirmed". resolveTime()
-- (src/lib/format.ts) no longer takes a conf argument; only 1 of 439
-- reservas_gestio rows had either field populated at time of removal.
ALTER TABLE public.reservas_gestio
  DROP COLUMN IF EXISTS "HCheckInConf",
  DROP COLUMN IF EXISTS "HCheckOutConf";
