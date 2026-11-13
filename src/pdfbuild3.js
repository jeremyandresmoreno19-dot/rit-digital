// ===== RIT formato naranja (Cartilla GCSSO 2026, A3 horizontal) =====
// Se escribe encima de la plantilla oficial (assets/rit_formato.pdf: anverso y reverso).
// Medidas en puntos desde el borde superior, tomadas de la plantilla.
const RIT3 = {
  W: 1191.12, H: 841.92,
  // Encabezado: [x donde termina la etiqueta, x donde termina la celda, fila]
  HDR: {
    gerencia:[353.3, 595.5, 0], superint:[708.6, 879.1, 0], area:[973.2, 1162.6, 0],
    fecha:[59.1, 312.0, 1], turno:[365.3, 595.5, 1], supervisor:[671.0, 879.1, 1], asistentes:[948.6, 1162.6, 1],
    eecc:[102.1, 312.0, 2], contrato:[374.9, 595.5, 2], nombreContrato:[678.0, 1162.6, 2]
  },
  HDR_ROWS: [82.0, 99.0, 116.0, 132.9],
  // Riesgos de fatalidad del turno (casillas)
  GRID: [["01","02","03","04","05","06","07"],["08","09","10","11","13","20","22"],["24","25","26","27","29","30","31"]],
  GRID_X0: 36.5, GRID_DX: 159.73, GRID_TOP: [166.48, 187.48, 208.46], GRID_BOX: 7.97,
  // Actividades: 6 por hoja, bloques de 4 ítems y 3 filas de RF
  T0: 265.0, BLK: 73.82, PER: 6, IT_H: 18.455, RF_H: 24.607,
  COL: { act:[28.5,160.5], item:[160.5,245.5], si:[245.5,274.5], no:[274.5,303.4], rf:[303.4,343.4], ri:[343.4,573.4], co:[573.4,803.4], ct:[803.4,1162.5] },
  CB: { si:256.0, no:285.0, size:6.97, dy:5.2 },
  // Aportes y reconocimientos (último día)
  AP_ROWS: [745.8, 759.7, 773.5, 787.3, 801.2],
  AP: { p:[28.5,420.0], r:[420.0,596.0], f:[596.0,705.9] },
  RC: { q:[728.0,883.0], m:[883.0,1162.6] },
  FIT: { ri:{ w:222, h:22.4, s:8, m:5.4 }, co:{ w:222, h:22.4, s:8, m:5.4 }, ct:{ w:351, h:22.4, s:7.6, m:5 }, act:{ w:112, h:64, s:9.5, m:6.5, bold:true, lead:1.18 } },
  ITEMS: ["Instructivos y/o PTS","Materiales","Herramientas","EPP"]
};
RIT3.CODES = RIT3.GRID.flat();
function ritPaginate3(acts){ const out = []; for (let i = 0; i < acts.length; i += RIT3.PER) out.push(acts.slice(i, i + RIT3.PER)); return out.length ? out : [[]]; }

// D = { h:{gerencia, superint, area, fecha, turno, supervisor, asistentes, eecc, contrato, nombreContrato},
//       acts:[{ name, prep:["SI"|"NO"|..x4], rows:[{ rf, r, c, k }] }], lastDay, aportes:[{p,r,f}], recon:[{q,m}] }
async function buildRit3(PDFLib, tplBytes, D, opts){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const G = RIT3, H = G.H, DATA = rgb(0.043, 0.122, 0.247);
  const tpl = await PDFDocument.load(tplBytes), doc = await PDFDocument.create();
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = ritPaginate3(D.acts || []), n = pages.length;
  const idx = Array.from({ length:n }, () => 0); if (opts && opts.reverso) idx.push(1);
  (await doc.copyPages(tpl, idx)).forEach(p => doc.addPage(p));

  // Texto en una línea que se achica si no cabe
  const line = (pg, s, x0, x1, base, font, size, center) => {
    let t = ritSan(s); if (!t) return; const maxW = x1 - x0; let z = size;
    while (z > 5 && font.widthOfTextAtSize(t, z) > maxW) z -= 0.25;
    while (t.length > 1 && font.widthOfTextAtSize(t, z) > maxW) t = t.slice(0, -1);
    const w = font.widthOfTextAtSize(t, z);
    pg.drawText(t, { x: center ? x0 + (maxW - w) / 2 : x0, y: H - base, size: z, font, color: DATA });
  };
  // Párrafo que se ajusta a la celda (achica la letra antes de cortar)
  const para = (pg, s, x0, x1, top, bot, f, valign) => {
    const t = ritSan(s); if (!t) return;
    const font = f.bold ? FB : F, r = ritFit(t, font, f.w, f.h, f.s, f.m, f.lead), lh = r.s * r.lead;
    const blockH = (r.lines.length - 1) * lh + r.s * 0.72;
    const start = valign === "top" ? top + 3 + r.s * 0.8 : top + (bot - top - blockH) / 2 + r.s * 0.72;
    r.lines.forEach((ln, i) => pg.drawText(ln, { x: x0 + 3, y: H - (start + i * lh), size: r.s, font, color: DATA }));
  };
  // Marca (X) dentro de una casilla
  const mark = (pg, x, top, size) => {
    const p = size * 0.18;
    pg.drawLine({ start:{ x:x + p, y:H - (top + p) }, end:{ x:x + size - p, y:H - (top + size - p) }, thickness:1.3, color:DATA });
    pg.drawLine({ start:{ x:x + p, y:H - (top + size - p) }, end:{ x:x + size - p, y:H - (top + p) }, thickness:1.3, color:DATA });
  };

  const used = new Set(); (D.acts || []).forEach(a => (a.rows || []).forEach(r => used.add(r.rf)));
  for (let pi = 0; pi < n; pi++) {
    const pg = doc.getPage(pi), h = D.h || {};
    // Encabezado (igual en todas las hojas)
    Object.keys(G.HDR).forEach(k => {
      const [lx, cx, row] = G.HDR[k], base = G.HDR_ROWS[row] + 12.2;
      line(pg, h[k], lx + 4, cx - 4, base, FB, 8);
    });
    // Riesgos de fatalidad del turno: se marcan los RF de todas las actividades
    G.GRID.forEach((row, ri) => row.forEach((c, ci) => { if (used.has(c)) mark(pg, G.GRID_X0 + ci * G.GRID_DX, G.GRID_TOP[ri], G.GRID_BOX); }));
    // Actividades de esta hoja
    pages[pi].forEach((a, b) => {
      const top = G.T0 + b * G.BLK;
      para(pg, a.name, 41, G.COL.act[1] - 2, top, top + G.BLK, G.FIT.act, "top");
      (a.prep || []).slice(0, 4).forEach((v, k) => {
        const y = top + k * G.IT_H + G.CB.dy;
        if (v === "SI") mark(pg, G.CB.si, y, G.CB.size); else if (v === "NO") mark(pg, G.CB.no, y, G.CB.size);
      });
      (a.rows || []).slice(0, 3).forEach((r, j) => {
        const t = top + j * G.RF_H, bt = t + G.RF_H;
        line(pg, r.rf, 316, G.COL.rf[1] - 3, t + G.RF_H / 2 + 3.4, FB, 9);
        para(pg, r.r, G.COL.ri[0], G.COL.ri[1], t, bt, G.FIT.ri);
        para(pg, r.c, G.COL.co[0], G.COL.co[1], t, bt, G.FIT.co);
        para(pg, r.k, G.COL.ct[0], G.COL.ct[1], t, bt, G.FIT.ct);
      });
    });
    // Aportes y reconocimientos: solo el último día y en la última hoja
    if (D.lastDay && pi === n - 1) {
      (D.aportes || []).slice(0, 4).forEach((a, i) => {
        const base = G.AP_ROWS[i] + 9.8;
        line(pg, a.p, G.AP.p[0] + 4, G.AP.p[1] - 4, base, F, 7.5);
        line(pg, a.r, G.AP.r[0] + 4, G.AP.r[1] - 4, base, F, 7.5);
        if (ritSan(a.p) || ritSan(a.r)) line(pg, a.f, G.AP.f[0] + 4, G.AP.f[1] - 4, base, F, 7.5, true);
      });
      (D.recon || []).slice(0, 4).forEach((r, i) => {
        const base = G.AP_ROWS[i] + 9.8;
        line(pg, r.q, G.RC.q[0] + 4, G.RC.q[1] - 4, base, F, 7.5);
        line(pg, r.m, G.RC.m[0] + 4, G.RC.m[1] - 4, base, F, 7.5);
      });
    }
    // Hoja n de m
    const lab = `Hoja ${pi + 1} de ${n}`, w = FB.widthOfTextAtSize(lab, 8);
    pg.drawText(lab, { x: 1162.6 - w, y: H - 818, size: 8, font: FB, color: DATA });
  }
  return { bytes: await doc.save(), pages: n };
}
if (typeof module !== "undefined") module.exports = { RIT3, ritPaginate3, buildRit3 };
