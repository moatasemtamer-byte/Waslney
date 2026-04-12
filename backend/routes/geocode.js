// Backend proxy for Nominatim — avoids browser CORS/User-Agent issues
const router = require('express').Router();

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  try {
    // Dynamic import of node-fetch or use built-in fetch (Node 18+)
    const fetchFn = globalThis.fetch || (await import('node-fetch').then(m => m.default).catch(() => null));
    if (!fetchFn) return res.status(500).json({ error: 'fetch not available' });

    const egUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=eg&addressdetails=1&accept-language=en`;
    let r = await fetchFn(egUrl, {
      headers: {
        'User-Agent': 'WaslneyShuttleApp/1.0 contact@waslney.com',
        'Accept-Language': 'en',
      }
    });
    let data = await r.json();

    // Fallback: append "Egypt" if no results
    if (!data.length) {
      const globalUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' Egypt')}&format=json&limit=6&addressdetails=1&accept-language=en`;
      r = await fetchFn(globalUrl, {
        headers: {
          'User-Agent': 'WaslneyShuttleApp/1.0 contact@waslney.com',
          'Accept-Language': 'en',
        }
      });
      data = await r.json();
    }

    res.json(data);
  } catch (err) {
    console.error('Geocode proxy error:', err.message);
    res.status(500).json({ error: 'Geocode failed', details: err.message });
  }
});

module.exports = router;
