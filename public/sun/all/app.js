// Combined Wellington sunlight map: all suburb overlays on one Leaflet map.
// Reuses each suburb's own files (../<slug>/data/*, ../../karori-sun/data/*); nothing is duplicated.
// Lazy: overlays load only for suburbs in view at zoom >= OV_MIN_Z; addresses.json per suburb at zoom >= ADDR_LOAD_Z
// (or on click/search); the cross-suburb search index (search.json) loads on first use of the search box.
(async function () {
  const OV_MIN_Z = 12, ADDR_LOAD_Z = 15, ADDR_DOTS_Z = 16;
  const $ = (id) => document.getElementById(id);
  const map = L.map('map', { zoomControl: true, preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Sun model: LINZ LiDAR (CC BY 4.0)'
  }).addTo(map);
  const Q = new URLSearchParams(location.search);
  map.createPane('sun'); map.getPane('sun').style.zIndex = 350;
  map.createPane('labels'); map.getPane('labels').style.zIndex = 450;

  const fmt = (v) => (v == null ? '–' : v.toFixed(1) + ' h');
  const idx = await (await fetch('suburbs.json')).json();
  const S = idx.suburbs, LAYERS = idx.layers, RAMP = idx.ramp;
  const bySlug = Object.fromEntries(S.map(s => [s.slug, s]));
  const P = S[0].possible;
  $('possible').textContent = `year ${P.total} h/day (AM ${P.am}, PM ${P.pm}), June ${P.jun} h, December ${P.dec} h`;

  // Overlay images are stretched linearly in Web Mercator between their bounds, so a suburb polygon can be
  // expressed once as a CSS clip-path in % of the image box (zoom-independent). Extra rings (islands) are
  // joined with zero-area there-and-back bridges.
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  function clipPath(s) {
    const [[south, west], [north, east]] = s.bounds, my0 = merc(north), my1 = merc(south);
    const pt = ([lat, lon]) => `${((lon - west) / (east - west) * 100).toFixed(3)}% ${((my0 - merc(lat)) / (my0 - my1) * 100).toFixed(3)}%`;
    const r0 = s.rings[0], seq = [...r0];
    s.rings.slice(1).forEach(r => seq.push(r0[0], ...r, r[0], r0[0]));
    return `polygon(${seq.map(pt).join(',')})`;
  }
  const allB = L.latLngBounds([]);
  S.forEach(s => {
    s.ovB = L.latLngBounds(s.bounds); s.polyB = L.latLngBounds(s.rings.flat()); s.clip = clipPath(s); s.ov = {};
    allB.extend(s.ovB);
  });

  if (Q.get('z') || Q.get('lat')) map.setView([+(Q.get('lat') || allB.getCenter().lat), +(Q.get('lon') || allB.getCenter().lng)], +(Q.get('z') || 13));
  else map.fitBounds(allB, { maxZoom: 13, paddingTopLeft: [innerWidth > 700 ? 320 : 0, 0] });

  // ---- suburb outlines + labels (link to each suburb's page) ----
  const outlines = L.layerGroup().addTo(map);
  S.forEach(s => {
    L.polygon(s.rings, { color: '#222', weight: 1.3, opacity: 0.75, fill: false, interactive: false }).addTo(outlines);
    L.marker(s.label, { pane: 'labels', icon: L.divIcon({ className: 'sub-label', html: `<a href="${s.page}" title="Open the ${s.name} map">${s.name}</a>`, iconSize: null }), keyboard: false }).addTo(outlines);
    const li = document.createElement('li'); li.innerHTML = `<a href="${s.page}">${s.name}</a>`; $('sublist').appendChild(li);
  });
  $('show-outlines').onchange = (e) => e.target.checked ? outlines.addTo(map) : map.removeLayer(outlines);

  // ---- sun overlays: lazy, per suburb in view, all switched together ----
  let currentKey = null, pending = 0;
  function info() {
    const z = map.getZoom(), n = S.filter(s => currentKey && s.ov[currentKey] && map.hasLayer(s.ov[currentKey])).length;
    $('loadinfo').textContent = currentKey === 'none' ? '' : (z < OV_MIN_Z ? `Zoom in (to level ${OV_MIN_Z}+) to show the sun overlays.` :
      `${n} suburb overlay${n === 1 ? '' : 's'} shown${pending ? `, ${pending} loading…` : ''}.` + (z < ADDR_LOAD_Z ? ` Zoom in further for address scores.` : ''));
  }
  function updateOverlays() {
    const z = map.getZoom(), vb = map.getBounds().pad(0.15), op = +$('opacity').value;
    S.forEach(s => {
      const want = currentKey && currentKey !== 'none' && z >= OV_MIN_Z && vb.intersects(s.polyB);
      for (const [k, o] of Object.entries(s.ov)) if ((k !== currentKey || !want) && map.hasLayer(o)) map.removeLayer(o);
      if (!want) return;
      let o = s.ov[currentKey];
      if (!o) {
        o = s.ov[currentKey] = L.imageOverlay(s.page + s.files[currentKey], s.bounds, { pane: 'sun', opacity: op, interactive: false, className: 'sun-ov' });
        pending++; o.once('load error', () => { pending--; info(); });
      }
      if (!map.hasLayer(o)) { o.setOpacity(op).addTo(map); o.getElement().style.clipPath = s.clip; }
    });
    info();
  }
  function showLayer(key) {
    currentKey = key;
    document.querySelectorAll('#layer-buttons button').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    updateOverlays();
    if (key === 'none') { $('legend').innerHTML = ''; return; }
    const m = LAYERS.find(l => l.key === key);
    const n = 5, ticks = Array.from({ length: n + 1 }, (_, i) => `<span>${(m.vmax * i / n).toFixed(m.vmax % n ? 1 : 0)}</span>`).join('');
    $('legend').innerHTML = `<div class="bar" style="background:linear-gradient(90deg,${RAMP.join(',')})"></div>
      <div class="ticks">${ticks}</div><div class="small">${m.label}: hours of direct sun per day</div>`;
  }
  const lb = $('layer-buttons');
  [...LAYERS.map(l => [l.key, { total: 'Day', am: 'Morning', pm: 'Afternoon', jun: 'June', dec: 'December' }[l.key] || l.key]), ['none', 'Off']]
    .forEach(([k, t]) => { const b = document.createElement('button'); b.textContent = t; b.dataset.key = k; b.onclick = () => showLayer(k); lb.appendChild(b); });
  $('opacity').oninput = (e) => S.forEach(s => Object.values(s.ov).forEach(o => o.setOpacity(+e.target.value)));
  showLayer(LAYERS.some(l => l.key === Q.get('layer')) || Q.get('layer') === 'none' ? Q.get('layer') : 'total');

  function sunTable(g, r) {
    const row = (lbl, k) => `<tr><td>${lbl}</td><td class="v">${fmt(g && g[k])}</td><td class="v muted">${fmt(r && r[k])}</td></tr>`;
    return `<table><tr><td></td><td class="muted">garden</td><td class="muted">roof</td></tr>
      ${row('Morning', 'am')}${row('Afternoon', 'pm')}${row('Total (year avg)', 'total')}${row('June avg', 'jun')}${row('December avg', 'dec')}</table>`;
  }
  const colorFor = (h, vmax) => { const t = Math.max(0, Math.min(1, h / vmax)); return RAMP[Math.round(t * (RAMP.length - 1))]; };
  const popupHtml = (s, a, F) => {
    const obj = (arr) => arr ? Object.fromEntries(F.map((f, i) => [f, arr[i]])) : null;
    return `<div class="tt"><h3>${a[2]}</h3>${sunTable(obj(a[3]), obj(a[4]))}<div class="muted"><a href="${s.page}?z=18&lat=${a[0]}&lon=${a[1]}">Open the ${s.name} map →</a></div></div>`;
  };

  // ---- addresses: per suburb, on demand ----
  function loadAddr(s) {
    if (!s.A) s.A = fetch(s.page + 'data/addresses.json').then(r => r.json()).then(A => {
      const F = A.fields, obj = (arr) => arr ? Object.fromEntries(F.map((f, i) => [f, arr[i]])) : null;
      s.addrLayer = L.layerGroup();
      A.a.forEach((a) => {
        const gg = obj(a[3]);
        L.circleMarker([a[0], a[1]], { radius: 3, weight: 0.5, color: '#333', fillColor: colorFor(gg ? gg.total : 0, 12), fillOpacity: 0.9 })
          .bindTooltip(() => popupHtml(s, a, F).replace(/<div class="muted"><a.*<\/a><\/div>/, ''), { sticky: true })
          .addTo(s.addrLayer);
      });
      syncAddr(); return A;
    }).catch(e => { s.A = null; throw e; });
    return s.A;
  }
  function syncAddr() {
    const z = map.getZoom(), vb = map.getBounds().pad(0.1), dots = $('show-addr').checked && z >= ADDR_DOTS_Z;
    S.forEach(s => {
      const inView = vb.intersects(s.polyB);
      if (inView && z >= ADDR_LOAD_Z && !s.A) loadAddr(s).catch(() => { });
      if (s.addrLayer) (dots && inView) ? s.addrLayer.addTo(map) : map.removeLayer(s.addrLayer);
    });
  }
  $('show-addr').onchange = syncAddr;
  map.on('moveend', () => { updateOverlays(); syncAddr(); });
  if (Q.get('addr') === '1') $('show-addr').checked = true;
  syncAddr();

  // ---- click anywhere: nearest scored address (loads the suburb(s) under the click if needed) ----
  map.on('click', async (e) => {
    const cand = S.filter(s => s.polyB.pad(0.05).contains(e.latlng));
    const got = await Promise.all(cand.map(s => loadAddr(s).then(A => [s, A]).catch(() => null)));
    let best = null, bd = 1e18; const cl = Math.cos(e.latlng.lat * Math.PI / 180);
    for (const g of got) if (g) for (const a of g[1].a) {
      const dy = a[0] - e.latlng.lat, dx = (a[1] - e.latlng.lng) * cl, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [g[0], a, g[1].fields]; }
    }
    if (best && Math.sqrt(bd) * 111320 < 80) L.popup().setLatLng([best[1][0], best[1][1]]).setContent(popupHtml(...best)).openOn(map);
  });

  // ---- listings (tiny files; all suburbs) ----
  const sale = L.layerGroup().addTo(map), rent = L.layerGroup().addTo(map);
  $('show-sale').onchange = (e) => e.target.checked ? sale.addTo(map) : map.removeLayer(sale);
  $('show-rent').onchange = (e) => e.target.checked ? rent.addTo(map) : map.removeLayer(rent);
  Promise.all(S.map(s => fetch(s.page + 'data/listings.geojson', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ features: [] })))).then(all => {
    let nS = 0, nR = 0;
    all.forEach(L_ => (L_.features || []).forEach(f => {
      const p = f.properties, [lon, lat] = f.geometry.coordinates, isRent = p.kind === 'rent'; isRent ? nR++ : nS++;
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

  // ---- cross-suburb address search (search.json, loaded on first focus) ----
  let IX = null, IXp = null, hits = [], sel = -1;
  const norm = (t) => t.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  function loadIndex() {
    if (!IXp) IXp = fetch('search.json').then(r => r.json()).then(j => {
      IX = [];
      for (const [slug, list] of Object.entries(j.a)) list.forEach((t, i) => IX.push([norm(t + ' ' + bySlug[slug].name), t, slug, i]));
      return IX;
    });
    return IXp;
  }
  const res = $('results');
  function render() {
    res.innerHTML = hits.map((h, k) => `<li data-k="${k}" class="${k === sel ? 'sel' : ''}">${h[1]} <span class="muted">${bySlug[h[2]].name}</span></li>`).join('');
  }
  async function doSearch() {
    const q = norm($('q').value); sel = -1;
    if (q.length < 3) { hits = []; render(); return; }
    await loadIndex();
    const toks = q.split(' ');
    hits = [];
    for (const r of IX) { if (toks.every(t => r[0].includes(t))) { hits.push(r); if (hits.length >= 200) break; } }
    // prefer entries that start with the query (e.g. "15 rimu" before "115 rimu")
    hits.sort((a, b) => (b[0].startsWith(q) - a[0].startsWith(q)) || a[1].length - b[1].length);
    hits = hits.slice(0, 12); render();
  }
  async function go(h) {
    hits = []; render(); $('q').value = h[1] + ', ' + bySlug[h[2]].name;
    const s = bySlug[h[2]], A = await loadAddr(s);
    let a = A.a[h[3]];
    if (!a || !a[2].startsWith(h[1])) a = A.a.find(x => x[2].startsWith(h[1] + ',')) || a; // guard against a stale index
    if (!a) return;
    map.setView([a[0], a[1]], Math.max(map.getZoom(), 18));
    L.popup().setLatLng([a[0], a[1]]).setContent(popupHtml(s, a, A.fields)).openOn(map);
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
  window.__sunAll = { map, S, showLayer, go: (q) => { $('q').value = q; return doSearch().then(() => hits[0] && go(hits[0])); } };
})();
