// Cliente del endpoint /api/ai (Netlify Function que llama a Gemini con la clave del servidor)
window.AI = {
  endpoint: '/api/ai',
  async ask(task, payload) {
    let res;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, ...payload }),
      });
    } catch (e) {
      throw new Error('Sin conexión con el asistente IA');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      if (res.status === 404) throw new Error('El asistente IA solo funciona publicado en Netlify (o con "netlify dev").');
      throw new Error((data && data.error) || `Error ${res.status}`);
    }
    return data;
  },
};
