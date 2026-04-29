// Backend proxy for Nominatim — keeps Nominatim calls server-side (no CORS issues).
const router = require('express').Router();
const https  = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'WaslneyShuttleApp/1.0 contact@waslney.com',
        'Accept-Language': 'en',
        'Accept': 'application/json',
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve([]); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// GET /api/geocode/search?q=Nasr+City
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);

  try {
    // Egypt-restricted search first
    const egUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=eg&addressdetails=1&accept-language=en`;
    let data = await httpsGet(egUrl);

    // Fallback: append Egypt if no results
    if (!Array.isArray(data) || !data.length) {
      const fbUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' Egypt')}&format=json&limit=6&addressdetails=1&accept-language=en`;
      data = await httpsGet(fbUrl);
    }

    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('Geocode search proxy error:', err.message);
    res.json([]); // empty array, not 500 — frontend handles gracefully
  }
});

// GET /api/geocode/reverse?lat=30.06&lng=31.24
router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.json(null);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`;
    const data = await httpsGet(url);
    res.json(data || null);
  } catch (err) {
    console.error('Geocode reverse proxy error:', err.message);
    res.json(null);
  }
});

module.exports = router;
