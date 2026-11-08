-- RIT Digital · PARTE 1 de 2: tablas, seguridad y catálogo inicial.
-- Pégalo completo en Supabase → SQL Editor → New query → Run. No hay que cambiar nada.
-- Después ejecuta la PARTE 2 (claves).

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



-- ===================== DATOS INICIALES =====================
insert into public.rit_rf (code, nombre, riesgo, cons_tipo, consecuencia, controles, orden) values
  ('01', 'Energía eléctrica', 'Contacto con energía eléctrica en bandejas y extensiones', 'Accidente grave o fatal', 'electrocución o quemadura grave', 'Aseo solo externo, sin intervenir tableros ni bandejas energizadas (CCP2) · Extensiones y equipos eléctricos inspeccionados (CCP3) · Bloqueo y verificación de ausencia de tensión si se interviene (CCP4)', 1),
  ('02', 'Trabajo en altura', 'Caída a distinto nivel desde techos o estructuras', 'Accidente grave o fatal', 'caída de altura, politraumatismo', 'Personal acreditado y examen de altura vigente (CCP2) · Arnés doble cola 100% conectado a línea de vida (CCM1·CCM2) · Plan de rescate (CCM3)', 2),
  ('03', 'Maniobras de izaje', 'Caída o golpe por carga suspendida en maniobra de izaje', 'Accidente grave o fatal', 'aplastamiento por carga suspendida', 'Plan de izaje y rigger acreditado (CCP3·CCP5) · Elementos de izaje inspeccionados (CCP1) · Nadie bajo carga suspendida (CCM1) · Comunicación radial operador-rigger (CCP4)', 3),
  ('04', 'Liberación descontrolada de energías', 'Liberación de presión hidráulica, neumática o de material colgado', 'Accidente grave o fatal', 'golpe o inyección por alta presión', 'Aislación, bloqueo y energía cero incl. contrapeso y tensor (CCP1) · Mangueras y acoples con piolas antilátigo (CCP2·CCP3) · Segregar área de proyección (CCM1)', 4),
  ('05', 'Caída de rocas en mina rajo', 'Caída de rocas desde taludes en mina rajo', 'Accidente grave o fatal', 'aplastamiento por caída de rocas', 'Respetar segregación y no ingresar a zonas restringidas (CCM1) · Bermas y taludes saneados (CCP2)', 5),
  ('06', 'Incendio', 'Incendio por trabajos en caliente o combustibles acumulados', 'Accidente grave o fatal', 'quemaduras o intoxicación por humo', 'Permiso de trabajo en caliente (CCP2) · Retiro de materiales combustibles (CCP1) · Extintor operativo y vía de evacuación conocida (CCM1·CCM2)', 6),
  ('07', 'Sustancias peligrosas', 'Contacto con salmuera o solución', 'Accidente grave', 'quemadura química ocular o de piel', 'Revisar HDS y señalización (CCP1) · Personal capacitado (CCP2) · Bloqueo de líneas de alimentación (CCP3) · EPP químico y lavaojos ubicado (CCM1)', 7),
  ('08', 'Tronaduras y explosivos', 'Exposición a tronadura en zonas cercanas', 'Accidente grave o fatal', 'proyección de material', 'Respetar horario de tronadura, aviso y evacuación de la zona (CCP4) · Capacidad de respuesta ante emergencia (CCM1)', 8),
  ('09', 'Partes móviles', 'Atrapamiento por partes móviles', 'Accidente grave o fatal', 'amputación o aplastamiento de extremidades', 'No traspasar guardas ni barreras duras (CCP1) · Bloqueo y energía cero en detención (CCP2) · Ubicar pull-cord / parada de emergencia (CCM1)', 9),
  ('10', 'Vehículos', 'Pérdida de control de vehículo liviano en traslados', 'Accidente grave o fatal', 'volcamiento o colisión', 'Conductor acreditado y test de fatiga aprobado (CCP1) · Check list pre-uso del vehículo (CCP2) · Respetar velocidad y señalización vial (CCP4)', 10),
  ('11', 'Espacios confinados', 'Atmósfera peligrosa o atrapamiento al interior del TK', 'Accidente grave o fatal', 'asfixia o intoxicación', 'Permiso de ingreso y vigía permanente (CCP1) · Medición de gases antes y durante (CCP2) · Bloqueo de líneas y ventilación (CCP3) · Plan de rescate (CCM1)', 11),
  ('13', 'Caída de objetos', 'Caída de herramientas, material o polines desde altura', 'Accidente grave o fatal', 'golpe en la cabeza (TEC)', 'Herramientas amarradas y retiro de material suelto (CCP1) · No trabajar en la vertical de otra cuadrilla (CCP2) · Segregar zona inferior (CCM1)', 12),
  ('20', 'Sílice', 'Exposición a polvo con sílice en suspensión', 'Enfermedad profesional', 'silicosis', 'Humectar antes de barrer o aspirar, prohibido barrer en seco (CCP1·CCM2) · Colectores operativos (CCP2) · Respirador filtro mixto ABEK1-P3 (CCM3)', 13),
  ('22', 'Falla de estructuras para tránsito', 'Falla de rejilla, baranda, pasillo o plataforma', 'Accidente grave o fatal', 'caída a distinto nivel', 'Inspección visual de rejillas y barandas antes de transitar (CCP2) · Retirar material que sobrecargue pasillos (CCP3) · Respetar vanos segregados (CCM1)', 14),
  ('24', 'Taludes', 'Deslizamiento de material desde stock pile o acopio', 'Accidente grave o fatal', 'sepultamiento o aplastamiento', 'Evaluar condición del acopio antes de ingresar (CCP1) · No trabajar al pie del acopio ni bajo material colgado, respetar pretiles (CCM1)', 15),
  ('25', 'Equipos mineros e industriales', 'Pérdida de control de minicargador, cargador o camión', 'Accidente grave o fatal', 'volcamiento o colisión', 'Operador acreditado y test de fatiga aprobado (CCP1) · Check list pre-uso: frenos y alarma de retroceso (CCP3) · Cinturón y cabina ROPS/FOPS (CCM1)', 16),
  ('26', 'Equipos autónomos', 'Interacción con equipos autónomos', 'Accidente grave o fatal', 'atropello o colisión', 'Respetar rutas y control de acceso de equipos autónomos (CCP4) · Personal acreditado y comunicado con el centro de control (CCP3)', 17),
  ('27', 'Atropello', 'Interacción de personas con equipos móviles', 'Accidente grave o fatal', 'atropello', 'Segregación peatón-equipo (CCP1) · Alarma de proximidad operativa (CCP2) · Ropa de alta visibilidad (CCP3) · Contacto visual y radial (CCP4)', 18),
  ('29', 'Caída a cuerpos líquidos', 'Caída a TK de salmuera o piscina PDS', 'Accidente grave o fatal', 'ahogamiento', 'Zona aislada, señalizada y con barandas (CCP1) · Chaleco salvavidas y trabajo en pareja (CCP2) · Aro salvavidas y plan de rescate (CCM1)', 19),
  ('30', 'Tiro y arrastre', 'Corte de cadena o eslinga en maniobra de tiro', 'Accidente grave o fatal', 'golpe por latigazo de cadena o eslinga', 'Accesorios de arrastre certificados (CCP3) · Sistema de tiro inspeccionado antes de uso (CCP1) · Personal fuera de la línea de tiro (CCM1)', 20),
  ('31', 'Incendio de equipos mineros e industriales', 'Incendio en minicargador o cargador frontal', 'Accidente grave o fatal', 'quemaduras', 'Check list de fugas hidráulicas y de combustible (CCP2) · Sistema de supresión y extintor operativos (CCM1) · Operador acreditado (CCP1)', 21)
on conflict (code) do nothing;

insert into public.rit_actividades (code, area, nombre, rf, orden) values
  ('2.1', 'Chancado Secundario', 'Aseo int./ext. feeder CH-II', '{04,09,20}', 2001),
  ('2.2', 'Chancado Secundario', 'Aseo chute feeder/recuperadora CH-II', '{04,09,20}', 2002),
  ('2.3', 'Chancado Secundario', 'Aseo cola correa recuperadora CH-II', '{09,20,22}', 2003),
  ('2.4', 'Chancado Secundario', 'Aseo cabeza correa recuperadora CH-II', '{09,20,22}', 2004),
  ('2.5', 'Chancado Secundario', 'Aseo pasillos contrapeso recuperadora CH-II', '{09,20,22}', 2005),
  ('2.6', 'Chancado Secundario', 'Aseo bajo contrapeso recuperadora CH-II', '{09,20,22}', 2006),
  ('2.7', 'Chancado Secundario', 'Limpieza retorno correa recuperadora CH-II', '{09,20,22}', 2007),
  ('2.8', 'Chancado Secundario', 'Desatollo traspasos feeder/recup./harnero CH-II', '{04,09,20}', 2008),
  ('2.9', 'Chancado Secundario', 'Aseo pasillos túneles recuperadoras CH-II', '{09,20,22}', 2009),
  ('2.10', 'Chancado Secundario', 'Aseo perimetral feeder CH-II', '{09,20,22}', 2010),
  ('2.11', 'Chancado Secundario', 'Aseo contorno stock pile de gruesos', '{24,27,20}', 2011),
  ('2.12', 'Chancado Secundario', 'Aseo portones stock pile de gruesos', '{24,27,20}', 2012),
  ('2.13', 'Chancado Secundario', 'Aseo chute recuperadora/harnero CH-II', '{04,09,20}', 2013),
  ('2.14', 'Chancado Secundario', 'Aseo chute harnero/chancador CH-II', '{04,09,20}', 2014),
  ('2.15', 'Chancado Secundario', 'Aseo sistema motriz chancador CH-II', '{09,20,22}', 2015),
  ('2.16', 'Chancado Secundario', 'Aseo bóvedas descarga CV-110', '{04,09,20}', 2016),
  ('2.17', 'Chancado Secundario', 'Aseo bóvedas descarga CV-111', '{04,09,20}', 2017),
  ('2.18', 'Chancado Secundario', 'Aseo mallas 2° deck harnero CH-II', '{04,09,20}', 2018),
  ('2.19', 'Chancado Secundario', 'Aseo plano inclinado harnero CH-II', '{04,09,20}', 2019),
  ('2.20', 'Chancado Secundario', 'Aseo 6° nivel nave CH-II', '{09,20,22}', 2020),
  ('2.21', 'Chancado Secundario', 'Aseo 5° nivel nave CH-II', '{09,20,22}', 2021),
  ('2.22', 'Chancado Secundario', 'Aseo 4° nivel nave CH-II', '{09,20,22}', 2022),
  ('2.23', 'Chancado Secundario', 'Aseo 3er nivel nave CH-II', '{09,20,22}', 2023),
  ('2.24', 'Chancado Secundario', 'Aseo 2° nivel nave CH-II', '{09,20,22}', 2024),
  ('2.25', 'Chancado Secundario', 'Aseo 1er nivel nave CH-II', '{09,20,22}', 2025),
  ('2.26', 'Chancado Secundario', 'Aseo polines impacto CV-110/111', '{09,20,22}', 2026),
  ('2.27', 'Chancado Secundario', 'Aseo retorno CV-110/111', '{09,20,22}', 2027),
  ('2.28', 'Chancado Secundario', 'Aseo estructural CV-110/111', '{09,20,22}', 2028),
  ('2.29', 'Chancado Secundario', 'Aseo pasillos CV-110/111', '{09,20,22}', 2029),
  ('2.30', 'Chancado Secundario', 'Aseo polines retorno CV-111', '{09,20,22}', 2030),
  ('2.31', 'Chancado Secundario', 'Aseo bajo estructura sujeción CV-110', '{09,20,22}', 2031),
  ('2.32', 'Chancado Secundario', 'Aseo colectores DC-104 a 108', '{09,20,22}', 2032),
  ('2.33', 'Chancado Secundario', 'Desatollo colectores DC-104 a 108', '{04,09,20}', 2033),
  ('2.34', 'Chancado Secundario', 'Desatollo línea principal colectores CH-II', '{04,09,20}', 2034),
  ('2.35', 'Chancado Secundario', 'Aseo mangas captadoras 3er nivel CH-II', '{04,09,20}', 2035),
  ('2.36', 'Chancado Secundario', 'Aseo electroimanes recuperadoras CH-II', '{09,20,22}', 2036),
  ('2.37', 'Chancado Secundario', 'Aseo techo harnero recuperadoras CH-II', '{02,13,20}', 2037),
  ('2.38', 'Chancado Secundario', 'Aseo cono centrador recuperadoras CH-II', '{04,09,20}', 2038),
  ('2.39', 'Chancado Secundario', 'Aseo viga flotante recuperadoras CH-II', '{04,09,20}', 2039),
  ('2.40', 'Chancado Secundario', 'Aseo distribuidor de carga CH-II', '{04,09,20}', 2040),
  ('2.41', 'Chancado Secundario', 'Aseo tolvín chancador CH-II', '{04,09,20}', 2041),
  ('2.42', 'Chancado Secundario', 'Desatollo chutes CH-II', '{04,09,20}', 2042),
  ('2.43', 'Chancado Secundario', 'Aseo derrame chutes CH-II', '{09,20,22}', 2043),
  ('2.44', 'Chancado Secundario', 'Mantención red de alto vacío CH-II', '{09,20,22}', 2044),
  ('2.45', 'Chancado Secundario', 'Mantención planta de fino', '{09,20,22}', 2045),
  ('3.1', 'Chancado Terciario', 'Aseo int./ext. feeder CH-III', '{04,09,20}', 3001),
  ('3.2', 'Chancado Terciario', 'Aseo chute feeder/recuperadora CH-III', '{04,09,20}', 3002),
  ('3.3', 'Chancado Terciario', 'Aseo cola correa recuperadora CH-III', '{09,20,22}', 3003),
  ('3.4', 'Chancado Terciario', 'Aseo cabeza correa recuperadora CH-III', '{09,20,22}', 3004),
  ('3.5', 'Chancado Terciario', 'Aseo pasillos contrapeso recuperadora CH-III', '{09,20,22}', 3005),
  ('3.6', 'Chancado Terciario', 'Aseo bajo contrapeso recuperadora CH-III', '{09,20,22}', 3006),
  ('3.7', 'Chancado Terciario', 'Limpieza retorno correa recuperadora CH-III', '{09,20,22}', 3007),
  ('3.8', 'Chancado Terciario', 'Desatollo traspasos feeder/recup./harnero CH-III', '{04,09,20}', 3008),
  ('3.9', 'Chancado Terciario', 'Aseo pasillos túneles recuperadoras CH-III', '{09,20,22}', 3009),
  ('3.10', 'Chancado Terciario', 'Aseo perimetral feeder CH-III', '{09,20,22}', 3010),
  ('3.11', 'Chancado Terciario', 'Aseo contorno stock pile terciario', '{24,27,20}', 3011),
  ('3.12', 'Chancado Terciario', 'Aseo portones stock pile terciario', '{24,27,20}', 3012),
  ('3.13', 'Chancado Terciario', 'Aseo chute recuperadora/harnero CH-III', '{04,09,20}', 3013),
  ('3.14', 'Chancado Terciario', 'Aseo chute harnero/chancador CH-III', '{04,09,20}', 3014),
  ('3.15', 'Chancado Terciario', 'Aseo sistema motriz chancador CH-III', '{09,20,22}', 3015),
  ('3.16', 'Chancado Terciario', 'Aseo bóvedas descarga CV-132', '{04,09,20}', 3016),
  ('3.17', 'Chancado Terciario', 'Aseo bóvedas descarga CV-131', '{04,09,20}', 3017),
  ('3.18', 'Chancado Terciario', 'Aseo mallas deck harnero CH-III', '{04,09,20}', 3018),
  ('3.19', 'Chancado Terciario', 'Aseo plano inclinado harnero CH-III', '{04,09,20}', 3019),
  ('3.20', 'Chancado Terciario', 'Aseo 6° nivel nave CH-III', '{09,20,22}', 3020),
  ('3.21', 'Chancado Terciario', 'Aseo 5° nivel nave CH-III', '{09,20,22}', 3021),
  ('3.22', 'Chancado Terciario', 'Aseo 4° nivel nave CH-III', '{09,20,22}', 3022),
  ('3.23', 'Chancado Terciario', 'Aseo 3er nivel nave CH-III', '{09,20,22}', 3023),
  ('3.24', 'Chancado Terciario', 'Aseo 2° nivel nave CH-III', '{09,20,22}', 3024),
  ('3.25', 'Chancado Terciario', 'Aseo 1er nivel nave CH-III', '{09,20,22}', 3025),
  ('3.26', 'Chancado Terciario', 'Aseo polines impacto CV-131/132', '{09,20,22}', 3026),
  ('3.27', 'Chancado Terciario', 'Aseo retorno CV-131/132', '{09,20,22}', 3027),
  ('3.28', 'Chancado Terciario', 'Aseo estructural CV-131/132', '{09,20,22}', 3028),
  ('3.29', 'Chancado Terciario', 'Aseo pasillos CV-131/132', '{09,20,22}', 3029),
  ('3.30', 'Chancado Terciario', 'Aseo polines retorno CV-131', '{09,20,22}', 3030),
  ('3.31', 'Chancado Terciario', 'Aseo bajo estructura sujeción CV-132', '{09,20,22}', 3031),
  ('3.32', 'Chancado Terciario', 'Aseo colectores DC-121 a 125', '{09,20,22}', 3032),
  ('3.33', 'Chancado Terciario', 'Desatollo colectores DC-121 a 125', '{04,09,20}', 3033),
  ('3.34', 'Chancado Terciario', 'Desatollo línea principal colectores CH-III', '{04,09,20}', 3034),
  ('3.35', 'Chancado Terciario', 'Aseo electroimanes recuperadoras CH-III', '{09,20,22}', 3035),
  ('3.36', 'Chancado Terciario', 'Aseo techo harnero recuperadoras CH-III', '{02,13,20}', 3036),
  ('3.37', 'Chancado Terciario', 'Aseo cono centrador recuperadoras CH-III', '{04,09,20}', 3037),
  ('3.38', 'Chancado Terciario', 'Aseo viga flotante recuperadoras CH-III', '{04,09,20}', 3038),
  ('3.39', 'Chancado Terciario', 'Aseo distribuidor de carga CH-III', '{04,09,20}', 3039),
  ('3.40', 'Chancado Terciario', 'Aseo tolvín chancador CH-III', '{04,09,20}', 3040),
  ('3.41', 'Chancado Terciario', 'Desatollo chutes CH-III', '{04,09,20}', 3041),
  ('3.42', 'Chancado Terciario', 'Aseo derrame chutes CH-III', '{09,20,22}', 3042),
  ('3.43', 'Chancado Terciario', 'Aseo int./ext. feeder CH-III (línea)', '{04,09,20}', 3043),
  ('3.44', 'Chancado Terciario', 'Mantención red de alto vacío CH-III', '{09,20,22}', 3044),
  ('4.1', 'Línea Crítica Terciaria', 'Aseo pasillos CV-120 y testigo tripper BM-120', '{09,20,22}', 4001),
  ('4.2', 'Línea Crítica Terciaria', 'Aseo cola CV-119 y pasillos', '{09,20,22}', 4002),
  ('4.3', 'Línea Crítica Terciaria', 'Aseo polines impacto CV-119/120', '{09,20,22}', 4003),
  ('4.4', 'Línea Crítica Terciaria', 'Aseo polines retorno CV-120', '{09,20,22}', 4004),
  ('4.5', 'Línea Crítica Terciaria', 'Aseo traspaso CV-120/BM-120 (chute pantalón)', '{04,09,20}', 4005),
  ('4.6', 'Línea Crítica Terciaria', 'Aseo rieles tripper BM-120', '{09,22,20}', 4006),
  ('4.7', 'Línea Crítica Terciaria', 'Aseo estructural y contrapeso CV-119/120', '{09,20,22}', 4007),
  ('4.8', 'Línea Crítica Terciaria', 'Aseo polines retorno CV-119', '{09,20,22}', 4008),
  ('4.9', 'Línea Crítica Terciaria', 'Aseo cola CV-120 y pasillos', '{09,20,22}', 4009),
  ('4.10', 'Línea Crítica Terciaria', 'Aseo cabezal CV-120', '{09,20,22}', 4010),
  ('4.11', 'Línea Crítica Terciaria', 'Aseo pasillo CV-112', '{09,20,22}', 4011),
  ('5.1', 'Línea Crítica y Curado Ácido', 'Aseo CV-113/114 con raspador y minicargador', '{25,27,20}', 5001),
  ('5.2', 'Línea Crítica y Curado Ácido', 'Aseo chutes traspaso línea crítica', '{04,09,20}', 5002),
  ('5.3', 'Línea Crítica y Curado Ácido', 'Aseo techos CV-113/114', '{02,13,20}', 5003),
  ('5.4', 'Línea Crítica y Curado Ácido', 'Aseo polines impacto CV-112', '{09,20,22}', 5004),
  ('5.5', 'Línea Crítica y Curado Ácido', 'Aseo retorno CV-112 (cola a pesaje)', '{09,20,22}', 5005),
  ('5.6', 'Línea Crítica y Curado Ácido', 'Aseo cabezal CV-112/113/114', '{09,20,22}', 5006),
  ('5.7', 'Línea Crítica y Curado Ácido', 'Aseo bajo cámara de curado CV-113/114', '{09,20,22}', 5007),
  ('5.8', 'Línea Crítica y Curado Ácido', 'Aseo cola CV-112/113/114', '{09,20,22}', 5008),
  ('5.9', 'Línea Crítica y Curado Ácido', 'Aseo carro tensor CV-113/114', '{04,09,20}', 5009),
  ('6.1', 'Área Clorurada', 'Carguío de sal con cargador frontal', '{25,27,20}', 6001),
  ('6.2', 'Área Clorurada', 'Aseo interior TK salmuera', '{11,29,07}', 6002),
  ('6.3', 'Área Clorurada', 'Aseo interior piscina PDS', '{11,29,07}', 6003),
  ('6.4', 'Área Clorurada', 'Aseo parrilla buzón descarga de sal', '{04,09,20}', 6004),
  ('6.5', 'Área Clorurada', 'Aseo derrame stacker de sal', '{09,20,22}', 6005),
  ('6.6', 'Área Clorurada', 'Lavado hidrojet estructura CV-113/114', '{04,09,20}', 6006),
  ('6.7', 'Área Clorurada', 'Lavado hidrojet conveyor y pasillos CV-113/114', '{04,09,20}', 6007),
  ('6.8', 'Área Clorurada', 'Retiro material acuoso piscina CV-113', '{29,25,27}', 6008),
  ('6.9', 'Área Clorurada', 'Aseo ducto scrubber torres 1 y 2', '{11,02,20}', 6009),
  ('6.10', 'Área Clorurada', 'Aseo robotizado línea crítica', '{09,20,22}', 6010),
  ('6.11', 'Área Clorurada', 'Cuadrilla spot mantenciones mayores', '{}', 6011),
  ('7.1', 'Correa CV-201', 'Aseo pasillo túnel hipódromo sur', '{09,20,22}', 7001),
  ('7.2', 'Correa CV-201', 'Aseo cola CV-201', '{09,20,22}', 7002),
  ('7.3', 'Correa CV-201', 'Aseo enhebrador CV-201', '{09,20,22}', 7003),
  ('7.4', 'Correa CV-201', 'Aseo rieles CV-201', '{09,22,20}', 7004),
  ('7.5', 'Correa CV-201', 'Aseo entre correas CV-201/205', '{09,20,22}', 7005),
  ('7.6', 'Correa CV-201', 'Aseo cabezal CV-201', '{09,20,22}', 7006),
  ('7.7', 'Correa CV-201', 'Aseo retorno polines CV-201', '{09,20,22}', 7007),
  ('7.8', 'Correa CV-201', 'Aseo retorno CV-201 para cambio de polín', '{09,20,22}', 7008),
  ('7.9', 'Correa CV-201', 'Aseo bandejas eléctricas CV-201', '{01,09,20}', 7009),
  ('7.10', 'Correa CV-201', 'Aseo retorno mesa 463 a huinche tensor', '{09,20,22}', 7010),
  ('7.11', 'Correa CV-201', 'Aseo pasillos cola CV-201', '{09,20,22}', 7011),
  ('7.12', 'Correa CV-201', 'Aseo pasillos cabezal CV-201', '{09,20,22}', 7012),
  ('7.13', 'Correa CV-201', 'Aseo cola CV-201 con minicargador', '{25,27,20}', 7013),
  ('7.14', 'Correa CV-201', 'Lavado estructural mesas CV-201', '{04,09,20}', 7014),
  ('7.15', 'Correa CV-201', 'Limpieza camino con camión tolva', '{25,27,20}', 7015),
  ('8.1', 'Puente Apilador', 'Aseo pasillos cabeza CV-202', '{09,20,22}', 8001),
  ('8.2', 'Puente Apilador', 'Aseo traspaso CV-201/202/203', '{04,09,20}', 8002),
  ('8.3', 'Puente Apilador', 'Aseo pasillos luffing', '{09,20,22}', 8003),
  ('8.4', 'Puente Apilador', 'Aseo oruga puente azul', '{09,22,20}', 8004),
  ('8.5', 'Puente Apilador', 'Aseo atollo sobrecarga CV-203', '{04,09,20}', 8005),
  ('8.6', 'Puente Apilador', 'Aseo pasillos CV-203', '{09,20,22}', 8006),
  ('8.7', 'Puente Apilador', 'Lavado estructural puente CV-202', '{04,09,20}', 8007),
  ('9.1', 'Rotopala', 'Aseo tobogán rotopala', '{09,20,22}', 9001),
  ('9.2', 'Rotopala', 'Aseo riñón rotopala', '{09,20,22}', 9002),
  ('9.3', 'Rotopala', 'Aseo eje disco rotopala', '{09,20,22}', 9003),
  ('9.4', 'Rotopala', 'Aseo orugas rotopala', '{09,22,20}', 9004),
  ('9.5', 'Rotopala', 'Aseo traspaso hopper 204', '{04,09,20}', 9005),
  ('9.6', 'Rotopala', 'Aseo pasillo hopper 204', '{09,20,22}', 9006),
  ('9.7', 'Rotopala', 'Aseo polines impacto BM-203 y estructura', '{09,20,22}', 9007),
  ('10.1', 'CV-204 y Puente Rojo', 'Aseo orugas puente rojo', '{09,22,20}', 10001),
  ('10.2', 'CV-204 y Puente Rojo', 'Aseo pasillos cabezal CV-204', '{09,20,22}', 10002),
  ('10.3', 'CV-204 y Puente Rojo', 'Aseo rieles, pluma y catalina puente rojo', '{09,22,20}', 10003),
  ('10.4', 'CV-204 y Puente Rojo', 'Aseo cubre canaletas', '{09,20,22}', 10004),
  ('10.5', 'CV-204 y Puente Rojo', 'Aseo vigas uniones de paño', '{09,20,22}', 10005),
  ('10.6', 'CV-204 y Puente Rojo', 'Aseo motores cola CV-204', '{09,20,22}', 10006),
  ('10.7', 'CV-204 y Puente Rojo', 'Aseo bandeja eléctrica pluma CV-204', '{01,09,20}', 10007),
  ('10.8', 'CV-204 y Puente Rojo', 'Lavado estructural puente CV-204', '{04,09,20}', 10008),
  ('11.1', 'Correa CV-205', 'Aseo cola CV-205 bajo polea', '{09,20,22}', 11001),
  ('11.2', 'Correa CV-205', 'Aseo pasillos cabezal y cola CV-205', '{09,20,22}', 11002),
  ('11.3', 'Correa CV-205', 'Aseo bajo retorno CV-205', '{09,20,22}', 11003),
  ('11.4', 'Correa CV-205', 'Aseo túnel CV-205', '{09,20,22}', 11004),
  ('11.5', 'Correa CV-205', 'Aseo traspaso CV-204/205', '{04,09,20}', 11005),
  ('11.6', 'Correa CV-205', 'Aseo traspaso CV-205/206', '{04,09,20}', 11006),
  ('11.7', 'Correa CV-205', 'Aseo techos cabezal CV-205/206', '{02,13,20}', 11007),
  ('11.8', 'Correa CV-205', 'Aseo enhebrador CV-205', '{09,20,22}', 11008),
  ('12.1', 'Correa CV-206', 'Aseo cola CV-206 y polines impacto', '{09,20,22}', 12001),
  ('12.2', 'Correa CV-206', 'Aseo pasillos cabezal y cola CV-206', '{09,20,22}', 12002),
  ('12.3', 'Correa CV-206', 'Aseo bajo retorno CV-206', '{09,20,22}', 12003),
  ('12.4', 'Correa CV-206', 'Aseo traspaso CV-206/207', '{04,09,20}', 12004),
  ('13.1', 'Correa CV-207', 'Aseo pasillos CV-207', '{09,20,22}', 13001),
  ('13.2', 'Correa CV-207', 'Aseo cabezal o cola CV-207', '{09,20,22}', 13002),
  ('14.1', 'Spreader', 'Aseo pasillos CV-207A/207B', '{09,20,22}', 14001),
  ('14.2', 'Spreader', 'Aseo tornamesa spreader', '{09,20,22}', 14002),
  ('14.3', 'Spreader', 'Aseo traspaso BM-208/CV-207A/207B', '{04,09,20}', 14003),
  ('14.4', 'Spreader', 'Aseo orugas spreader', '{09,22,20}', 14004),
  ('14.5', 'Spreader', 'Aseo sistemas motrices spreader', '{09,20,22}', 14005),
  ('14.6', 'Spreader', 'Aseo techos sistemas motrices CV-207A/B', '{02,13,20}', 14006),
  ('14.7', 'Spreader', 'Aseo pasillos acceso consola spreader', '{09,20,22}', 14007),
  ('14.8', 'Spreader', 'Aseo pasillos pluma spreader', '{09,20,22}', 14008),
  ('14.9', 'Spreader', 'Aseo pasillos intermedia spreader', '{09,20,22}', 14009),
  ('14.10', 'Spreader', 'Aseo techos sala eléctrica spreader', '{02,13,20}', 14010),
  ('14.11', 'Spreader', 'Aseo techo intermedia spreader', '{02,13,20}', 14011),
  ('14.12', 'Spreader', 'Aseo techo pasillos acceso spreader', '{02,13,20}', 14012),
  ('15.1', 'Aseo correctivo', 'Cuadrilla correctiva turno A', '{}', 15001),
  ('15.2', 'Aseo correctivo', 'Cuadrilla correctiva turno B', '{}', 15002),
  ('15.3', 'Aseo correctivo', 'Manilla-manilla (cambio de turno)', '{}', 15003),
  ('16.1', 'Aseo oficinas', 'Aseo completo oficina instrumentación cola CV-206', '{}', 16001),
  ('16.2', 'Aseo oficinas', 'Aseo completo consola de operaciones', '{}', 16002),
  ('16.3', 'Aseo oficinas', 'Aseo completo oficina chancado secundario', '{}', 16003),
  ('16.4', 'Aseo oficinas', 'Aseo completo oficina ejecución mantenimiento', '{}', 16004),
  ('16.5', 'Aseo oficinas', 'Aseo completo oficina ingeniería mantenimiento', '{}', 16005),
  ('16.6', 'Aseo oficinas', 'Aseo completo oficina superintendencia CHMM', '{}', 16006),
  ('16.7', 'Aseo oficinas', 'Mantención aseo oficina instrumentación cola CV-206', '{}', 16007),
  ('16.8', 'Aseo oficinas', 'Mantención aseo consola de operaciones', '{}', 16008),
  ('16.9', 'Aseo oficinas', 'Mantención aseo oficina chancado secundario', '{}', 16009),
  ('16.10', 'Aseo oficinas', 'Mantención aseo oficina ejecución mantenimiento', '{}', 16010),
  ('16.11', 'Aseo oficinas', 'Mantención aseo oficina ingeniería mantenimiento', '{}', 16011),
  ('16.12', 'Aseo oficinas', 'Mantención aseo oficina superintendencia CHMM', '{}', 16012),
  ('16.13', 'Aseo oficinas', 'Retiro materiales y aspirado oficinas y estacionamientos', '{}', 16013),
  ('16.14', 'Aseo oficinas', 'Aseo completo instalaciones móviles spreader', '{}', 16014),
  ('16.15', 'Aseo oficinas', 'Aseo completo instalaciones área clorurada', '{}', 16015),
  ('16.16', 'Aseo oficinas', 'Mantención aseo instalaciones área clorurada', '{}', 16016)
on conflict (code) do nothing;

insert into public.rit_supervisores (nombre, orden) values
  ('Bastián Arce', 1),
  ('Bastián Araya', 2),
  ('Andrés Martínez', 3),
  ('Richard Espada', 4),
  ('Danny Gosalve', 5),
  ('Jeannelson Estay', 6)
on conflict (nombre) do nothing;

insert into public.rit_config (k, v) values ('contrato', '{"centro":"División Radomiro Tomic","gerencia":"Planta","superint":"CHM.M","eecc":"Mantenimiento Industrial SpA","contrato":"4600031622","nombreContrato":"Servicio de Aseo Industrial en Áreas Operacionales DRT","jefeOps":"Bastián Araya Villavicencio"}'::jsonb)
on conflict (k) do nothing;
