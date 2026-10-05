// Editor de mensajes WhatsApp: plantillas, formato, emojis, variables y enlaces wa.me
window.WA = (function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS_TPL = 'wa_templates_v1';
  const LS_NAME = 'wa_my_name';
  const LS_DRAFT = 'wa_draft';

  const QUICK = ['👋', '😊', '🙌', '🛍️', '👗', '👕', '👖', '👟', '👜', '🧥', '✨', '🔥', '💥', '💰', '🏷️', '📦', '🚚', '📍', '📞', '📲', '📸', '✅', '⭐', '🎉', '🙏', '💯', '➡️', '👇'];

  const BUILTIN = [
    {
      id: 'presentacion', name: '🤝 Presentación de proveedor',
      text: '¡Hola, *{nombre}*! 👋\n\nSoy {mi_nombre}, proveedor de ropa en Jalisco 🛍️. Nos encantaría ser parte de su inventario en *{municipio}*.\n\n✅ Precios de mayoreo\n✅ Envíos a todo Jalisco 🚚\n✅ Nuevas colecciones cada mes ✨\n\n¿Le puedo compartir nuestro catálogo? 📲',
    },
    {
      id: 'mayoreo', name: '💰 Oferta de mayoreo',
      text: '¡Hola {nombre}! 🔥\n\nEsta semana tenemos *promoción de mayoreo*:\n\n• 👖 Pantalones desde _$X_\n• 👕 Playeras desde _$X_\n• 👗 Vestidos desde _$X_\n\n📦 Pedido mínimo: X piezas\n📍 Entrega en {municipio}\n\n¿Le interesa? Responda este mensaje 🙌\n— {mi_nombre}',
    },
    {
      id: 'catalogo', name: '📸 Invitación a catálogo',
      text: 'Buen día, *{nombre}* ✨\n\nLe comparto nuestro *catálogo de temporada* 📸 con modelos nuevos para dama, caballero y niños.\n\n👉 ¿Prefiere que se lo envíe por aquí o le agendo una visita en {municipio}?\n\n¡Saludos! 🙏\n{mi_nombre}',
    },
    {
      id: 'seguimiento', name: '🔁 Seguimiento',
      text: 'Hola {nombre} 😊\n\nLe escribo para dar seguimiento a la información que le compartimos. ¿Tuvo oportunidad de revisarla? 📋\n\nQuedo atento(a) a cualquier duda ✅\n{mi_nombre}',
    },
    { id: 'blank', name: '📝 En blanco', text: '' },
  ];

  let mode = 'single';
  let store = null;
  let bulk = [];
  let custom = [];
  let selStart = 0, selEnd = 0;

  const ta = () => $('waText');

  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function loadCustom() {
    try { custom = JSON.parse(lsGet(LS_TPL, '[]')) || []; } catch (e) { custom = []; }
  }

  function renderTemplates(selected) {
    const opts = BUILTIN.map((t) => `<option value="b:${t.id}">${esc(t.name)}</option>`);
    if (custom.length) {
      opts.push('<optgroup label="Mis plantillas">' +
        custom.map((t, i) => `<option value="c:${i}">⭐ ${esc(t.name)}</option>`).join('') + '</optgroup>');
    }
    $('tplSelect').innerHTML = opts.join('');
    if (selected) $('tplSelect').value = selected;
  }

  function currentTemplate() {
    const [kind, key] = $('tplSelect').value.split(':');
    return kind === 'b' ? BUILTIN.find((t) => t.id === key) : custom[+key];
  }

  // ---------- Variables / formato ----------
  function fill(text, s) {
    const me = $('myName').value.trim() || 'tu nombre';
    return text
      .replace(/\{nombre\}/gi, s ? s.nombre : 'Tienda')
      .replace(/\{municipio\}/gi, s ? s.municipio : 'tu municipio')
      .replace(/\{telefono\}/gi, s && s.telefono ? s.telefono : '')
      .replace(/\{mi_nombre\}/gi, me);
  }

  function waFormat(text) {
    let h = esc(text);
    h = h.replace(/```([\s\S]+?)```/g, '<code>$1</code>');
    h = h.replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=$|[\s.,!?:;)])/gm, '$1<b>$2</b>');
    h = h.replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=$|[\s.,!?:;)])/gm, '$1<i>$2</i>');
    h = h.replace(/(^|[\s(])~(?!\s)([^~\n]+?)~(?=$|[\s.,!?:;)])/gm, '$1<s>$2</s>');
    h = h.replace(/^&gt; (.*)$/gm, '<span class="quote">$1</span>');
    return h.replace(/\n/g, '<br>');
  }

  const link = (digits, msg) => `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;

  function targetDigits() {
    if (store) return store.waDigits;
    let d = ($('manualNum') ? $('manualNum').value : '').replace(/\D/g, '');
    if (d.length === 10) d = '52' + d;
    return d.length >= 11 ? d : null;
  }

  // ---------- Render ----------
  function update() {
    const raw = ta().value;
    lsSet(LS_DRAFT, raw);
    $('charCount').textContent = `${raw.length} caracteres`;

    const sample = mode === 'bulk' ? bulk[0] : store;
    const msg = fill(raw, sample);
    $('pvName').textContent = sample ? sample.nombre : (targetDigits() ? '+' + targetDigits() : 'Contacto');
    $('pvBubble').innerHTML = (waFormat(msg) || '<span class="muted">Vista previa…</span>') +
      `<span class="time">${new Date().toTimeString().slice(0, 5)} ✓✓</span>`;

    if (mode === 'single') {
      const d = targetDigits();
      const url = d ? link(d, msg) : (msg ? `https://wa.me/?text=${encodeURIComponent(msg)}` : '');
      $('waLink').value = url;
      $('waOpen').href = url || '#';
      $('waOpen').classList.toggle('disabled', !url);
      if (!$('qr').classList.contains('hidden')) drawQr();
    } else {
      $('bulkCount').textContent = `${bulk.length} enlaces personalizados`;
      $('bulkList').innerHTML = bulk.map((s, i) => `
        <li>
          <span><b>${esc(s.nombre)}</b><small>${esc(s.municipio)} · +${esc(s.waDigits)}</small></span>
          <a class="btn sm btn-wa" target="_blank" rel="noopener" data-sent="${i}" href="${esc(link(s.waDigits, fill(raw, s)))}">Enviar ↗</a>
        </li>`).join('');
    }
  }

  function drawQr() {
    const box = $('qr');
    box.innerHTML = '';
    const url = $('waLink').value;
    if (!url) { box.textContent = 'Escribe un mensaje primero'; return; }
    if (typeof QRCode === 'undefined') { box.textContent = 'QR no disponible'; return; }
    new QRCode(box, { text: url, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.L });
  }

  function setTarget() {
    const t = $('waTarget');
    if (mode === 'bulk') {
      t.innerHTML = `<span class="tag">Masivo</span> ${bulk.length} tiendas del filtro actual. Cada enlace se personaliza con sus variables.`;
    } else if (store) {
      t.innerHTML = `<span class="tag ok">Para</span> <b>${esc(store.nombre)}</b> · ${esc(store.municipio)} · +${esc(store.waDigits)}`;
    } else {
      t.innerHTML = `<label for="manualNum">Número WhatsApp (10 dígitos o con lada país)</label>
        <input id="manualNum" type="tel" placeholder="33 1234 5678">`;
      $('manualNum').addEventListener('input', update);
    }
    $('singleOut').classList.toggle('hidden', mode === 'bulk');
    $('bulkOut').classList.toggle('hidden', mode !== 'bulk');
  }

  function open() {
    loadCustom();
    renderTemplates();
    const draft = lsGet(LS_DRAFT, '');
    if (draft) { ta().value = draft; $('tplSelect').value = 'b:blank'; }
    else { $('tplSelect').value = 'b:presentacion'; ta().value = BUILTIN[0].text; }
    $('qr').classList.add('hidden');
    $('emojiPop').classList.add('hidden');
    setTarget();
    update();
    $('waModal').classList.remove('hidden');
    document.body.classList.add('no-scroll');
    setTimeout(() => ta().focus(), 50);
  }

  function close() {
    $('waModal').classList.add('hidden');
    document.body.classList.remove('no-scroll');
  }

  // ---------- Edición ----------
  function remember() { selStart = ta().selectionStart; selEnd = ta().selectionEnd; }

  function insert(text) {
    const el = ta();
    const v = el.value;
    el.value = v.slice(0, selStart) + text + v.slice(selEnd);
    selStart = selEnd = selStart + text.length;
    el.focus();
    el.setSelectionRange(selStart, selEnd);
    update();
  }

  function wrap(mark) {
    const el = ta();
    const v = el.value;
    const sel = v.slice(selStart, selEnd) || 'texto';
    const out = mark + sel + mark;
    el.value = v.slice(0, selStart) + out + v.slice(selEnd);
    el.focus();
    el.setSelectionRange(selStart + mark.length, selStart + mark.length + sel.length);
    remember();
    update();
  }

  function prefixLines(prefix) {
    const el = ta();
    const v = el.value;
    const lineStart = v.lastIndexOf('\n', selStart - 1) + 1;
    let lineEnd = v.indexOf('\n', Math.max(selEnd, selStart));
    if (lineEnd === -1) lineEnd = v.length;
    let n = 0;
    const block = v.slice(lineStart, lineEnd).split('\n')
      .map((l) => (prefix === '1. ' ? `${++n}. ` : prefix) + l).join('\n');
    el.value = v.slice(0, lineStart) + block + v.slice(lineEnd);
    el.focus();
    el.setSelectionRange(lineStart, lineStart + block.length);
    remember();
    update();
  }

  // ---------- Eventos ----------
  function init() {
    $('myName').value = lsGet(LS_NAME, '');
    $('quickEmojis').innerHTML = QUICK.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('');

    ['keyup', 'click', 'select', 'input'].forEach((ev) => ta().addEventListener(ev, remember));
    ta().addEventListener('input', update);
    $('myName').addEventListener('input', () => { lsSet(LS_NAME, $('myName').value); update(); });

    $('toolbar').addEventListener('mousedown', (e) => e.preventDefault()); // conservar selección
    $('toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.wrap) wrap(b.dataset.wrap);
      else if (b.dataset.prefix) prefixLines(b.dataset.prefix);
      else if (b.id === 'emojiToggle') $('emojiPop').classList.toggle('hidden');
    });

    $('quickEmojis').addEventListener('mousedown', (e) => e.preventDefault());
    $('quickEmojis').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emoji]');
      if (b) insert(b.dataset.emoji);
    });
    document.querySelector('emoji-picker').addEventListener('emoji-click', (e) => insert(e.detail.unicode));

    document.querySelectorAll('.chip[data-var]').forEach((c) => {
      c.addEventListener('mousedown', (e) => e.preventDefault());
      c.addEventListener('click', () => insert(c.dataset.var));
    });

    $('tplSelect').addEventListener('change', () => {
      const t = currentTemplate();
      if (t) { ta().value = t.text; selStart = selEnd = t.text.length; update(); }
    });
    $('tplSave').addEventListener('click', () => {
      const name = prompt('Nombre de la plantilla:');
      if (!name) return;
      custom.push({ name: name.trim(), text: ta().value });
      lsSet(LS_TPL, JSON.stringify(custom));
      renderTemplates(`c:${custom.length - 1}`);
      toast('Plantilla guardada 💾');
    });
    $('tplDelete').addEventListener('click', () => {
      const [kind, key] = $('tplSelect').value.split(':');
      if (kind !== 'c') return toast('Solo puedes eliminar tus plantillas ⭐');
      if (!confirm(`¿Eliminar "${custom[+key].name}"?`)) return;
      custom.splice(+key, 1);
      lsSet(LS_TPL, JSON.stringify(custom));
      renderTemplates('b:blank');
      toast('Plantilla eliminada');
    });

    $('copyLink').addEventListener('click', () => $('waLink').value ? copyText($('waLink').value, 'Enlace') : toast('Escribe un mensaje'));
    $('copyMsg').addEventListener('click', () => copyText(fill(ta().value, store), 'Mensaje'));
    $('showQr').addEventListener('click', () => { $('qr').classList.toggle('hidden'); drawQr(); });
    $('waOpen').addEventListener('click', (e) => { if ($('waOpen').classList.contains('disabled')) e.preventDefault(); });

    $('copyAllLinks').addEventListener('click', () => {
      const txt = bulk.map((s) => `${s.nombre} (${s.municipio}): ${link(s.waDigits, fill(ta().value, s))}`).join('\n');
      copyText(txt, 'Enlaces');
    });
    $('bulkList').addEventListener('click', (e) => {
      const a = e.target.closest('[data-sent]');
      if (a) a.closest('li').classList.add('sent');
    });

    const aiRun = async (improve) => {
      const instruction = $('aiInstr').value.trim();
      if (!improve && !instruction) { $('aiInstr').focus(); return toast('Describe qué quieres decir en el mensaje'); }
      if (improve && !ta().value.trim()) return toast('Escribe primero un texto para mejorar');
      const btns = [$('aiGen'), $('aiImprove')];
      btns.forEach((b) => { b.disabled = true; });
      const btn = improve ? $('aiImprove') : $('aiGen');
      const label = btn.textContent;
      btn.textContent = '⏳ Pensando…';
      try {
        const r = await AI.ask('message', {
          instruction: improve ? (instruction || 'Mejora la redacción, claridad y persuasión del borrador') : instruction,
          draft: improve ? ta().value : '',
          tone: $('aiTone').value,
        });
        if (!r.mensaje) throw new Error('La IA no devolvió texto');
        ta().value = r.mensaje;
        selStart = selEnd = r.mensaje.length;
        update();
        toast('Mensaje generado con IA ✨ — revísalo antes de enviar');
      } catch (err) {
        toast('⚠️ ' + err.message);
      } finally {
        btns.forEach((b) => { b.disabled = false; });
        btn.textContent = label;
      }
    };
    $('aiGen').addEventListener('click', () => aiRun(false));
    $('aiImprove').addEventListener('click', () => aiRun(true));
    $('aiInstr').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aiRun(false); } });

    $('waClose').addEventListener('click', close);
    $('waModal').addEventListener('click', (e) => { if (e.target.id === 'waModal') close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('waModal').classList.contains('hidden')) close(); });
  }

  init(); // el script se carga al final del <body>, el DOM ya existe

  return {
    openSingle(s) { mode = 'single'; store = s; bulk = []; open(); },
    openBulk(list) { mode = 'bulk'; store = null; bulk = list; open(); },
    format: waFormat,
    fill,
  };
})();
