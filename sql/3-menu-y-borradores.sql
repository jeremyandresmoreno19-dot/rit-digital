-- RIT Digital · ACTUALIZACIÓN: menú, borradores en la nube y RIT del equipo.
-- Pégalo completo en Supabase → SQL Editor → New query → Run. No hay que cambiar nada.
-- No borra datos: agrega una columna y funciones nuevas. Se puede ejecutar más de una vez.

alter table public.rit_registros add column if not exists estado text not null default 'terminado';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rit_registros_estado_chk') then
    alter table public.rit_registros add constraint rit_registros_estado_chk check (estado in ('borrador','terminado'));
  end if;
end $$;
create index if not exists rit_registros_sup_idx on public.rit_registros (supervisor, fecha desc);

-- Guarda un RIT como borrador (mientras se llena) o terminado (al descargar el PDF).
-- Un RIT terminado no vuelve a borrador si después se corrige.
create or replace function public.rit_registro_guardar2(p_clave text, p_id text, p_fecha date, p_turno text, p_supervisor text, p_estado text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare quien text; est text;
begin
  quien := public._rit_quien(p_clave, array['equipo','editor']);
  est := case when p_estado = 'terminado' then 'terminado' else 'borrador' end;
  if octet_length(p_data::text) > 250000 then raise exception 'El RIT es demasiado grande'; end if;
  insert into public.rit_registros (id, fecha, turno, supervisor, estado, data, subido_por, updated_at)
  values (p_id, p_fecha, p_turno, p_supervisor, est, p_data, quien, now())
  on conflict (id) do update set fecha = excluded.fecha, turno = excluded.turno, supervisor = excluded.supervisor,
         estado = case when public.rit_registros.estado = 'terminado' then 'terminado' else excluded.estado end,
         data = excluded.data, subido_por = excluded.subido_por, updated_at = now();
end $$;

-- Lista liviana (sin el documento completo) para los menús Mis RIT, Equipo y Archivo.
create or replace function public.rit_registros_resumen(p_clave text, p_desde date default null, p_hasta date default null, p_limit int default 300)
returns table (id text, fecha date, turno text, supervisor text, estado text, area text, jornada text, n int, actividades text, updated_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._rit_quien(p_clave, array['equipo','editor']);
  return query select r.id, r.fecha, r.turno, r.supervisor, r.estado,
      coalesce(r.data->'h'->>'area', ''), coalesce(r.data->'h'->>'jornada', ''),
      coalesce(jsonb_array_length(r.data->'acts'), 0),
      coalesce((select string_agg(x->>'name', ' | ') from jsonb_array_elements(r.data->'acts') x), ''),
      r.updated_at
    from public.rit_registros r
   where (p_desde is null or r.fecha >= p_desde) and (p_hasta is null or r.fecha <= p_hasta)
     and jsonb_typeof(r.data->'acts') = 'array'
   order by r.fecha desc nulls last, r.updated_at desc
   limit least(coalesce(p_limit, 300), 1000);
end $$;

-- Documento completo de uno o varios RIT (vista previa y descarga de la semana).
create or replace function public.rit_registros_ver(p_clave text, p_ids text[])
returns table (id text, fecha date, turno text, supervisor text, estado text, data jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._rit_quien(p_clave, array['equipo','editor']);
  return query select r.id, r.fecha, r.turno, r.supervisor, r.estado, r.data, r.updated_at
    from public.rit_registros r where r.id = any(p_ids) limit 200;
end $$;

-- Borrar un borrador propio que ya no sirve. Los RIT terminados no se borran desde la app.
create or replace function public.rit_borrador_borrar(p_clave text, p_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._rit_quien(p_clave, array['equipo','editor']);
  delete from public.rit_registros where id = p_id and estado = 'borrador';
end $$;

grant execute on function public.rit_registro_guardar2(text,text,date,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.rit_registros_resumen(text,date,date,int) to anon, authenticated;
grant execute on function public.rit_registros_ver(text,text[]) to anon, authenticated;
grant execute on function public.rit_borrador_borrar(text,text) to anon, authenticated;

notify pgrst, 'reload schema';
