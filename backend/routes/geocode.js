// Geocode proxy — Photon (primary) + Nominatim (fallback)
// • In-memory cache (5 min TTL) — avoids hammering APIs on fast typing
// • Photon first: faster, no rate limit, great Egypt coverage
// • Nominatim fallback if Photon returns <3 results
const router = require('express').Router();
const https  = require('https');

// ── In-memory cache ───────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL) { cache.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) {
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a,b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ── HTTPS helper ──────────────────────────────────────────────────────────────
function httpsGet(url, ms = 6000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'WaslneyShuttleApp/1.0 contact@waslney.com',
        'Accept': 'application/json',
        'Accept-Language': 'en',
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    });
    req.on('error', reject);
    req.setTimeout(ms, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Photon (komoot) — fast, no auth, no rate limit ────────────────────────────
// Egypt bbox: lon 24.6–36.9  lat 22.0–31.7
async function searchPhoton(q) {
  const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) +
              '&limit=8&lang=en&bbox=24.6,22.0,36.9,31.7';
  const data = await httpsGet(url, 5000);
  if (!data || !data.features || !data.features.length) return [];
  return data.features
    .filter(f => {
      const lon = f.geometry.coordinates[0];
      const lat = f.geometry.coordinates[1];
      return lat >= 22.0 && lat <= 31.7 && lon >= 24.6 && lon <= 36.9;
    })
    .map(f => {
      const p = f.properties;
      const parts = [
        p.name,
        p.street,
        p.district || p.suburb || p.locality,
        p.city || p.county,
      ].filter(Boolean);
      return {
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        display_name: parts.slice(0,3).join(', ') || p.name || '',
        name: p.name || '',
        address: {
          neighbourhood: p.district || p.suburb || '',
          suburb:        p.suburb || p.locality || '',
          city:          p.city   || p.county   || '',
          town:          p.city   || '',
          road:          p.street || '',
        },
        type:  p.osm_value || p.type || '',
        class: p.osm_key  || '',
      };
    });
}

// ── Nominatim — fallback (rate-limited, 1 req/sec) ────────────────────────────
async function searchNominatim(q) {
  const base = 'https://nominatim.openstreetmap.org/search';
  const url1 = base + '?q=' + encodeURIComponent(q) +
    '&format=json&limit=8&countrycodes=eg&addressdetails=1&accept-language=en' +
    '&viewbox=24.6,31.7,36.9,22.0&bounded=0';
  let data = await httpsGet(url1, 7000);
  if (!Array.isArray(data) || !data.length) {
    const url2 = base + '?q=' + encodeURIComponent(q + ' Egypt') +
      '&format=json&limit=6&addressdetails=1&accept-language=en';
    data = await httpsGet(url2, 7000);
  }
  return Array.isArray(data) ? data : [];
}

// Deduplicate by lat/lng
function dedup(arr) {
  const seen = new Set();
  return arr.filter(r => {
    const k = parseFloat(r.lat).toFixed(3) + ',' + parseFloat(r.lon).toFixed(3);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── GET /api/geocode/search?q=Nasr+City ──────────────────────────────────────
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const key = 'search:' + q.toLowerCase();
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    let results = [];

    // Try Photon first
    try { results = await searchPhoton(q); }
    catch (e) { console.warn('Photon failed:', e.message); }

    // If fewer than 3 results, also try Nominatim and merge
    if (results.length < 3) {
      try {
        const nom = await searchNominatim(q);
        results = dedup([...results, ...nom]);
      } catch (e) { console.warn('Nominatim failed:', e.message); }
    }

    cacheSet(key, results);
    res.json(results);
  } catch (err) {
    console.error('Geocode search error:', err.message);
    res.json([]);
  }
});

// ── GET /api/geocode/reverse?lat=30.06&lng=31.24 ─────────────────────────────
router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.json(null);

  const key = 'rev:' + parseFloat(lat).toFixed(4) + ',' + parseFloat(lng).toFixed(4);
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    let result = null;

    // Photon reverse first (faster)
    try {
      const pUrl = 'https://photon.komoot.io/reverse?lat=' + lat + '&lon=' + lng + '&limit=1&lang=en';
      const pData = await httpsGet(pUrl, 4000);
      if (pData && pData.features && pData.features.length) {
        const p = pData.features[0].properties;
        const parts = [p.name, p.street, p.district || p.suburb, p.city || p.county].filter(Boolean);
        result = {
          display_name: parts.join(', '),
          address: {
            road:          p.street || '',
            neighbourhood: p.district || p.suburb || '',
            suburb:        p.suburb  || '',
            city:          p.city    || p.county || '',
            town:          p.city    || '',
          },
        };
      }
    } catch (e) { /* fall through */ }

    // Nominatim reverse fallback
    if (!result) {
      const nUrl = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng +
                   '&format=json&accept-language=en';
      result = await httpsGet(nUrl, 6000);
    }

    cacheSet(key, result);
    res.json(result || null);
  } catch (err) {
    console.error('Geocode reverse error:', err.message);
    res.json(null);
  }
});

module.exports = router;
