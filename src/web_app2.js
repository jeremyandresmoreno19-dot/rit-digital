(function(){
"use strict";
// ================= Configuración =================
const RC = window.RIT_CONFIG || {};
const SB_URL = String(RC.SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = String(RC.SUPABASE_ANON_KEY || "");
const CLOUD = !!(SB_URL && SB_KEY && !/TU-PROYECTO|TU-ANON/.test(SB_URL + SB_KEY));
const LS_KEY = "rit_rt_v3", CAT_KEY = "rit_cat_v2";
const PREP_V = [["SI","SÍ"],["NO","NO"],["NA","NA"]];
const fmtDate = iso => { if (!iso) return ""; const [y, m, d] = String(iso).split("-"); return d + "-" + m + "-" + y; };
const ITEMS = ["Instructivos y/o PTS","Materiales","Herramientas","EPP"];

const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
const short = iso => iso ? iso.slice(8,10) + "-" + iso.slice(5,7) : "";
const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-_/]/g, "");
const ordOf = c => { const m = /^(\d+)\.(\d+)$/.exec(c); return m ? (+m[1]) * 1000 + (+m[2]) : 999000; };
const stamp = t => { if (!t) return ""; const d = new Date(t); return String(d.getDate()).padStart(2,"0") + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + d.getFullYear() + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); };

// ================= Supabase (REST) =================
function sbHeaders(json){ const h = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY }; if (json) h["Content-Type"] = "application/json"; return h; }
async function sbGet(path){
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: sbHeaders(), cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
async function rpc(fn, body){
  let r;
  try { r = await fetch(SB_URL + "/rest/v1/rpc/" + fn, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(body || {}) }); }
  catch (e) { const er = new Error("Sin conexión"); er.offline = true; throw er; }
  const t = await r.text();
  if (!r.ok) { let m = t; try { const j = JSON.parse(t); m = j.message || j.error || t; } catch (e) {} const er = new Error(m || ("HTTP " + r.status)); er.status = r.status; er.badKey = /Clave incorrecta/.test(m); throw er; }
  return t ? JSON.parse(t) : null;
}

// ================= Catálogo oficial =================
function defaultCatalog(){
  return {
    at: 0,
    rf: RF_ORDER.map((c, i) => ({ code:c, nombre:RF_LIB[c].n, riesgo:RF_LIB[c].r, cons_tipo:RF_LIB[c].t, consecuencia:RF_LIB[c].c, controles:RF_LIB[c].k, orden:i + 1 })),
    acts: CAT.map(([c, n, p]) => ({ code:c, area:AREAS[c.split(".")[0]], nombre:n, rf:PKG[p].slice(), activo:true, orden:ordOf(c) })),
    sup: SUPERVISORES.slice(),
    cfg: { gerencia:"Planta", superint:"CHM.M", eecc:"Mantenimiento Industrial SpA", contrato:"4600031622", nombreContrato:"Servicio de Aseo Industrial en Áreas Operacionales DRT", jefeOps:"Bastián Araya Villavicencio" }
  };
}
let KC = (() => { try { const o = JSON.parse(localStorage.getItem(CAT_KEY)); if (o && o.rf && o.acts) return o; } catch (e) {} return defaultCatalog(); })();
let RFL = {}, RFO = [], ACT = {}, AREA_LIST = [];
function indexCatalog(){
  RFL = {}; KC.rf.forEach(r => { RFL[r.code] = { n:r.nombre, r:r.riesgo, t:r.cons_tipo || "", c:r.consecuencia, k:r.controles, by:r.updated_by, at:r.updated_at }; });
  RFO = KC.rf.slice().sort((a, b) => a.orden - b.orden).map(r => r.code).filter(c => RIT2.CODES.includes(c));
  ACT = {}; KC.acts.forEach(a => { ACT[a.code] = a; });
  AREA_LIST = []; KC.acts.slice().sort((a, b) => a.orden - b.orden).forEach(a => { if (!AREA_LIST.includes(a.area)) AREA_LIST.push(a.area); });
}
indexCatalog();
let catState = CLOUD ? "cargando" : "local";
async function refreshCatalog(silent){
  if (!CLOUD) return false;
  try {
    const [rf, acts, sup, cfg] = await Promise.all([
      sbGet("rit_rf?select=*&order=orden"), sbGet("rit_actividades?select=*&order=orden"),
      sbGet("rit_supervisores?select=nombre&order=orden"), sbGet("rit_config?select=k,v")
    ]);
    if (!rf.length) throw new Error("vacío");
    const c = cfg.find(x => x.k === "contrato");
    KC = { at: Date.now(), rf, acts, sup: sup.map(s => s.nombre), cfg: c ? c.v : KC.cfg };
    try { localStorage.setItem(CAT_KEY, JSON.stringify(KC)); } catch (e) {}
    indexCatalog(); catState = "ok"; syncDraftWithCatalog();
    if (!silent && sheet.hidden) render(); else if (!silent) renderStatus();
    return true;
  } catch (e) { catState = "off"; renderStatus(); return false; }
}
// Las actividades de hoy que no se editaron a mano toman el nombre y los RF vigentes del catálogo
function syncDraftWithCatalog(){
  let changed = false;
  D().acts.forEach(a => { const c = ACT[a.id]; if (c && !a.manualRf) { if (a.rf.join() !== c.rf.join() || a.name !== c.nombre) { a.rf = c.rf.slice(); a.name = c.nombre; changed = true; } } });
  if (changed) persist(true);
}

// ================= Estado del usuario =================
function blankMem(){ return { names:[], supOtros:[], areaEsp:[], custom:[], use:{}, hist:[], outbox:{}, team:"", teamWho:"", yo:"", myTexts:{}, myDef:{} }; }
function guessJornada(){ const h = new Date().getHours(); return h >= 6 && h < 18 ? "Día" : "Noche"; }
function blankDraft(prev){
  return { id:"r" + Date.now() + Math.random().toString(36).slice(2, 6),
    h:{ fecha:today(), turno: prev ? prev.h.turno : "A", area: prev ? prev.h.area : "Área Seca", supervisor: prev ? prev.h.supervisor : "", asistentes: prev ? prev.h.asistentes : 0, jornada: guessJornada() },
    ot:{ areaEsp: prev && prev.ot ? prev.ot.areaEsp : "", tipo: prev && prev.ot ? prev.ot.tipo : "" },
    acts:[], rfAdd:[], lastDay:false,
    aportes:[0,1,2,3].map(() => ({ p:"", r:"", f:today() })), recon:[0,1,2,3].map(() => ({ q:"", m:"" })) };
}
let S = (() => { try { const o = JSON.parse(localStorage.getItem(LS_KEY)); if (o && o.draft && o.mem) { o.mem = Object.assign(blankMem(), o.mem); o.draft.ot = o.draft.ot || { areaEsp:"", tipo:"" }; return o; } } catch (e) {} return { draft: blankDraft(null), mem: blankMem(), updatedAt: 0 }; })();
const mem = () => S.mem, D = () => S.draft;
// Borrador nuevo: el supervisor sale del "¿Quién eres?" de este celular
function newDraft(prev){ const d = blankDraft(prev); if (mem().yo) d.h.supervisor = mem().yo; return d; }
if (!D().h.supervisor && mem().yo) D().h.supervisor = mem().yo;
let saveTimer = null;
function persist(now){
  S.updatedAt = Date.now(); clearTimeout(saveTimer);
  const run = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} };
  if (now) run(); else saveTimer = setTimeout(run, 300);
  scheduleDraftSync();
}

// ================= Catálogo: búsqueda =================
function itemById(id){
  if (ACT[id]) return { id, name:ACT[id].nombre, area:ACT[id].area, rf:ACT[id].rf, activo:ACT[id].activo };
  const c = mem().custom.find(x => x.id === id);
  return c ? { id:c.id, name:c.name, area:"Mis actividades", custom:true, rf:c.rf, activo:true } : null;
}
function allItems(){
  return mem().custom.map(c => ({ id:c.id, name:c.name, area:"Mis actividades", custom:true, rf:c.rf }))
    .concat(KC.acts.filter(a => a.activo).sort((a, b) => a.orden - b.orden).map(a => ({ id:a.code, name:a.nombre, area:a.area, rf:a.rf })));
}
function search(q, area){
  const toks = norm(q).split(/\s+/).filter(Boolean);
  let list = allItems();
  if (area === "frecuentes") list = list.filter(x => mem().use[x.id]);
  else if (area === "mias") list = list.filter(x => x.custom);
  else if (area && area !== "todas") list = list.filter(x => !x.custom && x.area === area);
  if (toks.length) list = list.filter(x => { const hay = norm(x.name + " " + x.id + " " + x.area); return toks.every(t => hay.includes(t)); });
  if (toks.length || area === "frecuentes") { const u = mem().use; list = list.slice().sort((a, b) => (u[b.id] || 0) - (u[a.id] || 0)); }
  return list;
}
// Texto vigente de un RF dentro de una actividad: lo editado hoy, si no la versión propia por defecto, si no el oficial
function txt(a, code){
  const L = RFL[code] || { r:"", t:"", c:"", k:"" }, o = a.ov && a.ov[code];
  if (o === "OF") return { r:L.r, t:L.t, c:L.c, k:L.k, src:"of" };
  if (o) return Object.assign({}, o, { src:"edit" });
  const dflt = mem().myDef[code]; if (dflt) return Object.assign({}, dflt, { src:"mine" });
  return { r:L.r, t:L.t, c:L.c, k:L.k, src:"of" };
}
const sameTxt = (x, y) => x && y && x.r === y.r && x.t === y.t && x.c === y.c && x.k === y.k;
function autoMarks(d){ const s = new Set(); d.acts.forEach(a => (a.rf || []).forEach(c => s.add(c))); return s; }

// ================= Aprendizaje e historial =================
function learn(key, v){
  v = String(v || "").trim(); if (!v) return;
  const arr = key === "names" ? mem().names : key === "areaEsp" ? mem().areaEsp : mem().supOtros;
  if (key === "supervisor" && KC.sup.some(s => norm(s) === norm(v))) return;
  const i = arr.findIndex(x => norm(x) === norm(v)); if (i >= 0) arr.splice(i, 1);
  arr.unshift(v); if (arr.length > 80) arr.length = 80;
}
function learnAll(d){ learn("supervisor", d.h.supervisor); if (d.ot) learn("areaEsp", d.ot.areaEsp); if (d.lastDay) { d.aportes.forEach(a => learn("names", a.r)); d.recon.forEach(r => learn("names", r.q)); } }
function upsertHist(entry){
  const h = mem().hist; const i = h.findIndex(e => e.id === entry.id);
  if (i >= 0) h.splice(i, 1, entry); else h.push(entry);
  h.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || b.at - a.at);
  if (h.length > 60) h.length = 60;
}
function archive(d, countUse, estado){
  if (!d.acts.length) return;
  const old = mem().hist.find(e => e.id === d.id);
  const est = estado === "terminado" || (old && old.estado === "terminado") ? "terminado" : "borrador";
  upsertHist({ id:d.id, fecha:d.h.fecha, turno:d.h.turno, sup:d.h.supervisor, area:d.h.area, jornada:d.h.jornada, n:d.acts.length, at:Date.now(), d:clone(d), cloud:false, estado:est });
  if (countUse) d.acts.forEach(a => { mem().use[a.id] = (mem().use[a.id] || 0) + 1; });
  learnAll(d);
  if (CLOUD) { mem().outbox[d.id] = 1; flushOutbox(); }
}
function previous(){ return mem().hist.find(e => e.id !== D().id) || null; }
if (D().h.fecha !== today()) { archive(D(), false); S.draft = newDraft(D()); persist(true); }

// ================= Nube: RIT guardados =================
let cloudBusy = false, NEW_API = true;
const cloudKey = () => mem().team || (ED && ED.key) || "";
const isMissingFn = e => e && (e.status === 404 || /could not find the function|PGRST202/i.test(e.message || ""));
// Copia que se sube: incluye los textos de cada RF tal como salen en el PDF de este supervisor
function cloudData(d){
  const c = clone(d); c.acts.forEach(a => { delete a._open; });
  c.tx = d.acts.map(a => { const o = {}; (a.rf || []).filter(x => RFL[x]).forEach(x => { const T = txt(a, x); o[x] = { r:T.r, t:T.t, c:T.c, k:T.k }; }); return o; });
  return c;
}
async function saveRec(id, fecha, turno, sup, estado, data){
  const k = cloudKey();
  if (NEW_API) {
    try { await rpc("rit_registro_guardar2", { p_clave:k, p_id:id, p_fecha:fecha, p_turno:turno, p_supervisor:sup || "", p_estado:estado, p_data:data }); return true; }
    catch (e) { if (!isMissingFn(e)) throw e; NEW_API = false; }
  }
  if (estado !== "terminado") return false;          // sin la actualización de la base, los borradores no se suben
  await rpc("rit_registro_guardar", { p_clave:k, p_id:id, p_fecha:fecha, p_turno:turno, p_supervisor:sup || "", p_data:data });
  return true;
}
async function flushOutbox(){
  if (!CLOUD || !mem().team || cloudBusy) return;
  cloudBusy = true;
  try {
    for (const id of Object.keys(mem().outbox)) {
      const e = mem().hist.find(x => x.id === id); if (!e) { delete mem().outbox[id]; continue; }
      const ok = await saveRec(e.id, e.fecha, e.turno, e.sup, e.estado || "terminado", cloudData(e.d));
      delete mem().outbox[id]; if (ok) e.cloud = true;
    }
    persist(true); SUM.at = 0;
  } catch (e) { if (e.badKey) { mem().team = ""; persist(true); } }
  cloudBusy = false; if (sheet.hidden) render();
}
// Borrador en la nube: se sube solo unos segundos después del último cambio
let draftTimer = null, draftSig = "", draftState = "";
function scheduleDraftSync(){
  if (!CLOUD || !mem().team || !NEW_API) return;
  clearTimeout(draftTimer); draftTimer = setTimeout(syncDraft, 3500);
}
async function syncDraft(){
  const d = D(); if (!d.acts.length || !mem().team || !NEW_API) return;
  const data = cloudData(d), sig = JSON.stringify(data); if (sig === draftSig) return;
  const old = mem().hist.find(e => e.id === d.id), est = old && old.estado === "terminado" ? "terminado" : "borrador";
  try { draftState = "subiendo"; const ok = await saveRec(d.id, d.h.fecha, d.h.turno, d.h.supervisor, est, data); draftSig = sig; draftState = ok ? "nube" : ""; SUM.at = 0; }
  catch (e) { draftState = e.offline ? "sinred" : ""; if (e.badKey) { mem().team = ""; persist(true); } }
  const el = $("#savestate"); if (el) el.outerHTML = saveStateHtml();
}
// Resumen de los RIT en la nube (para Inicio, Mis RIT, Equipo y el panel)
const SUM = { from:null, rows:[], at:0, loading:false, err:"" };
async function loadSum(fromIso, force){
  if (!CLOUD || !cloudKey() || !NEW_API) return SUM.rows;
  const need = force || !SUM.at || Date.now() - SUM.at > 60000 || (fromIso === null ? SUM.from !== null : SUM.from !== null && fromIso < SUM.from);
  if (!need || SUM.loading) return SUM.rows;
  SUM.loading = true;
  try {
    const rows = await rpc("rit_registros_resumen", { p_clave:cloudKey(), p_desde:fromIso, p_hasta:null, p_limit:fromIso === null ? 1000 : 600 });
    SUM.rows = rows || []; SUM.from = fromIso; SUM.at = Date.now(); SUM.err = "";
  } catch (e) {
    if (isMissingFn(e)) { NEW_API = false; SUM.err = "update"; }
    else SUM.err = e.offline ? "offline" : (e.message || "error");
    if (e.badKey) { mem().team = ""; persist(true); }
  }
  SUM.loading = false; if (sheet.hidden) render(); else if (panel.dataset.kind === "ed") drawEditor();
  return SUM.rows;
}
const DOCS = {};   // documentos completos ya descargados, por id
async function fetchDocs(ids, key){
  const miss = ids.filter(id => !DOCS[id]);
  if (miss.length) { const rows = await rpc("rit_registros_ver", { p_clave:key || cloudKey(), p_ids:miss }); (rows || []).forEach(r => { DOCS[r.id] = r; }); }
  return ids.map(id => DOCS[id]).filter(Boolean);
}

// ================= Render principal =================
function setPath(obj, path, val){ const p = path.split("."); let o = obj; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = val; }
function turnoHtml(d){
  const h = d.h, cfg = KC.cfg || {};
  const sups = KC.sup.concat(mem().supOtros.filter(x => !KC.sup.some(s => norm(s) === norm(x)))).slice(0, 10);
  const supOther = h.supervisor && !sups.some(s => norm(s) === norm(h.supervisor)) ? h.supervisor : "";
  let html = "";
  html += `<section class="card"><h2>Datos del turno</h2>
    <div class="row2">
      <label class="fld"><span>Fecha</span><input type="date" data-bind="h.fecha" value="${esc(h.fecha)}"></label>
      <div class="fld"><span>Turno</span><div class="seg" role="group" aria-label="Turno">
        ${["A","B"].map(t => `<button data-act="set" data-path="h.turno" data-val="${t}" aria-pressed="${h.turno === t}" aria-label="Turno ${t}">${t}</button>`).join("")}</div></div>
    </div>
    <div class="fld"><span>Área / Frente de trabajo</span><div class="seg" role="group" aria-label="Área">
      ${["Área Seca","Área Húmeda"].map(t => `<button data-act="set" data-path="h.area" data-val="${t}" aria-pressed="${h.area === t}">${t}</button>`).join("")}</div></div>
    <div class="fld"><span>Jornada</span><div class="seg" role="group" aria-label="Jornada">
      ${["Día","Noche"].map(t => `<button data-act="set" data-path="h.jornada" data-val="${t}" aria-pressed="${h.jornada === t}">${t}</button>`).join("")}</div></div>
    <div class="fld"><span>Supervisor a cargo</span>
      <div class="chips">${sups.map(s => `<button class="chip" data-act="set" data-path="h.supervisor" data-val="${esc(s)}" aria-pressed="${norm(s) === norm(h.supervisor)}">${esc(s)}</button>`).join("")}</div>
      <div class="auto"><input type="text" placeholder="Otro supervisor: escribe el nombre" data-bind="h.supervisor" data-auto="supervisor" data-rerender value="${esc(supOther)}" autocomplete="off" aria-label="Otro supervisor"></div></div>
    <div class="fld"><span>Nº de asistentes</span><div class="stepper">
      <button data-act="asist" data-d="-1" aria-label="Restar">−</button>
      <input type="text" inputmode="numeric" data-bind="h.asistentes" data-num value="${h.asistentes || ""}" placeholder="0" aria-label="Número de asistentes">
      <button data-act="asist" data-d="1" aria-label="Sumar">+</button></div></div>
    <details class="more"><summary><b>Datos del contrato</b><small>${esc([cfg.gerencia, cfg.superint, cfg.eecc].filter(Boolean).join(", ") || "Sin completar")}</small></summary>
      <div class="inner"><p class="note">Los define Prevención en el catálogo y salen iguales en todos los RIT.</p>
      ${[["gerencia","Gerencia"],["superint","Superintendencia / Dirección"],["eecc","Nombre de EECC"],["contrato","N° Contrato"],["nombreContrato","Nombre del Contrato"]].map(([k, l]) =>
        `<div class="fld"><span>${l}</span><div class="readonly ${cfg[k] ? "" : "empty"}">${esc(cfg[k] || "Sin dato")}</div></div>`).join("")}
      </div></details>
  </section>`;

  return html;
}
function otHtml(d){
  const h = d.h, cfg = KC.cfg || {};
  let html = "";
  const ot = d.ot || {}; const actAreas = [...new Set(d.acts.map(a => (itemById(a.id) || {}).area).filter(x => x && x !== "Mis actividades"))];
  const sugArea = actAreas.join(", ");
  html += `<section class="card"><h2>Orden de Trabajo (OT)</h2>
    <p class="hint">Sale con los mismos datos del RIT: fecha, área seca o húmeda, jornada, turno, actividades y supervisor.</p>
    <label class="fld"><span>Área específica</span><span class="auto" style="display:block"><input type="text" data-bind="ot.areaEsp" data-auto="areaEsp" value="${esc(ot.areaEsp)}" placeholder="Por ejemplo: Chancado Secundario" autocomplete="off"></span></label>
    ${sugArea && sugArea !== ot.areaEsp ? `<div class="chips" style="margin-top:-6px"><button class="chip" data-act="set" data-path="ot.areaEsp" data-val="${esc(sugArea)}">Usar: ${esc(sugArea)}</button></div>` : ""}
    <div class="fld"><span>Tipo de trabajo</span><div class="seg" role="group" aria-label="Tipo de trabajo">
      ${["Planificada","No planificada","Emergente"].map(t => `<button data-act="settog" data-path="ot.tipo" data-val="${t}" aria-pressed="${ot.tipo === t}">${t}</button>`).join("")}</div></div>
    <p class="note" style="margin:0">Inicio, término, equipos, trabajadores, documentos y firmas de Codelco se completan a mano en la hoja.</p>
  </section>`;

  return html;
}
function lastDayHtml(d){
  const h = d.h, cfg = KC.cfg || {};
  let html = "";
  html += `<section class="card lastday"><label class="switch"><span>Hoy es el último día del turno<small>Activa aportes y reconocimientos</small></span>
      <input type="checkbox" data-act="lastday" ${d.lastDay ? "checked" : ""}></label>`;
  if (d.lastDay) {
    html += `<h3>Aportes a la gestión de riesgos</h3>`;
    d.aportes.forEach((a, i) => { html += `<div class="ap">
      <label class="fld"><span>Propuesta ${i + 1}</span><textarea data-bind="aportes.${i}.p" rows="2">${esc(a.p)}</textarea></label>
      <div class="row2"><label class="fld"><span>Responsable</span><span class="auto" style="display:block"><input type="text" data-bind="aportes.${i}.r" data-auto="names" value="${esc(a.r)}" autocomplete="off"></span></label>
      <label class="fld"><span>Fecha</span><input type="date" data-bind="aportes.${i}.f" value="${esc(a.f)}"></label></div></div>`; });
    html += `<h3>Reconocimientos</h3>`;
    d.recon.forEach((r, i) => { html += `<div class="ap">
      <label class="fld"><span>Quién</span><span class="auto" style="display:block"><input type="text" data-bind="recon.${i}.q" data-auto="names" value="${esc(r.q)}" autocomplete="off"></span></label>
      <label class="fld" style="margin-bottom:0"><span>Motivo</span><textarea data-bind="recon.${i}.m" rows="2">${esc(r.m)}</textarea></label></div>`; });
  }
  html += `</section>`;

  return html;
}
// ================= Íconos (línea, mismo trazo en toda la app) =================
const ICONS = {
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  folder:'<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  team:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2"/><path d="M17.5 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  lock:'<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  draft:'<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="m9 16.5 1-3 4.5-4.5 2 2-4.5 4.5z"/>',
  repeat:'<path d="M17 3l3 3-3 3"/><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  ot:'<rect x="5" y="3.5" width="14" height="17.5" rx="1.5"/><path d="M9 3.5V2.5h6v1"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  chev:'<path d="m9.5 6 6 6-6 6"/>',
  down:'<path d="m6 9.5 6 6 6-6"/>',
  back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  dl:'<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/>',
  share:'<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cloud:'<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5 3.75 3.75 0 0 1-.3 7.5z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>',
  cloudoff:'<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5 3.75 3.75 0 0 1-.3 7.5z"/><path d="M4 4l16 16"/>',
  pend:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  phone:'<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M11 18.5h2"/>',
  helmet:'<path d="M3.5 17h17"/><path d="M5 17v-2a7 7 0 0 1 14 0v2"/><path d="M10 8.5V6.5h4v2"/><path d="M12 6.5V12"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2"/>',
  risk:'<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  acts:'<path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11"/><path d="m3.5 6.5 1.3 1.3L7 5.5M3.5 12l1.3 1.3L7 11M3.5 17.5l1.3 1.3L7 16.5"/>',
  contract:'<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 12.5h7M8.5 16h4.5"/>',
  hist:'<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 8v4.5l3 1.8"/>',
  archive:'<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M4.5 8.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8.5M10 12.5h4"/>',
  out:'<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16.5 14.5 12 10 7.5M14.5 12H4"/>',
  user:'<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.8-4 3.8-6.5 7.5-6.5s6.7 2.5 7.5 6.5"/>',
  copy:'<rect x="8.5" y="8.5" width="12" height="12" rx="1.5"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash:'<path d="M4 7h16M10 7V4.5h4V7M6 7l1 13h10l1-13"/>',
  zip:'<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="M10 4v2M10 8v2M10 12v2"/><rect x="8.5" y="15" width="3" height="3" rx=".5"/>',
  left:'<path d="m14.5 6-6 6 6 6"/>'
};
const ic = (n, c) => `<svg class="ic${c ? " " + c : ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

// ================= Fechas para los menús =================
const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"], MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const isoOf = dt => dt.getFullYear() + "-" + String(dt.getMonth()+1).padStart(2,"0") + "-" + String(dt.getDate()).padStart(2,"0");
const dateOf = iso => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const t = dateOf(iso); t.setDate(t.getDate() + n); return isoOf(t); };
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const dShort = iso => { const t = dateOf(iso); return cap1(DIAS[t.getDay()].slice(0, 3)) + " " + t.getDate() + " " + MESES[t.getMonth()]; };
const dLong = iso => { const t = dateOf(iso); return DIAS[t.getDay()] + " " + t.getDate() + " " + MESES[t.getMonth()]; };
function dayLabel(iso){ const t = today(); if (iso === t) return "Hoy"; if (iso === addDays(t, -1)) return "Ayer"; return cap1(DIAS[dateOf(iso).getDay()]); }
// Semana de turno: de miércoles a martes
function weekStart(iso){ const t = dateOf(iso); return addDays(iso, -((t.getDay() - 3 + 7) % 7)); }
function weekLabel(ws){ const we = addDays(ws, 6), a = dateOf(ws), b = dateOf(we); return a.getMonth() === b.getMonth() ? `${a.getDate()} al ${b.getDate()} ${MESES[b.getMonth()]}` : `${a.getDate()} ${MESES[a.getMonth()]} al ${b.getDate()} ${MESES[b.getMonth()]}`; }
function ago(t){ if (!t) return ""; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return "recién"; if (m < 60) return "hace " + m + " min"; const h = Math.round(m / 60); if (h < 24) return "hace " + h + " h"; return stamp(t); }
const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0)).join("").toUpperCase();
const sameName = (a, b) => !!a && !!b && norm(a).replace(/\s+/g, " ").trim() === norm(b).replace(/\s+/g, " ").trim();
const jor = j => String(j || "").toLowerCase();
const recTitle = r => [r.turno ? "Turno " + r.turno : "", jor(r.jornada), r.area].filter(Boolean).join(", ");

// ================= Navegación =================
let VIEW = "inicio", STEP = 0, MIS_F = "semana", EQ_Q = "", EQ_DAYS = 7, GATE_SKIP = false;
const STEPS = ["Turno", "Actividades", "Preparados", "OT", "Cierre"];
function go(view, step){ VIEW = view; if (step !== undefined) STEP = step; render(); window.scrollTo({ top:0 }); if (view === "mis" || view === "equipo" || view === "inicio") loadSum(sumFrom()); }
function sumFrom(){ if (VIEW === "mis" && MIS_F === "todo") return null; const t = today(); const a = addDays(t, -Math.max(EQ_DAYS - 1, 6)), b = VIEW === "mis" && MIS_F === "mes" ? t.slice(0, 8) + "01" : weekStart(t); return [a, b, SUM.from || a].sort()[0]; }
const needGate = () => !mem().yo || (CLOUD && !mem().team && !GATE_SKIP);

function renderStatus(){
  const el = $("#catstatus"); if (!el) return;
  let t, off = false;
  if (!CLOUD) { t = "Catálogo local (la nube aún no está configurada)"; off = true; }
  else if (catState === "ok") t = mem().team ? "Catálogo al día, conectado" : "Catálogo al día, sin clave del equipo";
  else if (catState === "cargando") t = "Buscando la versión vigente del catálogo…";
  else { t = "Sin conexión: usando el catálogo guardado" + (KC.at ? " el " + stamp(KC.at) : ""); off = true; }
  el.className = "status" + (off ? " off" : ""); el.innerHTML = ic(off ? "cloudoff" : "cloud", "s") + esc(t);
}
function renderTop(){
  const top = $("#top"); if (!top) return;
  const d = D();
  if (VIEW === "form") {
    top.innerHTML = `<button class="tbtn back" data-act="tab" data-v="inicio" aria-label="Volver al inicio">${ic("back")}</button>
      <div class="ttl"><h1>RIT ${esc(dShort(d.h.fecha).toLowerCase().replace(/^\w+ /, ""))}, turno ${esc(d.h.turno)}</h1><p>${esc(d.h.supervisor || "Sin supervisor")}</p></div>
      <button class="tbtn" data-act="preview">${ic("eye", "s")}<span>Vista previa</span></button>`;
    return;
  }
  const sub = { inicio:"Radomiro Tomic", mis:"Solo los tuyos", equipo:"Solo para ver" }[VIEW] || "";
  const ttl = { inicio:"RIT Digital", mis:"Mis RIT", equipo:"RIT del equipo" }[VIEW] || "RIT Digital";
  top.innerHTML = `<img src="${LOGO_UI}" alt="Codelco"><div class="ttl"><h1>${ttl}</h1><p>${sub}</p></div>
    ${needGate() ? "" : `<button class="tbtn" data-act="editor" aria-label="Panel de administración">${ic("lock", "s")}<span>Admin</span></button>`}`;
}
function renderBar(){
  const bar = $("#bar"); if (!bar) return;
  if (needGate()) { bar.hidden = true; return; }
  bar.hidden = false;
  if (VIEW === "form") {
    bar.className = "bar";
    bar.innerHTML = (STEP > 0 ? `<button class="btn" data-act="prev">Atrás</button>` : `<button class="btn" data-act="tab" data-v="inicio">Inicio</button>`) +
      (STEP < STEPS.length - 1 ? `<button class="btn primary" data-act="next">Siguiente</button>` : `<button class="btn primary" data-act="download">Descargar</button>`);
    return;
  }
  bar.className = "bar tabbar";
  bar.innerHTML = [["inicio","home","Inicio"],["mis","folder","Mis RIT"],["equipo","team","Equipo"]].map(([v, i, l]) =>
    `<button data-act="tab" data-v="${v}" aria-current="${VIEW === v ? "page" : "false"}">${ic(i)}<span>${l}</span></button>`).join("");
}
function render(){
  renderTop(); renderBar();
  let html;
  if (needGate()) html = gateHtml();
  else if (VIEW === "form") html = formHtml();
  else if (VIEW === "mis") html = misHtml();
  else if (VIEW === "equipo") html = equipoHtml();
  else html = inicioHtml();
  $("#app").innerHTML = html;
  $("#app").className = "v-" + (needGate() ? "gate" : VIEW);
  renderStatus();
  const q = $("#eqq"); if (q) { q.value = EQ_Q; q.addEventListener("input", () => { EQ_Q = q.value; const box = $("#eqlist"); if (box) box.innerHTML = equipoList(); }); }
}

// ---- ¿Quién eres? (primera vez en el celular)
let gatePick = "";
function gateHtml(){
  const sups = KC.sup.slice(); gatePick = gatePick || mem().yo || "";
  const other = gatePick && !sups.some(s => sameName(s, gatePick)) ? gatePick : "";
  const askKey = CLOUD && !mem().team;
  return `<section class="gate">
    <div class="badge">${ic("user", "l")}</div>
    <h2>¿Quién eres?</h2>
    <p>Elige tu nombre una vez. Tus RIT quedan en tu carpeta y el supervisor se llena solo.</p>
    <div class="chips">${sups.map(s => `<button class="chip" data-act="gatepick" data-v="${esc(s)}" aria-pressed="${sameName(s, gatePick)}">${esc(s)}</button>`).join("")}</div>
    <label class="fld"><span>¿No estás en la lista? Escribe tu nombre</span><input type="text" id="gname" value="${esc(other)}" autocomplete="off" placeholder="Nombre y apellido"></label>
    ${askKey ? `<label class="fld"><span>Clave del equipo</span><input type="password" id="gpw" autocomplete="current-password" placeholder="La misma para todos los supervisores"></label>` : ""}
    <button class="btn navy" data-act="gatego">Entrar</button>
    ${askKey ? `<p class="note" style="margin-top:12px">Se pide solo la primera vez en este celular. ¿Sin señal? <button class="linkbtn" data-act="gateskip">Entrar sin nube por ahora</button></p>` : ""}
  </section>`;
}

// ---- Inicio
function myLocal(){ return mem().hist.filter(e => !e.sup || sameName(e.sup, mem().yo)); }
function myRecords(){
  const out = new Map();
  myLocal().forEach(e => out.set(e.id, { id:e.id, fecha:e.fecha, turno:e.turno, supervisor:e.sup, area:e.area || (e.d && e.d.h.area), jornada:e.jornada || (e.d && e.d.h.jornada), n:e.n, estado:e.estado || "terminado", local:e, at:e.at }));
  SUM.rows.filter(r => sameName(r.supervisor, mem().yo)).forEach(r => { const o = out.get(r.id); if (o) { o.cloudRow = r; if (r.estado === "terminado") o.estado = "terminado"; } else out.set(r.id, Object.assign({ cloudRow:r, at:Date.parse(r.updated_at) || 0 }, r)); });
  const d = D(); if (d.acts.length) out.set(d.id, Object.assign(out.get(d.id) || {}, { id:d.id, fecha:d.h.fecha, turno:d.h.turno, supervisor:d.h.supervisor, area:d.h.area, jornada:d.h.jornada, n:d.acts.length, estado:(out.get(d.id) || {}).estado || "borrador", current:true, at:S.updatedAt }));
  return [...out.values()].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.at || 0) - (a.at || 0));
}
// RIT anterior propio (del celular o de la nube) para "Repetir"
function prevRec(){ return myRecords().find(r => !r.current && r.id !== D().id && (r.n || 0) > 0) || null; }
function teamRecords(){ return SUM.rows.filter(r => !sameName(r.supervisor, mem().yo)); }
function inicioHtml(){
  const d = D(), t = today(), ws = weekStart(t), prev = prevRec();
  const mine = myRecords().filter(r => r.fecha >= ws).length, team = teamRecords().filter(r => r.fecha >= ws).length, pend = Object.keys(mem().outbox).length;
  let h = `<div class="hello"><div><small>Supervisor</small><b>${esc(mem().yo)}</b></div><button class="linkbtn" data-act="who">Cambiar</button></div>
    <div id="catstatus" class="status"></div>`;
  if (CLOUD && !mem().team) h += `<div class="banner"><p>Sin clave del equipo tus RIT quedan solo en este celular.</p><button class="ghost" data-act="login">Ingresar clave</button></div>`;
  h += `<button class="shift" data-act="newrit"><span class="d">${esc(dShort(t))}</span><span class="m">Turno ${esc(d.h.turno)}, ${esc(jor(guessJornada()))}</span><span class="go">${ic("plus")}</span><span class="cta">Nuevo RIT de hoy</span></button>`;
  if (d.acts.length) h += `<h3 class="sect">Sigue donde quedaste</h3><div class="list">
    <button class="li" data-act="goform"><span class="ico">${ic("draft")}</span><span class="in"><b>RIT ${esc(dShort(d.h.fecha).toLowerCase().replace(/^\w+ /, ""))}, ${esc(d.h.area)}</b><small>${d.acts.length} ${d.acts.length === 1 ? "actividad" : "actividades"}, ${(mem().hist.find(e => e.id === d.id) || {}).estado === "terminado" ? "terminado; puedes corregirlo" : "guardado " + esc(ago(S.updatedAt))}</small></span><span class="pill">Seguir</span></button></div>`;
  h += `<h3 class="sect">Atajos</h3><div class="list">
    <button class="li" data-act="repeat" ${prev ? "" : "disabled"}><span class="ico">${ic("repeat")}</span><span class="in"><b>Repetir RIT anterior</b><small>${prev ? esc(dLong(prev.fecha)) + ", " + prev.n + (prev.n === 1 ? " actividad" : " actividades") : "Aún no hay RIT anteriores en este celular"}</small></span>${ic("chev", "chev")}</button>
    <button class="li" data-act="goform" data-step="3"><span class="ico">${ic("ot")}</span><span class="in"><b>Orden de Trabajo</b><small>Con los datos del RIT de hoy</small></span>${ic("chev", "chev")}</button></div>`;
  h += `<h3 class="sect">Esta semana<small>miércoles a martes</small></h3><div class="nums"><button data-act="tab" data-v="mis"><b>${mine}</b><small>Mis RIT</small></button><button data-act="tab" data-v="equipo"><b>${CLOUD && mem().team ? team : "–"}</b><small>Del equipo</small></button><div><b>${pend}</b><small>Por subir</small></div></div>`;
  if (SUM.err === "update") h += `<p class="note" style="margin-top:14px">Para ver los RIT del equipo falta ejecutar la actualización de la base de datos (sql/3-menu-y-borradores.sql).</p>`;
  return h;
}

// ---- Mis RIT
function tagsFor(r){
  let t = "";
  if (r.estado === "terminado") t += `<span class="tg ok">${ic("check")}Terminado</span>`;
  else t += `<span class="tg amb">${ic("pend")}${r.current ? "En curso" : "Borrador"}</span>`;
  if (CLOUD) { if (mem().outbox[r.id]) t += `<span class="tg">${ic("phone")}Por subir</span>`; else if (r.cloudRow || (r.local && r.local.cloud) || (r.current && draftState === "nube")) t += `<span class="tg">${ic("cloud")}En la nube</span>`; else if (r.local) t += `<span class="tg">${ic("phone")}En este celular</span>`; }
  return t;
}
function byDay(list, row){
  let h = "", last = null;
  list.forEach(r => {
    if (r.fecha !== last) { if (last !== null) h += `</div>`; const n = list.filter(x => x.fecha === r.fecha).length; h += `<h3 class="day">${dayLabel(r.fecha)}<small>${esc(dLong(r.fecha))}${row === "team" ? ", " + n + " RIT" : ""}</small></h3><div class="list">`; last = r.fecha; }
    h += row === "team" ? teamRow(r) : misRow(r);
  });
  return h + (last !== null ? `</div>` : "");
}
function misRow(r){
  return `<button class="li" data-act="${r.current ? "goform" : "misitem"}" data-id="${esc(r.id)}"><span class="in"><b>${esc(recTitle(r))}</b><small>${r.n || 0} ${r.n === 1 ? "actividad" : "actividades"}</small><span class="tgs">${tagsFor(r)}</span></span>${r.current ? `<span class="pill">Seguir</span>` : ic("chev", "chev")}</button>`;
}
function misHtml(){
  const t = today(); let list = myRecords();
  const from = MIS_F === "semana" ? weekStart(t) : MIS_F === "mes" ? t.slice(0, 8) + "01" : "";
  if (from) list = list.filter(r => (r.fecha || "") >= from);
  let h = `<div class="folder"><span class="ico">${ic("folder")}</span><div><b>${esc(mem().yo)}</b><small>${list.length} ${list.length === 1 ? "RIT" : "RIT"} ${MIS_F === "semana" ? "esta semana (miércoles a martes)" : MIS_F === "mes" ? "este mes" : "en total"}</small></div></div>
    <div class="seg" role="group" aria-label="Período">${[["semana","Esta semana"],["mes","Mes"],["todo","Todo"]].map(([k, l]) => `<button data-act="misf" data-v="${k}" aria-pressed="${MIS_F === k}">${l}</button>`).join("")}</div>`;
  if (!list.length) h += `<div class="emptybox">${ic("folder", "l")}<p>${MIS_F === "semana" ? "Esta semana aún no tienes RIT." : "No hay RIT en este período."}</p><button class="ghost" data-act="newrit">Hacer el RIT de hoy</button></div>`;
  else h += byDay(list, "mis");
  if (SUM.loading) h += `<p class="note center">Buscando tus RIT en la nube…</p>`;
  return h;
}

// ---- Equipo
function teamRow(r){
  return `<button class="li" data-act="eqitem" data-id="${esc(r.id)}"><span class="av">${esc(initials(r.supervisor))}</span><span class="in"><b>${esc(r.supervisor || "Sin supervisor")}</b><small>${esc(recTitle(r))}, ${r.n} act.</small>${r.estado === "borrador" ? `<span class="tgs"><span class="tg amb">${ic("pend")}En curso</span></span>` : ""}</span>${ic("chev", "chev")}</button>`;
}
function equipoList(){
  const t = today(), from = addDays(t, -(EQ_DAYS - 1)), q = norm(EQ_Q).split(/\s+/).filter(Boolean);
  let list = teamRecords().filter(r => (r.fecha || "") >= from);
  if (q.length) list = list.filter(r => { const hay = norm(r.supervisor + " " + r.actividades + " " + r.area); return q.every(x => hay.includes(x)); });
  if (!list.length) return `<div class="emptybox">${ic("team", "l")}<p>${q.length ? "Sin resultados para esa búsqueda." : "Todavía no hay RIT de otros supervisores en estos días."}</p></div>` + moreBtn();
  return byDay(list, "team") + moreBtn();
}
const moreBtn = () => `<button class="more" data-act="eqmore">Ver días anteriores${ic("down", "s")}</button>`;
function equipoHtml(){
  if (!CLOUD) return `<div class="emptybox">${ic("cloudoff", "l")}<p>La app aún no está conectada a la nube.</p></div>`;
  if (!mem().team) return `<div class="emptybox">${ic("lock", "l")}<p>Para ver los RIT del equipo ingresa la clave del equipo.</p><button class="ghost" data-act="login">Ingresar clave</button></div>`;
  if (SUM.err === "update" || !NEW_API) return `<div class="emptybox">${ic("cloudoff", "l")}<p>Falta ejecutar la actualización de la base de datos (sql/3-menu-y-borradores.sql) para ver los RIT del equipo.</p></div>`;
  let h = `<label class="search">${ic("search", "s")}<input type="search" id="eqq" placeholder="Buscar supervisor o actividad" autocomplete="off" aria-label="Buscar supervisor o actividad"></label>`;
  if (!SUM.at && SUM.loading) return h + `<p class="note center">Cargando los RIT del equipo…</p>`;
  if (SUM.err === "offline" && !SUM.at) return h + `<div class="emptybox">${ic("cloudoff", "l")}<p>Sin conexión. Los RIT del equipo se ven con señal.</p></div>`;
  return h + `<div id="eqlist">${equipoList()}</div>`;
}

// ---- Formulario por pasos
function saveStateHtml(){
  const t = !CLOUD || !mem().team ? "Guardado en este celular" : draftState === "nube" ? "Guardado en el celular y en la nube" : draftState === "subiendo" ? "Guardado en el celular, subiendo…" : draftState === "sinred" ? "Guardado en el celular; se sube con señal" : "Guardado en este celular";
  return `<p class="save" id="savestate">${ic("check", "s")}${t}</p>`;
}
function formHtml(){
  const d = D();
  let h = saveStateHtml();
  h += `<nav class="steps" aria-label="Pasos">${STEPS.map((s, i) => `<button data-act="step" data-s="${i}" class="${i === STEP ? "on" : i < STEP ? "ok" : ""}" aria-current="${i === STEP ? "step" : "false"}">${s}</button>`).join("")}</nav>`;
  if (STEP === 0) h += turnoHtml(d);
  else if (STEP === 1) h += actsStepHtml(d);
  else if (STEP === 2) h += prepStepHtml(d);
  else if (STEP === 3) h += sharedHtml(d) + otHtml(d);
  else h += closeStepHtml(d);
  return h;
}
function actsStepHtml(d){
  const prev = prevRec(), hojas = d.acts.length ? ritPaginate(d.acts).length : 1;
  let h = `<section><div class="sechead"><h2>Actividades<span class="count">${d.acts.length}${d.acts.length ? (hojas > 1 ? ", " + hojas + " hojas" : ", 1 hoja") : ""}</span></h2>
    ${prev && !d.acts.length ? `<button class="ghost" data-act="repeat">Repetir RIT del ${short(prev.fecha)}</button>` : ""}</div>`;
  d.acts.forEach((a, i) => { h += actCard(a, i, "acts"); });
  if (d.acts.length < 30) h += `<button class="add" data-act="pick" data-i="new">${ic("plus", "s")}Agregar actividad</button>`;
  if (d.acts.length >= 6) h += `<p class="hint" style="margin:8px 4px 0">Desde la actividad ${d.acts.length >= 7 ? "8" : "7"} el PDF suma otra hoja con el mismo encabezado.</p>`;
  return h + `</section>`;
}
function prepStepHtml(d){
  if (!d.acts.length) return `<div class="emptybox">${ic("acts", "l")}<p>Primero agrega las actividades del turno.</p><button class="ghost" data-act="step" data-s="1">Ir a Actividades</button></div>`;
  let h = `<section><div class="sechead"><h2>¿Estamos preparados?</h2></div><p class="hint" style="margin:0 4px 12px">Cada ítem parte en SÍ. Cambia solo lo que no corresponda.</p>`;
  d.acts.forEach((a, i) => { h += actCard(a, i, "prep"); });
  return h + `</section>`;
}
// Datos que la OT toma del RIT: se muestran para que se vea que no hay que escribirlos de nuevo
function sharedHtml(d){
  const h = d.h;
  return `<section class="card shared"><h2>Viene del RIT</h2><dl>
    <div><dt>Fecha</dt><dd>${esc(fmtDate(h.fecha))}</dd></div><div><dt>Turno</dt><dd>${esc(h.turno)}</dd></div>
    <div><dt>Jornada</dt><dd>${esc(h.jornada)}</dd></div><div><dt>Área</dt><dd>${esc(h.area)}</dd></div>
    <div class="w"><dt>Supervisor</dt><dd>${esc(h.supervisor || "Falta")}</dd></div>
    <div class="w"><dt>Actividades</dt><dd>${d.acts.length ? d.acts.map(a => esc(a.name)).join("<br>") : "Ninguna todavía"}</dd></div></dl>
    <button class="linkbtn" data-act="step" data-s="0">Cambiar datos del turno</button></section>`;
}
function closeStepHtml(d){
  const pr = problems();
  let h = lastDayHtml(d);
  h += `<section class="card"><h2>Revisar y descargar</h2>`;
  if (pr.length) h += `<ul class="todo">${pr.map(p => `<li>${ic("risk", "s")}${esc(p)}</li>`).join("")}</ul>`;
  else h += `<p class="okline">${ic("check", "s")}Todo listo para descargar.</p>`;
  h += `<div class="dlopts">
      <button class="btn primary" data-act="dl" data-k="both" ${pr.length ? "disabled" : ""}>${ic("dl", "s")}RIT y Orden de Trabajo</button>
      <div class="row2"><button class="btn" data-act="dl" data-k="rit" ${pr.length ? "disabled" : ""}>Solo RIT</button><button class="btn" data-act="dl" data-k="ot" ${pr.length ? "disabled" : ""}>Solo OT</button></div>
      ${navigator.share ? `<button class="btn" data-act="share" data-k="both" ${pr.length ? "disabled" : ""}>${ic("share", "s")}Compartir (WhatsApp, correo…)</button>` : ""}
      <button class="btn" data-act="preview">${ic("eye", "s")}Ver vista previa</button></div>
    <p class="note" style="margin:12px 0 0">Al descargar, el RIT queda terminado en Mis RIT${CLOUD && mem().team ? " y en la nube" : ""}.</p></section>`;
  return h;
}

function actCard(a, i, mode){
  const it = itemById(a.id);
  const meta = it && !it.custom ? `${esc(a.id)}, ${esc(it.area)}` : "Actividad propia";
  const codes = (a.rf || []).filter(c => RFL[c]);
  const tags = codes.map(c => `<button class="tag" data-act="rf" data-i="${i}" aria-label="Cambiar RF"><b>RF${c}</b><span>${esc(RFL[c].n)}</span></button>`).join("");
  const anyNo = a.prep.some(x => x === "NO");
  const own = codes.filter(c => txt(a, c).src !== "of").length;
  const prepHtml = `<div class="prep"><span class="lbl">¿Estamos preparados para ejecutarla?</span><div class="prep3">
      ${ITEMS.map((t, k) => `<div class="pr"><span>${t}</span><div class="seg sm" role="group" aria-label="${t}">${PREP_V.map(([v, l]) => `<button data-act="prepset" data-i="${i}" data-k="${k}" data-v="${v}" aria-pressed="${a.prep[k] === v}" class="${v === "NO" && a.prep[k] === v ? "isno" : ""}">${l}</button>`).join("")}</div></div>`).join("")}</div>
      ${anyNo ? `<p class="warn">Con un NO la actividad no debe ejecutarse hasta resolverlo.</p>` : ""}</div>`;
  if (mode === "prep") return `<article class="act"><header><span class="num">${i + 1}</span><div class="t"><b>${esc(a.name)}</b><small>${meta}</small></div></header>${prepHtml}</article>`;
  return `<article class="act">
    <header><span class="num">${i + 1}</span><div class="t"><b>${esc(a.name)}</b><small>${meta}</small></div></header>
    <div class="tags">${tags}${codes.length ? `<button class="tag edit" data-act="rf" data-i="${i}">Cambiar RF</button>` : `<button class="tag need" data-act="rf" data-i="${i}">Elegir RF de esta actividad</button>`}</div>
    ${mode === "acts" ? "" : prepHtml}
    ${codes.length ? `<details ${a._open ? "open" : ""} data-i="${i}"><summary>Riesgo, consecuencia y controles${own ? `<span class="badge mine">${own === 1 ? "1 con tu versión" : own + " con tu versión"}</span>` : ""}</summary><div class="rfd">${codes.map(c => { const T = txt(a, c); return `<div><h4>RF${c} ${esc(RFL[c].n)}${T.src === "mine" ? `<span class="badge mine">Tu versión</span>` : T.src === "edit" ? `<span class="badge mine">Editado</span>` : ""}</h4><p><em>Riesgo:</em> ${esc(T.r)}</p><p><em>Consecuencia:</em> ${esc(ritConsText(T.t, T.c))}</p><p><em>Controles:</em> ${esc(T.k)}</p><button class="ghost sm" data-act="txt" data-i="${i}" data-c="${c}">Editar textos</button></div>`; }).join("")}</div></details>` : ""}
    <footer><button data-act="pick" data-i="${i}">Cambiar actividad</button><button data-act="del" data-i="${i}">Quitar</button></footer>
  </article>`;
}

// ================= Hojas =================
const sheet = $("#sheet"), panel = $("#panel");
let pick = null, rfEdit = null, ED = null, edTab = null, edView = null;
document.addEventListener("toggle", e => { const dt = e.target; if (dt.tagName === "DETAILS" && dt.dataset.i !== undefined) { const a = D().acts[+dt.dataset.i]; if (a) a._open = dt.open; } }, true);
try { const o = JSON.parse(sessionStorage.getItem("rit_ed")); if (o && o.key) ED = o; } catch (e) {}
function openSheet(html, full){ panel.className = "panel" + (full ? " full" : ""); panel.innerHTML = html; panel.dataset.kind = ""; sheet.hidden = false; document.body.style.overflow = "hidden"; }
let fromPreview = false;
function closeSheet(){
  const back = PV && PV.back;
  sheet.hidden = true; panel.innerHTML = ""; panel.dataset.kind = ""; document.body.style.overflow = ""; pick = null; rfEdit = null; edView = null; PV = null; render();
  if (back === "ed" && ED) { drawEditor(); return; }
  if (fromPreview) { fromPreview = false; openPreview(); }
}
// Vuelve a dibujar la pantalla y, si hay una hoja de edición abierta desde el documento, también esa hoja
function rerender(){
  render();
  const k = panel.dataset.kind; if (sheet.hidden || !k) return;
  const y = ($(".sh-body", panel) || {}).scrollTop || 0;
  if (k === "act") drawActSheet(); else if (k === "turno") drawSecSheet("turno"); else if (k === "ot") drawSecSheet("ot"); else if (k === "last") drawSecSheet("last");
  const b = $(".sh-body", panel); if (b) b.scrollTop = y;
}
let actSheetIdx = null;
function drawActSheet(){
  const i = actSheetIdx, a = D().acts[i]; if (!a) { closeSheet(); return; }
  a._open = true; const keep = fromPreview;
  openSheet(`<div class="sh-head"><h2>Actividad ${i + 1}</h2><button class="icon" data-act="close" aria-label="Volver al documento">✕</button></div><div class="sh-body">${actCard(a, i)}</div>
    <div class="sh-foot"><button class="btn primary" data-act="close">${keep ? "Volver al documento" : "Listo"}</button></div>`, true);
  panel.dataset.kind = "act";
}
function drawSecSheet(kind){
  const d = D(); const title = { turno:"Datos del turno", ot:"Orden de Trabajo", last:"Último día del turno" }[kind];
  const html = kind === "turno" ? turnoHtml(d) : kind === "ot" ? otHtml(d) : lastDayHtml(d);
  openSheet(`<div class="sh-head"><h2>${title}</h2><button class="icon" data-act="close" aria-label="Volver al documento">✕</button></div><div class="sh-body">${html}</div>
    <div class="sh-foot"><button class="btn primary" data-act="close">${fromPreview ? "Volver al documento" : "Listo"}</button></div>`, true);
  panel.dataset.kind = kind;
}

function openPicker(slot){
  const hasUse = Object.keys(mem().use).length > 0;
  pick = { slot, area: hasUse ? "frecuentes" : "todas" };
  const chips = [["todas","Todas"]];
  if (hasUse) chips.unshift(["frecuentes","Más usadas"]);
  if (mem().custom.length) chips.push(["mias","Mis actividades"]);
  AREA_LIST.forEach(a => chips.push([a, a]));
  openSheet(`<div class="sh-head"><h2>${slot === "new" ? "Agregar actividad" : "Cambiar actividad"}</h2><button class="icon" data-act="close" aria-label="Cerrar">✕</button></div>
    <div style="padding:0 16px 10px"><input type="search" id="q" placeholder="Busca: cabezal, 201, hidrojet, techo…" autocomplete="off" enterkeyhint="done" aria-label="Buscar actividad"></div>
    <div class="areas" id="areas">${chips.map(([k, v]) => `<button class="chip" data-act="area" data-a="${esc(k)}" aria-pressed="${pick.area === k}">${esc(v)}</button>`).join("")}</div>
    <div class="sh-body" id="res" style="flex:1"></div>`, true);
  const q = $("#q");
  q.addEventListener("input", renderResults);
  q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const v = q.value.trim(); if (!search(v, pick.area).length && v.length >= 3) newActivity(v); else q.blur(); } });
  renderResults(); setTimeout(() => q.focus(), 60);
}
function renderResults(){
  if (!pick) return;
  const qv = ($("#q") || {}).value || ""; const area = qv.trim() ? "todas" : pick.area;
  const list = search(qv, area).slice(0, 150);
  const newBtn = qv.trim().length >= 3 ? `<button class="res new" data-act="newact"><span class="nm">Usar “${esc(qv.trim())}” como actividad nueva</span><span class="meta">Queda en Mis actividades de este celular; eliges sus RF a continuación</span></button>` : "";
  let h = "";
  if (!list.length) h = qv.trim() ? (newBtn || `<p class="empty" style="padding:20px 0">Escribe al menos 3 letras para crearla como actividad nueva.</p>`) : `<p class="empty" style="padding:20px 0">No hay actividades en este grupo todavía.</p>`;
  else {
    let last = null;
    list.forEach(x => {
      if (!qv.trim() && area === "todas" && x.area !== last) { h += `<p class="grp">${esc(x.area)}</p>`; last = x.area; }
      h += `<button class="res" data-act="choose" data-id="${esc(x.id)}"><span class="nm">${esc(x.name)}</span><span class="meta">${x.custom ? "" : `<b>${esc(x.id)}</b>`}${x.rf.length ? x.rf.map(c => "RF" + c).join(", ") : "RF por elegir"}${qv.trim() ? ", " + esc(x.area) : ""}</span></button>`;
    });
    h += newBtn;
  }
  $("#res").innerHTML = h;
}
function placeActivity(it){
  const a = { id:it.id, name:it.name, rf:(it.rf || []).slice(), prep:["SI","SI","SI","SI"], ov:{}, manualRf:false };
  const d = D(); let idx;
  if (pick.slot === "new") { d.acts.push(a); idx = d.acts.length - 1; } else { idx = +pick.slot; d.acts[idx] = a; }
  persist(true); const back = fromPreview; fromPreview = false; closeSheet();
  if (!a.rf.length) { fromPreview = back; openRf(idx); toast("Elige los RF de esta actividad"); }
  else if (back) openPreview();
}
function newActivity(name){
  name = name.trim(); name = name.charAt(0).toUpperCase() + name.slice(1);
  let c = mem().custom.find(x => norm(x.name) === norm(name));
  if (!c) { c = { id:"u" + Date.now(), name, rf:[] }; mem().custom.unshift(c); }
  placeActivity({ id:c.id, name:c.name, custom:true, rf:c.rf });
}
function openRf(i){ rfEdit = { i, sel: D().acts[i].rf.slice() }; drawRf(); }
function rfGrid(sel, act){
  return `<div class="rfpick">${RFO.map(c => { const k = sel.indexOf(c); return `<button data-act="${act}" data-c="${c}" aria-pressed="${k >= 0}"><b>RF${c}</b><span>${esc(RFL[c].n)}</span>${k >= 0 ? `<em>${k + 1}</em>` : ""}</button>`; }).join("")}</div>`;
}
function drawRf(){
  const a = D().acts[rfEdit.i];
  openSheet(`<div class="sh-head"><h2>RF de la actividad</h2><button class="icon" data-act="close" aria-label="Cerrar">✕</button></div>
    <div class="sh-body"><p style="margin:0 0 4px; font-weight:600">${esc(a.name)}</p>
    <p class="hint" style="margin:0 0 12px">Elige hasta 3. Este cambio vale solo para el RIT de hoy; para cambiarlo para todos, se edita en el catálogo.</p>
    ${rfGrid(rfEdit.sel, "rftoggle")}</div>
    <div class="sh-foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="rfdone">Listo</button></div>`);
}
function confirmSheet(title, body, okLabel, onOk){
  confirmSheet.cb = onOk;
  openSheet(`<div class="sh-head"><h2>${esc(title)}</h2></div><div class="sh-body confirm">${body}</div>
    <div class="sh-foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="confirmok">${esc(okLabel)}</button></div>`);
}
function loginSheet(kind){
  const ed = kind === "editor";
  openSheet(`<div class="sh-head"><h2>${ed ? "Editar catálogo" : "Clave del equipo"}</h2><button class="icon" data-act="close" aria-label="Cerrar">✕</button></div>
    <div class="sh-body login"><p>${ed ? "Ingresa tu clave de editor. Los cambios que guardes los verán todos los celulares." : "Con la clave del equipo los RIT se guardan en la nube y se ven desde cualquier celular. Se pide una sola vez."}</p>
    <input type="password" id="pw" autocomplete="current-password" placeholder="Clave" aria-label="Clave">
    </div><div class="sh-foot"><button class="btn" data-act="close">Ahora no</button><button class="btn primary" data-act="${ed ? "edlogin" : "teamlogin"}">Entrar</button></div>`);
  const pw = $("#pw"); setTimeout(() => pw.focus(), 60);
  pw.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $(`[data-act="${ed ? "edlogin" : "teamlogin"}"]`).click(); } });
}
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2800); }

// ================= Edición personal de textos (queda en este celular) =================
let txEdit = null;
function openTxt(i, code){ txEdit = { i, code }; drawTxt(); }
function drawTxt(){
  const a = D().acts[txEdit.i], c = txEdit.code, L = RFL[c], T = txt(a, c), vers = mem().myTexts[c] || [];
  openSheet(`<div class="sh-head"><h2>RF${c} ${esc(L.n)}</h2><button class="icon" data-act="close" aria-label="Cerrar">✕</button></div>
    <div class="sh-body"><p class="note" style="margin-bottom:10px">${esc(a.name)}. Lo que cambies aquí queda en tu celular; el texto oficial solo lo cambia Prevención.</p>
    <div class="fld"><span>Partir desde</span><div class="chips"><button class="chip" data-act="txtver" data-v="of">Texto oficial</button>${vers.map((v, k) => `<button class="chip" data-act="txtver" data-v="${k}">Mi versión ${k + 1}${v.at ? " (" + short(v.at) + ")" : ""}</button>`).join("")}</div></div>
    <label class="fld"><span>Riesgo</span><textarea id="x_r" data-fit="ri" rows="2">${esc(T.r)}</textarea><small class="fit" data-for="x_r"></small></label>
    <div class="fld"><span>Consecuencia</span><select class="selbox" id="x_t" style="margin-bottom:8px">${consOptions(T.t)}</select>
      <textarea id="x_c" data-fit="co" data-tipo="x_t" rows="2">${esc(T.c)}</textarea><small class="fit" data-for="x_c"></small></div>
    <label class="fld"><span>Controles</span><textarea id="x_k" data-fit="ct" rows="4">${esc(T.k)}</textarea><small class="fit" data-for="x_k"></small></label>
    <label class="switch" style="font-size:15px"><span>Usar esta versión en mis próximos RIT<small>Se guarda solo en este celular</small></span><input type="checkbox" id="x_def" checked></label></div>
    <div class="sh-foot"><button class="btn" data-act="txtof">Usar el oficial</button><button class="btn primary" data-act="txtsave">Guardar</button></div>`);
  fitFonts().then(updateFits);
}

// ================= PDF =================
const b64 = x => { const b = atob(x); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
let ASSETS = null;
function assets(){ if (!ASSETS) ASSETS = { logoPng: b64(LOGO_PDF_B64), reversoPdf: b64(REVERSO_B64) }; return ASSETS; }
// Texto de un RF en un documento: el propio se arma en vivo; uno ajeno usa lo que subió su autor
function txtIn(d, i, a, x){
  if (d === S.draft) return txt(a, x);
  const t = d.tx && d.tx[i] && d.tx[i][x]; if (t) return t;
  const L = RFL[x] || { r:"", t:"", c:"", k:"" }, o = a.ov && a.ov[x];
  return o && o !== "OF" ? o : { r:L.r, t:L.t, c:L.c, k:L.k };
}
async function makePdf(reverso, dd){
  if (!window.PDFLib) throw new Error("nolib");
  const d = dd || D(), c = KC.cfg || {};
  const h = { centro:"División Radomiro Tomic", gerencia:c.gerencia, superint:c.superint, area:d.h.area, fecha:fmtDate(d.h.fecha), turno:d.h.turno,
              supervisor:d.h.supervisor, asistentes:d.h.asistentes, eecc:c.eecc, contrato:c.contrato, nombreContrato:c.nombreContrato };
  const acts = d.acts.map((a, i) => ({ name:a.name, prep:a.prep, rows:(a.rf || []).filter(x => RFL[x]).slice(0, 3).map(x => { const T = txtIn(d, i, a, x); return { rf:x, r:T.r, c:ritConsText(T.t, T.c), k:T.k }; }) }));
  const out = await buildRit2(window.PDFLib, assets(), { h, acts, lastDay:d.lastDay, aportes:d.aportes.map(a => ({ p:a.p, r:a.r, f:fmtDate(a.f) })), recon:d.recon }, { reverso });
  return out.bytes;
}
let OT_TPL = null;
async function makeOt(dd){
  if (!window.PDFLib) throw new Error("nolib");
  if (!OT_TPL) OT_TPL = b64(OT_B64);
  const d = dd || D(), c = KC.cfg || {};
  const f = d.h.fecha ? d.h.fecha.split("-").reverse().join("/") : "";
  const out = await buildOt(window.PDFLib, OT_TPL.slice(), { fecha:f, area:d.h.area, areaEsp:(d.ot || {}).areaEsp, jornada:d.h.jornada, tipo:(d.ot || {}).tipo,
    turno:d.h.turno, descs:d.acts.map(a => a.name), jefe:c.jefeOps || "", supervisor:d.h.supervisor });
  return out.bytes;
}
function problems(){
  const d = D(), out = [];
  if (!d.acts.length) out.push("Agrega al menos una actividad.");
  d.acts.forEach((a, i) => { if (!a.rf.length) out.push(`La actividad ${i + 1} no tiene RF.`); });
  if (!String(d.h.supervisor || "").trim()) out.push("Falta el supervisor a cargo.");
  return out;
}
let previewZoom = 1, previewRev = true, previewDoc = "rit";
let PV = null;   // documento de solo lectura en la vista previa: { d, title, sub, own }
async function openPreview(){
  const ro = !!PV;
  const head = ro ? `<button class="icon" data-act="close" aria-label="Volver">${ic("back")}</button><div class="pvt"><h2>${esc(PV.title)}</h2><p>${esc(PV.sub)}</p></div>`
                  : `<h2>Vista previa</h2>`;
  openSheet(`<div class="sh-head">${head}<div class="zoom"><button class="icon" data-act="zoom" data-d="-1" aria-label="Alejar">−</button><span id="zl">${Math.round(previewZoom * 100)}%</span><button class="icon" data-act="zoom" data-d="1" aria-label="Acercar">+</button></div>${ro ? "" : `<button class="icon" data-act="close" aria-label="Cerrar">${ic("close")}</button>`}</div>
    ${ro ? `<p class="ro">${ic("eye", "s")}${PV.own ? "Vista del documento. Para cambiarlo, ábrelo para editar." : "Solo lectura: el RIT de otro supervisor no se puede editar."}</p>` : ""}
    <div class="prevopts"><div class="seg" role="group" aria-label="Documento" style="margin-bottom:10px">${[["rit","RIT"],["ot","Orden de Trabajo"]].map(([k, l]) => `<button data-act="pdoc" data-k="${k}" aria-pressed="${previewDoc === k}">${l}</button>`).join("")}</div>
    ${previewDoc === "rit" ? `<label class="switch"><span>Incluir reverso (guía de consulta)</span><input type="checkbox" data-act="rev" ${previewRev ? "checked" : ""}></label>` : ""}</div>
    ${ro ? "" : `<p class="taphint">Toca cualquier parte del documento para cambiarla.</p>`}
    <div class="pages" id="pages"><p class="msg">Generando el PDF…</p></div>
    <div class="sh-foot">${ro
      ? (PV.own ? `<button class="btn" data-act="pvopen">${ic("edit", "s")}Abrir y editar</button>` : `<button class="btn" data-act="pvbase">${ic("copy", "s")}Usar como base</button>`) + `<button class="btn primary" data-act="pvdl">${ic("dl", "s")}Descargar ${previewDoc === "rit" ? "RIT" : "OT"}</button>`
      : (navigator.share ? `<button class="btn" data-act="share" data-k="${previewDoc}">Compartir</button>` : "") + `<button class="btn primary" data-act="dl" data-k="${previewDoc}">Descargar ${previewDoc === "rit" ? "RIT" : "OT"}</button>`}</div>`, true);
  panel.dataset.kind = ro ? "pv" : "";
  await drawPreview();
}
async function drawPreview(){
  const box = $("#pages"); if (!box) return;
  try {
    const src = PV ? PV.d : undefined;
    const bytes = previewDoc === "rit" ? await makePdf(previewRev, src) : await makeOt(src);
    if (!window.pdfjsLib) { box.innerHTML = `<p class="msg">La vista previa no cargó en este dispositivo. El PDF se puede descargar igual.</p>`; return; }
    const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported:false }).promise;
    box.innerHTML = "";
    const dpr = Math.min(window.devicePixelRatio || 1, 3), cssW = Math.max(280, box.clientWidth - 24) * previewZoom * (previewDoc === "ot" ? 0.8 : 1);
    for (let n = 1; n <= pdf.numPages; n++) {
      const pg = await pdf.getPage(n); const base = pg.getViewport({ scale:1 });
      let scale = (cssW / base.width) * dpr; if (base.width * scale > 7000) scale = 7000 / base.width;
      const vp = pg.getViewport({ scale }); const cv = document.createElement("canvas");
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      cv.style.width = cssW + "px"; cv.style.height = (cssW * base.height / base.width) + "px";
      cv.dataset.page = n - 1; cv.dataset.w = base.width; cv.dataset.h = base.height; cv.className = PV ? "" : "tappable";
      box.appendChild(cv); await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    }
  } catch (e) { box.innerHTML = `<p class="msg">No se pudo generar la vista previa (${esc(e.message || e)}).</p>`; }
}
// ---- Tocar el documento para editar: se traduce el punto tocado a la celda del formato
document.addEventListener("click", e => {
  const cv = e.target.closest && e.target.closest("canvas.tappable"); if (!cv) return;
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * (+cv.dataset.w), y = (e.clientY - r.top) / r.height * (+cv.dataset.h);
  const pg = +cv.dataset.page;
  if (previewDoc === "rit") hitRit(pg, x, y); else hitOt(pg, x, y);
});
function editFrom(fn){ fromPreview = true; fn(); }
function hitRit(pg, x, y){
  const R2 = RIT2, d = D(), pages = d.acts.length ? ritPaginate(d.acts) : [[]];
  if (pg >= pages.length) { toast("El reverso es la guía de consulta: no se edita"); return; }
  const last = pg === pages.length - 1, offset = pages.slice(0, pg).reduce((n, p) => n + p.length, 0);
  if (y >= R2.HDR_TOP && y < R2.HDR_TOP + 3 * R2.HDR_RH) {
    const row = Math.floor((y - R2.HDR_TOP) / R2.HDR_RH), col = R2.HDR_COLS.findIndex((c, i) => x >= c && x < R2.HDR_COLS[i + 1]);
    if (row === 2 || (row === 0 && col <= 2)) { toast("Esos datos del contrato los cambia el administrador en el panel"); return; }
    editFrom(() => drawSecSheet("turno")); return;
  }
  if (y >= R2.BAND_TOP && y < R2.AH_TOP) { toast("Los RF de arriba se marcan solos según las actividades"); return; }
  const slots = last ? R2.PER_LAST : R2.PER_MID;
  if (y >= R2.AH_BOT && y < R2.AH_BOT + slots * R2.BLK_H) {
    const b = Math.floor((y - R2.AH_BOT) / R2.BLK_H), i = offset + b, a = d.acts[i], top = R2.AH_BOT + b * R2.BLK_H, C = R2.COL;
    if (!a) { editFrom(() => openPicker("new")); return; }
    const inC = k => x >= C[k][0] && x < C[k][1];
    if (inC("ri") || inC("co") || inC("ct")) {
      const j = Math.floor((y - top) / (R2.BLK_H / 3)), code = (a.rf || []).filter(c => RFL[c])[j];
      if (code) { editFrom(() => openTxt(i, code)); return; }
    }
    if (inC("si") || inC("no") || inC("na")) {
      const k = Math.floor((y - top) / (R2.BLK_H / 4)); const v = inC("si") ? "SI" : inC("no") ? "NO" : "NA";
      a.prep[k] = v; persist(true); render(); drawPreview(); toast(`${ITEMS[k]}: ${v === "SI" ? "SÍ" : v}`); return;
    }
    if (inC("rf")) { editFrom(() => openRf(i)); return; }
    actSheetIdx = i; editFrom(drawActSheet); return;
  }
  if (last && y >= R2.BOT_TITLE - 12 && y < R2.FOOT) { editFrom(() => drawSecSheet("last")); return; }
}
function hitOt(pg, x, y){
  const G = OT_GEOM, d = D();
  if (y >= G.rowsTop[0] && y < G.rowsTop[G.rowsTop.length - 1]) {
    const r = G.rowsTop.findIndex((t, k) => y >= t && y < G.rowsTop[k + 1]), i = pg * G.PER_SHEET + r;
    if (x < G.desc.x1) { if (d.acts[i]) { actSheetIdx = i; editFrom(drawActSheet); } else editFrom(() => openPicker("new")); return; }
    toast("Equipos asociados y trabajadores se completan a mano en la hoja"); return;
  }
  if (y >= G.fecha.t && y < G.fecha.b && x >= G.areaEsp.x0 && x < G.areaEsp.x1) { editFrom(() => drawSecSheet("ot")); return; }
  if (y >= G.plan.t && y < G.plan.b && x >= 276) { editFrom(() => drawSecSheet("ot")); return; }
  if (y >= G.fecha.t && y < G.turno.b) { editFrom(() => drawSecSheet("turno")); return; }
  if (y >= G.jefe.t && y < G.jefe.b && x < G.sup.x1) { if (x < G.jefe.x1) toast("El jefe de operaciones lo define el administrador"); else editFrom(() => drawSecSheet("turno")); return; }
  toast("Esa parte de la OT se completa a mano en la hoja");
}
function chooseDownload(){
  openSheet(`<div class="sh-head"><h2>Descargar</h2><button class="icon" data-act="close" aria-label="Cerrar">✕</button></div>
    <div class="sh-body"><div class="dlopts">
      <button class="btn primary" data-act="dl" data-k="both">RIT y Orden de Trabajo</button>
      <button class="btn" data-act="dl" data-k="rit">Solo RIT</button>
      <button class="btn" data-act="dl" data-k="ot">Solo Orden de Trabajo</button>
      ${navigator.share ? `<button class="btn" data-act="share" data-k="both">Compartir RIT y OT (WhatsApp, correo…)</button>` : ""}</div>
      <p class="note" style="margin-top:12px">Se descargan como archivos separados, listos para imprimir: el RIT en A3 horizontal y la OT en tamaño carta.</p></div>`);
}
function saveBlob(bytes, name, type){
  const url = URL.createObjectURL(new Blob([bytes], { type:type || "application/pdf" })); const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000);
}
// Descarga de un documento de solo lectura (propio anterior o de otro supervisor)
async function exportOther(d, kind){
  try {
    const sup = String(d.h.supervisor || "").replace(/\s+/g, "_");
    const name = `${kind === "rit" ? "RIT" : "OT"}_${d.h.fecha}_Turno${d.h.turno}${sup ? "_" + sup : ""}.pdf`;
    saveBlob(kind === "rit" ? await makePdf(previewRev, d) : await makeOt(d), name); toast("PDF listo");
  } catch (e) { toast(e.message === "nolib" ? "No cargó el generador de PDF: revisa la conexión." : "No se pudo generar el PDF."); }
}
async function exportDocs(kind, mode){
  const pr = problems(); if (pr.length) { toast(pr[0]); return; }
  const d = D();
  const go = async () => {
    const files = [];
    try {
      if (kind === "rit" || kind === "both") files.push({ name:`RIT_${d.h.fecha}_Turno${d.h.turno}.pdf`, bytes: await makePdf(previewRev) });
      if (kind === "ot" || kind === "both") files.push({ name:`OT_${d.h.fecha}_Turno${d.h.turno}.pdf`, bytes: await makeOt() });
    } catch (e) { toast(e.message === "nolib" ? "No cargó el generador de PDF: revisa la conexión y vuelve a abrir la app." : "No se pudo generar el PDF."); return; }
    if (mode === "share") {
      const fl = files.map(f => new File([f.bytes], f.name, { type:"application/pdf" }));
      if (navigator.canShare && navigator.canShare({ files:fl })) {
        try { await navigator.share({ files:fl, title:fl.map(f => f.name).join(", ") }); done(); } catch (e) { if (e && e.name !== "AbortError") toast("No se pudo compartir."); }
        return;
      }
    }
    files.forEach((f, i) => setTimeout(() => saveBlob(f.bytes, f.name), i * 700));
    done(files.length);
  };
  const done = n => { archive(D(), true, "terminado"); persist(true); if (!sheet.hidden) closeSheet(); else render(); toast((n > 1 ? "RIT y OT listos" : "PDF listo") + (CLOUD && mem().team ? "; quedó terminado en la nube" : "; quedó en Mis RIT")); };
  if (d.acts.some(a => a.prep.some(x => x === "NO"))) confirmSheet("Hay ítems marcados NO", `<p>Con un NO la actividad no debe ejecutarse. ¿Generar de todas formas?</p>`, "Generar", go);
  else go();
}

// ================= Panel de edición del catálogo =================
let FIT_FONT = null, FIT_FONT_B = null;
async function fitFonts(){
  if (!FIT_FONT && window.PDFLib) { const doc = await PDFLib.PDFDocument.create(); FIT_FONT = await doc.embedFont(PDFLib.StandardFonts.Helvetica); FIT_FONT_B = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold); }
  return !!FIT_FONT;
}
function fitMsg(field, text, tipo){
  if (!FIT_FONT) return { cls:"", t:"" };
  const f = RIT2.FIT[field]; let t = String(text || "").replace(/\s+/g, " ").trim();
  if (field === "co") t = ritConsText(tipo, t);
  if (!t) return { cls:"warn", t:"Vacío: la celda quedará en blanco" };
  const r = ritFit(t, f.bold ? FIT_FONT_B : FIT_FONT, f.w, f.h, f.s, f.m, f.lead);
  if (r.cut) return { cls:"bad", t:"Muy largo: en el PDF se cortará. Acórtalo un poco." };
  if (r.s >= f.s - 0.01) return { cls:"ok", t:"Cabe con la letra normal" };
  return { cls:"warn", t:`Cabe, pero con letra más chica (${String(r.s.toFixed(1)).replace(".", ",")} pt)` };
}
function updateFits(){ panel.querySelectorAll("[data-fit]").forEach(inp => { const out = panel.querySelector(`.fit[data-for="${inp.id}"]`); if (!out) return; const tp = inp.dataset.tipo ? ($("#" + inp.dataset.tipo) || {}).value : ""; const m = fitMsg(inp.dataset.fit, inp.value, tp); out.className = "fit " + m.cls; out.textContent = m.t; }); }
const ED_TABS = [["rf","Riesgos (RF)","risk"],["act","Actividades","acts"],["sup","Supervisores","helmet"],["cfg","Contrato","contract"],["log","Cambios","hist"],["key","Claves","key"],["arch","Archivo completo","archive"]];
function edHead(){
  const t = ED_TABS.find(x => x[0] === edTab);
  return `<div class="sh-head">${edTab ? `<button class="icon" data-act="edhome" aria-label="Volver al panel">${ic("back")}</button>` : ""}<h2>${t ? t[1] : "Administración"}</h2>${edTab ? "" : `<button class="icon" data-act="close" aria-label="Cerrar">${ic("close")}</button>`}</div>
    <p class="who"><span>Editando como <b>${esc(ED.nombre)}</b></span><button data-act="edlogout">${ic("out", "s")}Salir</button></p>`;
}
// ---- Inicio del panel: secciones, RIT de hoy por supervisor y archivo
const ADM = { from:"", to:"", rows:[], at:0, loading:false, err:"", week:"" };
async function admLoad(from, to, force){
  if (!force && ADM.from === from && ADM.to === to && Date.now() - ADM.at < 60000) return;
  ADM.loading = true; ADM.err = "";
  try { ADM.rows = await rpc("rit_registros_resumen", { p_clave:ED.key, p_desde:from, p_hasta:to, p_limit:1000 }) || []; ADM.from = from; ADM.to = to; ADM.at = Date.now(); }
  catch (e) { ADM.rows = []; ADM.err = isMissingFn(e) ? "update" : e.offline ? "offline" : e.message; if (isMissingFn(e)) NEW_API = false; }
  ADM.loading = false; if (panel.dataset.kind === "ed" && (edTab === null || edTab === "arch")) drawEditor();
}
function admTodayHtml(){
  const t = today(), rows = ADM.rows.filter(r => r.fecha === t);
  if (ADM.err === "update") return `<p class="note">Para ver quién hizo su RIT falta ejecutar sql/3-menu-y-borradores.sql en Supabase.</p>`;
  if (ADM.err) return `<p class="note">${esc(ADM.err === "offline" ? "Sin conexión: el estado de hoy se ve con señal." : ADM.err)}</p>`;
  if (!ADM.at) return `<p class="note">Cargando…</p>`;
  const st = n => { const rs = rows.filter(r => sameName(r.supervisor, n)); return rs.some(r => r.estado === "terminado") ? "ok" : rs.length ? "cur" : "no"; };
  const extra = [...new Set(rows.map(r => r.supervisor).filter(n => n && !KC.sup.some(s => sameName(s, n))))];
  const names = KC.sup.concat(extra), c = { ok:0, cur:0, no:0 }; names.forEach(n => c[st(n)]++);
  return `<div class="nums"><div><b>${c.ok}</b><small>Terminados</small></div><div><b>${c.cur}</b><small>En curso</small></div><div><b>${c.no}</b><small>Sin RIT</small></div></div>
    <div class="list" style="margin-top:10px">${names.map(n => { const k = st(n), r = rows.find(x => sameName(x.supervisor, n));
      return `<div class="li static"><span class="av">${esc(initials(n))}</span><span class="in"><b>${esc(n)}</b><small>${r ? esc(recTitle(r)) + ", " + r.n + " act." : "Aún no hace su RIT de hoy"}</small></span>
        <span class="tg ${k === "ok" ? "ok" : k === "cur" ? "amb" : ""}">${k === "ok" ? ic("check") + "Terminado" : k === "cur" ? ic("pend") + "En curso" : "Sin RIT"}</span></div>`; }).join("")}</div>
    <p class="note" style="margin-top:8px">Los supervisores que no están de turno hoy aparecen como Sin RIT.</p>`;
}
function edHome(){
  const t = today(), ws = weekStart(t);
  if (!ADM.loading && (ADM.from !== ws || Date.now() - ADM.at > 60000)) setTimeout(() => admLoad(ws, addDays(ws, 6)), 0);
  return `<div class="tiles">${ED_TABS.filter(x => x[0] !== "arch").map(([k, l, i]) => {
      const sub = { rf:RFO.length + " RF oficiales", act:KC.acts.length + " y sus RF", sup:KC.sup.length + " nombres", cfg:"N° y jefe de operaciones", log:"Historial y restaurar", key:"Editor y equipo" }[k];
      return `<button data-act="edtab" data-t="${k}">${ic(i)}<b>${l}</b><small>${esc(sub)}</small></button>`; }).join("")}</div>
    <h3 class="sect" style="margin-top:20px">Hoy<small>${esc(dLong(t))}</small></h3>${admTodayHtml()}
    <div class="list" style="margin-top:16px"><button class="li" data-act="edtab" data-t="arch"><span class="ico">${ic("archive")}</span><span class="in"><b>Archivo completo</b><small>Todos los RIT por semana. Descarga la semana en ZIP.</small></span>${ic("chev", "chev")}</button></div>`;
}
// ---- Archivo: semana de turno (miércoles a martes)
function edArch(){
  const ws = ADM.week || (ADM.week = weekStart(today())), we = addDays(ws, 6);
  if (!ADM.loading && (ADM.from !== ws || ADM.to !== we)) setTimeout(() => admLoad(ws, we), 0);
  const rows = ADM.from === ws ? ADM.rows : [], fin = rows.filter(r => r.estado === "terminado").length;
  let h = `<div class="weeknav"><button class="icon" data-act="archwk" data-d="-7" aria-label="Semana anterior">${ic("left")}</button><div><b>Semana del ${esc(weekLabel(ws))}</b><small>Miércoles a martes</small></div><button class="icon" data-act="archwk" data-d="7" aria-label="Semana siguiente" ${addDays(ws, 7) > today() ? "disabled" : ""}>${ic("chev")}</button></div>`;
  if (ADM.err) return h + `<p class="note">${esc(ADM.err === "update" ? "Falta ejecutar sql/3-menu-y-borradores.sql en Supabase." : ADM.err === "offline" ? "Sin conexión." : ADM.err)}</p>`;
  if (ADM.loading || ADM.from !== ws) return h + `<p class="note">Cargando…</p>`;
  if (!rows.length) return h + `<div class="emptybox">${ic("archive", "l")}<p>No hay RIT en esta semana.</p></div>`;
  h += `<p class="note">${rows.length} RIT, ${fin} terminados${rows.length - fin ? ", " + (rows.length - fin) + " en curso" : ""}.</p>`;
  return h + byDay(rows.map(r => Object.assign({}, r)), "team").replace(/data-act="eqitem"/g, 'data-act="architem"');
}
function edArchFoot(){ return `<div class="sh-foot"><button class="btn primary" data-act="archzip" ${ADM.rows.length && ADM.from === ADM.week ? "" : "disabled"}>${ic("zip", "s")}Descargar semana en ZIP</button></div>`; }
function loadScript(src){ return new Promise((ok, bad) => { const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = () => bad(new Error("No cargó " + src)); document.head.appendChild(sc); }); }
async function zipWeek(btn){
  const rows = ADM.rows.slice(); if (!rows.length) return;
  btn.disabled = true;
  try {
    if (!window.fflate) await loadScript("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");
    const docs = []; for (let i = 0; i < rows.length; i += 40) docs.push(...await fetchDocs(rows.slice(i, i + 40).map(r => r.id), ED.key));
    const files = {}, used = {};
    for (let i = 0; i < docs.length; i++) {
      const r = docs[i], d = r.data; if (!d || !d.acts || !d.acts.length) continue;
      btn.textContent = `Generando ${i + 1} de ${docs.length}…`;
      let base = `${d.h.fecha}_Turno${d.h.turno}_${String(d.h.supervisor || "Sin_supervisor").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_")}${r.estado === "borrador" ? "_borrador" : ""}`;
      used[base] = (used[base] || 0) + 1; if (used[base] > 1) base += "_" + used[base];
      files[base + "_RIT.pdf"] = await makePdf(previewRev, d);
      files[base + "_OT.pdf"] = await makeOt(d);
    }
    const zip = fflate.zipSync(files, { level:0 });
    saveBlob(zip, `RIT_semana_${ADM.week}.zip`, "application/zip"); toast("ZIP listo");
  } catch (e) { toast(e.offline ? "Sin conexión: el ZIP se arma con señal." : "No se pudo armar el ZIP (" + (e.message || e) + ")"); }
  btn.disabled = false; btn.innerHTML = `${ic("zip", "s")}Descargar semana en ZIP`;
}
async function openEditor(){
  if (!CLOUD) { toast("Primero hay que conectar la app a Supabase (archivo config.js)."); return; }
  if (!ED) { loginSheet("editor"); return; }
  await fitFonts(); drawEditor();
}
function drawEditor(){
  let body = "";
  if (edTab === null) body = edHome();
  else if (edTab === "arch") body = edArch();
  else if (edTab === "rf") body = edView && edView.rf ? edRfForm(edView.rf) : edRfList();
  else if (edTab === "act") body = edView && edView.act !== undefined ? edActForm(edView.act) : edActList();
  else if (edTab === "sup") body = edSup();
  else if (edTab === "cfg") body = edCfg();
  else if (edTab === "log") body = `<div id="logbox"><p class="msg">Cargando cambios…</p></div>`;
  else if (edTab === "key") body = edKeys();
  const y = panel.dataset.kind === "ed" && edTab === drawEditor.last ? (($("#edbody") || {}).scrollTop || 0) : 0; drawEditor.last = edTab;
  openSheet(edHead() + `<div class="sh-body" style="flex:1" id="edbody">${body}</div>` + (edTab === "arch" ? edArchFoot() : edFoot()), true);
  panel.dataset.kind = "ed"; if (y) $("#edbody").scrollTop = y;
  updateFits();
  if (edTab === "act" && (!edView || edView.act === undefined)) { const q = $("#eq"); if (q) q.addEventListener("input", () => { $("#elist").innerHTML = edActRows(q.value); }); }
  if (edTab === "log") loadLog();
}
function edFoot(){
  if (edTab === "rf" && edView && edView.rf) return `<div class="sh-foot"><button class="btn" data-act="edback">Volver</button><button class="btn primary" data-act="edsaverf">Guardar para todos</button></div>`;
  if (edTab === "act" && edView && edView.act !== undefined) return `<div class="sh-foot"><button class="btn" data-act="edback">Volver</button><button class="btn primary" data-act="edsaveact">Guardar para todos</button></div>`;
  if (edTab === "sup") return `<div class="sh-foot"><button class="btn primary" data-act="edsavesup">Guardar lista</button></div>`;
  if (edTab === "cfg") return `<div class="sh-foot"><button class="btn primary" data-act="edsavecfg">Guardar datos del contrato</button></div>`;
  return "";
}
function edRfList(){
  return `<p class="note">Toca un riesgo para cambiar su texto. El nombre del RF viene impreso en el formato Codelco y no se cambia.</p>` +
    RFO.map(c => { const L = RFL[c]; return `<button class="erow" data-act="edrf" data-c="${c}"><b>RF${c} ${esc(L.n)}</b><small>${L.by ? "Editado el " + esc(stamp(L.at)) + " por " + esc(L.by) : "Texto inicial"}</small></button>`; }).join("");
}
function consOptions(sel){ const list = CONS_TIPOS.slice(); if (sel && !list.includes(sel)) list.unshift(sel); return list.map(x => `<option value="${esc(x)}" ${x === sel ? "selected" : ""}>${esc(x === "Otra" ? "Otra (solo el detalle)" : x)}</option>`).join(""); }
function edRfForm(c){
  const L = RFL[c];
  return `<p class="fixed-name">RF${c} ${esc(L.n)}</p><p class="note">Lo que guardes aquí sale en todos los RIT desde ahora.</p>
    <label class="fld"><span>Riesgo</span><textarea id="f_r" data-fit="ri" rows="2">${esc(L.r)}</textarea><small class="fit" data-for="f_r"></small></label>
    <div class="fld"><span>Consecuencia</span><select class="selbox" id="f_t" style="margin-bottom:8px">${consOptions(L.t)}</select>
      <textarea id="f_c" data-fit="co" data-tipo="f_t" rows="2" placeholder="Detalle, por ejemplo: amputación o aplastamiento">${esc(L.c)}</textarea><small class="fit" data-for="f_c"></small></div>
    <label class="fld"><span>Controles</span><textarea id="f_k" data-fit="ct" rows="5">${esc(L.k)}</textarea><small class="fit" data-for="f_k"></small></label>`;
}
function edActRows(q){
  const toks = norm(q).split(/\s+/).filter(Boolean);
  let list = KC.acts.slice().sort((a, b) => a.orden - b.orden);
  if (toks.length) list = list.filter(a => { const h = norm(a.nombre + " " + a.code + " " + a.area); return toks.every(t => h.includes(t)); });
  return list.slice(0, 250).map(a => `<button class="erow ${a.activo ? "" : "off"}" data-act="edact" data-c="${esc(a.code)}"><b>${esc(a.nombre)}</b><small>${esc(a.code)}, ${esc(a.area)}, ${a.rf.length ? a.rf.map(x => "RF" + x).join(" ") : "sin RF"}${a.activo ? "" : ", oculta"}</small></button>`).join("") || `<p class="empty">Sin resultados.</p>`;
}
function edActList(){
  return `<div class="addrow" style="margin-bottom:8px"><input type="search" id="eq" placeholder="Buscar actividad" autocomplete="off" aria-label="Buscar actividad"><button class="ghost" data-act="edact" data-c="">+ Nueva</button></div><div id="elist">${edActRows("")}</div>`;
}
function nextCode(area){
  const same = KC.acts.filter(a => a.area === area && /^\d+\.\d+$/.test(a.code));
  if (same.length) { const p = same[0].code.split(".")[0]; const mx = Math.max(...same.map(a => +a.code.split(".")[1])); return p + "." + (mx + 1); }
  const mx = Math.max(0, ...KC.acts.filter(a => /^\d+\.\d+$/.test(a.code)).map(a => +a.code.split(".")[0]));
  return (mx + 1) + ".1";
}
function edActForm(code){
  const a = code ? ACT[code] : null;
  const v = edView.draft || (edView.draft = a ? { code:a.code, area:a.area, nombre:a.nombre, rf:a.rf.slice(), activo:a.activo, nuevo:false }
                                              : { code:nextCode(AREA_LIST[0]), area:AREA_LIST[0], nombre:"", rf:[], activo:true, nuevo:true });
  return `<p class="fixed-name">${v.nuevo ? "Nueva actividad" : esc(v.code)}</p>
    <label class="fld"><span>Área</span><select class="selbox" id="a_area">${AREA_LIST.concat(v.area && !AREA_LIST.includes(v.area) ? [v.area] : []).map(x => `<option ${x === v.area ? "selected" : ""}>${esc(x)}</option>`).join("")}<option value="__nueva">Otra área…</option></select></label>
    <label class="fld" id="a_newarea_w" hidden><span>Nombre del área nueva</span><input type="text" id="a_newarea" autocomplete="off"></label>
    ${v.nuevo ? `<label class="fld"><span>Código</span><input type="text" id="a_code" value="${esc(v.code)}" autocomplete="off"></label>` : ""}
    <label class="fld"><span>Nombre corto (como sale en el PDF)</span><input type="text" id="a_nombre" data-fit="act" value="${esc(v.nombre)}" autocomplete="off"><small class="fit" data-for="a_nombre"></small></label>
    <div class="fld"><span>RF de la actividad (hasta 3, en orden)</span>${rfGrid(v.rf, "edactrf")}</div>
    <label class="switch" style="margin-top:8px"><span>Visible para los supervisores<small>Si la apagas, deja de aparecer en el buscador</small></span><input type="checkbox" id="a_activo" ${v.activo ? "checked" : ""}></label>`;
}
function readActForm(){
  const v = edView.draft; if (!v) return v;
  const ar = $("#a_area"); if (ar) v.area = ar.value === "__nueva" ? (($("#a_newarea") || {}).value || "").trim() : ar.value;
  const cd = $("#a_code"); if (cd) v.code = cd.value.trim();
  const nm = $("#a_nombre"); if (nm) v.nombre = nm.value;
  const ac = $("#a_activo"); if (ac) v.activo = ac.checked;
  return v;
}
function edSup(){
  if (!edView || !edView.sup) edView = { sup: KC.sup.slice() };
  return `<p class="note">Esta lista aparece como botones en todos los celulares.</p>
    <ul class="supl">${edView.sup.map((s, i) => `<li><span>${esc(s)}</span><button data-act="supup" data-i="${i}" aria-label="Subir">↑</button><button data-act="supdel" data-i="${i}" aria-label="Quitar">✕</button></li>`).join("")}</ul>
    <div class="addrow"><input type="text" id="s_new" placeholder="Nombre y apellido" autocomplete="off" aria-label="Nuevo supervisor"><button class="ghost" data-act="supadd">Agregar</button></div>`;
}
function edCfg(){
  const c = KC.cfg || {};
  return `<p class="note">Estos datos salen en el encabezado de todos los RIT.</p>` +
    [["gerencia","Gerencia"],["superint","Superintendencia / Dirección"],["eecc","Nombre de EECC"],["contrato","N° Contrato"],["nombreContrato","Nombre del Contrato"],["jefeOps","Jefe de operaciones (firma en la OT)"]]
      .map(([k, l]) => `<label class="fld"><span>${l}</span><input type="text" id="c_${k}" value="${esc(c[k] || "")}" autocomplete="off"></label>`).join("");
}
function edKeys(){
  return `<p class="note">La clave del equipo es la que usan los supervisores para guardar los RIT en la nube. Mínimo 6 caracteres.</p>
    <label class="fld"><span>Nueva clave mía (${esc(ED.nombre)})</span><input type="password" id="k_yo" autocomplete="new-password"></label>
    <button class="ghost" data-act="keysave" data-q="yo" style="margin-bottom:22px">Cambiar mi clave</button>
    <label class="fld"><span>Nueva clave del equipo</span><input type="password" id="k_equipo" autocomplete="new-password"></label>
    <button class="ghost" data-act="keysave" data-q="equipo">Cambiar clave del equipo</button>`;
}
const FIELD_NAMES = { riesgo:"riesgo", cons_tipo:"tipo de consecuencia", consecuencia:"consecuencia", controles:"controles", nombre:"nombre", area:"área", rf:"RF", activo:"visible" };
async function loadLog(){
  const box = $("#logbox"); if (!box) return;
  try {
    const rows = await rpc("rit_cambios_listar", { p_clave:ED.key, p_limit:80 });
    window.__ritLog = rows || [];
    if (!rows || !rows.length) { box.innerHTML = `<p class="empty">Todavía no hay cambios.</p>`; return; }
    box.innerHTML = rows.map((r, idx) => {
      const what = r.tabla === "rf" ? "RF" + r.clave : r.tabla === "actividad" ? "Actividad " + r.clave : r.tabla === "supervisores" ? "Lista de supervisores" : r.tabla === "contrato" ? "Datos del contrato" : "Clave " + (r.clave === "equipo" ? "del equipo" : "personal");
      let changed = [], diff = "";
      if (r.antes && r.despues && typeof r.antes === "object" && !Array.isArray(r.antes)) {
        Object.keys(r.despues).forEach(k => { if (k === "code") return; const a = JSON.stringify(r.antes[k]), b = JSON.stringify(r.despues[k]); if (a !== b) { changed.push(FIELD_NAMES[k] || k); diff += `<div class="diff"><b>${esc(FIELD_NAMES[k] || k)}</b><div class="old">Antes: ${esc(Array.isArray(r.antes[k]) ? r.antes[k].join(", ") : r.antes[k])}</div><div class="new">Ahora: ${esc(Array.isArray(r.despues[k]) ? r.despues[k].join(", ") : r.despues[k])}</div></div>`; } });
      } else if (r.tabla === "supervisores") { diff = `<div class="diff"><div class="old">Antes: ${esc((r.antes || []).join(", "))}</div><div class="new">Ahora: ${esc((r.despues || []).join(", "))}</div></div>`; }
      else if (!r.antes && r.despues) changed.push("creada");
      const canRestore = (r.tabla === "rf" || r.tabla === "actividad") && r.antes;
      return `<div class="chg"><b>${esc(what)}${changed.length ? ": " + esc(changed.join(", ")) : ""}</b><small>${esc(stamp(r.at))}, ${esc(r.editor || "")}</small>
        ${diff ? `<details><summary>Ver qué cambió</summary>${diff}${canRestore ? `<button class="ghost" data-act="restore" data-idx="${idx}">Restaurar lo de antes</button>` : ""}</details>` : ""}</div>`;
    }).join("");
  } catch (e) { box.innerHTML = `<p class="msg">${esc(e.offline ? "Sin conexión: los cambios se ven con internet." : e.message)}</p>`; if (e.badKey) edLogout(); }
}
function edLogout(){ ED = null; try { sessionStorage.removeItem("rit_ed"); } catch (e) {} }
async function edSave(fn, body, okMsg){
  const btn = panel.querySelector(".sh-foot .primary"); if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  try {
    await rpc(fn, Object.assign({ p_clave: ED.key }, body));
    await refreshCatalog(true);
    toast(okMsg || "Guardado: todos lo verán al abrir la app"); return true;
  } catch (e) {
    toast(e.offline ? "Sin conexión: no se guardó. Inténtalo con señal." : e.message);
    if (e.badKey) { edLogout(); closeSheet(); }
    return false;
  } finally { if (btn) { btn.disabled = false; } }
}

// ================= Acciones de los menús =================
// Documento completo de un RIT: del celular si está, si no desde la nube
async function recData(id){
  if (D().id === id) return D();
  const l = mem().hist.find(e => e.id === id); if (l && l.d) return l.d;
  if (!CLOUD || !cloudKey()) { toast("Ese RIT está en la nube: ingresa la clave del equipo."); return null; }
  try { const [r] = await fetchDocs([id]); if (r && r.data && r.data.acts) return r.data; toast("No se encontró ese RIT."); }
  catch (e) { toast(e.offline ? "Sin conexión: los RIT de la nube se ven con señal." : e.message); }
  return null;
}
function findRow(id){ return myRecords().find(r => r.id === id) || SUM.rows.find(r => r.id === id) || null; }
async function openRemote(id, own){
  const r = findRow(id); toast("Abriendo…");
  const d = await recData(id); if (!d) return;
  PV = { d, id, own, title: own ? "RIT " + dShort(d.h.fecha).toLowerCase().replace(/^\w+ /, "") : (d.h.supervisor || (r && r.supervisor) || "Sin supervisor"),
         sub: dLong(d.h.fecha) + ", " + recTitle({ turno:d.h.turno, jornada:d.h.jornada, area:d.h.area }) };
  previewDoc = "rit"; $("#toast").classList.remove("on"); openPreview();
}
// Copia las actividades de otro RIT al RIT abierto (repetir, copiar a hoy o usar como base)
function copyActsFrom(src, fecha, who){
  const d = D();
  const apply = () => {
    d.acts = clone(src.acts).map(a => ({ id:a.id, name:a.name, rf:(a.rf || []).slice(), prep:["SI","SI","SI","SI"], ov:a.ov || {}, manualRf:!!a.manualRf, _open:false }));
    syncDraftWithCatalog(); persist(true); PV = null; if (!sheet.hidden) { sheet.hidden = true; panel.innerHTML = ""; document.body.style.overflow = ""; }
    go("form", 1); toast(`Se copiaron ${d.acts.length} actividades${who ? " de " + who : ""} del ${fmtDate(fecha)}`);
  };
  if (d.acts.length) confirmSheet("Reemplazar actividades", `<p>Las ${d.acts.length} actividades del RIT abierto se cambiarán por las del ${esc(fmtDate(fecha))}${who ? " de " + esc(who) : ""}.</p>`, "Reemplazar", apply);
  else apply();
}
async function openForEdit(id){
  const src = await recData(id); if (!src) return;
  const d = D(); if (d.id !== id) archive(d, false);
  const c = clone(src); delete c.tx; c.acts.forEach(a => { a.prep = a.prep || ["SI","SI","SI","SI"]; a.ov = a.ov || {}; });
  if (!mem().hist.find(e => e.id === id)) upsertHist({ id:c.id, fecha:c.h.fecha, turno:c.h.turno, sup:c.h.supervisor, area:c.h.area, jornada:c.h.jornada, n:c.acts.length, at:Date.now(), d:clone(c), cloud:true, estado:(findRow(id) || {}).estado || "terminado" });
  S.draft = c; persist(true); PV = null; if (!sheet.hidden) { sheet.hidden = true; panel.innerHTML = ""; document.body.style.overflow = ""; }
  go("form", 0); toast(`RIT del ${fmtDate(c.h.fecha)} abierto para editar`);
}
function misSheet(id){
  const r = myRecords().find(x => x.id === id); if (!r) return;
  openSheet(`<div class="sh-head"><h2>${esc(dayLabel(r.fecha))}, ${esc(dLong(r.fecha))}</h2><button class="icon" data-act="close" aria-label="Cerrar">${ic("close")}</button></div>
    <div class="sh-body"><p class="note">${esc(recTitle(r))}, ${r.n} ${r.n === 1 ? "actividad" : "actividades"}</p><div class="list">
      <button class="li" data-act="pvmine" data-id="${esc(id)}"><span class="ico">${ic("eye")}</span><span class="in"><b>Ver documento</b><small>RIT y OT tal como se imprimen</small></span>${ic("chev", "chev")}</button>
      <button class="li" data-act="open" data-id="${esc(id)}"><span class="ico">${ic("edit")}</span><span class="in"><b>Abrir y editar</b><small>Corregir este RIT</small></span>${ic("chev", "chev")}</button>
      <button class="li" data-act="copy" data-id="${esc(id)}"><span class="ico">${ic("copy")}</span><span class="in"><b>Copiar a hoy</b><small>Mismas actividades en el RIT de hoy</small></span>${ic("chev", "chev")}</button>
      ${r.estado === "borrador" ? `<button class="li danger" data-act="delbor" data-id="${esc(id)}"><span class="ico">${ic("trash")}</span><span class="in"><b>Borrar borrador</b><small>Se borra del celular y de la nube</small></span></button>` : ""}
    </div></div>`);
}
function whoSheet(){
  openSheet(`<div class="sh-head"><h2>¿Quién eres?</h2><button class="icon" data-act="close" aria-label="Cerrar">${ic("close")}</button></div>
    <div class="sh-body"><p class="note">Tus RIT se ordenan en la carpeta con tu nombre.</p>
    <div class="chips">${KC.sup.map(x => `<button class="chip" data-act="whopick" data-v="${esc(x)}" aria-pressed="${sameName(x, mem().yo)}">${esc(x)}</button>`).join("")}</div>
    <div class="addrow"><input type="text" id="whoname" placeholder="Otro nombre" autocomplete="off" aria-label="Otro nombre"><button class="ghost" data-act="whopick" data-v="">Usar</button></div></div>`);
}
function setYo(name){
  name = String(name || "").trim(); if (!name) return false;
  const old = mem().yo; mem().yo = name;
  const d = D(); if (!d.h.supervisor || sameName(d.h.supervisor, old)) d.h.supervisor = name;
  learn("supervisor", name); persist(true); return true;
}

// ================= Eventos =================
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el || el.tagName === "INPUT") return;
  const act = el.dataset.act, d = D();
  switch (act) {
    case "tab": PV = null; go(el.dataset.v); break;
    case "goform": go("form", el.dataset.step !== undefined ? +el.dataset.step : STEP); break;
    case "step": STEP = +el.dataset.s; render(); window.scrollTo({ top:0 }); break;
    case "next": STEP = Math.min(STEPS.length - 1, STEP + 1); render(); window.scrollTo({ top:0 }); break;
    case "prev": STEP = Math.max(0, STEP - 1); render(); window.scrollTo({ top:0 }); break;
    case "newrit": if (d.acts.length) { archive(d, false); S.draft = newDraft(d); persist(true); toast("RIT nuevo con los datos del turno"); } go("form", 0); break;
    case "who": whoSheet(); break;
    case "whopick": { const v = el.dataset.v || (($("#whoname") || {}).value || ""); if (setYo(v)) { closeSheet(); toast("Listo: " + mem().yo); loadSum(sumFrom(), true); } break; }
    case "gatepick": { const pw = ($("#gpw") || {}).value || ""; gatePick = el.dataset.v; const n = $("#gname"); if (n) n.value = ""; render(); const p2 = $("#gpw"); if (p2) { p2.value = pw; if (!pw) p2.focus(); } break; }
    case "gatego": case "gateskip": {
      const name = ((($("#gname") || {}).value || "").trim()) || gatePick;
      if (!name) { toast("Elige tu nombre"); break; }
      if (act === "gatego" && CLOUD && !mem().team) {
        const k = ($("#gpw") || {}).value || ""; if (!k) { toast("Escribe la clave del equipo"); break; }
        el.disabled = true;
        try { const r = await rpc("rit_login", { p_clave:k }); mem().team = k; mem().teamWho = r.nombre; Object.assign(mem().outbox, Object.fromEntries(mem().hist.filter(x => !x.cloud).map(x => [x.id, 1]))); }
        catch (er) { el.disabled = false; toast(er.offline ? "Sin conexión: puedes entrar sin nube por ahora." : er.message); break; }
      }
      if (act === "gateskip") GATE_SKIP = true;
      setYo(name); go("inicio"); if (mem().team) { toast("Listo: los RIT se guardarán en la nube"); flushOutbox(); loadSum(sumFrom(), true); } break; }
    case "misf": MIS_F = el.dataset.v; render(); loadSum(sumFrom()); break;
    case "misitem": misSheet(el.dataset.id); break;
    case "pvmine": openRemote(el.dataset.id, true); break;
    case "eqitem": openRemote(el.dataset.id, false); break;
    case "eqmore": EQ_DAYS += 7; loadSum(addDays(today(), -(EQ_DAYS - 1)), true); render(); break;
    case "pvbase": { const p = PV; if (p) copyActsFrom(p.d, p.d.h.fecha, p.own ? "" : p.d.h.supervisor); break; }
    case "pvopen": { const p = PV; if (p) openForEdit(p.id); break; }
    case "pvdl": if (PV) exportOther(PV.d, previewDoc); break;
    case "delbor": { const id = el.dataset.id; confirmSheet("Borrar borrador", `<p>Este borrador se borra de este celular${CLOUD && mem().team ? " y de la nube" : ""}. Los RIT terminados no se pueden borrar.</p>`, "Borrar", async () => {
        try { if (CLOUD && cloudKey() && NEW_API) await rpc("rit_borrador_borrar", { p_clave:cloudKey(), p_id:id }); }
        catch (er) { toast(er.offline ? "Sin conexión: inténtalo con señal." : er.message); render(); return; }
        mem().hist = mem().hist.filter(e => e.id !== id); delete mem().outbox[id]; SUM.rows = SUM.rows.filter(r => r.id !== id); persist(true); render(); toast("Borrador borrado"); });
      break; }
    case "set": setPath(d, el.dataset.path, el.dataset.val); if (el.dataset.path === "h.supervisor") learn("supervisor", el.dataset.val); persist(true); rerender(); break;
    case "asist": { const n = Math.max(0, (parseInt(d.h.asistentes, 10) || 0) + (+el.dataset.d)); d.h.asistentes = n; persist(); const inp = $('[data-bind="h.asistentes"]'); if (inp) inp.value = n || ""; break; }
    case "pick": openPicker(el.dataset.i); break;
    case "area": { pick.area = el.dataset.a; document.querySelectorAll("#areas .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.a === pick.area)); const q = $("#q"); if (q) q.value = ""; renderResults(); break; }
    case "choose": { const it = itemById(el.dataset.id); if (it) placeActivity(it); break; }
    case "newact": newActivity(($("#q") || {}).value || ""); break;
    case "rf": openRf(+el.dataset.i); break;
    case "rftoggle": { const c = el.dataset.c, k = rfEdit.sel.indexOf(c);
      if (k >= 0) rfEdit.sel.splice(k, 1); else if (rfEdit.sel.length >= 3) { toast("El formato admite 3 RF por actividad"); break; } else rfEdit.sel.push(c);
      const y = ($(".sh-body", panel) || {}).scrollTop || 0; drawRf(); const b = $(".sh-body", panel); if (b) b.scrollTop = y; break; }
    case "rfdone": { const a = d.acts[rfEdit.i]; a.rf = rfEdit.sel.slice(); a.manualRf = true; a.ov = a.ov || {}; Object.keys(a.ov).forEach(k => { if (!a.rf.includes(k)) delete a.ov[k]; });
      const cu = mem().custom.find(x => x.id === a.id); if (cu) cu.rf = a.rf.slice();
      persist(true); closeSheet(); break; }
    case "prepset": { const a = d.acts[+el.dataset.i]; a.prep[+el.dataset.k] = el.dataset.v; persist(true); rerender(); break; }
    case "txt": openTxt(+el.dataset.i, el.dataset.c); break;
    case "txtver": { const c = txEdit.code, L = RFL[c]; const v = el.dataset.v === "of" ? { r:L.r, t:L.t, c:L.c, k:L.k } : (mem().myTexts[c] || [])[+el.dataset.v];
      if (!v) break; $("#x_r").value = v.r; $("#x_c").value = v.c; $("#x_k").value = v.k; const sel = $("#x_t"); sel.innerHTML = consOptions(v.t); updateFits(); break; }
    case "txtof": { const a = d.acts[txEdit.i], c = txEdit.code; a.ov = a.ov || {}; a.ov[c] = "OF"; delete mem().myDef[c]; a._open = true; persist(true); closeSheet(); toast(`RF${c} volvió al texto oficial`); break; }
    case "txtsave": { const a = d.acts[txEdit.i], c = txEdit.code, L = RFL[c];
      const v = { r:$("#x_r").value.trim(), t:$("#x_t").value, c:$("#x_c").value.trim(), k:$("#x_k").value.trim() };
      if (!v.r || !v.k) { toast("Riesgo y controles no pueden quedar vacíos"); break; }
      a.ov = a.ov || {}; a._open = true;
      if (sameTxt(v, { r:L.r, t:L.t, c:L.c, k:L.k })) { a.ov[c] = "OF"; delete mem().myDef[c]; persist(true); closeSheet(); toast("Quedó igual al texto oficial"); break; }
      a.ov[c] = v;
      const list = mem().myTexts[c] = (mem().myTexts[c] || []).filter(x => !sameTxt(x, v));
      list.unshift(Object.assign({ at: today() }, v)); if (list.length > 6) list.length = 6;
      const asDefault = $("#x_def").checked;
      if (asDefault) mem().myDef[c] = v; else if (mem().myDef[c] && sameTxt(mem().myDef[c], v)) delete mem().myDef[c];
      persist(true); closeSheet(); toast(asDefault ? "Guardado: se usará en tus próximos RIT" : "Guardado solo para esta actividad"); break; }
    case "del": d.acts.splice(+el.dataset.i, 1); persist(true); if (panel.dataset.kind === "act") closeSheet(); else render(); toast("Actividad quitada"); break;
    case "repeat": { const r = prevRec(); if (!r) break; const src = await recData(r.id); if (src) copyActsFrom(src, src.h.fecha, ""); break; }
    case "copy": { const id = el.dataset.id; const src = await recData(id); if (src) copyActsFrom(src, src.h.fecha, ""); break; }
    case "open": openForEdit(el.dataset.id); break;
    case "new": archive(d, false); S.draft = newDraft(d); persist(true); go("form", 0); toast("RIT nuevo con los datos del turno"); break;
    case "preview": openPreview(); break;
    case "download": chooseDownload(); break;
    case "dl": exportDocs(el.dataset.k, "download"); break;
    case "share": exportDocs(el.dataset.k, "share"); break;
    case "pdoc": previewDoc = el.dataset.k; openPreview(); break;
    case "settog": { const cur = el.dataset.path.split(".").reduce((o, k) => o && o[k], d); setPath(d, el.dataset.path, cur === el.dataset.val ? "" : el.dataset.val); persist(true); rerender(); break; }
    case "zoom": previewZoom = Math.min(3, Math.max(1, previewZoom + (+el.dataset.d) * 0.5)); $("#zl").textContent = Math.round(previewZoom * 100) + "%"; drawPreview(); break;
    case "confirmok": { const cb = confirmSheet.cb; sheet.hidden = true; panel.innerHTML = ""; document.body.style.overflow = ""; if (cb) cb(); break; }
    case "close": closeSheet(); break;
    case "login": loginSheet("team"); break;
    case "teamlogin": { const k = ($("#pw") || {}).value || ""; if (!k) break; el.disabled = true;
      try { const r = await rpc("rit_login", { p_clave:k }); mem().team = k; mem().teamWho = r.nombre; persist(true); closeSheet(); toast("Listo: los RIT se guardarán en la nube"); Object.assign(mem().outbox, Object.fromEntries(mem().hist.filter(x => !x.cloud).map(x => [x.id, 1]))); flushOutbox(); loadSum(sumFrom(), true); }
      catch (er) { el.disabled = false; toast(er.offline ? "Sin conexión: inténtalo cuando tengas señal." : er.message); } break; }
    // ---- panel de edición
    case "editor": openEditor(); break;
    case "edlogin": { const k = ($("#pw") || {}).value || ""; if (!k) break; el.disabled = true;
      try { const r = await rpc("rit_login", { p_clave:k }); if (r.rol !== "editor") { el.disabled = false; toast("Esa clave no es de editor"); break; }
        ED = { key:k, nombre:r.nombre }; try { sessionStorage.setItem("rit_ed", JSON.stringify(ED)); } catch (er) {} edTab = null; edView = null; ADM.at = 0; await fitFonts(); drawEditor(); }
      catch (er) { el.disabled = false; toast(er.offline ? "Sin conexión: inténtalo cuando tengas señal." : er.message); } break; }
    case "edlogout": edLogout(); closeSheet(); toast("Saliste del modo edición"); break;
    case "edtab": edTab = el.dataset.t; edView = null; drawEditor(); break;
    case "edhome": edTab = null; edView = null; drawEditor(); break;
    case "archwk": ADM.week = addDays(ADM.week || weekStart(today()), +el.dataset.d); drawEditor(); break;
    case "architem": { const id = el.dataset.id; const r = ADM.rows.find(x => x.id === id); try { toast("Abriendo…"); const [doc] = await fetchDocs([id], ED.key); if (!doc) { toast("No se encontró ese RIT."); break; }
        PV = { back:"ed", d:doc.data, id, own:false, title:doc.supervisor || "Sin supervisor", sub:dLong(doc.fecha) + ", " + recTitle(r || {}) }; previewDoc = "rit"; $("#toast").classList.remove("on"); openPreview(); }
      catch (er) { toast(er.offline ? "Sin conexión." : er.message); } break; }
    case "archzip": zipWeek(el); break;
    case "edback": edView = null; drawEditor(); break;
    case "edrf": edView = { rf: el.dataset.c }; drawEditor(); break;
    case "edsaverf": { const c = edView.rf; const ok = await edSave("rit_guardar_rf", { p_code:c, p_nombre:RFL[c].n, p_riesgo:$("#f_r").value, p_cons_tipo:$("#f_t").value, p_consecuencia:$("#f_c").value, p_controles:$("#f_k").value }, `RF${c} guardado: todos lo verán al abrir la app`); if (ok) { edView = null; drawEditor(); } break; }
    case "edact": edView = { act: el.dataset.c }; drawEditor(); break;
    case "edactrf": { const v = readActForm(); const c = el.dataset.c, k = v.rf.indexOf(c);
      if (k >= 0) v.rf.splice(k, 1); else if (v.rf.length >= 3) { toast("El formato admite 3 RF por actividad"); break; } else v.rf.push(c);
      const y = ($("#edbody") || {}).scrollTop || 0; drawEditor(); const b = $("#edbody"); if (b) b.scrollTop = y; break; }
    case "edsaveact": { const v = readActForm();
      if (!v.area) { toast("Escribe el nombre del área nueva"); break; }
      if (!v.code) { toast("Falta el código"); break; }
      if (v.nuevo && ACT[v.code]) { toast(`El código ${v.code} ya existe`); break; }
      if (!v.nombre.trim()) { toast("Falta el nombre de la actividad"); break; }
      const ok = await edSave("rit_guardar_actividad", { p_code:v.code, p_area:v.area, p_nombre:v.nombre, p_rf:v.rf, p_activo:v.activo }, "Actividad guardada: todos la verán al abrir la app");
      if (ok) { edView = null; drawEditor(); } break; }
    case "supadd": { const inp = $("#s_new"); const v = (inp.value || "").trim(); if (!v) break; if (!edView.sup.some(s => norm(s) === norm(v))) edView.sup.push(v); drawEditor(); break; }
    case "supdel": edView.sup.splice(+el.dataset.i, 1); drawEditor(); break;
    case "supup": { const i = +el.dataset.i; if (i > 0) { const t = edView.sup[i - 1]; edView.sup[i - 1] = edView.sup[i]; edView.sup[i] = t; } drawEditor(); break; }
    case "edsavesup": { const ok = await edSave("rit_guardar_supervisores", { p_lista:edView.sup }, "Lista de supervisores guardada"); if (ok) { edView = null; drawEditor(); } break; }
    case "edsavecfg": { const v = {}; ["gerencia","superint","eecc","contrato","nombreContrato","jefeOps"].forEach(k => v[k] = ($("#c_" + k).value || "").trim());
      await edSave("rit_guardar_config", { p_valor:v }, "Datos del contrato guardados"); break; }
    case "restore": { const r = (window.__ritLog || [])[+el.dataset.idx]; if (!r || !r.antes) break; const a = r.antes; let ok;
      if (r.tabla === "rf") ok = await edSave("rit_guardar_rf", { p_code:a.code, p_nombre:a.nombre, p_riesgo:a.riesgo, p_cons_tipo:a.cons_tipo || "", p_consecuencia:a.consecuencia, p_controles:a.controles }, "Se restauró el texto anterior");
      else ok = await edSave("rit_guardar_actividad", { p_code:a.code, p_area:a.area, p_nombre:a.nombre, p_rf:a.rf, p_activo:a.activo }, "Se restauró la versión anterior");
      if (ok) loadLog(); break; }
    case "keysave": { const q = el.dataset.q, inp = $(q === "yo" ? "#k_yo" : "#k_equipo"), v = inp.value;
      if (v.length < 6) { toast("La clave debe tener al menos 6 caracteres"); break; }
      try { await rpc("rit_cambiar_clave", { p_clave:ED.key, p_quien:q, p_nueva:v }); inp.value = "";
        if (q === "yo") { ED.key = v; try { sessionStorage.setItem("rit_ed", JSON.stringify(ED)); } catch (er) {} }
        if (q === "equipo") { mem().team = v; persist(true); }
        toast(q === "yo" ? "Tu clave quedó cambiada" : "Clave del equipo cambiada: avísale al equipo");
      } catch (er) { toast(er.offline ? "Sin conexión." : er.message); } break; }
  }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.act === "lastday") { D().lastDay = el.checked; persist(true); rerender(); return; }
  if (el.dataset.act === "rev") { previewRev = el.checked; drawPreview(); return; }
  if (el.id === "f_t" || el.id === "x_t") { updateFits(); return; }
  if (el.id === "a_area") { const w = $("#a_newarea_w"); if (w) w.hidden = el.value !== "__nueva"; const v = edView && edView.draft; if (v && v.nuevo && el.value !== "__nueva") { const cd = $("#a_code"); if (cd) cd.value = nextCode(el.value); } return; }
  if (el.dataset.bind) { if (el.dataset.auto) learn(el.dataset.auto, el.value); persist(true); if (el.dataset.rerender) render(); }
});
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.fit) { updateFits(); return; }
  if (!el.dataset.bind) return;
  let v = el.value; if (el.dataset.num !== undefined) v = parseInt(v.replace(/\D/g, ""), 10) || 0;
  setPath(D(), el.dataset.bind, v); persist();
  if (el.dataset.auto) showSug(el);
});
document.addEventListener("focusin", e => { if (e.target.dataset && e.target.dataset.auto) showSug(e.target); });
document.addEventListener("focusout", e => { if (e.target.dataset && e.target.dataset.auto) setTimeout(() => hideSug(e.target), 160); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
function showSug(inp){
  const key = inp.dataset.auto; const src = key === "names" ? mem().names : key === "areaEsp" ? mem().areaEsp : mem().supOtros;
  const q = norm(inp.value).trim(), toks = q.split(/\s+/).filter(Boolean);
  const list = src.filter(s => norm(s) !== q && toks.every(t => norm(s).includes(t))).slice(0, 6);
  hideSug(inp); if (!list.length) return;
  const box = document.createElement("div"); box.className = "sug";
  box.innerHTML = list.map(s => `<button type="button" data-v="${esc(s)}">${esc(s)}</button>`).join("");
  box.addEventListener("pointerdown", ev => { const b = ev.target.closest("button"); if (!b) return; ev.preventDefault();
    inp.value = b.dataset.v; setPath(D(), inp.dataset.bind, inp.value); learn(key, inp.value); persist(true); hideSug(inp); if (inp.dataset.rerender) render(); else inp.blur(); });
  inp.parentNode.appendChild(box);
}
function hideSug(inp){ const p = inp.parentNode; if (p) p.querySelectorAll(".sug").forEach(x => x.remove()); }

// ================= Arranque =================
render();
if (CLOUD) {
  refreshCatalog(); flushOutbox(); loadSum(sumFrom());
  let lastCheck = Date.now();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - lastCheck > 30000) { lastCheck = Date.now(); refreshCatalog(!sheet.hidden); flushOutbox(); loadSum(sumFrom(), true); } });
  window.addEventListener("online", () => { refreshCatalog(!sheet.hidden); flushOutbox(); });
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
