-- =====================================================================
--  RIT Digital · Codelco División Radomiro Tomic · MISPA
--  Script único para Supabase (SQL Editor → New query → pegar → Run).
--  ANTES DE EJECUTAR: cambia las 3 claves de la sección "CLAVES" (al final).
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ---------- Tablas ----------
create table if not exists public.rit_claves (
  id bigint generated always as identity primary key,
  nombre text not null,
  rol text not null check (rol in ('editor','equipo')),
  clave_hash text not null
);

create table if not exists public.rit_rf (
  code text primary key,
  nombre text not null,
  riesgo text not null default '',
  cons_tipo text not null default '',
  consecuencia text not null default '',
  controles text not null default '',
  orden int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.rit_actividades (
  code text primary key,
  area text not null,
  nombre text not null,
  rf text[] not null default '{}',
  activo boolean not null default true,
  orden int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.rit_supervisores (
  nombre text primary key,
  orden int not null default 0
);

create table if not exists public.rit_config (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.rit_cambios (
  id bigint generated always as identity primary key,
  tabla text not null,
  clave text,
  antes jsonb,
  despues jsonb,
  editor text,
  at timestamptz not null default now()
);

create table if not exists public.rit_registros (
  id text primary key,
  fecha date,
  turno text,
  supervisor text,
  data jsonb not null,
  subido_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rit_rf add column if not exists cons_tipo text not null default '';
create index if not exists rit_registros_fecha_idx on public.rit_registros (fecha desc);

-- ---------- Seguridad: el catálogo se lee libre; todo cambio pasa por funciones con clave ----------
alter table public.rit_claves      enable row level security;
alter table public.rit_rf          enable row level security;
alter table public.rit_actividades enable row level security;
alter table public.rit_supervisores enable row level security;
alter table public.rit_config      enable row level security;
alter table public.rit_cambios     enable row level security;
alter table public.rit_registros   enable row level security;

drop policy if exists rit_rf_leer on public.rit_rf;
create policy rit_rf_leer on public.rit_rf for select to anon, authenticated using (true);
drop policy if exists rit_act_leer on public.rit_actividades;
create policy rit_act_leer on public.rit_actividades for select to anon, authenticated using (true);
drop policy if exists rit_sup_leer on public.rit_supervisores;
create policy rit_sup_leer on public.rit_supervisores for select to anon, authenticated using (true);
drop policy if exists rit_cfg_leer on public.rit_config;
create policy rit_cfg_leer on public.rit_config for select to anon, authenticated using (true);

revoke all on public.rit_claves, public.rit_cambios, public.rit_registros from anon, authenticated;
revoke insert, update, delete on public.rit_rf, public.rit_actividades, public.rit_supervisores, public.rit_config from anon, authenticated;
grant select on public.rit_rf, public.rit_actividades, public.rit_supervisores, public.rit_config to anon, authenticated;

-- ---------- Verificación de clave (interna) ----------
create or replace function public._rit_quien(p_clave text, p_roles text[])
returns text language plpgsql security definer set search_path = public, extensions as $$
declare n text;
begin
  select nombre into n from public.rit_claves
   where rol = any(p_roles) and clave_hash = crypt(coalesce(p_clave,''), clave_hash)
   limit 1;
  if n is null then
    perform pg_sleep(0.7);
    raise exception 'Clave incorrecta' using errcode = '28000';
  end if;
  return n;
end $$;
revoke execute on function public._rit_quien(text, text[]) from public, anon, authenticated;

-- ---------- Ingreso ----------
create or replace function public.rit_login(p_clave text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  select nombre, rol into r from public.rit_claves
   where clave_hash = crypt(coalesce(p_clave,''), clave_hash)
   order by (rol = 'editor') desc limit 1;
  if not found then
    perform pg_sleep(0.7);
    raise exception 'Clave incorrecta' using errcode = '28000';
  end if;
  return json_build_object('nombre', r.nombre, 'rol', r.rol);
end $$;

-- ---------- Edición del catálogo (solo editores) ----------
drop function if exists public.rit_guardar_rf(text,text,text,text,text,text);
create or replace function public.rit_guardar_rf(p_clave text, p_code text, p_nombre text, p_riesgo text, p_cons_tipo text, p_consecuencia text, p_controles text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare ed text; viejo jsonb;
begin
  ed := public._rit_quien(p_clave, array['editor']);
  select jsonb_build_object('code',code,'nombre',nombre,'riesgo',riesgo,'cons_tipo',cons_tipo,'consecuencia',consecuencia,'controles',controles)
    into viejo from public.rit_rf where code = p_code;
  if viejo is null then raise exception 'El RF % no existe en el formato', p_code; end if;
  update public.rit_rf set nombre = trim(p_nombre), riesgo = trim(p_riesgo), cons_tipo = trim(coalesce(p_cons_tipo,'')),
         consecuencia = trim(p_consecuencia), controles = trim(p_controles), updated_at = now(), updated_by = ed
   where code = p_code;
  insert into public.rit_cambios (tabla, clave, antes, despues, editor)
  values ('rf', p_code, viejo, jsonb_build_object('code',p_code,'nombre',trim(p_nombre),'riesgo',trim(p_riesgo),'cons_tipo',trim(coalesce(p_cons_tipo,'')),'consecuencia',trim(p_consecuencia),'controles',trim(p_controles)), ed);
end $$;

create or replace function public.rit_guardar_actividad(p_clave text, p_code text, p_area text, p_nombre text, p_rf text[], p_activo boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare ed text; viejo jsonb; malos text[]; ord int;
begin
  ed := public._rit_quien(p_clave, array['editor']);
  if coalesce(trim(p_code),'') = '' or coalesce(trim(p_nombre),'') = '' or coalesce(trim(p_area),'') = '' then
    raise exception 'Faltan el código, el área o el nombre de la actividad';
  end if;
  if coalesce(array_length(p_rf,1),0) > 3 then raise exception 'El formato admite máximo 3 RF por actividad'; end if;
  select array_agg(x) into malos from unnest(coalesce(p_rf,'{}')) x where x not in (select code from public.rit_rf);
  if malos is not null then raise exception 'RF desconocidos: %', array_to_string(malos, ', '); end if;
  select jsonb_build_object('code',code,'area',area,'nombre',nombre,'rf',rf,'activo',activo), orden
    into viejo, ord from public.rit_actividades where code = p_code;
  if ord is null then
    ord := case when p_code ~ '^\d+\.\d+$'
                then split_part(p_code,'.',1)::int * 1000 + split_part(p_code,'.',2)::int
                else 999000 end;
  end if;
  insert into public.rit_actividades (code, area, nombre, rf, activo, orden, updated_at, updated_by)
  values (trim(p_code), trim(p_area), trim(p_nombre), coalesce(p_rf,'{}'), coalesce(p_activo,true), ord, now(), ed)
  on conflict (code) do update set area = excluded.area, nombre = excluded.nombre, rf = excluded.rf,
         activo = excluded.activo, updated_at = now(), updated_by = ed;
  insert into public.rit_cambios (tabla, clave, antes, despues, editor)
  values ('actividad', p_code, viejo, jsonb_build_object('code',p_code,'area',trim(p_area),'nombre',trim(p_nombre),'rf',coalesce(p_rf,'{}'),'activo',coalesce(p_activo,true)), ed);
end $$;

create or replace function public.rit_guardar_supervisores(p_clave text, p_lista text[])
returns void language plpgsql security definer set search_path = public, extensions as $$
declare ed text; viejo jsonb;
begin
  ed := public._rit_quien(p_clave, array['editor']);
  select coalesce(jsonb_agg(nombre order by orden), '[]'::jsonb) into viejo from public.rit_supervisores;
  delete from public.rit_supervisores where true;
  insert into public.rit_supervisores (nombre, orden)
  select distinct on (trim(n)) trim(n), i from unnest(p_lista) with ordinality as t(n, i) where trim(n) <> '' order by trim(n), i;
  insert into public.rit_cambios (tabla, clave, antes, despues, editor)
  values ('supervisores', null, viejo, to_jsonb(p_lista), ed);
end $$;

create or replace function public.rit_guardar_config(p_clave text, p_valor jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare ed text; viejo jsonb;
begin
  ed := public._rit_quien(p_clave, array['editor']);
  select v into viejo from public.rit_config where k = 'contrato';
  insert into public.rit_config (k, v, updated_at, updated_by) values ('contrato', p_valor, now(), ed)
  on conflict (k) do update set v = excluded.v, updated_at = now(), updated_by = ed;
  insert into public.rit_cambios (tabla, clave, antes, despues, editor) values ('contrato', 'contrato', viejo, p_valor, ed);
end $$;

create or replace function public.rit_cambios_listar(p_clave text, p_limit int default 60)
returns setof public.rit_cambios language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._rit_quien(p_clave, array['editor']);
  return query select * from public.rit_cambios order by id desc limit least(coalesce(p_limit,60), 300);
end $$;

-- Cambiar claves: 'yo' cambia la propia; 'equipo' cambia la clave compartida del equipo
create or replace function public.rit_cambiar_clave(p_clave text, p_quien text, p_nueva text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare ed text;
begin
  ed := public._rit_quien(p_clave, array['editor']);
  if length(coalesce(p_nueva,'')) < 6 then raise exception 'La clave nueva debe tener al menos 6 caracteres'; end if;
  if p_quien = 'equipo' then
    update public.rit_claves set clave_hash = crypt(p_nueva, gen_salt('bf')) where rol = 'equipo';
  else
    update public.rit_claves set clave_hash = crypt(p_nueva, gen_salt('bf'))
     where rol = 'editor' and nombre = ed;
  end if;
  insert into public.rit_cambios (tabla, clave, editor) values ('clave', coalesce(p_quien,'yo'), ed);
end $$;

-- ---------- RIT guardados en la nube (equipo y editores) ----------
create or replace function public.rit_registro_guardar(p_clave text, p_id text, p_fecha date, p_turno text, p_supervisor text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare quien text;
begin
  quien := public._rit_quien(p_clave, array['equipo','editor']);
  if octet_length(p_data::text) > 250000 then raise exception 'El RIT es demasiado grande'; end if;
  insert into public.rit_registros (id, fecha, turno, supervisor, data, subido_por, updated_at)
  values (p_id, p_fecha, p_turno, p_supervisor, p_data, quien, now())
  on conflict (id) do update set fecha = excluded.fecha, turno = excluded.turno, supervisor = excluded.supervisor,
         data = excluded.data, subido_por = excluded.subido_por, updated_at = now();
end $$;

create or replace function public.rit_registros_listar(p_clave text, p_limit int default 40)
returns table (id text, fecha date, turno text, supervisor text, data jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._rit_quien(p_clave, array['equipo','editor']);
  return query select r.id, r.fecha, r.turno, r.supervisor, r.data, r.updated_at
    from public.rit_registros r order by r.fecha desc nulls last, r.updated_at desc
    limit least(coalesce(p_limit,40), 200);
end $$;

grant execute on function public.rit_login(text) to anon, authenticated;
grant execute on function public.rit_guardar_rf(text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.rit_guardar_actividad(text,text,text,text,text[],boolean) to anon, authenticated;
grant execute on function public.rit_guardar_supervisores(text,text[]) to anon, authenticated;
grant execute on function public.rit_guardar_config(text,jsonb) to anon, authenticated;
grant execute on function public.rit_cambios_listar(text,int) to anon, authenticated;
grant execute on function public.rit_cambiar_clave(text,text,text) to anon, authenticated;
grant execute on function public.rit_registro_guardar(text,text,date,text,text,jsonb) to anon, authenticated;
grant execute on function public.rit_registros_listar(text,int) to anon, authenticated;

-- ---------- Menú: borradores en la nube, resumen del equipo y archivo ----------

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


-- ===================== CLAVES (cámbialas antes de ejecutar) =====================
-- Mínimo 6 caracteres. Después se pueden cambiar desde el panel de la app.
insert into public.rit_claves (nombre, rol, clave_hash)
select * from (values
  ('Administrador','editor', crypt('CAMBIA-clave-jeremy',     gen_salt('bf'))),
  ('Prevención',   'editor', crypt('CAMBIA-clave-prevencion', gen_salt('bf'))),
  ('Equipo MISPA', 'equipo', crypt('CAMBIA-clave-equipo',     gen_salt('bf')))
) as v(nombre, rol, clave_hash)
where not exists (select 1 from public.rit_claves);
