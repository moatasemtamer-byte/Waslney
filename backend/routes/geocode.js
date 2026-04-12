// Backend proxy for Nominatim — uses Node built-in https (no extra deps needed)
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

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);

  try {
    // Egypt-restricted search first
    const egUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=eg&addressdetails=1&accept-language=en`;
    let data = await httpsGet(egUrl);

    // Fallback: append Egypt to query if no results
    if (!Array.isArray(data) || !data.length) {
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' Egypt')}&format=json&limit=6&addressdetails=1&accept-language=en`;
      data = await httpsGet(fallbackUrl);
    }

    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('Geocode proxy error:', err.message);
    res.json([]); // return empty array, not 500 — frontend handles gracefully
  }
});

module.exports = router;
