(function () {
  const SOURCES = [
    { estado: 'Jalisco', url: 'data/tiendas_ropa_jalisco_final.csv' },
    { estado: 'Guanajuato', url: 'data/tiendas_ropa_guanajuato_final.csv' },
    { estado: 'Nuevo León', url: 'data/tiendas_ropa_nuevo-leon_final.csv' },
    { estado: 'Coahuila', url: 'data/tiendas_ropa_coahuila_final.csv' },
    { estado: 'Sonora', url: 'data/tiendas_ropa_sonora_final.csv' },
    { estado: 'Sinaloa', url: 'data/tiendas_ropa_sinaloa_final.csv' },
    { estado: 'Nayarit', url: 'data/tiendas_ropa_Nayarit_final.csv' },
    { estado: 'Durango', url: 'data/tiendas_ropa_durango_final.csv' },
    { estado: 'Chihuahua', url: 'data/tiendas_ropa_chihuahua_final.csv' },
    { estado: 'San Luis Potosí', url: 'data/tiendas_ropa_san_luis_potosi_final.csv' },
    { estado: 'Aguascalientes', url: 'data/tiendas_ropa_Aguascalientes_final.csv' },
    { estado: 'Michoacán', url: 'data/tiendas_ropa_michoacan_final.csv' },
    { estado: 'Baja California Sur', url: 'data/tiendas_ropa_baja_california_sur_final.csv' },
    { estado: 'Baja California', url: 'data/tiendas_ropa_baja_california_norte_final.csv' },
    { estado: 'Querétaro', url: 'data/tiendas_ropa_Queretaro_final.csv' },
    { estado: 'Hidalgo', url: 'data/tiendas_ropa_hidalgo_final.csv' },
    { estado: 'Estado de México', url: 'data/clientes_jeans_Estado_de_Mexico.csv' },
    { estado: 'Ciudad de México', url: 'data/tiendas_ropa_CDMX_final.csv' },
    { estado: 'Puebla', url: 'data/tiendas_ropa_puebla_final.csv' },
  ];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    stores: [], filtered: [], markers: new Map(),
    letter: '', aiIds: null, me: null, near: false,
  };

  // ---------- Tema ----------
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  try {
    const t = localStorage.getItem('theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch (e) {}
  $('btnTheme').addEventListener('click', () => {
    document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('theme', document.documentElement.dataset.theme); } catch (e) {}
    syncTheme();
  });

  // ---------- Toast / copiar ----------
  let toastTimer;
  window.toast = function (msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  };
  window.copyText = async function (text, label) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast((label || 'Texto') + ' copiado ✅');
  };

  // ---------- Mapa ----------
  const map = L.map('map', { zoomControl: false }).setView(GEO.center, GEO.zoom);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

  // Capas sin clave de API (Esri + OpenStreetMap)
  const esri = (service, maxZoom) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19, maxNativeZoom: maxZoom, attribution: 'Tiles &copy; Esri',
  });
  const bases = {
    '🗺️ Calles': esri('World_Street_Map', 19),
    '⚪ Claro': esri('Canvas/World_Light_Gray_Base', 16),
    '⚫ Oscuro': esri('Canvas/World_Dark_Gray_Base', 16),
    '🛰️ Satélite': esri('World_Imagery', 19),
    '🧭 OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }),
  };
  let userPickedBase = false;
  let currentBase = isDark() ? bases['⚫ Oscuro'] : bases['🗺️ Calles'];
  currentBase.addTo(map);
  L.control.layers(bases, null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', (e) => { currentBase = e.layer; userPickedBase = true; });

  function syncTheme() {
    const dark = isDark();
    if (!userPickedBase) {
      map.removeLayer(currentBase);
      currentBase = dark ? bases['⚫ Oscuro'] : bases['🗺️ Calles'];
      currentBase.addTo(map);
    }
    const p = document.querySelector('emoji-picker');
    if (p) { p.classList.toggle('dark', dark); p.classList.toggle('light', !dark); }
  }
  syncTheme();

  // Botón "ver todo"
  const HomeCtl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const b = L.DomUtil.create('button', 'map-btn');
      b.title = 'Ver todas las tiendas'; b.innerHTML = '⤢';
      L.DomEvent.on(b, 'click', (e) => { L.DomEvent.stop(e); fitAll(); });
      return b;
    },
  });
  new HomeCtl().addTo(map);

  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true, chunkedLoading: true,
    iconCreateFunction: (c) => {
      const n = c.getChildCount();
      const size = n < 5 ? 36 : n < 15 ? 44 : 52;
      return L.divIcon({ html: `<div><span>${n}</span></div>`, className: 'cluster', iconSize: [size, size] });
    },
  });
  map.addLayer(cluster);
  const meLayer = L.layerGroup().addTo(map);

  const pin = (cls) => L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin ${cls}"><span>👗</span></div>`,
    iconSize: [30, 38], iconAnchor: [15, 38], popupAnchor: [0, -34], tooltipAnchor: [0, -30],
  });

  // ---------- Datos ----------
  const clean = (v) => {
    const s = (v ?? '').toString().trim();
    return !s || /^n\/?d$/i.test(s) ? null : s;
  };
  const digits = (p) => (p || '').replace(/\D/g, '');

  function normalizeRows(rows) {
    const phoneCount = {};
    const keyNorm = new Map();
    const stores = rows.map((raw, i) => {
      const r = {};
      for (const k of Object.keys(raw)) r[keyNorm.get(k) ?? (keyNorm.set(k, GEO.norm(k)), keyNorm.get(k))] = raw[k];
      const telefono = clean(r['telefono']);
      const whatsapp = clean(r['whatsapp']);
      const s = {
        id: i,
        nombre: clean(r['nombre']) || 'Sin nombre',
        municipio: clean(r['municipio']) || 'Sin municipio',
        estado: raw.__estado || 'Jalisco',
        telefono,
        correo: clean(r['correo']),
        whatsapp,
        sitio: clean(r['sitio_red']),
        fuente: clean(r['url_fuente']),
      };
      let wa = digits(whatsapp || telefono);
      if (wa.length === 10) wa = '52' + wa; // número nacional sin lada de país
      s.waDigits = wa.length >= 11 ? wa : null;
      s.latlng = GEO.locate(s.municipio, s.nombre, s.estado);
      if (telefono) phoneCount[digits(telefono)] = (phoneCount[digits(telefono)] || 0) + 1;
      return s;
    });
    stores.forEach((s) => {
      const d = digits(s.telefono);
      s.corporativo = !!d && (/^52(800|900)/.test(d) || phoneCount[d] > 1);
      s.letter = firstLetter(s.nombre);
    });
    return stores.filter((s) => s.nombre !== 'Sin nombre' || s.telefono);
  }

  function firstLetter(name) {
    const c = GEO.norm(name).replace(/[^a-z0-9]/g, '').charAt(0);
    return /[a-z]/.test(c) ? c.toUpperCase() : '#';
  }

  function load(rows) {
    state.stores = normalizeRows(rows);
    $('fallback').classList.add('hidden');

    const estados = [...new Set(state.stores.map((s) => s.estado))];
    $('fEstado').innerHTML = '<option value="">Todos los estados</option>' +
      estados.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
    fillMunSelect();

    renderAZ();
    renderMunList();
    buildMarkers();
    applyFilters(true);
    const missing = state.stores.filter((s) => !s.latlng);
    if (missing.length) toast(`${missing.length} tienda(s) sin ubicación: agrega su municipio en js/geo.js`);
    hideLoader();
  }

  function fillMunSelect() {
    const est = $('fEstado').value;
    $('fMun').innerHTML = '<option value="">' + (est ? `Todo ${esc(est)}` : 'Todos los municipios') + '</option>' +
      municipios(est).map((m) => `<option value="${esc(m.name)}">${esc(m.name)} (${m.total})</option>`).join('');
  }

  function municipios(estado) {
    const by = {};
    state.stores.forEach((s) => {
      if (estado && s.estado !== estado) return;
      const m = by[s.municipio] || (by[s.municipio] = { name: s.municipio, total: 0, phone: 0 });
      m.total++; if (s.telefono) m.phone++;
    });
    return Object.values(by).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  function parseCSV(text, estado) {
    const res = Papa.parse(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
    return res.data.map((r) => ({ ...r, __estado: estado }));
  }

  // Cada archivo aporta su estado; si uno falla se muestra el resto
  let loaded = 0;
  $('loaderChips').innerHTML = SOURCES.map((s) => `<span data-e="${esc(s.estado)}">${esc(s.estado)}</span>`).join('');

  // Porcentaje con conteo suave (acompaña la transición de la barra)
  let shownPct = 0;
  let pctRaf = 0;
  const showPct = (target) => {
    cancelAnimationFrame(pctRaf);
    const step = () => {
      shownPct = Math.min(target, shownPct + Math.max(1, Math.ceil((target - shownPct) / 6)));
      $('loaderPct').textContent = `${shownPct}%`;
      if (shownPct < target) pctRaf = requestAnimationFrame(step);
    };
    step();
  };

  // Consejos que rotan mientras se espera
  const TIPS = [
    '💡 Usa “📍 Cerca de mí” para ver las tiendas más próximas.',
    '💬 Escribe a cualquier tienda por WhatsApp desde su tarjeta.',
    '🔎 Busca por nombre de tienda, marca, municipio o teléfono.',
    '📥 Exporta la lista filtrada a CSV con los enlaces de WhatsApp.',
    '🤖 Pregúntale al asistente de IA qué tiendas te convienen.',
  ];
  let tipIdx = 0;
  const tipEl = $('loaderTip');
  tipEl.textContent = TIPS[0];
  const tipTimer = setInterval(() => {
    tipEl.classList.add('swap');
    setTimeout(() => { tipIdx = (tipIdx + 1) % TIPS.length; tipEl.textContent = TIPS[tipIdx]; tipEl.classList.remove('swap'); }, 250);
  }, 3200);

  // Cierra con un "¡Listo!" y se desvanece (idempotente: también se llama al cargar un CSV a mano)
  function hideLoader(failed) {
    const el = $('loader');
    if (el.classList.contains('hidden') || el.classList.contains('done')) return;
    clearInterval(tipTimer);
    if (failed) { el.classList.add('hidden'); return; }
    el.classList.add('done');
    $('loaderBar').style.width = '100%';
    showPct(100);
    $('loaderTitle').textContent = '¡Listo!';
    $('loaderIcon').textContent = '✅';
    $('loaderText').textContent = `${state.stores.length.toLocaleString('es-MX')} tiendas en ${new Set(state.stores.map((s) => s.estado)).size} estados`;
    tipEl.textContent = '';
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.classList.add('hidden'), 300);
    }, 350);
  }

  const tick = (estado, ok) => {
    loaded++;
    // Descarga = 90 % de la barra; el 10 % restante es ubicar las tiendas en el mapa
    const pct = Math.round((loaded / SOURCES.length) * 90);
    $('loaderBar').style.width = `${pct}%`;
    showPct(pct);
    $('loaderText').textContent = `${loaded} de ${SOURCES.length} estados descargados…`;
    const chip = [...$('loaderChips').children].find((c) => c.dataset.e === estado);
    if (chip) chip.classList.add(ok ? 'done' : 'fail');
  };
  Promise.all(SOURCES.map((src) =>
    fetch(src.url, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((t) => { const rows = parseCSV(t, src.estado); tick(src.estado, true); return rows; })
      .catch(() => { tick(src.estado, false); return []; })
  )).then((parts) => {
    const rows = parts.flat();
    if (!rows.length) throw new Error('sin datos');
    // Fase final: se pinta el 90 % antes de que el trabajo pesado bloquee el hilo
    $('loaderTitle').textContent = 'Ubicando tiendas en el mapa…';
    $('loaderText').textContent = `${rows.length.toLocaleString('es-MX')} tiendas · casi listo`;
    $('loaderBar').style.width = '96%';
    showPct(96);
    setTimeout(() => {
      try { load(rows); } catch (err) {
        console.error(err);
        hideLoader(true);
        $('fallback').classList.remove('hidden');
      }
    }, 30);
  }).catch(() => {
    hideLoader(true);
    $('fallback').classList.remove('hidden');
  });

  $('csvFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) f.text().then((t) => load(parseCSV(t, /guanajuato/i.test(f.name) ? 'Guanajuato' : /nuevo.?leon/i.test(f.name) ? 'Nuevo León' : /coahuila/i.test(f.name) ? 'Coahuila' : /sonora/i.test(f.name) ? 'Sonora' : /sinaloa/i.test(f.name) ? 'Sinaloa' : /nayarit/i.test(f.name) ? 'Nayarit' : /durango/i.test(f.name) ? 'Durango' : /chihuahua/i.test(f.name) ? 'Chihuahua' : /san.?luis/i.test(f.name) ? 'San Luis Potosí' : /aguascalientes/i.test(f.name) ? 'Aguascalientes' : /michoacan/i.test(f.name) ? 'Michoacán' : /baja.?california.?sur/i.test(f.name) ? 'Baja California Sur' : /baja.?california/i.test(f.name) ? 'Baja California' : /queretaro/i.test(f.name) ? 'Querétaro' : /hidalgo/i.test(f.name) ? 'Hidalgo' : /estado.?de.?mexico/i.test(f.name) ? 'Estado de México' : /cdmx|ciudad.?de.?mexico/i.test(f.name) ? 'Ciudad de México' : /puebla/i.test(f.name) ? 'Puebla' : 'Jalisco')));
  });

  // ---------- Distancia ----------
  const distKm = (s) => (state.me && s.latlng ? map.distance(state.me, s.latlng) / 1000 : null);
  const fmtKm = (km) => (km == null ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

  // ---------- Popups / tarjetas ----------
  function contactHTML(s) {
    const tel = s.telefono
      ? `<a href="tel:+${digits(s.telefono)}">${esc(s.telefono)}</a>${s.corporativo ? ' <span class="tag warn" title="Número compartido o 800: probablemente corporativo">corporativo</span>' : ''}`
      : '<span class="muted">No disponible</span>';
    const mail = s.correo ? `<a href="mailto:${esc(s.correo)}">${esc(s.correo)}</a>` : '<span class="muted">No disponible</span>';
    const wa = s.waDigits
      ? `+${esc(s.waDigits)}${s.whatsapp ? '' : ' <span class="tag" title="Se usa el teléfono como WhatsApp">vía teléfono</span>'}`
      : '<span class="muted">No disponible</span>';
    const site = s.sitio ? `<dt>🌐</dt><dd><a href="${esc(s.sitio)}" target="_blank" rel="noopener">${esc(s.sitio)}</a></dd>` : '';
    return `<dl class="contact">
      <dt>📞</dt><dd>${tel}</dd>
      <dt>✉️</dt><dd>${mail}</dd>
      <dt>💬</dt><dd>${wa}</dd>${site}
    </dl>`;
  }

  function actionsHTML(s) {
    const dir = s.latlng ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.nombre} ${s.municipio} ${s.estado}`)}` : s.fuente;
    return `<div class="actions">
      <button class="btn sm btn-wa" data-act="wa" data-id="${s.id}" ${s.waDigits ? '' : 'disabled'}>💬 WhatsApp</button>
      <a class="btn sm ${s.telefono ? '' : 'disabled'}" ${s.telefono ? `href="tel:+${digits(s.telefono)}"` : ''}>📞 Llamar</a>
      <button class="btn sm" data-act="copy" data-id="${s.id}" ${s.telefono ? '' : 'disabled'}>📋 Copiar</button>
      <a class="btn sm ${s.correo ? '' : 'disabled'}" ${s.correo ? `href="mailto:${esc(s.correo)}"` : ''}>✉️ Email</a>
      ${dir ? `<a class="btn sm" href="${esc(dir)}" target="_blank" rel="noopener">📍 Google Maps</a>` : ''}
    </div>`;
  }

  function popupHTML(s) {
    const d = distKm(s);
    return `<div class="popup">
      <h3>${esc(s.nombre)}</h3>
      <p class="muted">📍 ${esc(s.municipio)}, ${esc(s.estado)} · ubicación aproximada${d != null ? ` · a ${fmtKm(d)}` : ''}</p>
      ${contactHTML(s)}
      ${actionsHTML(s)}
    </div>`;
  }

  // Popup y tooltip se crean la primera vez que se necesitan (con ~15 mil pines, crearlos todos al cargar es lo más lento)
  function bindLazy(m) {
    if (m.getPopup()) return;
    const s = m._store;
    m.bindPopup(() => popupHTML(s), { maxWidth: 310 });
    m.bindTooltip(esc(s.nombre), { direction: 'top', className: 'pin-tip' });
  }

  function buildMarkers() {
    cluster.clearLayers();
    state.markers.clear();
    const icons = { ok: pin('ok'), none: pin('none') };
    state.stores.forEach((s) => {
      if (!s.latlng) return;
      const m = L.marker(s.latlng, { icon: s.telefono ? icons.ok : icons.none, title: s.nombre, riseOnHover: true });
      m._store = s;
      m.once('mouseover', () => { bindLazy(m); m.openTooltip(); });
      m.on('click', () => {
        highlight(s.id, false);
        if (!m.getPopup()) { bindLazy(m); m.openPopup(); } // táctil: aún no hubo "mouseover"
      });
      state.markers.set(s.id, m);
    });
  }

  // ---------- Filtros ----------
  function applyFilters(fit) {
    const q = GEO.norm($('q').value);
    const mun = $('fMun').value;
    const est = $('fEstado').value;
    const onlyPhone = $('fPhone').checked;
    const radius = +$('fRadius').value;

    state.filtered = state.stores.filter((s) => {
      if (est && s.estado !== est) return false;
      if (mun && s.municipio !== mun) return false;
      if (onlyPhone && !s.telefono) return false;
      if (state.letter && s.letter !== state.letter) return false;
      if (state.aiIds && !state.aiIds.has(s.id)) return false;
      if (state.near && state.me) { const d = distKm(s); if (d == null || d > radius) return false; }
      if (q && !(s.hay ||= GEO.norm(`${s.nombre} ${s.municipio} ${s.estado} ${s.telefono || ''} ${digits(s.telefono)}`)).includes(q)) return false;
      return true;
    });

    const sort = $('fSort').value;
    const cmp = {
      az: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
      mun: (a, b) => a.municipio.localeCompare(b.municipio, 'es') || a.nombre.localeCompare(b.nombre, 'es'),
      dist: (a, b) => (distKm(a) ?? 1e9) - (distKm(b) ?? 1e9),
    }[sort];
    state.filtered.sort(cmp);

    cluster.clearLayers();
    const layers = state.filtered.map((s) => state.markers.get(s.id)).filter(Boolean);
    cluster.addLayers(layers);

    if (fit === true) {
      if (state.near && state.me) {
        map.fitBounds(L.latLng(state.me).toBounds(radius * 2000), { maxZoom: 13 });
      } else if (layers.length) {
        map.fitBounds(L.featureGroup(layers).getBounds().pad(0.25), { maxZoom: 13 });
      }
    }

    renderStats();
    renderActiveFilters();
    renderList();
    $('az').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.l === state.letter));
  }

  function fitAll() {
    const layers = [...state.markers.values()];
    if (layers.length) map.fitBounds(L.featureGroup(layers).getBounds().pad(0.15));
  }

  function renderStats() {
    const f = state.filtered;
    $('stats').innerHTML = `
      <div><strong>${f.length}</strong><span>tiendas</span></div>
      <div><strong>${f.filter((s) => s.telefono).length}</strong><span>con teléfono</span></div>
      <div><strong>${f.filter((s) => s.waDigits).length}</strong><span>WhatsApp</span></div>
      <div><strong>${new Set(f.map((s) => s.municipio)).size}</strong><span>municipios</span></div>`;
  }

  function renderActiveFilters() {
    const chips = [];
    if ($('q').value.trim()) chips.push(['q', `“${$('q').value.trim()}”`]);
    if ($('fEstado').value) chips.push(['est', `🏞️ ${$('fEstado').value}`]);
    if ($('fMun').value) chips.push(['mun', `📍 ${$('fMun').value}`]);
    if (state.near) chips.push(['near', `🎯 ≤ ${$('fRadius').value} km de ti`]);
    if (state.letter) chips.push(['letter', `Letra ${state.letter}`]);
    if ($('fPhone').checked) chips.push(['phone', '📞 Con teléfono']);
    if (state.aiIds) chips.push(['ai', `✨ Resultados IA (${state.aiIds.size})`]);
    $('activeFilters').innerHTML = chips.map(([k, l]) => `<button class="fchip" data-clear="${k}">${esc(l)} ✕</button>`).join('') +
      (chips.length > 1 ? '<button class="fchip clear-all" data-clear="all">Limpiar todo</button>' : '');
  }

  function clearFilter(k) {
    if (k === 'q' || k === 'all') $('q').value = '';
    if (k === 'est' || k === 'all') { $('fEstado').value = ''; fillMunSelect(); }
    if (k === 'mun' || k === 'all') $('fMun').value = '';
    if (k === 'near' || k === 'all') setNear(false);
    if (k === 'letter' || k === 'all') state.letter = '';
    if (k === 'phone' || k === 'all') $('fPhone').checked = false;
    if (k === 'ai' || k === 'all') state.aiIds = null;
    applyFilters(true);
  }

  function renderAZ() {
    const have = new Set(state.stores.map((s) => s.letter));
    const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
    $('az').innerHTML = '<button data-l="" class="active">Todas</button>' +
      letters.map((l) => `<button data-l="${l}" ${have.has(l) ? '' : 'disabled'}>${l}</button>`).join('');
  }

  function renderMunList() {
    const max = Math.max(...municipios().map((m) => m.total));
    $('munList').innerHTML = municipios().map((m) => `
      <li><button data-mun="${esc(m.name)}">
        <span class="mun-name">${esc(m.name)}</span>
        <span class="bar"><i style="width:${(m.total / max) * 100}%"></i></span>
        <span class="mun-count"><b>${m.total}</b> · ${m.phone} 📞</span>
      </button></li>`).join('');
  }

  // La lista se dibuja por tandas: miles de tarjetas a la vez congelan la página
  const PAGE = 60;
  let listShown = 0;
  const listObserver = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) renderMore();
  }, { rootMargin: '600px' });

  const cardHTML = (s) => {
    const d = distKm(s);
    return `
        <li class="card" data-id="${s.id}" tabindex="0">
          <div class="card-head">
            <span class="dot ${s.telefono ? 'ok' : 'none'}"></span>
            <div class="grow"><h3>${esc(s.nombre)}</h3><p class="muted">📍 ${esc(s.municipio)}</p></div>
            ${d != null ? `<span class="dist">${fmtKm(d)}</span>` : ''}
          </div>
          ${contactHTML(s)}
          ${actionsHTML(s)}
        </li>`;
  };

  function renderMore(upTo) {
    const more = $('listMore');
    if (!more) return;
    const total = state.filtered.length;
    const next = Math.min(total, upTo ?? listShown + PAGE);
    if (next > listShown) {
      more.insertAdjacentHTML('beforebegin', state.filtered.slice(listShown, next).map(cardHTML).join(''));
      listShown = next;
    }
    if (listShown >= total) { listObserver.unobserve(more); more.remove(); return; }
    more.textContent = `Mostrando ${listShown.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} · sigue bajando para ver más`;
    listObserver.unobserve(more); listObserver.observe(more); // si sigue a la vista, pide otra tanda
  }

  function renderList() {
    const list = $('list');
    listObserver.disconnect();
    listShown = 0;
    if (!state.filtered.length) {
      list.innerHTML = '<li class="empty">Sin resultados 🤷<br><button class="btn sm" data-clear="all">Limpiar filtros</button></li>';
      return;
    }
    list.innerHTML = '<li class="more" id="listMore"></li>';
    renderMore();
  }

  function highlight(id, fly) {
    document.querySelectorAll('.card.active').forEach((c) => c.classList.remove('active'));
    let card = document.querySelector(`.card[data-id="${id}"]`);
    if (!card) { // la tarjeta aún no se ha dibujado: se dibuja hasta ella
      const i = state.filtered.findIndex((s) => s.id === id);
      if (i >= listShown) { renderMore(i + 1); card = document.querySelector(`.card[data-id="${id}"]`); }
    }
    if (card) { card.classList.add('active'); if (!fly) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    if (fly) {
      const m = state.markers.get(id);
      if (m) cluster.zoomToShowLayer(m, () => { bindLazy(m); m.openPopup(); });
      $('sidebar').classList.remove('open');
    }
  }

  // ---------- Cerca de mí ----------
  function setNear(on) {
    state.near = on;
    $('btnNear').classList.toggle('active', on);
    $('radiusWrap').classList.toggle('hidden', !on);
    meLayer.clearLayers();
    if (on && state.me) {
      L.circle(state.me, { radius: +$('fRadius').value * 1000, color: '#7c3aed', weight: 1.5, fillOpacity: 0.06 }).addTo(meLayer);
      L.marker(state.me, {
        icon: L.divIcon({ className: 'me-wrap', html: '<div class="me-dot"></div>', iconSize: [18, 18] }),
        zIndexOffset: 1000,
      }).bindTooltip('Tú estás aquí').addTo(meLayer);
    }
  }

  $('btnNear').addEventListener('click', () => {
    if (state.near) { setNear(false); $('fSort').value = 'az'; return applyFilters(true); }
    if (!navigator.geolocation) return toast('Tu navegador no permite geolocalización');
    $('btnNear').classList.add('loading');
    navigator.geolocation.getCurrentPosition((pos) => {
      $('btnNear').classList.remove('loading');
      state.me = [pos.coords.latitude, pos.coords.longitude];
      $('fMun').value = '';
      $('fSort').value = 'dist';
      setNear(true);
      applyFilters(true);
      if (!state.filtered.length) toast('No hay tiendas en ese radio, prueba uno mayor');
    }, () => {
      $('btnNear').classList.remove('loading');
      toast('No se pudo obtener tu ubicación (revisa los permisos)');
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
  $('fRadius').addEventListener('change', () => { setNear(state.near); applyFilters(true); });
  $('radiusWrap').classList.add('hidden');

  // ---------- Eventos de filtros ----------
  let qTimer;
  $('q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => applyFilters(true), 200); });
  $('fEstado').addEventListener('change', () => { fillMunSelect(); applyFilters(true); });
  $('fMun').addEventListener('change', () => { if ($('fMun').value) setNear(false); applyFilters(true); });
  $('fPhone').addEventListener('change', () => applyFilters(false));
  $('fSort').addEventListener('change', () => {
    if ($('fSort').value === 'dist' && !state.me) { toast('Activa "📍 Cerca de mí" para ordenar por distancia'); }
    applyFilters(false);
  });
  $('az').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.letter = b.dataset.l;
    applyFilters(true);
  });
  $('munList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mun]');
    if (!b) return;
    $('fEstado').value = '';
    fillMunSelect();
    $('fMun').value = b.dataset.mun;
    setNear(false);
    switchTab('stores');
    applyFilters(true);
  });

  // Tabs
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('hidden', p.id !== `pane-${name}`));
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    switchTab(t.dataset.tab);
    $('sidebar').classList.add('open');
  }));

  // Hover en tarjeta → resaltar pin
  $('list').addEventListener('mouseover', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const m = state.markers.get(+card.dataset.id);
    if (m && cluster.getVisibleParent(m) === m) { bindLazy(m); m.openTooltip(); }
  });
  $('list').addEventListener('mouseout', (e) => {
    const card = e.target.closest('.card');
    if (!card || card.contains(e.relatedTarget)) return;
    const m = state.markers.get(+card.dataset.id);
    if (m) m.closeTooltip();
  });

  // Delegación de eventos (lista + popups). Captura: los popups de Leaflet frenan la propagación
  document.addEventListener('click', (e) => {
    const clr = e.target.closest('[data-clear]');
    if (clr) { clearFilter(clr.dataset.clear); return; }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const s = state.stores.find((x) => x.id === +btn.dataset.id);
      if (btn.dataset.act === 'wa') WA.openSingle(s);
      if (btn.dataset.act === 'copy') copyText(s.telefono, 'Teléfono');
      e.stopPropagation();
      return;
    }
    const card = e.target.closest('.card');
    if (card && !e.target.closest('a')) highlight(+card.dataset.id, true);
  }, true);
  $('list').addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (card && e.key === 'Enter') highlight(+card.dataset.id, true);
  });

  $('sheetHandle').addEventListener('click', () => $('sidebar').classList.toggle('open'));

  // ---------- Asistente IA ----------
  function addMsg(cls, html) {
    const div = document.createElement('div');
    div.className = `msg ${cls}`;
    div.innerHTML = html;
    $('chat').appendChild(div);
    $('chat').scrollTop = $('chat').scrollHeight;
    return div;
  }

  async function askAI(question) {
    question = question.trim();
    if (!question) return;
    if (!state.stores.length) return toast('Espera a que carguen las tiendas');
    addMsg('user', esc(question));
    const wait = addMsg('bot typing', '<span></span><span></span><span></span>');
    $('chatInput').value = '';
    try {
      const r = await AI.ask('search', {
        question,
        municipios: municipios().map((m) => m.name),
        stores: state.stores.map((s) => ({ id: s.id, nombre: s.nombre, municipio: s.municipio, estado: s.estado, tel: !!s.telefono })),
      });
      wait.remove();
      const ids = (r.ids || []).filter((id) => state.stores.some((s) => s.id === id));
      // Aplicar filtros sugeridos por la IA
      $('q').value = '';
      state.letter = '';
      setNear(false);
      $('fEstado').value = '';
      fillMunSelect();
      $('fMun').value = r.municipio && municipios().some((m) => m.name === r.municipio) ? r.municipio : '';
      $('fPhone').checked = !!r.soloTelefono;
      state.aiIds = ids.length ? new Set(ids) : null;
      applyFilters(true);
      const names = ids.slice(0, 8).map((id) => {
        const s = state.stores.find((x) => x.id === id);
        return `<button class="link" data-goto="${id}">${esc(s.nombre)}</button>`;
      }).join(', ');
      addMsg('bot', `${esc(r.respuesta || 'Listo.')}${ids.length ? `<div class="found">🗺️ ${state.filtered.length} en el mapa: ${names}${ids.length > 8 ? '…' : ''}</div>` : ''}`);
    } catch (err) {
      wait.remove();
      addMsg('bot error', `⚠️ ${esc(err.message)}`);
    }
  }

  $('chatForm').addEventListener('submit', (e) => { e.preventDefault(); askAI($('chatInput').value); });
  $('suggest').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) askAI(b.textContent); });
  $('chat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) highlight(+b.dataset.goto, true);
  });

  // ---------- Barra superior ----------
  $('btnNew').addEventListener('click', () => WA.openSingle(null));
  $('btnBulk').addEventListener('click', () => {
    const list = state.filtered.filter((s) => s.waDigits);
    if (!list.length) return toast('No hay tiendas con número en el filtro actual');
    WA.openBulk(list);
  });
  $('btnExport').addEventListener('click', () => {
    const csv = Papa.unparse(state.filtered.map((s) => ({
      nombre: s.nombre, municipio: s.municipio, estado: s.estado, telefono: s.telefono || 'ND',
      correo: s.correo || 'ND', whatsapp: s.waDigits ? '+' + s.waDigits : 'ND',
      wa_link: s.waDigits ? `https://wa.me/${s.waDigits}` : '', url_fuente: s.fuente || '',
    })));
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tiendas_filtradas.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
