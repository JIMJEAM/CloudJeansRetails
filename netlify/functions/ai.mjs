// Proxy seguro hacia Gemini (Google AI Studio).
// La clave vive SOLO en la variable de entorno GEMINI_API_KEY de Netlify; nunca llega al navegador.
// Tareas permitidas (no es un proxy genérico, para no exponer la cuota):
//   - search:  pregunta en lenguaje natural sobre las tiendas → filtros + ids + respuesta
//   - message: redactar / mejorar un mensaje de WhatsApp

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// Si un modelo no existe, no tiene cuota o está saturado, se prueba el siguiente
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const clip = (s, n) => String(s ?? '').slice(0, n);

function buildSearch(input) {
  const stores = (Array.isArray(input.stores) ? input.stores : []).slice(0, 500)
    .map((s) => `${+s.id}|${clip(s.nombre, 80)}|${clip(s.municipio, 40)}|${clip(s.estado, 20)}|${s.tel ? 'tel' : 'sin tel'}`)
    .join('\n');
  const municipios = (Array.isArray(input.municipios) ? input.municipios : []).map((m) => clip(m, 40));
  return {
    prompt:
`Eres el asistente de un mapa de tiendas de ropa en Jalisco, Guanajuato, Nuevo León, Coahuila y Sonora, México. Responde en español, breve y útil.
Lista de tiendas (id|nombre|municipio|estado|teléfono):
${stores}

Pregunta del usuario: "${clip(input.question, 500)}"

Instrucciones:
- "ids": ids de las tiendas que responden la pregunta (vacío si la pregunta es general o no aplica).
- "municipio": uno de [${municipios.join(', ')}] si la pregunta se limita a uno, si no null.
- "soloTelefono": true si el usuario pide tiendas contactables / con teléfono / WhatsApp.
- "respuesta": 1-3 frases explicando lo encontrado. Puedes sugerir tipos de tienda (boutique, mayoreo, uniformes, caballero, etc.) deduciéndolos del nombre, aclarando que es inferido.`,
    schema: {
      type: 'OBJECT',
      properties: {
        respuesta: { type: 'STRING' },
        ids: { type: 'ARRAY', items: { type: 'INTEGER' } },
        municipio: { type: 'STRING', nullable: true },
        soloTelefono: { type: 'BOOLEAN' },
      },
      required: ['respuesta', 'ids', 'soloTelefono'],
    },
  };
}

function buildMessage(input) {
  return {
    prompt:
`Redacta un mensaje de WhatsApp en español de México para contactar a una tienda de ropa.
Tono: ${clip(input.tone || 'cordial y profesional', 60)}.
Instrucción del usuario: "${clip(input.instruction, 600)}"
Borrador actual (puede estar vacío):
"""${clip(input.draft, 2000)}"""

Reglas:
- Conserva EXACTAMENTE los marcadores {nombre}, {municipio}, {telefono}, {mi_nombre} si aparecen, y úsalos cuando aporten (al menos {nombre}).
- Usa formato de WhatsApp: *negrita*, _cursiva_, viñetas con "• " o emojis. Incluye emojis con moderación.
- Máximo ~700 caracteres. Sin asunto ni comillas envolventes. Cierra con una llamada a la acción.`,
    schema: {
      type: 'OBJECT',
      properties: { mensaje: { type: 'STRING' } },
      required: ['mensaje'],
    },
  };
}

async function callGemini(key, prompt, schema) {
  const models = [process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean);
  let last;
  for (const model of models) {
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return JSON.parse(text);
    }
    last = { status: res.status, message: data.error?.message || res.statusText };
    // Probar el siguiente modelo si este no existe o no tiene cuota
    if (![404, 429, 503].includes(res.status)) break;
  }
  const err = new Error(last?.message || 'Error de Gemini');
  err.status = last?.status === 429 ? 429 : 502;
  throw err;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'Falta configurar GEMINI_API_KEY en Netlify' }, 500);

  let input;
  try { input = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const builders = { search: buildSearch, message: buildMessage };
  const build = builders[input?.task];
  if (!build) return json({ error: 'Tarea no soportada' }, 400);

  try {
    const { prompt, schema } = build(input);
    return json(await callGemini(key, prompt, schema));
  } catch (e) {
    return json({ error: e.status === 429 ? 'Se agotó la cuota de Gemini, intenta en un momento.' : e.message }, e.status || 500);
  }
};

export const config = { path: '/api/ai' };
