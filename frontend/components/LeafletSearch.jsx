/**
 * LeafletSearch — autocomplete search input backed by Leaflet Control Geocoder
 * Uses Nominatim (OSM) via the leaflet-control-geocoder plugin loaded from CDN.
 * No API key, no backend proxy, CORS-safe, same CDN pattern as existing Leaflet load.
 */
import { useState, useEffect, useRef } from 'react';
import { C } from './UI.jsx';

// ── Load leaflet + geocoder from CDN (idempotent) ─────────────────────────────
let geocoderReady = false;
let geocoderLoading = false;
const geocoderCallbacks = [];

function loadGeocoder(cb) {
  if (geocoderReady) { cb(); return; }
  geocoderCallbacks.push(cb);
  if (geocoderLoading) return;
  geocoderLoading = true;

  function loadGeocoderScript() {
    // leaflet-control-geocoder CSS
    if (!document.querySelector('#lgc-css')) {
      const css = document.createElement('link');
      css.id = 'lgc-css'; css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css';
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js';
    js.onload = () => {
      geocoderReady = true;
      geocoderCallbacks.forEach(fn => fn());
      geocoderCallbacks.length = 0;
    };
    js.onerror = () => console.error('Failed to load leaflet-control-geocoder');
    document.head.appendChild(js);
  }

  // Make sure Leaflet itself is loaded first
  if (window.L) {
    loadGeocoderScript();
  } else {
    // Load Leaflet first, then geocoder
    if (!document.querySelector('#leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css'; css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    if (!document.querySelector('#leaflet-js')) {
      const js = document.createElement('script');
      js.id = 'leaflet-js';
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = loadGeocoderScript;
      document.head.appendChild(js);
    } else {
      // Script tag exists, poll for window.L
      const check = setInterval(() => {
        if (window.L) { clearInterval(check); loadGeocoderScript(); }
      }, 100);
    }
  }
}

// Reverse geocode using Nominatim directly (simple GET, CORS allowed)
export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await r.json();
    if (!d.address) return null;
    const a = d.address;
    const parts = [
      a.road || a.pedestrian || a.footway,
      a.neighbourhood || a.suburb || a.city_district || a.quarter,
      a.city || a.town || a.county,
    ].filter(Boolean);
    return parts.slice(0, 3).join(', ') || d.display_name?.split(',').slice(0,3).join(',') || null;
  } catch { return null; }
}

// ── PlaceSearch component ─────────────────────────────────────────────────────
export function PlaceSearch({ label, placeholder, icon, value, onChange }) {
  const [query,   setQuery]   = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [noRes,   setNoRes]   = useState(false);
  const [ready,   setReady]   = useState(!!geocoderReady);
  const debRef   = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);
  const geocRef  = useRef(null); // Nominatim geocoder instance
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });

  // Load geocoder plugin on mount
  useEffect(() => {
    loadGeocoder(() => {
      setReady(true);
      // Create a Nominatim geocoder instance
      if (window.L && window.L.Control && window.L.Control.Geocoder) {
        geocRef.current = window.L.Control.Geocoder.nominatim({
          geocodingQueryParams: { countrycodes: 'eg', limit: 8, addressdetails: 1 },
        });
      }
    });
  }, []);

  useEffect(() => { if (!value) setQuery(''); }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const fn = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target) &&
          listRef.current  && !listRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function measure() {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
  }

  function onInput(e) {
    const q = e.target.value;
    setQuery(q); onChange(null); setNoRes(false);
    clearTimeout(debRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }

    debRef.current = setTimeout(() => {
      if (!geocRef.current) {
        // Geocoder not ready yet — fall back to direct Nominatim fetch
        fallbackSearch(q);
        return;
      }
      setLoading(true);
      geocRef.current.geocode(q, (res) => {
        setLoading(false);
        const list = (res || []).map(r => ({
          name: r.name || r.html || String(r.center.lat.toFixed(4)+','+r.center.lng.toFixed(4)),
          lat: r.center.lat,
          lng: r.center.lng,
          type: r.properties?.type || '',
          city: r.properties?.address?.city || r.properties?.address?.town || '',
        }));
        setResults(list); setNoRes(list.length === 0);
        if (list.length > 0) { measure(); setOpen(true); } else setOpen(false);
      });
    }, 350);
  }

  // Direct Nominatim fetch as fallback (Nominatim does allow browser CORS)
  async function fallbackSearch(q) {
    setLoading(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=eg&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await r.json();
      const list = (data || []).map(item => {
        const a = item.address || {};
        const name = [
          a.neighbourhood || a.suburb || a.city_district || item.name,
          a.city || a.town || a.county,
        ].filter(Boolean).join(', ') || item.display_name.split(',').slice(0,2).join(',');
        return { name, lat: parseFloat(item.lat), lng: parseFloat(item.lon), type: item.type || '', city: a.city || a.town || '' };
      });
      setResults(list); setNoRes(list.length === 0);
      if (list.length > 0) { measure(); setOpen(true); } else setOpen(false);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]); setNoRes(true);
    } finally { setLoading(false); }
  }

  function pick(item) {
    setQuery(item.name); setResults([]); setOpen(false); setNoRes(false);
    onChange({ lat: item.lat, lng: item.lng, name: item.name });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display:'block', fontSize:12, color:C.text3, marginBottom:6, fontFamily:"'Sora',sans-serif" }}>
        {icon} {label}
      </label>
      <div ref={inputRef} style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={onInput}
          onFocus={() => { if (results.length) { measure(); setOpen(true); } }}
          placeholder={ready ? placeholder : 'Loading map search…'}
          disabled={false}
          style={{
            width: '100%', boxSizing: 'border-box', background: C.bg3,
            border: '1px solid ' + (value ? C.greenBorder : C.border),
            borderRadius: 8, padding: '11px 42px 11px 14px',
            color: C.text, fontFamily: "'Sora',sans-serif", fontSize: 14, outline: 'none',
          }}
        />
        {loading && (
          <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
            width:14, height:14, border:'2px solid '+C.border, borderTopColor:C.green,
            borderRadius:'50%', animation:'spin .6s linear infinite' }} />
        )}
        {!loading && value && (
          <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:C.green, fontSize:16 }}>✓</span>
        )}
        {!loading && !value && noRes && query.length >= 2 && (
          <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:C.red, fontSize:10 }}>no results</span>
        )}
      </div>

      {/* Dropdown — position:fixed to escape any parent overflow clipping */}
      {open && results.length > 0 && (
        <div ref={listRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
          zIndex: 99999, background: C.bg3,
          border: '1px solid ' + C.greenBorder, borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,.85)',
          maxHeight: 260, overflowY: 'auto',
        }}>
          {results.map((item, i) => (
            <div
              key={i}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid '+C.border, fontFamily:"'Sora',sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg4}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, color:C.text, flex:1 }}>{item.name}</span>
                {item.type && (
                  <span style={{ fontSize:9, color:C.text3, background:C.bg4, border:'1px solid '+C.border, borderRadius:3, padding:'1px 5px', whiteSpace:'nowrap' }}>
                    {item.type}
                  </span>
                )}
              </div>
              {item.city && <div style={{ fontSize:10, color:C.text3, marginTop:1 }}>{item.city}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
