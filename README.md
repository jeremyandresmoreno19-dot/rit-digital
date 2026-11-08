# RIT Digital · App web con catálogo en la nube

Archivos: `index.html` (la app), `config.js` (conexión a Supabase), `sw.js` y `manifest.webmanifest` (para que abra sin señal y se instale en el celular), íconos y `supabase.sql` (base de datos).

## 1. Base de datos en Supabase
1. Entra a supabase.com y crea un proyecto (puede ser el mismo de la app de firmas: las tablas de esta app empiezan con `rit_`).
2. Abre **SQL Editor → New query** y pega todo el contenido de `supabase.sql`.
3. **Antes de apretar Run**, baja hasta la sección **CLAVES** y cambia las tres claves (`CAMBIA-clave-jeremy`, `CAMBIA-clave-prevencion`, `CAMBIA-clave-equipo`). Mínimo 6 caracteres.
4. Aprieta **Run**. Debe terminar sin errores. Crea las tablas, la seguridad y carga los 21 RF, las 202 actividades y los supervisores.

## 2. Conectar la app
1. En Supabase ve a **Project Settings → API** y copia la **Project URL** y la clave **anon public**.
2. Abre `config.js` y reemplaza `https://TU-PROYECTO.supabase.co` y `TU-ANON-KEY` por esos dos datos.
   Nunca uses la clave `service_role`.

## 3. Publicar en GitHub Pages
1. Crea un repositorio, por ejemplo `rit-digital`.
2. **Add file → Upload files** y sube todos los archivos de esta carpeta (puedes dejar fuera `supabase.sql` y este LEEME).
3. **Settings → Pages → Branch: main / (root) → Save**.
4. En uno o dos minutos queda en `https://TU-USUARIO.github.io/rit-digital/`.

## 4. En el celular
- Abre el link en Chrome → menú ⋮ → **Agregar a pantalla de inicio**. Queda como app.
- La primera vez pide la **clave del equipo** (para guardar y ver los RIT en la nube).
- Prevención y Jeremy entran a **Editar catálogo** con su clave personal. Lo que guarden lo ven todos al abrir la app o al volver a ella.

## Cómo se llena (formato nuevo)
- **Actividades sin límite:** hasta 6 caben en una hoja; desde la 7ª el PDF suma otra hoja con el mismo encabezado ("Hoja 1 de 2"). Aportes y reconocimientos van solo en la última hoja.
- **¿Estamos preparados?:** cada ítem parte en SÍ y se puede cambiar a NO o NA.
- **Riesgos de fatalidad del turno:** la app no los muestra; en el PDF se marcan solos según los RF de las actividades.
- **Textos de cada RF:** riesgo, consecuencia (tipo + detalle) y controles vienen del catálogo oficial. Cada supervisor puede editarlos con "Editar textos"; su versión queda guardada solo en su celular y puede elegirla en los próximos RIT. El texto oficial solo se cambia en el panel con clave de editor.

## Revisar el documento y corregir tocando
- En **Vista previa** se ve el RIT o la OT tal como se va a imprimir. Tocando cualquier parte se abre su edición: el encabezado abre los datos del turno, una actividad abre su ficha, una celda de riesgo, consecuencia o controles abre ese texto, SÍ/NO/NA se marca directo y una fila vacía agrega una actividad. Al terminar vuelve al documento ya actualizado.
- **Compartir** envía el PDF directo a WhatsApp, correo u otra app del celular.

## Orden de Trabajo (OT)
- Con los mismos datos del RIT la app genera la OT «Servicio de aseo industrial en áreas operacionales DRT» (contrato 4600031622), en tamaño carta.
- Se llenan solos: fecha, área seca o húmeda (X), área específica, jornada día o noche (X), tipo planificada / no planificada / emergente (X), turno, descripción de las actividades (8 por hoja; si hay más, sale "Hoja 1 de 2"), jefe de operaciones y supervisor.
- Quedan para llenar a mano: número de trabajadores, inicio y término, equipos asociados, trabajadores, documentos, verificación de energía cero y las firmas de Codelco.
- El nombre del jefe de operaciones y los datos del contrato se cambian en el panel, pestaña **Contrato**.
- Al apretar **Descargar** se elige: RIT y OT, solo RIT o solo OT.

## Notas
- Sin señal la app abre igual con el último catálogo descargado; los RIT se suben solos cuando vuelve la conexión.
- Cada cambio del catálogo queda registrado (quién, cuándo, antes y después) en la pestaña **Cambios**, con opción de restaurar.
- Las claves se pueden cambiar desde la pestaña **Claves** del panel.
- En el plan gratis, Supabase pausa el proyecto si pasa 7 días sin uso; con uso diario no pasa.
- Para actualizar la app basta con subir el `index.html` nuevo al repositorio.
