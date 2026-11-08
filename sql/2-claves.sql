-- RIT Digital · PARTE 2 de 2: claves de acceso.
-- Cambia SOLO el texto entre comillas simples (mínimo 6 caracteres) y luego Run.
-- No uses comillas simples ( ' ) dentro de la clave.
insert into public.rit_claves (nombre, rol, clave_hash)
select * from (values
  ('Jeremy',       'editor', crypt('CAMBIA-clave-jeremy',     gen_salt('bf'))),
  ('Prevención',   'editor', crypt('CAMBIA-clave-prevencion', gen_salt('bf'))),
  ('Equipo MISPA', 'equipo', crypt('CAMBIA-clave-equipo',     gen_salt('bf')))
) as v(nombre, rol, clave_hash)
where not exists (select 1 from public.rit_claves);
