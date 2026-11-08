-- RIT Digital · El panel dice "Editando como Administrador" en vez de "Editando como Jeremy".
-- Pégalo en Supabase → SQL Editor → New query → Run. No cambia ninguna clave.
update public.rit_claves set nombre = 'Administrador' where nombre = 'Jeremy' and rol = 'editor';
select nombre, rol from public.rit_claves order by rol, nombre;
