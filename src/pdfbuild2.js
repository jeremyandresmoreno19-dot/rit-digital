// ===== Nuevo formato RIT (A3 horizontal, letra grande, SÍ/NO/NA, varias hojas) =====
const RIT2 = {
  PW: 1191, PH: 842.25, X0: 28.5, X1: 1162.5, CB: 8.6,
  COL: { act:[28.5,178.5], item:[178.5,278.5], si:[278.5,302.5], no:[302.5,326.5], na:[326.5,350.5],
         rf:[350.5,392.5], ri:[392.5,567.5], co:[567.5,772.5], ct:[772.5,1162.5] },
  HDR_COLS: [28.5, 312, 595.5, 879, 1162.5], HDR_TOP: 68, HDR_RH: 20,
  BAND_TOP: 132, BAND_H: 20, RFG_TOP: 156, RFG_RH: 25,
  AH_TOP: 237, AH_MID: 258, AH_BOT: 273, BLK_H: 72, PER_LAST: 6, PER_MID: 7,
  BOT_TITLE: 721, BOT_HTOP: 726, BOT_HBOT: 741, BOT_RH: 16.5, FOOT: 815,
  FIT: { ri:{ w:167, h:20, s:8.4, m:6.2 }, co:{ w:197, h:20, s:8.4, m:6.2 }, ct:{ w:382, h:20, s:7.8, m:5.6 }, act:{ w:136, h:68, s:10, m:7.5, bold:true, lead:1.2 } },
  GRID: [
    [["01","Energía eléctrica"],["02","Trabajo en altura"],["03","Maniobras de izaje"],["04","Liberación descontrolada de energías"],["05","Caída de rocas en mina rajo"],["06","Incendio"],["07","Sustancias peligrosas"],["08","Tronaduras y explosivos"]],
    [["09","Partes móviles"],["10","Vehículos"],["11","Espacios confinados"],["13","Caída de objetos"],["20","Sílice"],["22","Falla de estructuras para tránsito"],["24","Taludes"],["25","Equipos mineros e industriales"]],
    [["26","Equipos autónomos"],["27","Atropello"],["29","Caída a cuerpos líquidos"],["30","Tiro y arrastre"],["31","Incendio de equipos mineros e industriales"],null,null,null]
  ],
  ITEMS: ["Instructivos y/o PTS","Materiales","Herramientas","EPP"]
};
RIT2.CODES = RIT2.GRID.flat().filter(Boolean).map(x => x[0]);

function ritSan(s){
  return String(s == null ? "" : s).normalize("NFC").replace(/[\r\n\t]+/g, " ").replace(/[\u02BC]/g, "'")
    .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2022\u2026\u20AC\u2018\u2019\u201C\u201D]/g, "").replace(/\s+/g, " ").trim();
}
function ritWrap(text, font, size, maxW){
  const words = text.split(" "), lines = []; let cur = "";
  for (let w of words) {
    while (font.widthOfTextAtSize(w, size) > maxW && w.length > 1) {
      let k = w.length; while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > maxW) k--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(w.slice(0, k)); w = w.slice(k);
    }
    const cand = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(cand, size) <= maxW) cur = cand; else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function ritFit(text, font, maxW, maxH, size, min, lead){
  lead = lead || 1.16;
  for (let s = size; s >= min - 0.001; s -= 0.2) { const lines = ritWrap(text, font, s, maxW); if (lines.length * s * lead <= maxH) return { s, lines, lead, cut:false }; }
  const s = min; let lines = ritWrap(text, font, s, maxW); let cut = false;
  const maxLines = Math.max(1, Math.floor((maxH + 1) / (s * lead)));
  if (lines.length > maxLines) {
    cut = true; lines = lines.slice(0, maxLines); let last = lines[maxLines - 1];
    while (last.length && font.widthOfTextAtSize(last + "…", s) > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last.replace(/\s+$/, "") + "…";
  }
  return { s, lines, lead, cut };
}
function ritConsText(tipo, det){
  tipo = String(tipo || "").trim(); det = String(det || "").trim();
  if (!tipo || tipo === "Otra") return det;
  return det ? tipo + ": " + det : tipo;
}
function ritPaginate(acts){
  if (acts.length <= RIT2.PER_LAST) return [acts];
  const pages = []; let rest = acts.slice();
  while (rest.length > RIT2.PER_LAST) { pages.push(rest.slice(0, RIT2.PER_MID)); rest = rest.slice(RIT2.PER_MID); }
  pages.push(rest); return pages;
}

// D = { h:{centro,gerencia,superint,area,fecha(dd-mm-aaaa),turno,supervisor,asistentes,eecc,contrato,nombreContrato},
//       acts:[{name, prep:["SI"|"NO"|"NA"|""...], rows:[{rf,r,c,k}]}], lastDay, aportes:[{p,r,f}], recon:[{q,m}] }
async function buildRit2(PDFLib, assets, D, opts){
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = PDFLib;
  opts = opts || {};
  const R = RIT2, H = R.PH;
  const doc = await PDFDocument.create();
  doc.setTitle("RIT " + (D.h.fecha || "") + " Turno " + (D.h.turno || ""));
  doc.setAuthor("Codelco · División Radomiro Tomic"); doc.setSubject("Reunión de Inicio de Turno"); doc.setCreator("RIT Digital");
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(assets.logoPng);
  const hex = h => rgb(parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255);
  const NAVY = hex("#14284A"), INK = hex("#0F172A"), DATA = hex("#0B1F3F"), GRID = hex("#C5CBD4"), GREY = hex("#5B6576"), SUB = hex("#C9D3E6"), WHITE = rgb(1,1,1);
  const round = LineCapStyle ? LineCapStyle.Round : 1;
  const marks = new Set(); (D.acts || []).forEach(a => (a.rows || []).forEach(r => r && r.rf && marks.add(r.rf)));
  const pages = ritPaginate((D.acts || []).filter(Boolean));
  const mid = k => (R.COL[k][0] + R.COL[k][1]) / 2;

  for (let pi = 0; pi < pages.length; pi++) {
    const page = doc.addPage([R.PW, H]); const acts = pages[pi]; const last = pi === pages.length - 1; const n = pi + 1, total = pages.length;
    const T = (s, x, base, font, size, color, anchor, cs) => {
      s = ritSan(s); if (!s) return 0; cs = cs || 0;
      const w = font.widthOfTextAtSize(s, size) + cs * Math.max(s.length - 1, 0);
      if (anchor === "c") x -= w / 2; else if (anchor === "r") x -= w;
      if (!cs) page.drawText(s, { x, y: H - base, size, font, color });
      else { let xx = x; for (const ch of s) { page.drawText(ch, { x: xx, y: H - base, size, font, color }); xx += font.widthOfTextAtSize(ch, size) + cs; } }
      return w;
    };
    const hl = (x0, x1, t, color, w) => page.drawLine({ start:{ x:x0, y:H - t }, end:{ x:x1, y:H - t }, thickness: w || 0.6, color: color || GRID });
    const vl = (x, t0, t1, color, w) => page.drawLine({ start:{ x, y:H - t0 }, end:{ x, y:H - t1 }, thickness: w || 0.6, color: color || GRID });
    const fillR = (x0, t0, x1, t1, color) => page.drawRectangle({ x:x0, y:H - t1, width:x1 - x0, height:t1 - t0, color });
    const box = (x, top, mark) => {
      page.drawRectangle({ x, y: H - top - R.CB, width: R.CB, height: R.CB, borderColor: INK, borderWidth: 0.7, color: WHITE });
      if (mark) {
        const c = R.CB, p1 = [x + c*.18, top + c*.52], p2 = [x + c*.42, top + c*.80], p3 = [x + c*.96, top + c*.10];
        page.drawLine({ start:{ x:p1[0], y:H - p1[1] }, end:{ x:p2[0], y:H - p2[1] }, thickness:1.5, color:DATA, lineCap:round });
        page.drawLine({ start:{ x:p2[0], y:H - p2[1] }, end:{ x:p3[0], y:H - p3[1] }, thickness:1.5, color:DATA, lineCap:round });
      }
    };
    const fitbox = (s, x0, x1, top, h, size, mn, o) => {
      o = o || {}; s = ritSan(s); if (!s) return;
      const font = o.bold ? FB : F, pad = o.pad == null ? 4 : o.pad, lead = o.lead || 1.16;
      const r = ritFit(s, font, x1 - x0 - 2 * pad, h - 4, size, mn, lead);
      const lh = r.s * lead, bh = (r.lines.length - 1) * lh + r.s * 0.72; const base = top + (h - bh) / 2 + r.s * 0.72;
      r.lines.forEach((ln, i) => T(ln, o.align === "c" ? (x0 + x1) / 2 : x0 + pad, base + i * lh, font, r.s, o.color || DATA, o.align === "c" ? "c" : "l"));
    };

    // Logo, título y hoja
    page.drawImage(logo, { x: 28.5, y: H - 24 - 30, width: 30 * logo.width / logo.height, height: 30 });
    T("REUNIÓN DE INICIO DE TURNO (RIT)", 595.5, 50, FB, 21, INK, "c");
    T(`Hoja ${n} de ${total}`, R.X1, 47, FB, 11, INK, "r");
    // Encabezado
    const h = D.h;
    const rows = [[["Centro de trabajo:", h.centro || "División Radomiro Tomic"], ["Gerencia:", h.gerencia], ["Superintendencia / Dirección:", h.superint], ["Área / Frente de trabajo:", h.area]],
                  [["Fecha:", h.fecha], ["Turno (A-B):", h.turno], ["Supervisor a cargo:", h.supervisor], ["Nº de asistentes:", h.asistentes ? String(h.asistentes) : ""]],
                  [["Nombre de EECC:", h.eecc], ["N° Contrato:", h.contrato], ["Nombre del Contrato:", h.nombreContrato], null]];
    for (let r = 0; r < 4; r++) hl(R.X0, R.X1, R.HDR_TOP + r * R.HDR_RH);
    R.HDR_COLS.forEach((x, i) => vl(x, R.HDR_TOP, R.HDR_TOP + (i !== 3 ? 3 : 2) * R.HDR_RH));
    rows.forEach((row, r) => row.forEach((cell, i) => {
      if (!cell) return;
      const x = R.HDR_COLS[i] + 6, base = R.HDR_TOP + r * R.HDR_RH + 13.6;
      const w = T(cell[0], x, base, FB, 8.5, GREY);
      const xe = (r === 2 && i === 2) ? R.HDR_COLS[4] : R.HDR_COLS[i + 1];
      let v = ritSan(cell[1]), z = 9.5; const avail = xe - x - w - 10;
      while (z > 6.5 && FB.widthOfTextAtSize(v, z) > avail) z -= 0.25;
      while (v.length && FB.widthOfTextAtSize(v, z) > avail) v = v.slice(0, -1);
      T(v, x + w + 5, base, FB, z, DATA);
    }));
    // Banda y grilla RF (marcadas según las actividades)
    fillR(R.X0, R.BAND_TOP, R.X1, R.BAND_TOP + R.BAND_H, NAVY);
    const t1 = "RIESGOS DE FATALIDAD PRESENTES EN EL TURNO", t2 = "Se marcan según los RF de las actividades · evento top, energía y controles críticos de cada uno, al reverso";
    const w1 = FB.widthOfTextAtSize(t1, 9.5) + 1.0 * (t1.length - 1), w2 = F.widthOfTextAtSize(ritSan(t2), 7.5);
    const gx = (R.X0 + R.X1) / 2 - (w1 + 12 + w2) / 2;
    T(t1, gx, R.BAND_TOP + 13.6, FB, 9.5, WHITE, "l", 1.0); T(t2, gx + w1 + 12, R.BAND_TOP + 13.4, F, 7.5, SUB);
    const cw = (R.X1 - R.X0) / 8;
    for (let r = 0; r < 4; r++) hl(R.X0, R.X1, R.RFG_TOP + r * R.RFG_RH);
    for (let i = 0; i < 9; i++) vl(R.X0 + i * cw, R.RFG_TOP, R.RFG_TOP + 3 * R.RFG_RH);
    R.GRID.forEach((row, r) => row.forEach((cell, i) => {
      if (!cell) return;
      const [code, name] = cell, x = R.X0 + i * cw, top = R.RFG_TOP + r * R.RFG_RH;
      box(x + 6, top + R.RFG_RH / 2 - R.CB / 2, marks.has(code));
      const tx = x + 20, lab = "RF" + code, wl = FB.widthOfTextAtSize(lab + " ", 8);
      let lines = ritWrap(ritSan(name), F, 8, x + cw - 4 - tx - wl);
      if (lines.length > 1) lines = [lines[0]].concat(ritWrap(lines.slice(1).join(" "), F, 8, x + cw - 4 - tx));
      const lh = 9.2, base = top + (R.RFG_RH - (lines.length - 1) * lh) / 2 + 2.9;
      T(lab, tx, base, FB, 8, INK);
      lines.forEach((ln, k) => T(ln, tx + (k === 0 ? wl : 0), base + k * lh, F, 8, INK));
    }));
    // Encabezado de la tabla
    const C = R.COL;
    fillR(C.act[0], R.AH_TOP, C.act[1], R.AH_BOT, NAVY);
    fillR(C.item[0], R.AH_TOP, C.na[1], R.AH_MID, NAVY);
    fillR(C.rf[0], R.AH_TOP, C.co[1], R.AH_MID, NAVY);
    fillR(C.ct[0], R.AH_TOP, C.ct[1], R.AH_BOT, NAVY);
    T("ACTIVIDAD", mid("act"), R.AH_TOP + 21.5, FB, 8.5, WHITE, "c", 1.2);
    T("¿ESTAMOS PREPARADOS", (C.item[0] + C.na[1]) / 2, R.AH_TOP + 9.3, FB, 7.6, WHITE, "c");
    T("PARA EJECUTARLA?", (C.item[0] + C.na[1]) / 2, R.AH_TOP + 18.2, FB, 7.6, WHITE, "c");
    T("ANÁLISIS DE RIESGO", (C.rf[0] + C.co[1]) / 2, R.AH_TOP + 14, FB, 8.5, WHITE, "c", 1.0);
    T("CONTROLES", mid("ct"), R.AH_TOP + 21.5, FB, 8.5, WHITE, "c", 1.2);
    [["item","ÍTEM"],["si","SÍ"],["no","NO"],["na","NA"],["rf","RF Nº"],["ri","RIESGO"],["co","CONSECUENCIA"]].forEach(([k, t]) => T(t, mid(k), R.AH_MID + 10.3, FB, 7, NAVY, "c", 0.4));
    ["item","si","no","na","rf","ri","co"].forEach(k => vl(C[k][1], R.AH_MID, R.AH_BOT));
    vl(R.X0, R.AH_TOP, R.AH_BOT); vl(R.X1, R.AH_TOP, R.AH_BOT);
    hl(C.item[0], C.co[1], R.AH_BOT, NAVY, 1.4);
    // Actividades
    const slots = last ? R.PER_LAST : R.PER_MID, ih = R.BLK_H / 4, rh = R.BLK_H / 3, end = R.AH_BOT + slots * R.BLK_H;
    ["act","item","si","no","na","rf","ri","co","ct"].forEach(k => vl(C[k][0], R.AH_BOT, end)); vl(R.X1, R.AH_BOT, end);
    for (let b = 0; b < slots; b++) {
      const top = R.AH_BOT + b * R.BLK_H, a = acts[b] || null;
      R.ITEMS.forEach((lab, i) => {
        const it = top + i * ih; if (i) hl(C.item[0], C.na[1], it);
        T(lab, C.item[0] + 5, it + ih / 2 + 2.8, FB, 7.8, INK);
        const st = a ? (a.prep || [])[i] : null;
        [["si","SI"],["no","NO"],["na","NA"]].forEach(([k, v]) => box(mid(k) - R.CB / 2, it + ih / 2 - R.CB / 2, st === v));
      });
      for (let j = 0; j < 3; j++) {
        const rt = top + j * rh; if (j) hl(C.rf[0], R.X1, rt);
        const row = a && a.rows ? a.rows[j] : null;
        if (row && row.rf) {
          T("RF" + row.rf, mid("rf"), rt + rh / 2 + 3.2, FB, 9, DATA, "c");
          fitbox(row.r, C.ri[0], C.ri[1], rt, rh, 8.4, 6.2);
          fitbox(row.c, C.co[0], C.co[1], rt, rh, 8.4, 6.2);
          fitbox(row.k, C.ct[0], C.ct[1], rt, rh, 7.8, 5.6);
        } else T("RF", C.rf[0] + 5, rt + rh / 2 + 2.6, F, 7, GREY);
      }
      if (a) fitbox(a.name, C.act[0], C.act[1], top, R.BLK_H, 10, 7.5, { bold:true, align:"c", pad:7, lead:1.2 });
      hl(R.X0 - 1, R.X1, top + R.BLK_H, NAVY, 1.4);
    }
    // Aportes y reconocimientos: solo en la última hoja
    if (last) {
      const L = [[28.5, 432.5, "PROPUESTA"], [432.5, 602.5, "RESPONSABLE"], [602.5, 706.5, "FECHA"]], Rr = [[728.5, 890.5, "QUIÉN"], [890.5, 1162.5, "MOTIVO"]];
      T("APORTES A LA GESTIÓN DE RIESGOS (ÚLTIMO DÍA)", (L[0][0] + L[2][1]) / 2, R.BOT_TITLE, FB, 10, INK, "c");
      T("RECONOCIMIENTOS (ÚLTIMO DÍA)", (Rr[0][0] + Rr[1][1]) / 2, R.BOT_TITLE, FB, 10, INK, "c");
      const ap = D.lastDay ? (D.aportes || []) : [], rc = D.lastDay ? (D.recon || []) : [];
      [[L, ap.map(a => [a.p, a.r, (a.p || a.r) ? a.f : ""])], [Rr, rc.map(r => [r.q, r.m])]].forEach(([grp, data]) => {
        fillR(grp[0][0], R.BOT_HTOP, grp[grp.length - 1][1], R.BOT_HBOT, NAVY);
        grp.forEach(([a0, a1, lab]) => T(lab, (a0 + a1) / 2, R.BOT_HTOP + 10.4, FB, 7.8, WHITE, "c", 1.0));
        for (let r = 0; r < 5; r++) hl(grp[0][0], grp[grp.length - 1][1], R.BOT_HBOT + r * R.BOT_RH);
        grp.forEach(([a0]) => vl(a0, R.BOT_HTOP, R.BOT_HBOT + 4 * R.BOT_RH)); vl(grp[grp.length - 1][1], R.BOT_HTOP, R.BOT_HBOT + 4 * R.BOT_RH);
        data.slice(0, 4).forEach((vals, r) => grp.forEach(([a0, a1], k) => fitbox(vals[k], a0, a1, R.BOT_HBOT + r * R.BOT_RH, R.BOT_RH, 8.4, 6.2)));
      });
    }
    // Pie
    hl(R.X0, R.X1, R.FOOT, GRID, 0.8);
    const wg = T("GCSSO", R.X0, R.FOOT + 13, FB, 7.5, INK);
    T(" · Dirección Corporativa de Seguridad", R.X0 + wg, R.FOOT + 13, F, 7.5, GREY);
    T(`RIT ${h.fecha || ""}, turno ${h.turno || ""}, hoja ${n} de ${total}`, R.X1, R.FOOT + 13, F, 7.5, GREY, "r");
  }
  if (opts.reverso !== false && assets.reversoPdf) {
    const rev = await PDFDocument.load(assets.reversoPdf);
    const [p] = await doc.copyPages(rev, [0]); doc.addPage(p);
  }
  return { bytes: await doc.save({ useObjectStreams:false }), sheets: pages.length };
}
if (typeof module !== "undefined") module.exports = { RIT2, buildRit2, ritFit, ritWrap, ritConsText, ritPaginate, ritSan };
