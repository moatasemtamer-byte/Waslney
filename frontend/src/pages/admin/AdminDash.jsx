import React, { useState, useEffect } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, Tabs, Topbar, Badge, StatCard, DetailRow, CapBar, CapBarLabeled, Stars, Inp, Sel, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import { AdminMap, StopPicker } from '../../components/TripMap.jsx';


// ── Nominatim autocomplete for admin area fields ─────────────────────────────
function NominatimAreaSearch({ label, value, onChange }) {
  const [query,   setQuery]   = useState(value || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debRef  = React.useRef(null);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    const fn = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function onInput(e) {
    const q = e.target.value;
    setQuery(q);
    onChange(q); // update text value immediately
    clearTimeout(debRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&countrycodes=eg&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
        const d = await r.json();
        setResults(d); setOpen(d.length > 0);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 320);
  }

  function pick(item) {
    const addr = item.address || {};
    const name = [addr.neighbourhood || addr.suburb || addr.city_district || item.name, addr.city || addr.town || addr.county].filter(Boolean).slice(0,2).join(', ') || item.display_name.split(',').slice(0,2).join(',');
    setQuery(name); setResults([]); setOpen(false);
    onChange(name);
  }

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      <label style={{ display:'block', fontSize:12, color:C.text3, marginBottom:6, fontFamily:\"'Sora',sans-serif\" }}>{label}</label>
      <div style={{ position:'relative' }}>
        <input value={query} onChange={onInput} onFocus={() => results.length && setOpen(true)}
          placeholder="Type to search area…"
          style={{ width:'100%', boxSizing:'border-box', background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 36px 10px 14px', color:C.text, fontFamily:\"'Sora',sans-serif\", fontSize:14, outline:'none' }} />
        {loading && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', width:14, height:14, border:`2px solid ${C.border}`, borderTopColor:C.green, borderRadius:'50%', animation:'spin .6s linear infinite' }} />}
      </div>
      {open && results.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:9999, background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, boxShadow:'0 8px 32px rgba(0,0,0,.55)', overflow:'hidden' }}>
          {results.map((item, i) => {
            const addr = item.address || {};
            const main = [addr.neighbourhood||addr.suburb||addr.city_district||item.name, addr.city||addr.town].filter(Boolean).slice(0,2).join(', ') || item.display_name.split(',').slice(0,2).join(',');
            return (
              <div key={item.place_id||i} onMouseDown={() => pick(item)}
                style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`1px solid ${C.border}`, fontFamily:\"'Sora',sans-serif\" }}
                onMouseEnter={e=>e.currentTarget.style.background=C.bg4} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ fontSize:13, color:C.text }}>{main}</div>
                <div style={{ fontSize:10, color:C.text3, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.display_name.split(',').slice(1,4).join(',')}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminDash() {
  const { user, logout, notify } = useAuth();
  const [tab,     setTab]     = useState('overview');
  const [trips,   setTrips]   = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [editTrip, setEditTrip] = useState(null);
  const [stops,   setStops]   = useState([]);
  const [editStops, setEditStops] = useState([]);

  const [form, setForm] = useState({
    from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:''
  });
  const f = k => e => setForm({ ...form, [k]: e.target.value });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [t, d, u] = await Promise.all([api.getTrips(), api.getDrivers(), api.getUsers()]);
      setTrips(t); setDrivers(d); setUsers(u);
    } catch(e) { notify('Error', e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    const { from_loc, to_loc, pickup_time, date, price, driver_id } = form;
    if (!from_loc||!to_loc||!pickup_time||!date||!price||!driver_id) {
      notify('Incomplete', 'Fill in all required fields.', 'error'); return;
    }
    if (stops.length < 2) {
      notify('Add stops', 'Please add at least 1 pickup and 1 drop-off point on the map.', 'error'); return;
    }
    try {
      await api.createTrip({ ...form, price: parseFloat(form.price), total_seats: parseInt(form.total_seats)||16, stops });
      notify('Trip created!', `${from_loc} → ${to_loc} on ${date}`);
      setForm({ from_loc:'', to_loc:'', pickup_time:'', dropoff_time:'', date:'', price:'', total_seats:16, driver_id:'' });
      setStops([]);
      loadAll(); setTab('trips');
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleSaveEdit() {
    try {
      await api.updateTrip(editTrip.id, {
        from_loc:     editTrip.from_loc,
        to_loc:       editTrip.to_loc,
        pickup_time:  editTrip.pickup_time,
        dropoff_time: editTrip.dropoff_time,
        date:         editTrip.date,
        price:        parseFloat(editTrip.price),
        driver_id:    editTrip.driver_id,
        stops:        editStops,
      });
      notify('Trip updated', 'Changes saved.');
      setEditTrip(null); setEditStops([]);
      loadAll();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleCancel(id) {
    try {
      await api.deleteTrip(id);
      notify('Trip cancelled', 'Passengers notified.');
      loadAll();
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  const allTrips    = trips;
  const activeCount = trips.filter(t => t.status==='upcoming'||t.status==='active').length;
  const totalBooked = trips.reduce((s,t) => s+(t.booked_seats||0), 0);
  const passengers  = users.filter(u => u.role==='passenger');
  const driverUsers = users.filter(u => u.role==='driver');

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Topbar role="admin" name="Admin" onLogout={logout} />
      <div style={{ maxWidth:960, margin:'0 auto', padding:'28px 20px' }}>

        <Tabs tabs={[
          { id:'overview',   label:'Overview' },
          { id:'create',     label:'+ Create trip' },
          { id:'trips',      label:'Trips' },
          { id:'drivers',    label:'Drivers' },
          { id:'passengers', label:'Passengers' },
        ]} active={tab} onSet={t => { setTab(t); setEditTrip(null); }} />

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
              <StatCard num={activeCount}       label="Active trips"  color={C.blue} />
              <StatCard num={totalBooked}       label="Seats booked"  color={C.green} />
              <StatCard num={driverUsers.length} label="Drivers"       color={C.purple} />
              <StatCard num={passengers.length} label="Passengers"    color={C.amber} />
            </div>
            <p style={sectSt}>Live driver locations</p>
            <AdminMap height={340} />
            <p style={sectSt}>All trips</p>
            {loading && <Spinner />}
            {allTrips.slice(0,6).map(t => (
              <div key={t.id} style={{ ...card, marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Badge type={t.status==='completed'?'blue':t.status==='active'?'green':t.status==='cancelled'?'red':'amber'}>{t.status}</Badge>
                  <span style={{ fontWeight:400 }}>{t.from_loc} → {t.to_loc}</span>
                  <span style={{ marginLeft:'auto', fontSize:12, color:C.text2 }}>{t.booked_seats||0}/{t.total_seats} seats</span>
                </div>
                <CapBar booked={t.booked_seats||0} total={t.total_seats} />
              </div>
            ))}
          </div>
        )}

        {/* ── CREATE TRIP ── */}
        {tab === 'create' && (
          <div>
            <div style={card}>
              <p style={sectSt}>New trip</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <NominatimAreaSearch label="📍 Pickup area" value={form.from_loc} onChange={v => setForm({...form, from_loc:v})} />
                <NominatimAreaSearch label="🏁 Drop-off area" value={form.to_loc} onChange={v => setForm({...form, to_loc:v})} />
                <Inp label="📅 Date"              type="date" value={form.date}          onChange={f('date')} />
                <Inp label="🕐 Pickup time"       type="time" value={form.pickup_time}   onChange={f('pickup_time')} />
                <Inp label="🕐 Est. drop-off"     type="time" value={form.dropoff_time}  onChange={f('dropoff_time')} />
                <Inp label="💰 Price/seat (EGP)"  type="number" value={form.price}       onChange={f('price')} placeholder="45" />
                <Inp label="💺 Total seats"       type="number" value={form.total_seats} onChange={f('total_seats')} />
              </div>
              <Sel label="🚐 Assign driver" value={form.driver_id} onChange={f('driver_id')}>
                <option value="">Select driver…</option>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>

              <p style={{ ...sectSt, marginTop:20 }}>🗺️ Set pickup & drop-off points on map</p>
              <p style={{ fontSize:12, color:C.text3, marginBottom:12 }}>Click map to alternate between pickup 🟢 and drop-off 🔵 points. Add as many as needed.</p>
              <StopPicker stops={stops} onChange={setStops} height={340} />

              <button onClick={handleCreate} style={btnPrimary}>Create trip</button>
            </div>
          </div>
        )}

        {/* ── MANAGE TRIPS ── */}
        {tab === 'trips' && !editTrip && (
          <div>
            <p style={sectSt}>{allTrips.length} trips total</p>
            {loading && <Spinner />}
            {allTrips.map(t => {
              const driver = driverUsers.find(d => d.id === t.driver_id);
              return (
                <div key={t.id} style={{ ...card, marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                    <Badge type={t.status==='completed'?'blue':t.status==='active'?'green':t.status==='cancelled'?'red':'amber'}>{t.status}</Badge>
                    <span style={{ marginLeft:'auto', fontSize:11, color:C.text3 }}>{fmtDate(t.date)} · {t.pickup_time}</span>
                  </div>
                  <div style={{ fontSize:16, fontWeight:400, marginBottom:4 }}>{t.from_loc} → {t.to_loc}</div>
                  <div style={{ fontSize:12, color:C.text2, marginBottom:6 }}>
                    Driver: {t.driver_name||driver?.name||'—'} · {t.driver_plate||driver?.plate||'—'} · {t.price} EGP/seat
                  </div>
                  {t.stops && t.stops.length > 0 && (
                    <div style={{ fontSize:11, color:C.text3, marginBottom:8 }}>
                      {t.stops.filter(s=>s.type==='pickup').length} pickup{t.stops.filter(s=>s.type==='pickup').length!==1?'s':''} · {t.stops.filter(s=>s.type==='dropoff').length} drop-off{t.stops.filter(s=>s.type==='dropoff').length!==1?'s':''}
                    </div>
                  )}
                  <CapBarLabeled booked={t.booked_seats||0} total={t.total_seats} />
                  {t.status !== 'cancelled' && t.status !== 'completed' && (
                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      <button onClick={() => { setEditTrip({...t}); setEditStops(t.stops||[]); }} style={btnSm}>Edit</button>
                      <button onClick={() => handleCancel(t.id)} style={btnDanger}>Cancel trip</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── EDIT TRIP ── */}
        {tab === 'trips' && editTrip && (
          <div>
            <button onClick={() => { setEditTrip(null); setEditStops([]); }} style={{ ...btnSm, marginBottom:20 }}>← Cancel</button>
            <div style={card}>
              <p style={sectSt}>Edit trip #{editTrip.id}</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <NominatimAreaSearch label="Pickup area" value={editTrip.from_loc} onChange={v => setEditTrip({...editTrip, from_loc:v})} />
                <NominatimAreaSearch label="Drop-off area" value={editTrip.to_loc} onChange={v => setEditTrip({...editTrip, to_loc:v})} />
                <Inp label="Date" type="date" value={editTrip.date?.slice(0,10)} onChange={e => setEditTrip({...editTrip, date:e.target.value})} />
                <Inp label="Pickup time" type="time" value={editTrip.pickup_time} onChange={e => setEditTrip({...editTrip, pickup_time:e.target.value})} />
                <Inp label="Drop-off time" type="time" value={editTrip.dropoff_time||''} onChange={e => setEditTrip({...editTrip, dropoff_time:e.target.value})} />
                <Inp label="Price (EGP)" type="number" value={editTrip.price} onChange={e => setEditTrip({...editTrip, price:e.target.value})} />
              </div>
              <Sel label="Assign driver" value={editTrip.driver_id} onChange={e => setEditTrip({...editTrip, driver_id:e.target.value})}>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>
              <p style={{ ...sectSt, marginTop:16 }}>🗺️ Edit stops on map</p>
              <StopPicker stops={editStops} onChange={setEditStops} height={300} />
              <button onClick={handleSaveEdit} style={btnPrimary}>Save changes</button>
            </div>
          </div>
        )}

        {/* ── DRIVERS ── */}
        {tab === 'drivers' && (
          <div>
            <p style={sectSt}>{driverUsers.length} registered drivers</p>
            {driverUsers.map(d => (
              <div key={d.id} style={{ ...card, marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <Avatar name={d.name} size={44} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500 }}>{d.name}</div>
                    <div style={{ fontSize:12, color:C.text2 }}>{d.car} · <span style={{ fontFamily:'monospace' }}>{d.plate}</span></div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ color:C.amber, fontSize:14 }}>{'★'.repeat(Math.round(d.avg_rating))}{'☆'.repeat(5-Math.round(d.avg_rating))} {parseFloat(d.avg_rating).toFixed(1)}</div>
                    <div style={{ fontSize:11, color:C.text3 }}>{d.rating_count} reviews</div>
                  </div>
                </div>
                <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, display:'flex', gap:20 }}>
                  <div><span style={{ fontSize:18, fontWeight:300, color:C.blue }}>{d.total_trips}</span><div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Total</div></div>
                  <div><span style={{ fontSize:18, fontWeight:300, color:C.green }}>{d.completed_trips}</span><div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' }}>Done</div></div>
                  <div style={{ marginLeft:'auto', display:'flex', alignItems:'center' }}><Badge type="green">Active</Badge></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PASSENGERS ── */}
        {tab === 'passengers' && (
          <div>
            <p style={sectSt}>{passengers.length} registered passengers</p>
            {passengers.map(p => (
              <div key={p.id} style={{ ...card, marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <Avatar name={p.name} color={C.blue} dim={C.blueDim} border={C.blueBorder} size={38} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:14 }}>{p.name}</div>
                    <div style={{ fontSize:12, color:C.text2 }}>{p.phone}</div>
                  </div>
                  <div style={{ textAlign:'right', fontSize:12, color:C.text3 }}>Joined {fmtDate(p.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
