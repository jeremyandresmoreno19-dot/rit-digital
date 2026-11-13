# RIT Digital · Codelco División Radomiro Tomic · MISPA

App web (sin APK) para llenar en el celular la **Reunión de Inicio de Turno (RIT)** de Codelco y la **Orden de Trabajo (OT)**, y exportarlas en PDF vectorial listo para imprimir. Usuario: Jeremy Peñailillo (MISPA, contrato de aseo industrial en Gerencia Planta, Superintendencia CHM.M). Se conversa en español de Chile.

## Objetivo
Bajar el llenado del RIT de ~1 hora a menos de 5 minutos: casi todo con botones, búsqueda por palabra clave y textos precargados. Documento delicado (lo revisan Codelco y Prevención de Riesgos): **no inventar datos; si algo no se sabe, preguntar**.

## Estructura
Repositorio `jeremyandresmoreno19-dot/rit-digital` (público), publicado con GitHub Pages desde `main` (raíz): https://jeremyandresmoreno19-dot.github.io/rit-digital/
```
src/                 código fuente (se edita aquí)
  data.js            catálogo inicial: 21 RF, 202 actividades del itemizado, paquetes de RF, supervisores
  pdfbuild3.js       RIT formato naranja GCSSO 2026: escribe sobre assets/rit_formato.pdf (6 actividades por hoja, reverso guía de consulta)
  pdfbuild2.js       formato anterior; hoy solo se usan sus funciones de texto (ritSan, ritFit, ritConsText)
  pdfbuild_ot.js     rellena la OT sobre su formato original (carta vertical), 8 actividades por hoja
  web_app2.js        la app: menú, formulario por pasos, vista previa tocable, nube (Supabase), panel de administración
  web_base.css, web_extra.css
  schema.sql         tablas, RLS y funciones de Supabase (gen_sql.js le agrega los datos iniciales)
  build.py           arma ../index.html (un solo archivo con todo incrustado)
  gen_sql.js         arma ../sql/1-tablas.sql
  assets/            logo, plantilla OT, rit_formato.pdf (anverso y reverso del RIT naranja) y su origen RIT_Codelco_DRT_5.pptx
index.html           la app compilada (no editar a mano)
config.js            URL del proyecto Supabase (ujbkdhjhetechdurqsgf) y clave anon
sw.js, manifest.webmanifest, icon-*.png
sql/1-tablas.sql     instalación nueva (sin claves) · sql/2-claves.sql las 3 claves · sql/3-menu-y-borradores.sql actualización del menú
INSTRUCCIONES-CLAUDE.md  pasos para que Claude en el navegador haga la puesta en marcha
```
Para regenerar después de editar `src/`: `python3 src/build.py && node src/gen_sql.js`. Si cambia lo que guarda el service worker, subir `CACHE` en `sw.js`. Librerías por CDN jsDelivr: pdf-lib 1.17.1, pdfjs-dist 3.11.174 (sin worker), fflate 0.8.2 (solo para el ZIP, se carga al usarlo).

## Cómo funciona
- **Menú:** abajo Inicio, Mis RIT y Equipo; arriba a la derecha el botón Admin. La primera vez se elige "¿Quién eres?" (nombre) y la clave del equipo; el nombre llena solo el supervisor y define la carpeta Mis RIT.
- **Inicio:** tarjeta "Nuevo RIT de hoy", "Sigue donde quedaste", repetir el RIT anterior, ir a la OT y conteo de la semana (semana de turno: miércoles a martes).
- **Formulario por pasos:** Turno, Actividades, Preparados, OT (muestra los datos que vienen del RIT) y Cierre (último día, revisión y descarga). Todo sale del mismo borrador, así que lo que se escribe una vez sirve para el RIT y la OT.
- **Borradores:** cada cambio se guarda en el celular y, con señal y clave, se sube a `rit_registros` como `borrador` (~3,5 s después del último cambio). Al descargar queda `terminado` (no vuelve a borrador). Se sube también `tx`: los textos de RF tal como salen en el PDF de ese supervisor.
- **Mis RIT:** RIT propios del celular y de la nube con el mismo nombre, por día, con filtros semana/mes/todo; ver, abrir y editar, copiar a hoy, borrar borrador.
- **Equipo:** RIT de los demás (terminados y en curso) por día, con buscador; solo vista previa, descarga y "Usar como base".
- **Supervisor:** fecha, turno A/B, área seca/húmeda, jornada día/noche, supervisor (botones), asistentes. Actividades sin límite con buscador; al elegir una se cargan sus RF (máx. 3). ¿Estamos preparados? con SÍ/NO (parte en SÍ; el formato naranja no tiene NA). Riesgo, consecuencia y controles vienen del catálogo; el supervisor puede editarlos y su versión queda guardada solo en su celular (opción "usar en mis próximos RIT"). Aportes y reconocimientos solo el último día del turno (texto manual, nombres con autocompletado). "Repetir RIT anterior". Autoguardado.
- **Vista previa tocable:** se ve el RIT o la OT tal como se imprimen; al tocar una zona se abre su edición (mapeo de coordenadas en `hitRit` / `hitOt`).
- **PDF del RIT (formato naranja, cartilla GCSSO 2026):** se escribe encima de la plantilla oficial `assets/rit_formato.pdf` (A3 horizontal). 6 actividades por hoja, solo SÍ/NO (sin NA), los 21 RF de arriba se marcan solos según las actividades, aportes y reconocimientos en la última hoja, "Hoja n de m" abajo a la derecha y al final el reverso nuevo (guía de consulta con los 21 RF y sus controles críticos). La plantilla se genera desde `RIT_Codelco_DRT_5.pptx` con LibreOffice y la letra IBM Plex Sans, sin el número de lámina; las medidas de cada celda están en `RIT3`. Según los criterios de Seguridad, una actividad sin RF igual se registra (ya no bloquea la descarga); lo que bloquea es un ítem sin SÍ ni NO.
- **OT:** una OT por área del itemizado, porque cada área la firma una persona distinta de Codelco. En el paso OT se ve cada OT con sus actividades; con "Mover" se pasa una actividad a otra OT o a una OT nueva (`a.ot`), y cada OT tiene su área específica y tipo (`d.otInfo`). El administrador puede juntar áreas en una misma OT en Admin → OT por área (`KC.cfg.otGrupos`, se guarda en rit_config junto al contrato). Todas las OT salen en un PDF, cada una en su hoja con "OT n de m". Se llenan solos: fecha, X seca/húmeda, área específica, X jornada, X tipo, turno, actividades, jefe de operaciones y supervisor. Lo demás se llena a mano.
- **Descargar:** RIT y OT, solo uno, o compartir (Web Share) a WhatsApp/correo.
- **Nube (Supabase):** el catálogo se lee libre; todo cambio pasa por funciones `security definer` que verifican una clave (bcrypt en `rit_claves`). Roles: `editor` (Jeremy, Prevención) y `equipo` (supervisores). Los RIT descargados se guardan en `rit_registros` y se ven desde cualquier celular con la clave del equipo. Registro de cambios con antes/después y restaurar.
- **Panel de administración (botón Admin, clave de editor):** inicio con tarjetas, quién hizo su RIT hoy (terminado, en curso, sin RIT), archivo completo por semana con descarga en ZIP (RIT y OT de cada uno), textos oficiales de RF (con aviso de si caben en la celda del PDF), actividades y sus RF (crear/ocultar), supervisores, datos del contrato y jefe de operaciones, historial de cambios, cambio de claves.

## Estado y pendientes
1. **Publicada** en GitHub Pages y conectada a Supabase. Para el menú hay que ejecutar una vez `sql/3-menu-y-borradores.sql` en el SQL Editor; sin eso la app funciona igual, pero no sube borradores ni muestra el Equipo ni el panel de hoy/archivo.
2. **Validar con Prevención** los paquetes de RF por tipo de actividad (`PKG` en data.js): solo el de aseo manual (RF09, RF20, RF22) está confirmado por un RIT real. Oficinas y cuadrillas correctivas no tienen RF fijo.
3. Confirmar: si se usa ácido sulfúrico en el curado (RF07 hoy dice salmuera), cómo se escribe "Danny Gosalve", número de contrato 4600031622 (sacado del formato de la OT).
4. El logo viene de una imagen de baja resolución del documento (suavizada). Si consiguen el logo oficial en vector, reemplazar `assets/logo_*.png`.
5. Supervisores: Bastián Arce, Bastián Araya, Andrés Martínez, Richard Espada, Danny Gosalve, Jeannelson Estay. Jefe de operaciones: Bastián Araya Villavicencio.

## Criterios del usuario
Fondo siempre blanco (sin modo oscuro). Entregables completos y probados. No rellenar a la ligera datos de seguridad. El formato del PDF debe verse nítido al imprimir y al hacer zoom.
