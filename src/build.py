import base64, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
css=open('web_base.css').read()+open('web_extra.css').read()
logo='data:image/png;base64,'+base64.b64encode(open('assets/logo_ui.png','rb').read()).decode()
html=f'''<!doctype html>
<html lang="es" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light only">
<meta name="theme-color" content="#FFFFFF">
<title>RIT Digital</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>{css}</style>
</head>
<body>
<header class="top" id="top">
  <img src="{logo}" alt="Codelco">
  <div class="ttl"><h1>RIT Digital</h1><p>División Radomiro Tomic</p></div>
</header>
<main id="app"></main>
<nav class="bar" id="bar"></nav>
<div id="sheet" hidden><div class="scrim" data-act="close"></div><div class="panel" role="dialog" aria-modal="true" id="panel"></div></div>
<div id="toast" role="status" aria-live="polite"></div>
<script src="config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"></script>
<script>
{open('data.js').read()}
{open('pdfbuild2.js').read()}
{open('pdfbuild3.js').read().replace('if (typeof module !== "undefined") module.exports = { RIT3, ritPaginate3, buildRit3 };', '')}
{open('pdfbuild_ot.js').read()}
const LOGO_UI = "{logo}";
const LOGO_PDF_B64 = "{base64.b64encode(open('assets/logo_pdf.png','rb').read()).decode()}";
const RIT_TPL_B64 = "{base64.b64encode(open('assets/rit_formato.pdf','rb').read()).decode()}";
const OT_B64 = "{base64.b64encode(open('assets/ot_original.pdf','rb').read()).decode()}";
</script>
<script>
{open('web_app2.js').read()}
</script>
</body>
</html>
'''
open('../index.html','w').write(html); print(len(html))
