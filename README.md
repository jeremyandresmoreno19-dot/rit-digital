# RIT Digital · App web con catálogo en la nube

Reunión de Inicio de Turno (RIT) y Orden de Trabajo (OT) de MISPA en el celular, con PDF listo para imprimir.

## Abrir la app
👉 **https://jeremyandresmoreno19-dot.github.io/rit-digital/**

## Menú
- **Inicio:** nuevo RIT de hoy, seguir el borrador, repetir el anterior y la OT.
- **Mis RIT:** tu carpeta por día (semana de turno miércoles a martes, mes o todo). Ver, abrir y editar, copiar a hoy.
- **Equipo:** los RIT de los demás supervisores por día, terminados y en curso. Solo se ven; se pueden descargar o usar como base.
- **Admin** (arriba a la derecha): pide la clave de editor. Catálogo, quién hizo su RIT hoy y el archivo semanal en ZIP.
- El RIT se llena por pasos: Turno, Actividades, Preparados, OT y Cierre. Cada cambio se guarda solo.
- El PDF del RIT sale en el formato naranja de la GCSSO (cartilla 2026), con el reverso de guía de consulta.
- La OT se separa sola por área (una OT por área); en el paso OT se puede mover cada actividad a otra OT.

## Cómo está armado
- `index.html`: la app; `config.js`: conexión a Supabase (proyecto `ujbkdhjhetechdurqsgf`, clave pública anon); `sw.js` y `manifest.webmanifest`: para que abra sin señal y se instale.
- `sql/1-tablas.sql`: tablas, seguridad y catálogo inicial. `sql/2-claves.sql`: las tres claves (se cambian antes de ejecutar; nunca se suben con claves reales). `sql/3-menu-y-borradores.sql`: actualización para el menú (se ejecuta una vez en una base ya instalada).
- `src/`: código fuente. Después de editarlo: `python3 src/build.py && node src/gen_sql.js`.
- GitHub Pages publica la rama `main` (raíz). Cada cambio que se sube queda en línea en uno o dos minutos.

## En el celular
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
