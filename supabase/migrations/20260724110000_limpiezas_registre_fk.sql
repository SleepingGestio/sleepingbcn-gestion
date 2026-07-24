ALTER TABLE public.limpiezas_registre
  ADD CONSTRAINT limpiezas_registre_id_limpieza_fkey
  FOREIGN KEY (id_limpieza) REFERENCES public.limpiezas(id_limpieza),
  ADD CONSTRAINT limpiezas_registre_id_persona_fkey
  FOREIGN KEY (id_persona) REFERENCES public.personal(id_persona);

NOTIFY pgrst, 'reload schema';
