// ===== Orden de Trabajo (OT) · Carta vertical 612 x 792 pt, rellena sobre el formato original =====
const OT_GEOM = {
  PER_SHEET: 8,
  rowsTop: [232.8, 275.0, 317.3, 359.5, 401.8, 444.0, 486.2, 528.5, 570.7],
  desc:    { x0: 39.1,  x1: 255.4 },
  fecha:   { x0: 39.1,  x1: 154.8, t: 148.8, b: 166.8 },
  seca:    { x0: 192.4, x1: 212.6, t: 148.8, b: 166.8 },
  humeda:  { x0: 255.4, x1: 300.3, t: 148.8, b: 166.8 },
  areaEsp: { x0: 300.5, x1: 438.6, t: 148.8, b: 166.8 },
  dia:     { x0: 171.7, x1: 192.4, t: 169.8, b: 187.9 },
  noche:   { x0: 234.7, x1: 255.4, t: 169.8, b: 187.9 },
  plan:    { x0: 350.7, x1: 373.9, t: 169.8, b: 187.9 },
  noplan:  { x0: 438.8, x1: 459.5, t: 169.8, b: 187.9 },
  emerg:   { x0: 549.4, x1: 577.1, t: 169.8, b: 187.9 },
  turno:   { x0: 519.8, x1: 576.7, t: 190.3, b: 210.1 },
  jefe:    { x0: 39.1,  x1: 192.4, t: 676.7, b: 725.6 },
  sup:     { x0: 192.4, x1: 350.7, t: 676.7, b: 725.6 }
};
// D = { fecha:"dd/mm/aaaa", area:"Área Seca"|"Área Húmeda", areaEsp, jornada:"Día"|"Noche"|"", tipo:"Planificada"|"No planificada"|"Emergente"|"",
//       turno, descs:[...], jefe, supervisor }
async function buildOt(PDFLib, tplBytes, D){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const G = OT_GEOM;
  const doc = await PDFDocument.load(tplBytes), tpl = await PDFDocument.load(tplBytes);
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const H = doc.getPage(0).getHeight(), DATA = rgb(0.043, 0.122, 0.247);
  const descs = (D.descs || []).map(s => ritSan(s)).filter(Boolean);
  const n = Math.max(1, Math.ceil(descs.length / G.PER_SHEET));
  for (let k = 1; k < n; k++) { const [cp] = await doc.copyPages(tpl, [0]); doc.addPage(cp); }
  const one = (page, s, c, font, size, base) => {
    let t = ritSan(s); if (!t) return; const maxW = c.x1 - c.x0 - 6; let z = size;
    while (z > 5.5 && font.widthOfTextAtSize(t, z) > maxW) z -= 0.25;
    while (t.length > 1 && font.widthOfTextAtSize(t, z) > maxW) t = t.slice(0, -1);
    const w = font.widthOfTextAtSize(t, z);
    page.drawText(t, { x: c.x0 + (c.x1 - c.x0 - w) / 2, y: H - (base != null ? base : c.t + (c.b - c.t) / 2 + z * 0.35), size: z, font, color: DATA });
  };
  const mark = (page, c) => one(page, "X", c, FB, 11);
  const fitC = (page, s, c, font, size, min) => {   // centrado, hasta 2 líneas si no cabe
    const t = ritSan(s); if (!t) return;
    const r = ritFit(t, font, c.x1 - c.x0 - 6, c.b - c.t - 2, size, min, 1.1); const lh = r.s * 1.1;
    const start = c.t + (c.b - c.t - ((r.lines.length - 1) * lh + r.s * 0.72)) / 2 + r.s * 0.72;
    r.lines.forEach((ln, i) => { const w = font.widthOfTextAtSize(ln, r.s); page.drawText(ln, { x: c.x0 + (c.x1 - c.x0 - w) / 2, y: H - (start + i * lh), size: r.s, font, color: DATA }); });
  };
  const para = (page, s, x0, x1, top, bottom) => {
    const r = ritFit(ritSan(s), F, x1 - x0 - 10, bottom - top - 6, 10, 6, 1.2); const lh = r.s * 1.2;
    const start = top + (bottom - top - ((r.lines.length - 1) * lh + r.s * 0.72)) / 2 + r.s * 0.72;
    r.lines.forEach((ln, i) => page.drawText(ln, { x: x0 + 5, y: H - (start + i * lh), size: r.s, font: F, color: DATA }));
  };
  for (let k = 0; k < n; k++) {
    const page = doc.getPage(k);
    one(page, D.fecha, G.fecha, FB, 10);
    if (/seca/i.test(D.area || "")) mark(page, G.seca); else if (/h[uú]meda/i.test(D.area || "")) mark(page, G.humeda);
    fitC(page, D.areaEsp, G.areaEsp, FB, 9.5, 6);
    if (D.jornada === "Día") mark(page, G.dia); else if (D.jornada === "Noche") mark(page, G.noche);
    if (D.tipo === "Planificada") mark(page, G.plan); else if (D.tipo === "No planificada") mark(page, G.noplan); else if (D.tipo === "Emergente") mark(page, G.emerg);
    one(page, D.turno, G.turno, FB, 11);
    descs.slice(k * G.PER_SHEET, (k + 1) * G.PER_SHEET).forEach((t, i) => para(page, t, G.desc.x0, G.desc.x1, G.rowsTop[i], G.rowsTop[i + 1]));
    one(page, D.jefe, G.jefe, FB, 9, G.jefe.b - 7);
    one(page, D.supervisor, G.sup, FB, 9, G.sup.b - 7);
    const lab = [D.label || "", n > 1 ? `Hoja ${k + 1} de ${n}` : ""].filter(Boolean).join(", ");
    if (lab) { const w = FB.widthOfTextAtSize(lab, 9); page.drawText(lab, { x: 584 - w, y: H - 52, size: 9, font: FB, color: DATA }); }
  }
  doc.setTitle("Orden de Trabajo " + (D.fecha || "") + " Turno " + (D.turno || "")); doc.setCreator("RIT Digital");
  return { bytes: await doc.save({ useObjectStreams:false }), sheets: n };
}
if (typeof module !== "undefined") module.exports = { OT_GEOM, buildOt };
