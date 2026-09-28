// Wellington region sunlight map (Wellington City, Porirua, Lower Hutt, Upper Hutt) on one Leaflet map.
// Data lives in the separate wellington-sun-tiles Pages site (window.SUN_DATA, override with ?data=<url>):
//   meta.json, tiles/<layer>/<z>/<x>/<y>.webp (z11-16, overzoomed above), addr/index.json + addr/14/<x>/<y>.json
//   (address chunks by z14 tile, columns described by "cols"), search.json (lazy), suburbs.json (outlines).
(async function () {
  const ADDR_LOAD_Z = 15, ADDR_DOTS_Z = 16, CLICK_Z = 14, LABEL_Z = 13;
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const D = (Q.get('data') || window.SUN_DATA || '/wellington-sun-tiles/').replace(/\/?$/, '/');
  const map = L.map('map', { zoomControl: true, preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Sun model: LINZ LiDAR (CC BY 4.0)'
  }).addTo(map);
  map.createPane('sun'); map.getPane('sun').style.zIndex = 350;
  map.createPane('labels'); map.getPane('labels').style.zIndex = 450;
  const fmt = (v) => (v == null ? '–' : v.toFixed(1) + ' h');
  const META = await (await fetch(D + 'meta.json')).json();
  const LAYERS = META.layers, RAMP = META.ramp, P = META.possible, BOUNDS = L.latLngBounds(META.bounds);
  $('possible').textContent = `year ${P.total} h/day (AM ${P.am}, PM ${P.pm}), June ${P.jun} h, December ${P.dec} h`;
  $('naddr').textContent = META.n_addresses.toLocaleString('en-NZ');
  $('generated').textContent = `Computed ${META.generated}.`;
  const pageBase = location.pathname.replace(/sun\/all\/.*$/, '');   // -> /my-website/

  if (Q.get('z') || Q.get('lat')) map.setView([+(Q.get('lat') || BOUNDS.getCenter().lat), +(Q.get('lon') || BOUNDS.getCenter().lng)], +(Q.get('z') || 13));
  else map.fitBounds(BOUNDS, { maxZoom: 13, paddingTopLeft: [innerWidth > 700 ? 320 : 0, 0] });

  // ---- sun tiles: one XYZ layer per key ----
  const tl = {}; let currentKey = null;
  const tileLayer = (k) => tl[k] || (tl[k] = L.tileLayer(D + META.tiles.replace('{layer}', k), {
    pane: 'sun', opacity: +$('opacity').value, bounds: BOUNDS, minZoom: 9, maxZoom: 19,
    minNativeZoom: META.minNativeZoom, maxNativeZoom: META.maxNativeZoom, className: 'sun-tiles',
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
  }));
  function info() {
    const z = map.getZoom();
    $('loadinfo').textContent = z < CLICK_Z ? `Zoom in (to level ${CLICK_Z}+) and click for address scores.` : (z < ADDR_LOAD_Z ? 'Click the map for the nearest address’s scores.' : '');
  }
  function showLayer(key) {
    currentKey = key;
    document.querySelectorAll('#layer-buttons button').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    Object.entries(tl).forEach(([k, l]) => { if (k !== key && map.hasLayer(l)) map.removeLayer(l); });
    if (key === 'none') { $('legend').innerHTML = ''; return; }
    tileLayer(key).setOpacity(+$('opacity').value).addTo(map);
    const m = LAYERS.find(l => l.key === key);
    const n = 5, ticks = Array.from({ length: n + 1 }, (_, i) => `<span>${(m.vmax * i / n).toFixed(m.vmax % n ? 1 : 0)}</span>`).join('');
    $('legend').innerHTML = `<div class="bar" style="background:linear-gradient(90deg,${RAMP.join(',')})"></div>
      <div class="ticks">${ticks}</div><div class="small">${m.label}: hours of direct sun per day</div>`;
  }
  const lb = $('layer-buttons');
  [...LAYERS.map(l => [l.key, { total: 'Day', am: 'Morning', pm: 'Afternoon', jun: 'June', dec: 'December' }[l.key] || l.key]), ['none', 'Off']]
    .forEach(([k, t]) => { const b = document.createElement('button'); b.textContent = t; b.dataset.key = k; b.onclick = () => showLayer(k); lb.appendChild(b); });
  $('opacity').oninput = (e) => Object.values(tl).forEach(l => l.setOpacity(+e.target.value));
  showLayer(LAYERS.some(l => l.key === Q.get('layer')) || Q.get('layer') === 'none' ? Q.get('layer') : 'total');

  // ---- suburb outlines + labels (lazy file; labels from zoom 13; link to detailed suburb pages where they exist) ----
  const outlines = L.layerGroup(), labels = L.layerGroup();
  let SUBS = [];
  fetch(D + 'suburbs.json').then(r => r.json()).then(j => {
    SUBS = j.suburbs;
    SUBS.forEach(s => {
      L.polygon(s.rings, { color: '#222', weight: 1, opacity: 0.45, fill: false, interactive: false }).addTo(outlines);
      const html = s.page ? `<a href="${pageBase + s.page}" title="Open the detailed ${s.name} map">${s.name} ↗</a>` : `<span>${s.name}</span>`;
      L.marker(s.label, { pane: 'labels', icon: L.divIcon({ className: 'sub-label', html, iconSize: null }), keyboard: false, interactive: !!s.page }).addTo(labels);
    });
    SUBS.filter(s => s.page).sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
      const li = document.createElement('li'); li.innerHTML = `<a href="${pageBase + s.page}">${s.name}</a>`; $('sublist').appendChild(li);
    });
    syncOutlines();
  });
  function syncOutlines() {
    const on = $('show-outlines').checked;
    on ? outlines.addTo(map) : map.removeLayer(outlines);
    (on && map.getZoom() >= LABEL_Z) ? labels.addTo(map) : map.removeLayer(labels);
  }
  $('show-outlines').onchange = syncOutlines;

  // ---- popups ----
  function sunTable(g, r) {
    const row = (lbl, k) => `<tr><td>${lbl}</td><td class="v">${fmt(g && g[k])}</td><td class="v muted">${fmt(r && r[k])}</td></tr>`;
    return `<table><tr><td></td><td class="muted">garden</td><td class="muted">roof</td></tr>
      ${row('Morning', 'am')}${row('Afternoon', 'pm')}${row('Total (year avg)', 'total')}${row('June avg', 'jun')}${row('December avg', 'dec')}</table>`;
  }
  const colorFor = (h, vmax) => { const t = Math.max(0, Math.min(1, h / vmax)); return RAMP[Math.round(t * (RAMP.length - 1))]; };
  // chunk rows -> objects using the chunk's own column list (so extra columns can be added later)
  function rowObj(c, a) {
    const o = {}; c.cols.forEach((k, i) => o[k] = a[i]);
    const obj = (arr) => arr ? Object.fromEntries(c.fields.map((f, i) => [f, arr[i]])) : null;
    o.g = obj(o.garden); o.r = obj(o.roof); return o;
  }
  const subPage = (addr) => { const s = SUBS.find(s => s.page && addr.includes(', ' + s.name + ',')) || SUBS.find(s => s.page && addr.endsWith(', ' + s.name)); return s; };
  function popupHtml(o, link = true) {
    const s = link && subPage(o.address);
    return `<div class="tt"><h3>${o.address}</h3>${sunTable(o.g, o.r)}` +
      (s ? `<div class="muted"><a href="${pageBase + s.page}?z=18&lat=${o.lat}&lon=${o.lon}">Open the detailed ${s.name} map →</a></div>` : '') + '</div>';
  }

  // ---- address chunks (z14 tiles), on demand ----
  const IDX = await (await fetch(D + 'addr/index.json')).json(), CZ = IDX.z, chunks = {};
  const t2lon = (x) => x / 2 ** CZ * 360 - 180, t2lat = (y) => { const n = Math.PI - 2 * Math.PI * y / 2 ** CZ; return 180 / Math.PI * Math.atan(Math.sinh(n)); };
  const lon2t = (lon) => (lon + 180) / 360 * 2 ** CZ, lat2t = (lat) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** CZ;
  function loadChunk(k) {
    if (!(k in IDX.chunks)) return Promise.resolve(null);
    if (!chunks[k]) chunks[k] = fetch(D + `addr/${CZ}/${k}.json`).then(r => r.json()).then(c => {
      c.key = k; c.rows = c.a.map(a => rowObj(c, a)); c.layer = null; return c;
    }).catch(e => { delete chunks[k]; throw e; });
    return chunks[k];
  }
  function keysIn(b) {
    const x0 = Math.floor(lon2t(b.getWest())), x1 = Math.floor(lon2t(b.getEast())), y0 = Math.floor(lat2t(b.getNorth())), y1 = Math.floor(lat2t(b.getSouth()));
    const out = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (`${x}/${y}` in IDX.chunks) out.push(`${x}/${y}`); return out;
  }
  const dotLayer = L.layerGroup().addTo(map); const dotsOn = new Set();
  async function syncAddr() {
    const z = map.getZoom(), want = new Set(z >= ADDR_LOAD_Z ? keysIn(map.getBounds().pad(0.1)) : []);
    const dots = $('show-addr').checked && z >= ADDR_DOTS_Z;
    for (const k of want) loadChunk(k).then(c => {
      if (!c) return;
      if (!c.layer) { c.layer = L.layerGroup(); c.rows.forEach(o => L.circleMarker([o.lat, o.lon], { radius: 3, weight: 0.5, color: '#333', fillColor: colorFor(o.g ? o.g.total : 0, 12), fillOpacity: 0.9 }).bindTooltip(() => popupHtml(o, false), { sticky: true }).addTo(c.layer)); }
      if (dots && !dotsOn.has(k)) { c.layer.addTo(dotLayer); dotsOn.add(k); }
    }).catch(() => { });
    for (const k of [...dotsOn]) if (!dots || !want.has(k)) { chunks[k].then(c => dotLayer.removeLayer(c.layer)); dotsOn.delete(k); }
    info();
  }
  $('show-addr').onchange = syncAddr;
  if (Q.get('addr') === '1') $('show-addr').checked = true;
  map.on('moveend', () => { syncAddr(); syncOutlines(); });
  syncAddr();

  // ---- click: nearest scored address within 80 m (loads the chunk(s) around the click) ----
  map.on('click', async (e) => {
    if (map.getZoom() < CLICK_Z) return;
    const d = 0.0012, b = L.latLngBounds([e.latlng.lat - d, e.latlng.lng - d * 1.4], [e.latlng.lat + d, e.latlng.lng + d * 1.4]);
    const got = await Promise.all(keysIn(b).map(k => loadChunk(k).catch(() => null)));
    let best = null, bd = 1e18; const cl = Math.cos(e.latlng.lat * Math.PI / 180);
    for (const c of got) if (c) for (const o of c.rows) {
      const dy = o.lat - e.latlng.lat, dx = (o.lon - e.latlng.lng) * cl, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = o; }
    }
    if (best && Math.sqrt(bd) * 111320 < 80) L.popup().setLatLng([best.lat, best.lon]).setContent(popupHtml(best)).openOn(map);
  });

  // ---- listings (the existing suburb pages' listing files; empty until Trade Me keys exist) ----
  const sale = L.layerGroup().addTo(map), rent = L.layerGroup().addTo(map);
  $('show-sale').onchange = (e) => e.target.checked ? sale.addTo(map) : map.removeLayer(sale);
  $('show-rent').onchange = (e) => e.target.checked ? rent.addTo(map) : map.removeLayer(rent);
  const listingFiles = [D + 'listings.geojson'];
  fetch(D + 'suburbs.json').then(r => r.json()).then(j => j.suburbs.filter(s => s.page).forEach(s => listingFiles.push(pageBase + s.page + 'data/listings.geojson')))
    .catch(() => { }).then(() => Promise.all(listingFiles.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : { features: [] }).catch(() => ({ features: [] }))))).then(all => {
      let nS = 0, nR = 0; const seen = new Set();
      all.forEach(L_ => (L_.features || []).forEach(f => {
        const p = f.properties, id = p.id || p.url || JSON.stringify(f.geometry.coordinates); if (seen.has(id)) return; seen.add(id);
        const [lon, lat] = f.geometry.coordinates, isRent = p.kind === 'rent'; isRent ? nR++ : nS++;
        const price = isRent ? (p.rent_per_week ? `$${Math.round(p.rent_per_week)} per week` : (p.price || '')) : (p.price || '');
        const beds = p.bedrooms ? `${p.bedrooms} bed${p.bathrooms ? ' · ' + p.bathrooms + ' bath' : ''}` : '';
        const note = (p.ground && p.match !== 'address') ? `<div class="muted">Scores from ${p.linz_address} (${p.match}${p.match === 'nearest' ? ', ' + p.match_dist_m + ' m' : ''})</div>` :
          (!p.ground ? '<div class="muted">No scored address within 60 m</div>' : '');
        const html = `<div class="tt"><h3>${p.address || p.title || ''}</h3>
          <div><span class="price">${price}</span> ${beds ? '· ' + beds : ''} <span class="muted">(${isRent ? 'for rent' : 'for sale'})</span></div>
          ${p.ground ? sunTable(p.ground, p.roof) : ''}${note}</div>`;
        L.circleMarker([lat, lon], { radius: 7, weight: 2, color: '#fff', fillColor: isRent ? '#1f77ff' : '#e63946', fillOpacity: 0.95 })
          .bindTooltip(html, { sticky: false, direction: 'top', offset: [0, -6] })
          .on('click', () => p.url && window.open(p.url, '_blank', 'noopener'))
          .addTo(isRent ? rent : sale);
      }));
      $('status').textContent = (nS + nR) ? `${nS} for sale · ${nR} for rent` : 'No listings loaded yet (Trade Me API keys pending). Click the map or search for an address to see its scores.';
    });

  // ---- region-wide address search (search.json grouped by street; loaded on first focus) ----
  let IX = null, IXp = null, hits = [], sel = -1;
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  function loadIndex() {
    if (!IXp) IXp = fetch(D + 'search.json').then(r => r.json()).then(j => {
      IX = [];
      for (const [road, sub, town, keys, labels, ci] of j.s) {
        const place = sub + (town ? ', ' + town : ''), tail = norm(road + ' ' + place);
        labels.forEach((lab, i) => IX.push([norm(lab + ' ' + road) + ' ' + norm(place), `${lab} ${road}`, place, keys[ci ? parseInt(ci[i], 36) : 0]]));
      }
      return IX;
    });
    return IXp;
  }
  const res = $('results');
  function render() {
    res.innerHTML = hits.map((h, k) => `<li data-k="${k}" class="${k === sel ? 'sel' : ''}">${h[1]} <span class="muted">${h[2]}</span></li>`).join('');
  }
  async function doSearch() {
    const q = norm($('q').value); sel = -1;
    if (q.length < 3) { hits = []; render(); return; }
    await loadIndex();
    const toks = q.split(' ');
    hits = [];
    for (const r of IX) { if (toks.every(t => r[0].includes(t))) { hits.push(r); if (hits.length >= 300) break; } }
    hits.sort((a, b) => (b[0].startsWith(q) - a[0].startsWith(q)) || a[1].length - b[1].length);
    hits = hits.slice(0, 12); render();
  }
  async function go(h) {
    hits = []; render(); $('q').value = h[1] + ', ' + h[2];
    const c = await loadChunk(h[3]); if (!c) return;
    const full = h[1] + ', ' + h[2];
    const o = c.rows.find(o => o.address === full) || c.rows.find(o => o.address.startsWith(h[1] + ','));
    if (!o) return;
    map.setView([o.lat, o.lon], Math.max(map.getZoom(), 18));
    L.popup().setLatLng([o.lat, o.lon]).setContent(popupHtml(o)).openOn(map);
  }
  let tmr; $('q').addEventListener('focus', () => loadIndex().catch(() => { IXp = null; }), { once: true });
  $('q').addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(doSearch, 120); });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (hits.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; render(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (hits.length) go(hits[Math.max(sel, 0)]); }
    else if (e.key === 'Escape') { hits = []; render(); }
  });
  res.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); go(hits[+li.dataset.k]); } });
  L.DomEvent.disableClickPropagation($('panel')); L.DomEvent.disableScrollPropagation($('panel'));
  info();
  window.__sunAll = { map, showLayer, chunks, go: (q) => { $('q').value = q; return doSearch().then(() => hits[0] && go(hits[0])); } };
})();
