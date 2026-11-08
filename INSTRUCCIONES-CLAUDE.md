# Instrucciones para Claude en el navegador: publicar RIT Digital

Eres Claude y controlas el navegador del computador de Jeremy. Vas a dejar en línea la app **RIT Digital** (GitHub Pages) conectada a su base de datos (Supabase). Habla en español de Chile, en frases cortas.

## Reglas
- **Claves:** nunca escribas, inventes ni repitas las claves de acceso. Cuando llegues a ese paso, detente y pide a Jeremy que las escriba él mismo en el editor.
- **service_role:** nunca copies ni pegues la clave `service_role` de Supabase. Solo se usa la clave **anon public**.
- **No borres nada** en Supabase ni en GitHub. Si una tabla `rit_` ya existe o aparece un error, detente y muéstrale el mensaje a Jeremy.
- **Login:** si te pide iniciar sesión (GitHub o Supabase), pídele a Jeremy que lo haga él.
- **Al terminar cada paso**, dile en una línea lo que hiciste.

## Paso 1 · Activar GitHub Pages
1. Abre `https://github.com/jeremyandresmoreno19-dot/rit-digital/settings/pages`.
2. En **Build and deployment → Source** elige **Deploy from a branch**.
3. En **Branch** elige **main** y la carpeta **/ (root)**. Toca **Save**.
4. La app quedará en `https://jeremyandresmoreno19-dot.github.io/rit-digital/` en 1 o 2 minutos.

## Paso 2 · Crear las tablas en Supabase (parte 1)
1. Abre `https://raw.githubusercontent.com/jeremyandresmoreno19-dot/rit-digital/main/sql/1-tablas.sql` y copia **todo** el texto: son unas 500 líneas, desde `-- RIT Digital · PARTE 1` hasta el final.
2. Abre `https://supabase.com/dashboard/projects` y pregúntale a Jeremy en qué proyecto va. Recomienda el mismo de la app de firmas: las tablas de esta app empiezan con `rit_` y no chocan con las de firmas.
3. En el proyecto, abre **SQL Editor → New query**, pega el texto completo y toca **Run**.
4. Debe terminar con *Success*. Si sale un aviso de "destructive operation", lee qué dice y consulta a Jeremy antes de confirmar.

## Paso 3 · Claves (parte 2): lo hace Jeremy
1. Abre `https://raw.githubusercontent.com/jeremyandresmoreno19-dot/rit-digital/main/sql/2-claves.sql`, cópialo y pégalo en otra **New query**. **No toques Run.**
2. Dile a Jeremy:
   > "Cambia tú los tres textos `CAMBIA-clave-jeremy`, `CAMBIA-clave-prevencion` y `CAMBIA-clave-equipo` por tus claves (mínimo 6 caracteres, sin comillas simples). Deja las comillas que los rodean. Después aprieta Run y avísame."
3. Espera su aviso. No leas en voz alta ni repitas las claves que escribió.
4. Para comprobar, ejecuta en una **New query** `select nombre, rol from public.rit_claves;`. Deben salir 3 filas: Jeremy, Prevención y Equipo MISPA.

## Paso 4 · Conectar la app
1. En Supabase abre **Project Settings → API** (o **Data API / API Keys**). Copia la **Project URL**, que tiene la forma `https://xxxx.supabase.co`.
2. Copia también la clave **anon public**: un texto largo que empieza con `eyJ…` o con `sb_publishable_…`. **No** copies la `service_role` / `secret`.
3. Abre `https://github.com/jeremyandresmoreno19-dot/rit-digital/edit/main/config.js`.
4. Reemplaza `https://TU-PROYECTO.supabase.co` por la Project URL y `TU-ANON-KEY` por la clave anon. Mantén las comillas dobles.
5. Toca **Commit changes…**, con el mensaje `Conectar con Supabase`, y la opción *Commit directly to the main branch*.

## Paso 5 · Probar
1. Espera 1 o 2 minutos y abre `https://jeremyandresmoreno19-dot.github.io/rit-digital/`. Recarga con Ctrl+Shift+R.
2. Bajo el encabezado **ya no** debe decir "Catálogo local (la nube aún no está configurada)".
3. Si la página da 404 o sigue diciendo "Catálogo local", espera otro minuto, recarga y revisa `config.js`.
4. Pídele a Jeremy que pruebe su clave del equipo en la app.
5. Cuando todo funcione, dile: "Listo. En el celular abre el link en Chrome → ⋮ → Agregar a pantalla de inicio".
