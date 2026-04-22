/**
 * LeafletSearch — autocomplete backed by /api/geocode/search (backend Nominatim proxy).
 * No CDN scripts, no direct browser→Nominatim calls. Works behind any firewall.
 */
import { useState, useEffect, useRef } from 'react';
import { C } from './UI.jsx';

// ── Backend geocode helper ────────────────────────────────────────────────────
async function searchPlaces(q) {
  const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Geocode error ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(item => {
    const a = item.address || {};
    const name = [
      a.neighbourhood || a.suburb || a.city_district || a.quarter || item.name,
      a.city || a.town || a.county,
    ].filter(Boolean).join(', ') || item.display_name?.split(',').slice(0, 2).join(',') || '';
    return {
      name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type || item.class || '',
      city: a.city || a.town || '',
    };
  });
}

// Reverse geocode — also proxied through backend
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || !d.address) return null;
    const a = d.address;
    const parts = [
      a.road || a.pedestrian || a.footway,
      a.neighbourhood || a.suburb || a.city_district || a.quarter,
      a.city || a.town || a.county,
    ].filter(Boolean);
    return parts.slice(0, 3).join(', ') || d.display_name?.split(',').slice(0, 3).join(',') || null;
  } catch { return null; }
}

// ── PlaceSearch component ─────────────────────────────────────────────────────
export function PlaceSearch({ label, placeholder, icon, value, onChange }) {
  const [query,   setQuery]   = useState(value?.name || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [noRes,   setNoRes]   = useState(false);
  const debRef   = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });

  useEffect(() => { if (!value) setQuery(''); }, [value]);

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
    setQuery(q);
    onChange(null);
    setNoRes(false);
    clearTimeout(debRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }

    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await searchPlaces(q);
        setResults(list);
        setNoRes(list.length === 0);
        if (list.length > 0) { measure(); setOpen(true); } else setOpen(false);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
        setNoRes(true);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  function pick(item) {
    setQuery(item.name);
    setResults([]);
    setOpen(false);
    setNoRes(false);
    onChange({ lat: item.lat, lng: item.lng, name: item.name });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: C.text3, marginBottom: 6, fontFamily: "'Sora',sans-serif" }}>
        {icon} {label}
      </label>
      <div ref={inputRef} style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={onInput}
          onFocus={() => { if (results.length) { measure(); setOpen(true); } }}
          placeholder={placeholder || 'Search area…'}
          style={{
            width: '100%', boxSizing: 'border-box', background: C.bg3,
            border: '1px solid ' + (value ? C.greenBorder : C.border),
            borderRadius: 8, padding: '11px 42px 11px 14px',
            color: C.text, fontFamily: "'Sora',sans-serif", fontSize: 14, outline: 'none',
          }}
        />
        {loading && (
          <div style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            width: 14, height: 14, border: '2px solid ' + C.border, borderTopColor: C.green,
            borderRadius: '50%', animation: 'spin .6s linear infinite',
          }} />
        )}
        {!loading && value && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.green, fontSize: 16 }}>✓</span>
        )}
        {!loading && !value && noRes && query.length >= 2 && (
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: C.red, fontSize: 10 }}>no results</span>
        )}
      </div>

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
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid ' + C.border, fontFamily: "'Sora',sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg4}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{item.name}</span>
                {item.type && (
                  <span style={{ fontSize: 9, color: C.text3, background: C.bg4, border: '1px solid ' + C.border, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                    {item.type}
                  </span>
                )}
              </div>
              {item.city && <div style={{ fontSize: 10, color: C.text3, marginTop: 1 }}>{item.city}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
