import React, { useState, useEffect } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, Tabs, Topbar, Badge, StatCard, DetailRow, CapBar, CapBarLabeled, Stars, Inp, Sel, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import { AdminMap, StopPicker } from '../../components/TripMap.jsx';


// ── Photon geocoder (CORS-enabled, no key, OSM-backed) ─────────────────────
async function photonSearch(q) {
  if (!q || q.trim().length < 2) return [];
  try {
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) +
      '&limit=7&lang=en&bbox=24.6,22.0,36.9,31.7';
    const r = await fetch(url);
    const data = await r.json();
    if (!data.features || !data.features.length) return [];
    return data.features.map(f => {
      const p = f.properties;
      const parts = [p.name, p.street ? (p.housenumber ? p.housenumber+' '+p.street : p.street) : null,
        p.district||p.suburb||p.neighbourhood, p.city||p.town||p.county].filter(Boolean);
      const seen = new Set();
      const name = parts.filter(x => { if(seen.has(x)) return false; seen.add(x); return true; }).slice(0,3).join(', ');
      return { place_id: p.osm_id, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], name, type: p.type||p.osm_key||'', city: p.city||p.town||p.county||'' };
    });
  } catch { return []; }
}

// ── Area search with autocomplete — used in Create/Edit trip ────────────────
function AreaSearch({ label, value, onChangeName, onChangeCoord }) {
  const [query,   setQuery]   = useState(value || '');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debRef   = React.useRef(null);
  const inputRef = React.useRef(null);
  const listRef  = React.useRef(null);
  const [pos, setPos] = useState({ top:0, left:0, width:300 });

  React.useEffect(() => { setQuery(value || ''); }, [value]);

  React.useEffect(() => {
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
    setQuery(q); onChangeName(q);
    clearTimeout(debRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      const list = await photonSearch(q);
      setLoading(false);
      setResults(list);
      if (list.length > 0) { measure(); setOpen(true); } else setOpen(false);
    }, 350);
  }

  function pick(item) {
    setQuery(item.name); setResults([]); setOpen(false);
    onChangeName(item.name);
    onChangeCoord && onChangeCoord({ lat: item.lat, lng: item.lng, name: item.name });
  }

  return (
    <div style={{ position:'relative' }}>
      <label style={{ display:'block', fontSize:12, color:C.text3, marginBottom:6, fontFamily:"'Sora',sans-serif" }}>{label}</label>
      <div ref={inputRef} style={{ position:'relative' }}>
        <input value={query} onChange={onInput} onFocus={() => { if(results.length){measure();setOpen(true);} }}
          placeholder="Type to search area…"
          style={{ width:'100%', boxSizing:'border-box', background:C.bg3, border:'1px solid '+C.border, borderRadius:8, padding:'10px 36px 10px 14px', color:C.text, fontFamily:"'Sora',sans-serif", fontSize:14, outline:'none' }} />
        {loading && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', width:14, height:14, border:'2px solid '+C.border, borderTopColor:C.green, borderRadius:'50%', animation:'spin .6s linear infinite' }} />}
      </div>
      {open && results.length > 0 && (
        <div ref={listRef} style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, zIndex:99999, background:C.bg3, border:'1px solid '+C.greenBorder, borderRadius:8, boxShadow:'0 12px 40px rgba(0,0,0,.8)', maxHeight:240, overflowY:'auto' }}>
          {results.map((item, i) => (
            <div key={item.place_id||i} onMouseDown={(e)=>{e.preventDefault();pick(item);}}
              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid '+C.border, fontFamily:"'Sora',sans-serif" }}
              onMouseEnter={e=>e.currentTarget.style.background=C.bg4} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, color:C.text, flex:1 }}>{item.name}</span>
                {item.type && <span style={{ fontSize:9, color:C.text3, background:C.bg4, border:'1px solid '+C.border, borderRadius:3, padding:'1px 5px' }}>{item.type}</span>}
              </div>
              {item.city && <div style={{ fontSize:10, color:C.text3, marginTop:1 }}>{item.city}</div>}
            </div>
          ))}
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
  const [mapCenter, setMapCenter] = useState(null);       // pans StopPicker when area chosen
  const [editMapCenter, setEditMapCenter] = useState(null);

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
                <AreaSearch label="📍 Pickup area" value={form.from_loc} onChangeName={v => setForm({...form, from_loc:v})} onChangeCoord={coord => { setForm(f => ({...f, from_loc: coord.name})); setMapCenter(coord); }} />
                <AreaSearch label="🏁 Drop-off area" value={form.to_loc} onChangeName={v => setForm({...form, to_loc:v})} onChangeCoord={coord => { setForm(f => ({...f, to_loc: coord.name})); setMapCenter(coord); }} />
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
              <StopPicker stops={stops} onChange={setStops} height={340} centerOn={mapCenter} />

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
                <AreaSearch label="📍 Pickup area" value={editTrip.from_loc} onChangeName={v => setEditTrip({...editTrip, from_loc:v})} onChangeCoord={coord => setEditMapCenter(coord)} />
                <AreaSearch label="🏁 Drop-off area" value={editTrip.to_loc} onChangeName={v => setEditTrip({...editTrip, to_loc:v})} onChangeCoord={coord => setEditMapCenter(coord)} />
                <Inp label="Date" type="date" value={editTrip.date?.slice(0,10)} onChange={e => setEditTrip({...editTrip, date:e.target.value})} />
                <Inp label="Pickup time" type="time" value={editTrip.pickup_time} onChange={e => setEditTrip({...editTrip, pickup_time:e.target.value})} />
                <Inp label="Drop-off time" type="time" value={editTrip.dropoff_time||''} onChange={e => setEditTrip({...editTrip, dropoff_time:e.target.value})} />
                <Inp label="Price (EGP)" type="number" value={editTrip.price} onChange={e => setEditTrip({...editTrip, price:e.target.value})} />
              </div>
              <Sel label="Assign driver" value={editTrip.driver_id} onChange={e => setEditTrip({...editTrip, driver_id:e.target.value})}>
                {driverUsers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.plate}</option>)}
              </Sel>
              <p style={{ ...sectSt, marginTop:16 }}>🗺️ Edit stops on map</p>
              <StopPicker stops={editStops} onChange={setEditStops} height={300} centerOn={editMapCenter} />
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
