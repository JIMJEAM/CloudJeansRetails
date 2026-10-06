(function () {
  const SOURCES = [
    { estado: 'Jalisco', url: 'data/tiendas_ropa_jalisco_final.csv' },
    { estado: 'Guanajuato', url: 'data/tiendas_ropa_guanajuato_final.csv' },
    { estado: 'Nuevo León', url: 'data/tiendas_ropa_nuevo-leon_final.csv' },
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
    showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true,
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
    const stores = rows.map((raw, i) => {
      const r = {};
      for (const k of Object.keys(raw)) r[GEO.norm(k)] = raw[k];
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
      s.latlng = GEO.locate(s.municipio, s.nombre);
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
    $('loader').classList.add('hidden');
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
  Promise.all(SOURCES.map((src) =>
    fetch(src.url, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((t) => parseCSV(t, src.estado))
      .catch(() => [])
  )).then((parts) => {
    const rows = parts.flat();
    if (!rows.length) throw new Error('sin datos');
    load(rows);
  }).catch(() => {
    $('loader').classList.add('hidden');
    $('fallback').classList.remove('hidden');
  });

  $('csvFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) f.text().then((t) => load(parseCSV(t, /guanajuato/i.test(f.name) ? 'Guanajuato' : /nuevo.?leon/i.test(f.name) ? 'Nuevo León' : 'Jalisco')));
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

  function buildMarkers() {
    cluster.clearLayers();
    state.markers.clear();
    state.stores.forEach((s) => {
      if (!s.latlng) return;
      const m = L.marker(s.latlng, { icon: pin(s.telefono ? 'ok' : 'none'), title: s.nombre, riseOnHover: true });
      m.bindPopup(() => popupHTML(s), { maxWidth: 310 });
      m.bindTooltip(esc(s.nombre), { direction: 'top', className: 'pin-tip' });
      m.on('click', () => highlight(s.id, false));
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
      if (q && !GEO.norm(`${s.nombre} ${s.municipio} ${s.estado} ${s.telefono || ''} ${digits(s.telefono)}`).includes(q)) return false;
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

  function renderList() {
    $('list').innerHTML = state.filtered.length
      ? state.filtered.map((s) => {
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
      }).join('')
      : '<li class="empty">Sin resultados 🤷<br><button class="btn sm" data-clear="all">Limpiar filtros</button></li>';
  }

  function highlight(id, fly) {
    document.querySelectorAll('.card.active').forEach((c) => c.classList.remove('active'));
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) { card.classList.add('active'); if (!fly) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    if (fly) {
      const m = state.markers.get(id);
      if (m) cluster.zoomToShowLayer(m, () => m.openPopup());
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
    if (m && cluster.getVisibleParent(m) === m) m.openTooltip();
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
