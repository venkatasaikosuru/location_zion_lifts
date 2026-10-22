  // Zion-Lifts location finder
  // The locations are loaded directly from data.xls. Keep that Excel file beside index.html.
  // Open this folder with VS Code Live Server (not by double-clicking index.html).

  const map = L.map('map', { scrollWheelZoom: true, preferCanvas: true, zoomAnimation: false, markerZoomAnimation: false, zoomSnap: 0.5, wheelPxPerZoomLevel: 90 }).setView([17.385, 78.4867], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    updateWhenZooming: false,
    keepBuffer: 4,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  let locations = [];
  let userPosition = null;
  let userMarker = null;
  // PERFORMANCE: all pins AND their name labels are drawn on ONE canvas instead of
  // thousands of DOM markers/tooltips. Mailing addresses are visible at every zoom level and
  // zooming/panning stays smooth even with 2600+ locations.
  const SHOW_ALL_NAMES = true;   // true = name on every location at every zoom
  const DECLUTTER_LABELS = false; // set true to hide labels that overlap others
  const PIN_COLOR = '#2a81cb';
  // Real Leaflet marker artwork (same icon as normal Leaflet markers), drawn on the canvas.
  const ICON_BASE = 'https://unpkg.com/leaflet@1.9.4/dist/images/';
  const pinImg = new Image(), shadowImg = new Image();
  pinImg.onload = shadowImg.onload = () => pinLayer.schedule();
  pinImg.src = ICON_BASE + 'marker-icon-2x.png';
  shadowImg.src = ICON_BASE + 'marker-shadow.png';
  const pinLayer = {
    points: [],
    canvas: document.createElement('canvas'),
    raf: null,
    init() {
      const c = this.canvas;
      c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:450;';
      map.getContainer().appendChild(c);
      const redraw = () => this.schedule();
      map.on('move zoom resize viewreset', redraw);
      this.resize();
    },
    resize() {
      const size = map.getSize(), dpr = window.devicePixelRatio || 1;
      this.canvas.width = size.x * dpr; this.canvas.height = size.y * dpr;
      this.canvas.style.width = size.x + 'px'; this.canvas.style.height = size.y + 'px';
      this.dpr = dpr;
    },
    setPoints(points) { this.points = points; this.schedule(); },
    schedule() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = null; this.draw(); });
    },
    draw() {
      const size = map.getSize();
      if (this.canvas.width !== size.x * this.dpr) this.resize();
      const ctx = this.canvas.getContext('2d'), dpr = this.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      ctx.font = '700 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      const pins = [], labels = [], used = [];
      for (const p of this.points) {
        const pt = map.latLngToContainerPoint([p.latitude, p.longitude]);
        if (pt.x < -200 || pt.y < -60 || pt.x > size.x + 200 || pt.y > size.y + 60) continue;
        pins.push([pt.x, pt.y]);
        p._x = pt.x; p._y = pt.y;
        if (SHOW_ALL_NAMES && p.mailingAddress) labels.push(p);
      }
      // shadows first, then pins (lower pins on top, like real markers)
      pins.sort((a, b) => a[1] - b[1]);
      const imgOK = pinImg.complete && pinImg.naturalWidth > 0;
      if (imgOK && shadowImg.complete && shadowImg.naturalWidth > 0) {
        for (const [x, y] of pins) ctx.drawImage(shadowImg, x - 12, y - 41, 41, 41);
      }
      for (const [x, y] of pins) {
        if (imgOK) {
          ctx.drawImage(pinImg, x - 12.5, y - 41, 25, 41);   // anchor = bottom tip
        } else {
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.bezierCurveTo(x - 14, y - 12, x - 11, y - 30, x, y - 30);
          ctx.bezierCurveTo(x + 11, y - 30, x + 14, y - 12, x, y);
          ctx.fillStyle = PIN_COLOR; ctx.fill();
        }
      }
      // name labels above each pin
      for (const p of labels) {
        const labelText = p.mailingAddress;
        const w = ctx.measureText(labelText).width + 24, h = 26;
        const x = p._x - w / 2, y = p._y - 46 - h;
        if (DECLUTTER_LABELS) {
          if (used.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1])) continue;
          used.push([x, y, w, h]);
        }
        ctx.fillStyle = '#f7f7f8'; ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
        ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h)); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f7f7f8';
        ctx.beginPath(); ctx.moveTo(p._x - 6, y + h - 0.5); ctx.lineTo(p._x + 6, y + h - 0.5); ctx.lineTo(p._x, y + h + 6); ctx.fill();
        ctx.fillStyle = '#151414'; ctx.fillText(labelText, x + 12, y + h / 2 + 1);
      }
    },
    // nearest pin to a screen point (for clicks / hover cursor)
    hit(pt) {
      let best = null, bestD = 18 * 18;
      for (const p of this.points) {
        if (p._x == null) continue;
        const dx = pt.x - p._x, dy = pt.y - (p._y - 20);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    }
  };
  pinLayer.init();
  map.on('click', e => {
    const p = pinLayer.hit(e.containerPoint);
    if (p) window.open(directionsURL(p), '_blank', 'noopener');
  });
  let hoverRaf = null;
  map.on('mousemove', e => {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = null;
      map.getContainer().style.cursor = pinLayer.hit(e.containerPoint) ? 'pointer' : '';
    });
  });
  const PAGE_SIZE = 100;      // cards rendered in the list at a time
  let shownCount = PAGE_SIZE;
  let visibleCache = [];
  // Update these coordinates if you have the exact Zion-Lifts office pin.
  const ADMIN_LOCATION = { name: 'Zion-Lifts Admin', address: 'Balanagar, Hyderabad', latitude: 17.4775, longitude: 78.4482 };
  let adminMarker = null;
  const list = document.getElementById('location-list');
  const radiusSelect = document.getElementById('radius');
  const searchInput = document.getElementById('search');
  const count = document.getElementById('count');
  const statusElement = document.getElementById('map-status');

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
  function distanceKm(aLat, aLon, bLat, bLon) {
    const rad = n => n * Math.PI / 180;
    const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function directionsURL(location) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location.latitude + ',' + location.longitude)}`;
  }
  function userNavURL() {
    return `https://www.google.com/maps/dir/?api=1&destination=${userPosition.lat},${userPosition.lng}`;
  }
  function filteredLocations() {
    const query = searchInput.value.trim().toLowerCase();
    const radius = radiusSelect.value;
    const maxKm = radius === 'all' ? Infinity : Number(radius);
    const result = [];
    for (const location of locations) {
      // Search by lift name or mailing address.
      if (query && !location.searchKey.includes(query)) continue;
      location.distance = userPosition ? distanceKm(userPosition.lat, userPosition.lng, location.latitude, location.longitude) : null;
      if (userPosition && location.distance > maxKm) continue;
      result.push(location);
    }
    if (userPosition) result.sort((a, b) => a.distance - b.distance);
    return result;
  }

  function setupAdmin() {
    const adminIcon = L.divIcon({
      className: 'admin-marker-wrap',
      html: '<div class="admin-marker-pin"><span>★</span></div>',
      iconSize: [36, 44], iconAnchor: [18, 42]
    });
    adminMarker = L.marker([ADMIN_LOCATION.latitude, ADMIN_LOCATION.longitude], { icon: adminIcon, zIndexOffset: 1000 }).addTo(map);
    adminMarker.bindTooltip('ADMIN · ZION-LIFTS', { permanent: true, direction: 'top', offset: [0, -46], className: 'admin-location-label' });
    // No popup on the admin marker; clicking it goes directly to Google Maps.
    adminMarker.on('click', () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${ADMIN_LOCATION.latitude},${ADMIN_LOCATION.longitude}`, '_blank', 'noopener'));
  }

  function renderMarkers(visible) {
    pinLayer.setPoints(visible);
  }

  function renderList(visible) {
    const frag = document.createDocumentFragment();

    const adminCard = document.createElement('article');
    adminCard.className = 'location-card admin-card';
    adminCard.innerHTML = '<div class="admin-card-tag">★ OFFICIAL ADMIN LOCATION</div><h2 class="card-title">Zion Lifts - Admin Zion-Lifts</h2><p class="address">Balanagar, Hyderabad</p><button class="navigate admin-navigate" type="button">Navigate to Admin Office 📍</button>';
    adminCard.querySelector('button').addEventListener('click', () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${ADMIN_LOCATION.latitude},${ADMIN_LOCATION.longitude}`, '_blank', 'noopener'));
    frag.appendChild(adminCard);

    // Test card: navigate to the user's own current location (appears once location is allowed).
    if (userPosition) {
      const me = document.createElement('article');
      me.className = 'location-card';
      me.innerHTML = `<h2 class="card-title">📍 Your current location</h2><p class="address">${userPosition.lat.toFixed(5)}, ${userPosition.lng.toFixed(5)}</p><button class="navigate" type="button">Navigate 📍</button>`;
      me.querySelector('button').addEventListener('click', () => window.open(userNavURL(), '_blank', 'noopener'));
      frag.appendChild(me);
    }

    // Only the first `shownCount` cards are built (2600 cards at once would be slow).
    visible.slice(0, shownCount).forEach(location => {
      const card = document.createElement('article');
      card.className = 'location-card';
      const distanceText = location.distance == null ? '' : `<p class="address">${location.distance.toFixed(1)} km away</p>`;
      card.innerHTML = `<h2 class="card-title">${escapeHTML(location.mailingAddress)}</h2>${distanceText}<button class="navigate" type="button">Navigate 📍</button>`;
      card.querySelector('button').addEventListener('click', () => window.open(directionsURL(location), '_blank', 'noopener'));
      frag.appendChild(card);
    });

    if (!visible.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No matching locations. Try another search or radius.';
      frag.appendChild(p);
    } else if (visible.length > shownCount) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'show-more';
      more.textContent = `Show more (${visible.length - shownCount} remaining)`;
      more.addEventListener('click', () => { shownCount += PAGE_SIZE; renderList(visibleCache); });
      frag.appendChild(more);
    }
    list.replaceChildren(frag);
  }

  // Full render: only needed when the search, radius, or user position changes — NOT on zoom.
  function render() {
    visibleCache = filteredLocations();
    shownCount = PAGE_SIZE;
    renderMarkers(visibleCache);
    renderList(visibleCache);
    const visible = visibleCache;
    count.textContent = `${visible.length} location${visible.length === 1 ? '' : 's'}`;
    statusElement.textContent = userPosition
      ? `Showing locations ${radiusSelect.value === 'all' ? 'at all distances' : `within ${radiusSelect.value} km`}`
      : `Loaded ${locations.length} lift locations · allow location access to find nearest`;
  }
  function fitEverything() {
    const points = visibleCache.map(l => L.latLng(l.latitude, l.longitude));
    points.push(L.latLng(ADMIN_LOCATION.latitude, ADMIN_LOCATION.longitude));
    if (userPosition) points.push(L.latLng(userPosition.lat, userPosition.lng));
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.12), { maxZoom: 12 });
  }
  function showAllOnMap() {
    radiusSelect.value = 'all'; searchInput.value = ''; render();
    fitEverything();
  }
  function requestCurrentLocation() {
    if (!navigator.geolocation) { statusElement.textContent = 'This browser does not support location access.'; return; }
    statusElement.textContent = 'Requesting your current location…';
    navigator.geolocation.getCurrentPosition(position => {
      userPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (userMarker) map.removeLayer(userMarker);
      // Red marker with a permanent label identifies the user's current location.
      userMarker = L.circleMarker([userPosition.lat, userPosition.lng], {
        radius: 9, color: '#ffffff', weight: 3, fillColor: '#e53935', fillOpacity: 1
      }).addTo(map).bindTooltip('Your current location', { permanent: true, direction: 'top', offset: [0, -10], className: 'current-location-label' });
     userMarker.bindPopup(() => {
    const box = document.createElement('div');
    box.innerHTML = '<strong>Your current location</strong>';
    return box;
});
      render();
      fitEverything();
    }, error => {
      console.warn('Location access was not granted:', error.message);
      statusElement.textContent = 'Location unavailable. Allow location access and press “Use My Location”.';
      render();
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  // Lift labels are permanent and remain visible at every zoom level.
  radiusSelect.addEventListener('change', render);
  let searchTimer = null;
  searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(render, 200); });
  setupAdmin();
  document.getElementById('show-all').addEventListener('click', showAllOnMap);
  document.getElementById('locate').addEventListener('click', requestCurrentLocation);

// ====== PASTE YOUR GOOGLE SHEET LINK HERE (between the quotes) ======
// Use the link from: File > Share > Publish to web > MapData tab > CSV
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRvYJ-GXNo1XaRPeox--AfUuLdLWpvfdkB1XHxvM8tdFai2WcBn22CZblKLFbpr2O3QfKIQ0KS4ihBj/pub?gid=1948021833&single=true&output=csv';
// =====================================================================

// Reads rows from a link (Google Sheet or data.xls) and makes column names case-insensitive
async function readRows(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return raw.map(r => {
    const o = {};
    for (const k of Object.keys(r)) o[String(k).trim().toLowerCase()] = r[k];
    return o;
  });
}

async function loadExcelFile() {
  try {
    let rows = null;

    // 1) Try the Google Sheet first (always the latest data)
    if (GOOGLE_SHEET_URL) {
      try {
        statusElement.textContent = 'Loading latest lift locations…';
        const sep = GOOGLE_SHEET_URL.includes('?') ? '&' : '?';
        rows = await readRows(`${GOOGLE_SHEET_URL}${sep}t=${Date.now()}`);
        if (!rows.length) throw new Error('Google Sheet returned no rows');
        console.log('Loaded from Google Sheet');
      } catch (err) {
        console.warn('Google Sheet failed, using data.xls backup:', err);
        rows = null;
      }
    }

    // 2) If the Google Sheet did not work, use the data.xls backup
    if (!rows) {
      statusElement.textContent = 'Loading lift locations from data.xls…';
      rows = await readRows('./data.xls');
      console.log('Loaded from data.xls (backup)');
    }

    // Use the exact "mailing address" column for map labels.
    locations = rows.map(row => {
      const mailingAddress = String(row['mailing address'] ?? '').trim();
      const name = String(row.name || 'Unnamed lift').trim();
      return {
        name,
        mailingAddress,
        latitude: Number(row.lat ?? row.latitude),
        longitude: Number(row.lng ?? row.lon ?? row.longitude),
        searchKey: `${name} ${mailingAddress}`.toLowerCase()
      };
    }).filter(row => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)
      && row.latitude >= -90 && row.latitude <= 90 && row.longitude >= -180 && row.longitude <= 180);

    render();
    fitEverything();
    requestCurrentLocation();
  } catch (error) {
    console.error(error);
    statusElement.textContent = 'Could not load locations';
    list.innerHTML = '<p class="empty">Could not load the locations. Check your internet connection, the Google Sheet link, and that data.xls is beside index.html.</p>';
  }
}
loadExcelFile();
