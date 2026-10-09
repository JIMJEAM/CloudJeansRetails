# 🛍️ Mapa Retail · Tiendas de Ropa (Jalisco, Guanajuato, Nuevo León, Coahuila, Sonora, Sinaloa, Nayarit, Durango, Chihuahua, San Luis Potosí, Aguascalientes, Michoacán, Baja California Sur, Baja California y Querétaro)

Web app estática (HTML + CSS + JS, sin build) que muestra en un mapa las tiendas de ropa de
`data/tiendas_ropa_jalisco_final.csv` y `data/tiendas_ropa_guanajuato_final.csv`, permite consultar teléfono / email / WhatsApp y trae un
editor de mensajes de WhatsApp que genera enlaces `wa.me`.

## Funciones
- **Buscador estilo directorio** (inspirado en tiendasinfo.mx): *¿Qué buscas?* + *¿Dónde?* + **📍 Cerca de mí** con radio de 15/30/70/200 km, distancia y orden por cercanía.
- **Mapa** (Leaflet) con agrupación de marcadores, 5 capas (calles, claro, oscuro, satélite, OSM), tooltips al pasar sobre tarjetas y botón "ver todo". Morado = con teléfono, gris = sin teléfono.
- **Directorio por municipio** con conteos y **índice A–Z**; chips de filtros activos.
- **✨ Asistente IA (Gemini)**: pregunta en lenguaje natural ("boutiques en Zapopan con teléfono") y filtra el mapa.
- **Consulta**: búsqueda por nombre/municipio/teléfono, filtro por municipio y "solo con teléfono".
- **Tarjetas**: llamar, copiar teléfono, email, WhatsApp y abrir la búsqueda de Google Maps (`url_fuente`).
- **Editor WhatsApp**:
  - Plantillas predefinidas y plantillas propias (se guardan en el navegador).
  - Formato de WhatsApp: *negrita*, _cursiva_, ~tachado~, ```monoespaciado```, viñetas, listas numeradas y citas.
  - Emojis rápidos + selector completo con búsqueda.
  - Variables `{nombre}`, `{municipio}`, `{telefono}`, `{mi_nombre}`.
  - Vista previa estilo chat, contador de caracteres, enlace `wa.me`, copiar enlace/mensaje y código QR.
  - **✨ Redactar / mejorar con IA** eligiendo el tono (conserva las variables).
  - **Mensaje masivo**: genera un enlace personalizado por cada tienda del filtro actual.
  - Número manual (botón "✍️ Editor WA") para escribir a cualquier contacto.
- **Exportar** la lista filtrada a CSV (incluye la columna `wa_link`).
- Tema claro/oscuro y diseño móvil (la lista se vuelve un panel deslizable).

## Datos
- La app lee un CSV por estado, listados en `SOURCES` de `js/app.js` (Jalisco: `data/tiendas_ropa_jalisco_final.csv`, Guanajuato: `data/tiendas_ropa_guanajuato_final.csv`, Nuevo León: `data/tiendas_ropa_nuevo-leon_final.csv`, Coahuila: `data/tiendas_ropa_coahuila_final.csv`, Sonora: `data/tiendas_ropa_sonora_final.csv`, Sinaloa: `data/tiendas_ropa_sinaloa_final.csv`, Nayarit: `data/tiendas_ropa_Nayarit_final.csv`, Durango: `data/tiendas_ropa_durango_final.csv`, Chihuahua: `data/tiendas_ropa_chihuahua_final.csv`, San Luis Potosí: `data/tiendas_ropa_san_luis_potosi_final.csv`, Aguascalientes: `data/tiendas_ropa_Aguascalientes_final.csv`, Michoacán: `data/tiendas_ropa_michoacan_final.csv`, Baja California Sur: `data/tiendas_ropa_baja_california_sur_final.csv`, Baja California: `data/tiendas_ropa_baja_california_norte_final.csv`, Querétaro: `data/tiendas_ropa_Queretaro_final.csv`); el estado se toma del archivo. Para actualizar datos, reemplaza el archivo con las mismas columnas:
  `nombre,municipio,teléfono,correo,WhatsApp,sitio_red,url_fuente`. `ND` = no disponible.
- El CSV no trae coordenadas: cada tienda se ubica en el **centro aproximado de su municipio** (`js/geo.js`).
  Si agregas un municipio nuevo, añade su latitud/longitud ahí.
- Si la columna `WhatsApp` está vacía se usa el `teléfono` como número de WhatsApp.
- Teléfonos 800 o repetidos en varias tiendas se marcan como **corporativo**.

## Correr localmente
`fetch` no funciona abriendo el archivo con doble clic, usa un servidor:

- **VS Code**: instala la extensión *Live Server* → clic derecho en `index.html` → *Open with Live Server*.
- o con Python: `python -m http.server 8080` y abre http://localhost:8080
- o con Node: `npx serve .`

(Si lo abres sin servidor, la app te deja cargar el CSV manualmente.)

## Publicar en GitHub
```bash
git init
git add .
git commit -m "Mapa retail de tiendas de ropa"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/mapa-tiendas.git
git push -u origin main
```
(Crea antes el repositorio vacío en https://github.com/new.)

## Desplegar en Netlify
1. Entra a https://app.netlify.com → **Add new site → Import an existing project → GitHub**.
2. Elige el repositorio.
3. Build command: *(vacío)* · Publish directory: `.` (ya viene en `netlify.toml`).
4. **Site configuration → Environment variables → Add variable**:
   - `GEMINI_API_KEY` = tu clave de Google AI Studio (márcala como *secret*).
   - (opcional) `GEMINI_MODEL` = modelo preferido, p. ej. `gemini-3.5-flash-lite`.
5. **Deploy** (o *Trigger deploy* si ya estaba publicado). Cada `git push` a `main` vuelve a publicar.

> ⚠️ **La clave nunca va en el código.** El navegador llama a `/api/ai` (función `netlify/functions/ai.mjs`)
> y la función usa `GEMINI_API_KEY` del servidor. No la pongas en `js/`, ni en un `.env` dentro de la carpeta
> si vas a usar Netlify Drop (Drop publica todos los archivos tal cual).

Netlify Drop (https://app.netlify.com/drop) sirve para el mapa, pero **no ejecuta funciones**: el asistente IA
solo funciona desplegando desde GitHub o con la CLI (`netlify deploy --prod`).

### IA en local
Con la CLI de Netlify (`npm i -g netlify-cli`): crea un archivo `.env` (ya está en `.gitignore`) con
`GEMINI_API_KEY=...` y ejecuta `netlify dev`. Con Live Server el mapa funciona pero el asistente muestra un aviso.

### Cuota de Gemini
La capa gratuita tiene límites por minuto/día. Si un modelo responde 429/503 la función prueba el siguiente
(`gemini-3.5-flash-lite` → `gemini-flash-latest` → `gemini-flash-lite-latest`). El endpoint solo acepta las dos
tareas de la app (búsqueda y redacción), no es un proxy abierto.

## Estructura
```
index.html
css/styles.css
js/geo.js        # centroides por municipio
js/app.js        # carga CSV, mapa, filtros, lista
js/whatsapp.js   # editor de mensajes y enlaces wa.me
js/ai.js         # cliente del endpoint /api/ai
netlify/functions/ai.mjs   # función que llama a Gemini con la clave del servidor
data/tiendas_ropa_*_final.csv   # un CSV por estado
netlify.toml
```
