// Karori sunlight map. All paths are relative, so the folder can live at any subpath (e.g. GitHub Pages).
(async function () {
  const $ = (id) => document.getElementById(id);
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([-41.2855, 174.735], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Sun model: LINZ LiDAR (CC BY 4.0)'
  }).addTo(map);
  // optional URL params: ?layer=am&z=17&lat=..&lon=..&addr=1
  const Q = new URLSearchParams(location.search);
  if (Q.get('z') || Q.get('lat')) map.setView([+(Q.get('lat') || -41.2855), +(Q.get('lon') || 174.735)], +(Q.get('z') || 15));
  map.createPane('sun'); map.getPane('sun').style.zIndex = 350;

  const fmt = (v) => (v == null ? '–' : v.toFixed(1) + ' h');
  const meta = await (await fetch('data/overlays.json')).json();
  const P = meta.possible;
  $('possible').textContent = `year ${P.total} h/day (AM ${P.am}, PM ${P.pm}), June ${P.jun} h, December ${P.dec} h`;

  // ---- sun overlays ----
  let current = null, currentKey = null;
  const overlays = {};
  function showLayer(key) {
    if (current) map.removeLayer(current);
    document.querySelectorAll('#layer-buttons button').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    currentKey = key;
    if (key === 'none') { current = null; $('legend').innerHTML = ''; return; }
    const m = meta.layers.find(l => l.key === key);
    overlays[key] = overlays[key] || L.imageOverlay(m.file, meta.bounds, { pane: 'sun', opacity: +$('opacity').value, interactive: false });
    current = overlays[key].setOpacity(+$('opacity').value).addTo(map);
    const n = 5, ticks = Array.from({ length: n + 1 }, (_, i) => `<span>${(m.vmax * i / n).toFixed(m.vmax % n ? 1 : 0)}</span>`).join('');
    $('legend').innerHTML = `<div class="bar" style="background:linear-gradient(90deg,${meta.ramp.join(',')})"></div>
      <div class="ticks">${ticks}</div><div class="small">${m.label}: hours of direct sun per day</div>`;
  }
  const lb = $('layer-buttons');
  [...meta.layers.map(l => [l.key, { total: 'Day', am: 'Morning', pm: 'Afternoon', jun: 'June', dec: 'December' }[l.key] || l.key]), ['none', 'Off']]
    .forEach(([k, t]) => { const b = document.createElement('button'); b.textContent = t; b.dataset.key = k; b.onclick = () => showLayer(k); lb.appendChild(b); });
  $('opacity').oninput = (e) => current && current.setOpacity(+e.target.value);
  showLayer(Q.get('layer') || 'total');

  function sunTable(g, r) {
    const row = (lbl, k) => `<tr><td>${lbl}</td><td class="v">${fmt(g && g[k])}</td><td class="v muted">${fmt(r && r[k])}</td></tr>`;
    return `<table><tr><td></td><td class="muted">garden</td><td class="muted">roof</td></tr>
      ${row('Morning', 'am')}${row('Afternoon', 'pm')}${row('Total (year avg)', 'total')}${row('June avg', 'jun')}${row('December avg', 'dec')}</table>`;
  }

  // ---- all addresses (pre-scored) ----
  const A = await (await fetch('data/addresses.json')).json();
  const F = A.fields, obj = (arr) => arr ? Object.fromEntries(F.map((f, i) => [f, arr[i]])) : null;
  const addrLayer = L.layerGroup();
  const colorFor = (h, vmax) => { const t = Math.max(0, Math.min(1, h / vmax)); const i = Math.round(t * (meta.ramp.length - 1)); return meta.ramp[i]; };
  A.a.forEach(([lat, lon, addr, g, r]) => {
    const gg = obj(g), rr = obj(r);
    L.circleMarker([lat, lon], { radius: 3, weight: 0.5, color: '#333', fillColor: colorFor(gg.total, 12), fillOpacity: 0.9 })
      .bindTooltip(`<div class="tt"><h3>${addr}</h3>${sunTable(gg, rr)}</div>`, { sticky: true })
      .addTo(addrLayer);
  });
  function syncAddr() { const on = $('show-addr').checked && map.getZoom() >= 16; on ? addrLayer.addTo(map) : map.removeLayer(addrLayer); }
  $('show-addr').onchange = syncAddr; map.on('zoomend', syncAddr);
  if (Q.get('addr') === '1') { $('show-addr').checked = true; syncAddr(); }

  // ---- listings ----
  const sale = L.layerGroup().addTo(map), rent = L.layerGroup().addTo(map);
  let L_ = { features: [] };
  try { L_ = await (await fetch('data/listings.geojson', { cache: 'no-cache' })).json(); } catch (e) { }
  const feats = L_.features || [];
  feats.forEach(f => {
    const p = f.properties, [lon, lat] = f.geometry.coordinates, isRent = p.kind === 'rent';
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
  });
  $('show-sale').onchange = (e) => e.target.checked ? sale.addTo(map) : map.removeLayer(sale);
  $('show-rent').onchange = (e) => e.target.checked ? rent.addTo(map) : map.removeLayer(rent);
  const nS = feats.filter(f => f.properties.kind === 'sale').length, nR = feats.length - nS;
  $('status').textContent = feats.length ? `${nS} for sale · ${nR} for rent${L_.meta && L_.meta.fetched ? ' · updated ' + L_.meta.fetched : ''}`
    : 'No listings loaded yet (Trade Me API keys pending). Turn on "All addresses" to explore the scores.';

  // ---- click anywhere: nearest scored address ----
  map.on('click', (e) => {
    let best = null, bd = 1e18; const cl = Math.cos(e.latlng.lat * Math.PI / 180);
    for (const a of A.a) { const dy = a[0] - e.latlng.lat, dx = (a[1] - e.latlng.lng) * cl, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = a; } }
    const m = Math.sqrt(bd) * 111320;
    if (best && m < 80) L.popup().setLatLng([best[0], best[1]]).setContent(`<div class="tt"><h3>${best[2]}</h3>${sunTable(obj(best[3]), obj(best[4]))}</div>`).openOn(map);
  });
})();
