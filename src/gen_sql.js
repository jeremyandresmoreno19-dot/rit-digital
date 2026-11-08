const fs=require('fs'); process.chdir(__dirname); const {RF_LIB,RF_ORDER,PKG,AREAS,CAT,SUPERVISORES}=require('./data.js');
const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
const arr=a=>"'{"+a.join(',')+"}'";
const ord=c=>{const [a,b]=c.split('.').map(Number); return a*1000+b;};
let s=fs.readFileSync('schema.sql','utf8');
let seed='\n-- ===================== DATOS INICIALES =====================\n';
seed+='insert into public.rit_rf (code, nombre, riesgo, cons_tipo, consecuencia, controles, orden) values\n'+
 RF_ORDER.map((c,i)=>`  (${q(c)}, ${q(RF_LIB[c].n)}, ${q(RF_LIB[c].r)}, ${q(RF_LIB[c].t)}, ${q(RF_LIB[c].c)}, ${q(RF_LIB[c].k)}, ${i+1})`).join(',\n')+'\non conflict (code) do nothing;\n\n';
seed+='insert into public.rit_actividades (code, area, nombre, rf, orden) values\n'+
 CAT.map(([c,n,p])=>`  (${q(c)}, ${q(AREAS[c.split('.')[0]])}, ${q(n)}, ${arr(PKG[p])}, ${ord(c)})`).join(',\n')+'\non conflict (code) do nothing;\n\n';
seed+='insert into public.rit_supervisores (nombre, orden) values\n'+SUPERVISORES.map((n,i)=>`  (${q(n)}, ${i+1})`).join(',\n')+'\non conflict (nombre) do nothing;\n\n';
seed+=`insert into public.rit_config (k, v) values ('contrato', '{"centro":"División Radomiro Tomic","gerencia":"Planta","superint":"CHM.M","eecc":"Mantenimiento Industrial SpA","contrato":"4600031622","nombreContrato":"Servicio de Aseo Industrial en Áreas Operacionales DRT","jefeOps":"Bastián Araya Villavicencio"}'::jsonb)\non conflict (k) do nothing;\n`;
const a = s.indexOf('-- ===================== CLAVES'), b = s.indexOf('where not exists (select 1 from public.rit_claves);', a) + 'where not exists (select 1 from public.rit_claves);'.length;
const head = '-- RIT Digital · PARTE 1 de 2: tablas, seguridad y catálogo inicial.\n-- Pégalo completo en Supabase → SQL Editor → New query → Run. No hay que cambiar nada.\n-- Después ejecuta la PARTE 2 (claves).\n\n';
const out = head + s.slice(0, a) + s.slice(b + 1) + seed;
fs.writeFileSync('../sql/1-tablas.sql', out); console.log('ok', out.length);
