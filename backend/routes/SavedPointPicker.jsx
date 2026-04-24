/**
 * SavedPointPicker.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable component for selecting a previously saved pickup/drop-off point.
 * Renders a styled dropdown of saved points + an inline "Save new point" form.
 *
 * Props:
 *   label        — e.g. "📍 Pickup area"
 *   type         — 'pickup' | 'dropoff'  (filters which saved points show)
 *   value        — currently selected point object { id, name, lat, lng } or null
 *   onChange     — called with { lat, lng, name } when a point is selected, or null on clear
 *   savedPoints  — full array of saved points from parent (avoids duplicate fetches)
 *   onPointSaved — called after a new point is saved so parent can refresh the list
 */
import { useState, useRef, useEffect } from 'react';
import { C } from './UI.jsx';
import * as api from '../api.js';

export default function SavedPointPicker({ label, type, value, onChange, savedPoints = [], onPointSaved }) {
  const [open,     setOpen]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ name: '', lat: '', lng: '', type: type || 'both' });
  const [formErr,  setFormErr]  = useState('');
  const [deleting, setDeleting] = useState(null);
  const wrapRef = useRef(null);

  // Filter to points usable for this field
  const filtered = savedPoints.filter(p =>
    p.type === 'both' || p.type === type || !type
  );

  // Close dropdown on outside click
  useEffect(() => {
    const fn = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function select(pt) {
    onChange({ lat: parseFloat(pt.lat), lng: parseFloat(pt.lng), name: pt.name });
    setOpen(false);
  }

  function clear(e) {
    e.stopPropagation();
    onChange(null);
  }

  async function handleSave() {
    const { name, lat, lng, type: ptype } = form;
    if (!name.trim()) { setFormErr('Enter a name for this point'); return; }
    const la = parseFloat(lat), ln = parseFloat(lng);
    if (isNaN(la) || isNaN(ln)) { setFormErr('Enter valid coordinates'); return; }
    setFormErr('');
    setSaving(true);
    try {
      const saved = await api.createSavedPoint({ name: name.trim(), type: ptype, lat: la, lng: ln });
      onPointSaved && onPointSaved(saved);
      setForm({ name: '', lat: '', lng: '', type: type || 'both' });
      setShowForm(false);
    } catch (e) {
      setFormErr(e.message || 'Could not save point');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    setDeleting(id);
    try {
      await api.deleteSavedPoint(id);
      onPointSaved && onPointSaved(null); // signal parent to refresh
      if (value && String(value.id) === String(id)) onChange(null);
    } catch {}
    finally { setDeleting(null); }
  }

  const typeColor  = type === 'pickup' ? C.green  : C.blue;
  const typeBorder = type === 'pickup' ? C.greenBorder : C.blueBorder;
  const typeDim    = type === 'pickup' ? C.greenDim    : C.blueDim;
  const typeEmoji  = type === 'pickup' ? '🟢' : '🔵';

  return (
    <div style={{ marginBottom: 14 }} ref={wrapRef}>
      {/* Label */}
      <div style={{ fontSize: 12, color: C.text3, marginBottom: 6, fontFamily: "'Sora',sans-serif" }}>
        {label}
      </div>

      {/* Trigger button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          background: C.bg3,
          border: `1px solid ${value ? typeBorder : C.border}`,
          borderRadius: 8,
          padding: '11px 14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: "'Sora',sans-serif",
          fontSize: 14,
          color: value ? C.text : C.text3,
          userSelect: 'none',
          transition: 'border-color .15s',
        }}
      >
        <span>{typeEmoji}</span>
        <span style={{ flex: 1 }}>
          {value ? value.name : `Choose saved point…`}
        </span>
        {value && (
          <span
            onClick={clear}
            style={{ color: C.text3, fontSize: 16, lineHeight: 1, padding: '0 2px', cursor: 'pointer' }}
            title="Clear"
          >×</span>
        )}
        {value && <span style={{ color: typeColor, fontSize: 14 }}>✓</span>}
        {!value && <span style={{ color: C.text3, fontSize: 11 }}>▼</span>}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          zIndex: 9999,
          background: C.bg3,
          border: `1px solid ${typeBorder}`,
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,.85)',
          minWidth: 280,
          maxWidth: 360,
          marginTop: 4,
          overflow: 'hidden',
        }}>
          {/* Saved points list */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '18px 16px', fontSize: 12, color: C.text3, textAlign: 'center' }}>
                No saved points yet. Add one below ↓
              </div>
            )}
            {filtered.map(pt => (
              <div
                key={pt.id}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderBottom: `1px solid ${C.border}`,
                  background: value?.name === pt.name ? typeDim : 'transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = typeDim}
                onMouseLeave={e => e.currentTarget.style.background = value?.name === pt.name ? typeDim : 'transparent'}
                onClick={() => select(pt)}
              >
                <span style={{ fontSize: 16 }}>{typeEmoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{pt.name}</div>
                  <div style={{ fontSize: 10, color: C.text3, marginTop: 1, fontFamily: 'monospace' }}>
                    {parseFloat(pt.lat).toFixed(5)}, {parseFloat(pt.lng).toFixed(5)}
                  </div>
                </div>
                {/* Delete button */}
                <button
                  onClick={e => handleDelete(e, pt.id)}
                  disabled={deleting === pt.id}
                  style={{
                    background: 'transparent', border: 'none',
                    color: deleting === pt.id ? C.text3 : C.red,
                    cursor: deleting === pt.id ? 'default' : 'pointer',
                    fontSize: 14, padding: '2px 4px', lineHeight: 1,
                  }}
                  title="Delete point"
                >
                  {deleting === pt.id ? '…' : '×'}
                </button>
              </div>
            ))}
          </div>

          {/* Save new point section */}
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <div
              onClick={() => setShowForm(f => !f)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: 12,
                color: typeColor,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: typeDim,
                fontFamily: "'Sora',sans-serif",
              }}
            >
              <span style={{ fontSize: 16 }}>＋</span>
              Save new point
              <span style={{ marginLeft: 'auto', color: C.text3 }}>{showForm ? '▲' : '▼'}</span>
            </div>

            {showForm && (
              <div style={{ padding: '12px 14px', background: C.bg4, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  <input
                    placeholder="Point name (e.g. Nasr City Gate 1)"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    style={inp}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      placeholder="Latitude"
                      value={form.lat}
                      onChange={e => setForm({ ...form, lat: e.target.value })}
                      style={inp}
                    />
                    <input
                      placeholder="Longitude"
                      value={form.lng}
                      onChange={e => setForm({ ...form, lng: e.target.value })}
                      style={inp}
                    />
                  </div>
                  <select
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="both">Both (pickup & drop-off)</option>
                    <option value="pickup">Pickup only</option>
                    <option value="dropoff">Drop-off only</option>
                  </select>
                </div>
                {formErr && (
                  <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>⚠ {formErr}</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      flex: 1, background: typeDim, color: typeColor,
                      border: `1px solid ${typeBorder}`, borderRadius: 6,
                      padding: '8px', fontSize: 12, cursor: saving ? 'default' : 'pointer',
                      fontFamily: "'Sora',sans-serif", fontWeight: 600,
                    }}
                  >
                    {saving ? 'Saving…' : '💾 Save point'}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setFormErr(''); }}
                    style={{
                      background: 'transparent', color: C.text3,
                      border: `1px solid ${C.border}`, borderRadius: 6,
                      padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                      fontFamily: "'Sora',sans-serif",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inp = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg3, #18181b)',
  border: '1px solid var(--border, #3f3f46)',
  borderRadius: 6, padding: '8px 10px',
  color: 'var(--text, #f4f4f5)',
  fontFamily: "'Sora',sans-serif", fontSize: 12, outline: 'none',
};
