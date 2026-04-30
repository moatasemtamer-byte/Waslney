import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App.jsx';
import * as api from '../../api.js';
import { C, WaslneyLogo, Badge, DetailRow, CapBar, Stars, btnPrimary, btnSm, btnDanger, card, fmtDate, Spinner, sectSt, Avatar } from '../../components/UI.jsx';
import TripMap, { ProximityMap } from '../../components/TripMap.jsx';
import socket, { connectSocket, watchTrip, joinPoolChat, sendPoolChatMessage } from '../../socket.js';

const SEARCH_RADIUS_M = 10000;

function haversineDistance(lat1,lng1,lat2,lng2){const R=6371000;const a=Math.sin((lat2-lat1)*Math.PI/360)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin((lng2-lng1)*Math.PI/360)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function estimateWalkTime(m){const min=Math.round(m/80);return min<1?'< 1 min walk':'~'+min+' min walk';}
function formatDist(m){return m<1000?Math.round(m)+'m':(m/1000).toFixed(1)+'km';}

async function photonSearch(q){
  if(!q||q.trim().length<2)return[];
  try{const r=await fetch('https://photon.komoot.io/api/?q='+encodeURIComponent(q)+'&limit=7&lang=en&bbox=24.6,22.0,36.9,31.7');const data=await r.json();if(!data.features?.length)return[];return data.features.map(f=>({place_id:f.properties.osm_id,lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],name:[f.properties.name,f.properties.street,f.properties.district||f.properties.suburb,f.properties.city||f.properties.county].filter(Boolean).slice(0,3).join(', '),type:f.properties.type||'',city:f.properties.city||f.properties.county||''}));}catch{return[];}
}
async function reverseGeocode(lat,lng){
  try{
    const token=localStorage.getItem('shuttle_token');
    const r=await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok)return null;
    const data=await r.json();
    return data.name||data.display_name||null;
  }catch{return null;}
}

function PlaceSearch({placeholder,icon,value,onChange}){
  const[query,setQuery]=useState(value?.name||'');
  const[results,setResults]=useState([]);
  const[open,setOpen]=useState(false);
  const[loading,setLoading]=useState(false);
  const debRef=useRef(null),inputRef=useRef(null),listRef=useRef(null);
  const[pos,setPos]=useState({top:0,left:0,width:300});
  useEffect(()=>{if(!value)setQuery('');},[value]);
  useEffect(()=>{const close=e=>{if(inputRef.current&&!inputRef.current.contains(e.target)&&listRef.current&&!listRef.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[]);
  function measure(){if(!inputRef.current)return;const r=inputRef.current.getBoundingClientRect();setPos({top:r.bottom+window.scrollY+4,left:r.left+window.scrollX,width:r.width});}
  function onInput(e){const q=e.target.value;setQuery(q);onChange(null);clearTimeout(debRef.current);if(q.length<2){setResults([]);setOpen(false);return;}debRef.current=setTimeout(async()=>{setLoading(true);const list=await photonSearch(q);setLoading(false);setResults(list);if(list.length){measure();setOpen(true);}else setOpen(false);},350);}
  function pick(item){setQuery(item.name);setResults([]);setOpen(false);onChange({lat:item.lat,lng:item.lng,name:item.name});}
  return(
    <div style={{position:'relative',flex:1}}>
      <div ref={inputRef} style={{position:'relative'}}>
        <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:16}}>{icon}</span>
        <input value={query} onChange={onInput} onFocus={()=>{if(results.length){measure();setOpen(true);}}}
          placeholder={placeholder}
          style={{width:'100%',boxSizing:'border-box',background:C.bg3,border:`1px solid ${value?'#fbbf24':C.border}`,borderRadius:12,padding:'14px 40px 14px 42px',color:C.text,fontFamily:"'Sora',sans-serif",fontSize:15,outline:'none'}}/>
        {loading&&<div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',width:14,height:14,border:'2px solid #333',borderTopColor:'#fbbf24',borderRadius:'50%',animation:'spin .6s linear infinite'}}/>}
        {!loading&&value&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',color:'#fbbf24',fontSize:16}}>✓</span>}
      </div>
      {open&&results.length>0&&(
        <div ref={listRef} style={{position:'fixed',top:pos.top,left:pos.left,width:pos.width,zIndex:99999,background:'#1a1a1a',border:'1px solid #fbbf2444',borderRadius:12,boxShadow:'0 12px 40px rgba(0,0,0,.9)',maxHeight:260,overflowY:'auto'}}>
          {results.map((item,i)=>(
            <div key={item.place_id||i} onMouseDown={e=>{e.preventDefault();pick(item);}}
              style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid #222'}}
              onMouseEnter={e=>e.currentTarget.style.background='#222'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{fontSize:14,color:'#fff'}}>{item.name}</div>
              {item.city&&<div style={{fontSize:11,color:'#555',marginTop:2}}>{item.city}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmartPoolBanner({onClick}){
  return(
    <div onClick={onClick} style={{background:'linear-gradient(135deg,#0c1a35 0%,#0f2347 50%,#0c1a35 100%)',border:'1px solid rgba(96,165,250,0.25)',borderRadius:16,padding:'14px 16px',marginBottom:20,cursor:'pointer',transition:'all .2s',position:'relative',overflow:'hidden'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(96,165,250,0.5)';e.currentTarget.style.transform='translateY(-1px)';}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(96,165,250,0.25)';e.currentTarget.style.transform='none';}}>
      <div style={{position:'absolute',top:-20,right:-20,width:80,height:80,borderRadius:'50%',background:'rgba(59,130,246,0.08)',filter:'blur(20px)',pointerEvents:'none'}}/>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,boxShadow:'0 4px 12px rgba(59,130,246,0.3)'}}>🚀</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
            <span style={{fontSize:13,fontWeight:800,color:'#fff',fontFamily:"'Sora',sans-serif"}}>Smart Pool</span>
            <span style={{fontSize:9,fontWeight:700,color:'#3b82f6',background:'rgba(59,130,246,0.15)',padding:'2px 6px',borderRadius:20,textTransform:'uppercase',letterSpacing:'.06em'}}>NEW</span>
          </div>
          <div style={{fontSize:12,color:'#60a5fa',fontFamily:"'Sora',sans-serif",whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Want to go at a certain time? Use Smart Pool</div>
          <div style={{fontSize:11,color:'rgba(148,163,184,0.7)',marginTop:1}}>Share your ride with others going your way</div>
        </div>
        <div style={{color:'#3b82f6',fontSize:18,flexShrink:0}}>›</div>
      </div>
    </div>
  );
}

function NoTripsPoolCard({destName,onClick}){
  return(
    <div style={{background:'linear-gradient(160deg,#0c1a35,#0f2347 60%,#091524)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:20,padding:'28px 20px',textAlign:'center',marginTop:8}}>
      <div style={{fontSize:44,marginBottom:14}}>😕</div>
      <div style={{fontSize:18,fontWeight:800,color:'#fff',marginBottom:6,fontFamily:"'Sora',sans-serif"}}>No trips available</div>
      <div style={{fontSize:13,color:'#60a5fa',lineHeight:1.65,marginBottom:24,fontFamily:"'Sora',sans-serif"}}>
        Want to go at a certain time?{' '}
        <span style={{color:'#93c5fd',fontWeight:700}}>Use Smart Pool</span>
        {' '}to create a shared ride{destName?` to ${destName}`:''} with others going your way
      </div>
      <button onClick={onClick}
        style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',color:'#fff',border:'none',borderRadius:14,padding:'15px 32px',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",width:'100%',boxShadow:'0 6px 20px rgba(59,130,246,0.35)',transition:'all .2s'}}
        onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'}
        onMouseLeave={e=>e.currentTarget.style.transform='none'}>
        🚀 Start Smart Pool
      </button>
    </div>
  );
}

function PoolUpsell({onClick}){
  return(
    <div onClick={onClick} style={{background:'rgba(29,78,216,0.08)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:14,padding:'12px 16px',marginTop:8,marginBottom:4,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
      onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(96,165,250,0.35)'}
      onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(96,165,250,0.15)'}>
      <span style={{fontSize:17}}>💸</span>
      <div style={{flex:1}}>
        <span style={{fontSize:12,color:'#60a5fa',fontFamily:"'Sora',sans-serif",fontWeight:600}}>Want to go at a certain time? Use Smart Pool</span>
      </div>
      <span style={{color:'#3b82f6',fontSize:14}}>›</span>
    </div>
  );
}

function BottomNav({active,onSet,bookingCount,isAdmin,pendingCount}){
  const tabs=isAdmin
    ?[{id:'review',icon:'📋',label:'Review',badge:pendingCount},{id:'account',icon:'👤',label:'Account'}]
    :[{id:'home',icon:'🏠',label:'Home'},{id:'activity',icon:'📋',label:'Activity',badge:bookingCount},{id:'account',icon:'👤',label:'Account'}];
  return(
    <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#000',borderTop:'1px solid #1a1a1a',display:'flex',zIndex:200,paddingBottom:'env(safe-area-inset-bottom)'}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>onSet(t.id)}
          style={{flex:1,background:'transparent',border:'none',cursor:'pointer',padding:'12px 0 10px',display:'flex',flexDirection:'column',alignItems:'center',gap:4,position:'relative'}}>
          <span style={{fontSize:22}}>{t.icon}</span>
          <span style={{fontSize:10,color:active===t.id?'#fbbf24':'#555',fontFamily:"'Sora',sans-serif",fontWeight:active===t.id?700:400}}>{t.label}</span>
          {t.badge>0&&<span style={{position:'absolute',top:8,right:'calc(50% - 18px)',background:'#fbbf24',color:'#000',borderRadius:'50%',fontSize:9,width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>{t.badge}</span>}
          {active===t.id&&<div style={{position:'absolute',bottom:0,left:'25%',right:'25%',height:2,background:'#fbbf24',borderRadius:2}}/>}
        </button>
      ))}
    </div>
  );
}

// ── Trip Detail Bottom Sheet ──
function TripDetailSheet({ booking, poolRequest, userLocation, onOpenChat, onClose, onCancel }) {
  if (!booking && !poolRequest) return null;

  const isPool = !booking && !!poolRequest;
  const isSearchingDriver = poolRequest && poolRequest.pool_group_id && !poolRequest.group_trip_id;
  const isWaitingMatch = poolRequest && !poolRequest.pool_group_id && poolRequest.status === 'pending';
  const isPoolConfirmed = poolRequest && poolRequest.group_trip_id && poolRequest.group_status === 'confirmed';
  const isLive = booking?.trip_status === 'active' || booking?.checkin_status === 'picked';
  const isUpcoming = !isLive;
  const hasChatAvailable = (booking?.is_pool === 1 && booking?.trip_id) || isPoolConfirmed;
  const chatTripId = isPoolConfirmed ? poolRequest.group_trip_id : booking?.trip_id;

  const from = booking ? booking.from_loc : (poolRequest?.origin_label || 'Pickup');
  const to = booking ? booking.to_loc : (poolRequest?.dest_label || 'Destination');
  const stops = booking?.stops || [];
  const pickupStop = stops.find(s => s.type === 'pickup');
  const dropoffStop = stops.find(s => s.type === 'dropoff');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />

      {/* Sheet */}
      <div style={{
        position: 'relative',
        background: '#0a0a0a',
        borderRadius: '24px 24px 0 0',
        maxHeight: '90vh',
        overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.08)',
        animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2a2a2a' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {/* Status icon */}
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: isLive
                ? 'linear-gradient(135deg,#14532d,#16a34a)'
                : isSearchingDriver ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)'
                : isWaitingMatch ? 'linear-gradient(135deg,#581c87,#7c3aed)'
                : 'linear-gradient(135deg,#0c1a35,#1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              boxShadow: isLive ? '0 4px 16px rgba(74,222,128,0.3)' : '0 4px 16px rgba(59,130,246,0.2)',
            }}>
              {isLive ? '🟢' : isSearchingDriver ? '🚗' : isWaitingMatch ? '🔄' : '⏳'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20,
                  background: isLive ? 'rgba(74,222,128,0.15)' : isSearchingDriver ? 'rgba(59,130,246,0.15)' : isWaitingMatch ? 'rgba(124,58,237,0.2)' : 'rgba(96,165,250,0.12)',
                  color: isLive ? '#4ade80' : isSearchingDriver ? '#60a5fa' : isWaitingMatch ? '#c084fc' : '#60a5fa',
                  textTransform: 'uppercase', letterSpacing: '.07em',
                }}>
                  {isLive ? '● LIVE' : isSearchingDriver ? '🚗 Searching Driver' : isWaitingMatch ? '🔄 Finding Match' : '⏳ UPCOMING'}
                </span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: "'Sora',sans-serif", lineHeight: 1.2 }}>
                {from} → {to}
              </div>
              {booking && (
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                  {booking.date} · {booking.pickup_time} ·{' '}
                  {booking.batch_status === 'assigned' && booking.batch_driver_name
                    ? <span style={{color:'#4ade80',fontWeight:700}}>✅ {booking.batch_driver_name}</span>
                    : booking.batch_status === 'tendered'
                    ? <span style={{color:'#60a5fa',fontWeight:700}}>🏷 Being arranged</span>
                    : booking.batch_status === 'pending'
                    ? <span style={{color:'#fbbf24',fontWeight:700}}>⏳ Pending vehicle</span>
                    : booking.driver_name}
                </div>
              )}
              {poolRequest && (
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                  {poolRequest.desired_date} · {poolRequest.desired_time}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#666', fontSize: 18, cursor: 'pointer', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── WAITING FOR MATCH state ── */}
          {isWaitingMatch && (
            <div style={{ background: 'linear-gradient(135deg,#1a0533,#2d0d5e)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 16, padding: '20px', textAlign: 'center' }}>
              <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(124,58,237,0.2)', animation: 'poolGlow 2s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2px solid rgba(124,58,237,0.35)', animation: 'poolGlow 2s ease-in-out infinite', animationDelay: '0.4s' }} />
                <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', border: '2px solid rgba(124,58,237,0.5)', animation: 'poolGlow 2s ease-in-out infinite', animationDelay: '0.8s' }} />
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#581c87,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, animation: 'poolPulse 1.8s ease-in-out infinite', boxShadow: '0 0 24px rgba(124,58,237,0.5)' }}>🔄</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#c084fc', marginBottom: 6, fontFamily: "'Sora',sans-serif" }}>Looking for riders near you</div>
              <div style={{ fontSize: 12, color: 'rgba(192,132,252,0.7)', lineHeight: 1.6 }}>
                We're matching you with passengers going the same way.<br />You'll get notified when someone joins.
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['📍 Within 15km', '⏰ ±15 min', '🏁 Same direction'].map(t => (
                  <span key={t} style={{ fontSize: 11, color: '#7c3aed', background: 'rgba(124,58,237,0.15)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(124,58,237,0.2)' }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── SEARCHING FOR DRIVER state ── */}
          {isSearchingDriver && (
            <div style={{ background: 'linear-gradient(135deg,#0a1628,#0f2347)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 16, padding: '20px', textAlign: 'center' }}>
              <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.15)', animation: 'poolGlow 1.8s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.25)', animation: 'poolGlow 1.8s ease-in-out infinite', animationDelay: '0.3s' }} />
                <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.4)', animation: 'poolGlow 1.8s ease-in-out infinite', animationDelay: '0.6s' }} />
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, animation: 'poolPulse 1.4s ease-in-out infinite', boxShadow: '0 0 24px rgba(59,130,246,0.5)' }}>🚗</div>
                {/* Scan line */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(96,165,250,0.8),transparent)', animation: 'poolScan 1.6s linear infinite' }} />
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#60a5fa', marginBottom: 6, fontFamily: "'Sora',sans-serif" }}>Waiting for a driver to accept</div>
              <div style={{ fontSize: 12, color: 'rgba(96,165,250,0.7)', lineHeight: 1.6 }}>
                Your group is ready. Nearby drivers are being notified.<br />Hang tight — you'll get a confirmation shortly!
              </div>
              {poolRequest?.group_size > 0 && (
                <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,0.12)', padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(59,130,246,0.2)' }}>
                  <span style={{ fontSize: 13 }}>👥</span>
                  <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>{poolRequest.group_size} passenger{poolRequest.group_size !== 1 ? 's' : ''} in group</span>
                </div>
              )}
            </div>
          )}

          {/* ── MAP (for confirmed bookings and active pool) ── */}
          {(booking && stops.length > 0) && (
            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <TripMap
                tripId={booking.trip_id}
                stops={stops}
                pickupLat={pickupStop?.lat}
                pickupLng={pickupStop?.lng}
                dropoffLat={dropoffStop?.lat}
                dropoffLng={dropoffStop?.lng}
                passengerLat={userLocation?.lat}
                passengerLng={userLocation?.lng}
                driverName={booking.driver_name}
                checkinStatus={booking.checkin_status}
                height={220}
              />
            </div>
          )}

          {/* ── LIVE status indicator ── */}
          {isLive && booking && (
            <div style={{ background: 'linear-gradient(135deg,#052e16,#064e24)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80', animation: 'activePulse 1.5s infinite', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
                  {booking.checkin_status === 'picked' ? '✅ You\'ve been picked up!' : '🟢 Your driver is on the way'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(74,222,128,0.6)', marginTop: 2 }}>
                  {booking.checkin_status === 'picked' ? 'Enjoy your ride!' : 'Track your driver on the map above'}
                </div>
              </div>
            </div>
          )}

          {/* ── Trip Details card ── */}
          {booking && (
            <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#555', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>Trip Details</div>
              {[
                { label: 'Driver', val: booking.driver_name, icon: '🧑‍✈️' },
                { label: 'Car', val: booking.driver_car, icon: '🚗' },
                { label: 'Plate', val: booking.driver_plate, icon: '🪪' },
                { label: 'Pickup time', val: booking.pickup_time, icon: '🕐', accent: '#fbbf24' },
                { label: 'Seats', val: booking.seats, icon: '💺' },
                { label: 'Total', val: `${booking.seats * (booking.pool_price || booking.price)} EGP`, icon: '💰', accent: '#fbbf24' },
              ].filter(r => r.val).map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none', gap: 10 }}>
                  <span style={{ fontSize: 14, width: 20 }}>{row.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: '#555' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: row.accent || '#fff' }}>{row.val}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Pool request details ── */}
          {poolRequest && (
            <div style={{ background: '#111', border: '1px solid rgba(96,165,250,0.1)', borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#4b7ab5', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>Pool Details</div>
              {[
                { label: 'From', val: poolRequest.origin_label, icon: '📍' },
                { label: 'To', val: poolRequest.dest_label, icon: '🏁' },
                { label: 'Date', val: poolRequest.desired_date, icon: '📅' },
                { label: 'Time', val: poolRequest.desired_time, icon: '🕐', accent: '#60a5fa' },
                { label: 'Seats', val: poolRequest.seats, icon: '💺' },
                { label: 'Group size', val: poolRequest.group_size > 0 ? `${poolRequest.group_size} passenger${poolRequest.group_size !== 1 ? 's' : ''}` : 'Just you so far', icon: '👥' },
              ].filter(r => r.val).map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none', gap: 10 }}>
                  <span style={{ fontSize: 14, width: 20 }}>{row.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: '#555' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: row.accent || '#fff' }}>{row.val}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Action buttons ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {hasChatAvailable && chatTripId && (
              <button
                onClick={() => { onClose(); onOpenChat(chatTripId); }}
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', border: 'none', borderRadius: 14, padding: '15px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif", boxShadow: '0 4px 16px rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                💬 Open Group Chat
              </button>
            )}
            {booking && booking.status === 'confirmed' && (
              <button
                onClick={() => { onCancel(booking.id); onClose(); }}
                style={{ background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 14, padding: '14px', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora',sans-serif" }}>
                Cancel Booking
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Active Trip Banner (appears on every page when there's an active/upcoming trip) ──
function ActiveTripBanner({ bookings, poolRequests, onOpenChat, onOpenDetail }) {
  // Priority: active live trip > upcoming confirmed > searching driver > waiting for match
  const liveBooking = bookings.find(b => b.status === 'confirmed' && b.trip_status === 'active');
  const upcomingBooking = bookings.find(b => b.status === 'confirmed' && b.trip_status === 'upcoming');
  const activeBooking = liveBooking || upcomingBooking;
  const confirmedPool = poolRequests.find(r => r.group_trip_id && r.group_status === 'confirmed');
  const searchingDriverPool = poolRequests.find(r => r.pool_group_id && !r.group_trip_id && r.status === 'pending');
  const waitingMatchPool = poolRequests.find(r => !r.pool_group_id && r.status === 'pending');

  const activePool = confirmedPool || searchingDriverPool || waitingMatchPool;

  if (!activeBooking && !activePool) return null;

  const isLive = !!liveBooking;
  const isSearchingDriver = !activeBooking && !!searchingDriverPool && !confirmedPool;
  const isWaitingMatch = !activeBooking && !confirmedPool && !searchingDriverPool && !!waitingMatchPool;
  const isPoolConfirmed = !activeBooking && !!confirmedPool;

  let statusColor, statusLabel, statusTag, bgGradient, borderColor;
  if (isLive) {
    statusColor = '#4ade80'; statusLabel = '🟢 ACTIVE TRIP'; statusTag = 'LIVE';
    bgGradient = 'linear-gradient(90deg,#052e16,#064e24)';
    borderColor = 'rgba(74,222,128,0.3)';
  } else if (isSearchingDriver) {
    statusColor = '#60a5fa'; statusLabel = '🚗 Searching for driver…'; statusTag = 'POOL';
    bgGradient = 'linear-gradient(90deg,#0a1628,#0d1d3d)';
    borderColor = 'rgba(59,130,246,0.3)';
  } else if (isWaitingMatch) {
    statusColor = '#c084fc'; statusLabel = '🔄 Finding match near you…'; statusTag = 'POOL';
    bgGradient = 'linear-gradient(90deg,#1a0533,#1e0a45)';
    borderColor = 'rgba(124,58,237,0.3)';
  } else if (isPoolConfirmed) {
    statusColor = '#60a5fa'; statusLabel = '👥 Pool Group Active'; statusTag = 'POOL';
    bgGradient = 'linear-gradient(90deg,#0a1628,#0f2347)';
    borderColor = 'rgba(96,165,250,0.2)';
  } else {
    statusColor = '#60a5fa'; statusLabel = '⏳ Upcoming Trip'; statusTag = 'SOON';
    bgGradient = 'linear-gradient(90deg,#0a1628,#0f2347)';
    borderColor = 'rgba(96,165,250,0.2)';
  }

  const routeLabel = activeBooking
    ? `${activeBooking.from_loc} → ${activeBooking.to_loc}`
    : activePool
    ? `${activePool.origin_label || 'Pickup'} → ${activePool.dest_label || 'Destination'}`
    : '';

  const handleClick = () => onOpenDetail(activeBooking, activePool);

  return (
    <div
      onClick={handleClick}
      style={{
        background: bgGradient,
        borderBottom: `1px solid ${borderColor}`,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'sticky',
        top: 57,
        zIndex: 90,
        cursor: 'pointer',
        transition: 'opacity 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      {/* Pulsing dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: statusColor,
          animation: 'activePulse 1.5s infinite',
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: statusColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {statusLabel}
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {routeLabel}
        </div>
      </div>

      {/* Chat quick-action (pool only) */}
      {(isPoolConfirmed) && confirmedPool && (
        <button
          onClick={e => { e.stopPropagation(); onOpenChat(confirmedPool.group_trip_id); }}
          style={{ background: 'rgba(29,78,216,0.25)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8, padding: '5px 10px', color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif", whiteSpace: 'nowrap', flexShrink: 0 }}>
          💬 Chat
        </button>
      )}

      {/* Status tag + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          background: isLive ? 'rgba(74,222,128,0.15)' : isWaitingMatch ? 'rgba(124,58,237,0.2)' : 'rgba(96,165,250,0.15)',
          color: statusColor,
        }}>
          {statusTag}
        </div>
        <span style={{ color: '#333', fontSize: 14 }}>›</span>
      </div>
    </div>
  );
}

// ── Fare Accept/Refuse Modal ──
function FareResponseModal({ fareOffer, onAccept, onRefuse, onClose }) {
  if (!fareOffer) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 600, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ background: '#0d1117', borderRadius: '24px 24px 0 0', padding: '28px 20px 44px', border: '1px solid rgba(251,191,36,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: "'Sora',sans-serif", marginBottom: 6 }}>
            Driver set the fare
          </div>
          <div style={{ fontSize: 13, color: '#4b7ab5', lineHeight: 1.6 }}>
            Your driver has confirmed the fare for your pool trip. Accept to stay in the group, or refuse to leave.
          </div>
        </div>

        {/* Fare display */}
        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 16, padding: '18px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Fare per seat</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: '#fbbf24', fontFamily: "'Sora',sans-serif" }}>
            {fareOffer.fare_per_passenger} <span style={{ fontSize: 16, fontWeight: 400 }}>EGP</span>
          </div>
          <div style={{ fontSize: 12, color: '#a16207', marginTop: 6 }}>
            {fareOffer.from_loc} → {fareOffer.to_loc}
          </div>
        </div>

        {/* Route info */}
        <div style={{ background: 'rgba(30,58,95,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 24, border: '1px solid rgba(96,165,250,0.1)' }}>
          <div style={{ fontSize: 12, color: '#60a5fa', lineHeight: 1.6 }}>
            ✅ Accept → stay in the group & continue with the trip<br />
            ❌ Refuse → leave the group, booking cancelled
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onRefuse}
            style={{ flex: 1, background: 'transparent', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 14, padding: '15px', color: '#f87171', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif" }}>
            ✕ Refuse & Leave
          </button>
          <button
            onClick={onAccept}
            style={{ flex: 2, background: 'linear-gradient(135deg,#14532d,#16a34a)', border: 'none', borderRadius: 14, padding: '15px', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif", boxShadow: '0 4px 16px rgba(74,222,128,0.3)' }}>
            ✅ Accept — {fareOffer.fare_per_passenger} EGP
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
export default function PassengerDash(){
  const{user,logout,notify}=useAuth();
  const isAdmin = user.role === 'admin';
  const[tab,setTab]=useState(()=>{const h=window.location.hash.replace('#','');
    const valid=isAdmin?['review','account']:['home','activity','account'];
    return valid.includes(h)?h:isAdmin?'review':'home';
  });
  // ── Admin review state ───────────────────────────────────
  const[pendingDrivers,setPendingDrivers]=useState([]);
  const[reviewLoading,setReviewLoading]=useState(false);
  const[expandedDriver,setExpandedDriver]=useState(null);
  const[rejectNote,setRejectNote]=useState('');
  const[rejectTarget,setRejectTarget]=useState(null);
  const[selTrip,setSelTrip]=useState(null);
  const[selPickup,setSelPickup]=useState(null);
  const[selDropoff,setSelDropoff]=useState(null);
  const[selBooking,setSelBooking]=useState(null);
  const[travelDate,setTravelDate]=useState(''); // selected travel date for booking
  const[weekSchedule,setWeekSchedule]=useState(null); // schedule for selected trip

  // Search
  const[fromCoord,setFromCoord]=useState(null);
  const[toCoord,setToCoord]=useState(null);
  const[userLocation,setUserLocation]=useState(null);
  const[locationLabel,setLocationLabel]=useState('Detecting location…');
  const[matchedTrips,setMatchedTrips]=useState([]);
  const[searching,setSearching]=useState(false);
  const[searched,setSearched]=useState(false);

  // Smart Pool modal
  const[showPool,setShowPool]=useState(false);
  const[poolDate,setPoolDate]=useState('');
  const[poolTime,setPoolTime]=useState('');
  const[poolSeats,setPoolSeats]=useState(1);
  const[poolSubmitting,setPoolSubmitting]=useState(false);
  const[poolWaiting,setPoolWaiting]=useState(false);
  const[poolResult,setPoolResult]=useState(null);
  const[myPoolRequests,setMyPoolRequests]=useState([]);
  const[activePoolGroup,setActivePoolGroup]=useState(null);

  // Pool chat — only opened explicitly by user action, never auto-opened
  const[poolChat,setPoolChat]=useState(null);
  const[poolChatStops,setPoolChatStops]=useState([]);
  const[chatInput,setChatInput]=useState('');
  const[sendingChat,setSendingChat]=useState(false);
  const chatEndRef=useRef(null);
  const poolChatRef=useRef(null);

  // Fare offer from driver
  const[fareOffer,setFareOffer]=useState(null); // {fare_per_passenger, from_loc, to_loc, tripId, bookingId}

  // Bookings
  const[myBookings,setMyBookings]=useState([]);
  const[loadingB,setLoadingB]=useState(false);
  const[seats,setSeats]=useState(1);
  const[booking,setBooking]=useState(false);

  // Rating
  const[rateTrip,setRateTrip]=useState(null);
  const[ratingStars,setRatingStars]=useState(0);
  const[rateComment,setRateComment]=useState('');

  // Trip detail sheet
  const[tripDetailOpen,setTripDetailOpen]=useState(false);
  const[tripDetailBooking,setTripDetailBooking]=useState(null);
  const[tripDetailPool,setTripDetailPool]=useState(null);

  // Notifications
  const[notifs,setNotifs]=useState([]);
  const[notifOpen,setNotifOpen]=useState(false);
  const unread=notifs.filter(n=>!n.is_read).length;

  const activeBookings=(Array.isArray(myBookings)?myBookings:[]).filter(b=>b.status==='confirmed');
  const historyBookings=(Array.isArray(myBookings)?myBookings:[]).filter(b=>b.status==='completed'||b.status==='cancelled');
  const changeTab=(t)=>{setTab(t);setSelTrip(null);setSelBooking(null);window.location.hash=t;};

  // Load pending drivers when admin opens review tab (or on mount)
  useEffect(()=>{ if(isAdmin && tab==='review') loadPendingDrivers(); },[tab]);

  useEffect(()=>{
    loadNotifs();
    if(isAdmin) return; // skip all passenger socket/data for admin
    requestLocation();
    connectSocket(user.id,'passenger');
    socket.on('checkin:update',({bookingId,status})=>{
      setMyBookings(prev=>prev.map(b=>b.id===bookingId?{...b,checkin_status:status}:b));
      setSelBooking(prev=>prev?.id===bookingId?{...prev,checkin_status:status}:prev);
    });
    // Pool confirmed — do NOT auto-open chat, just refresh data
    socket.on('pool:confirmed',({tripId})=>{
      loadMyPoolRequests();
      loadBookings();
      // Show notification instead of forcing chat open
      notify('Pool trip confirmed!','Your pool group has a driver. Open chat from Activity tab.','success');
    });
    // Fare offer from driver
    socket.on('fare:offer',({tripId, bookingId, fare_per_passenger, from_loc, to_loc})=>{
      setFareOffer(prev => prev ? prev : { tripId, bookingId, fare_per_passenger, from_loc, to_loc });
    });
    // Trip started by driver — update booking trip_status instantly, no refresh needed
    socket.on('trip:started', ({ tripId }) => {
      setMyBookings(prev => prev.map(b =>
        b.trip_id === tripId ? { ...b, trip_status: 'active' } : b
      ));
      setSelBooking(prev => prev?.trip_id === tripId ? { ...prev, trip_status: 'active' } : prev);
      notify('🚐 Trip started!', 'Your driver is on the way.', 'success');
    });
    // Trip completed by driver — update booking status instantly, then reload for rating prompt
    socket.on('trip:completed', ({ tripId }) => {
      setMyBookings(prev => prev.map(b =>
        b.trip_id === tripId ? { ...b, trip_status: 'completed', status: 'completed' } : b
      ));
      setSelBooking(prev => prev?.trip_id === tripId ? { ...prev, trip_status: 'completed', status: 'completed' } : prev);
      notify('🏁 Trip completed!', 'Please rate your driver.', 'info');
      loadBookings();
    });
    // Real-time chat — append incoming messages instantly without re-fetching
    socket.on('pool:chat:message', (msg) => {
      setPoolChat(prev => {
        if (!prev || prev.tripId !== msg.trip_id) return prev;
        // Avoid duplicates (in case server echoes back our own send)
        const alreadyExists = prev.messages.some(
          m => m.created_at === msg.created_at && m.user_id === msg.user_id && m.message === msg.message
        );
        if (alreadyExists) return prev;
        const updated = { ...prev, messages: [...prev.messages, msg] };
        poolChatRef.current = updated;
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        return updated;
      });
    });
    return()=>{
      socket.off('checkin:update');
      socket.off('pool:confirmed');
      socket.off('fare:offer');
      socket.off('pool:chat:message');
      socket.off('trip:started');
      socket.off('trip:completed');
    };
  },[user.id]);

  useEffect(()=>{myBookings.forEach(b=>{if(b.trip_id)watchTrip(b.trip_id);});},[myBookings.length]);

  // Tab-specific refresh
  useEffect(()=>{
    if(tab==='activity'){loadBookings();loadMyPoolRequests();}
  },[tab]);

  // Always-running fare offer polling — independent of active tab
  useEffect(()=>{
    async function checkFare(){
      try{
        const reqs=await api.getMyPoolRequests();
        setMyPoolRequests(reqs);
        const withFare=reqs.find(r=>r.fare_per_passenger&&!r.fare_responded);
        if(withFare){
          setFareOffer(prev=>prev?prev:{
            tripId: withFare.group_trip_id,
            bookingId: withFare.booking_id,
            fare_per_passenger: withFare.fare_per_passenger,
            from_loc: withFare.fare_from_loc||withFare.origin_label,
            to_loc:   withFare.fare_to_loc||withFare.dest_label,
          });
        }
      }catch{}
    }
    checkFare();
    const interval=setInterval(checkFare,8000);
    return()=>clearInterval(interval);
  },[]);

  useEffect(()=>{if(tab==='home'){loadActivePoolGroup();loadBookings();}},[tab]);

  async function loadPendingDrivers(){
    setReviewLoading(true);
    try{ const d=await api.getPendingDrivers(); setPendingDrivers(d.drivers||[]); }
    catch(e){ notify('Error','Could not load pending drivers','error'); }
    finally{ setReviewLoading(false); }
  }

  async function handleApprove(id){
    try{
      await api.approveDriver(id);
      notify('Approved','Driver account activated ✅');
      setPendingDrivers(p=>p.filter(d=>d.id!==id));
      setExpandedDriver(null);
    }catch(e){ notify('Error',e.message,'error'); }
  }

  async function handleReject(id){
    try{
      await api.rejectDriver(id, rejectNote);
      notify('Rejected','Driver account rejected ❌');
      setPendingDrivers(p=>p.filter(d=>d.id!==id));
      setRejectTarget(null); setRejectNote(''); setExpandedDriver(null);
    }catch(e){ notify('Error',e.message,'error'); }
  }

  async function loadNotifs(){try{const r=await api.getNotifications();setNotifs(Array.isArray(r)?r:[]);}catch{}}
  async function openNotifs(){setNotifOpen(true);try{await api.markNotifRead();setNotifs(n=>n.map(x=>({...x,is_read:1})));}catch{}}

  function requestLocation(){
    if(!navigator.geolocation){setLocationLabel('GPS not available');return;}
    navigator.geolocation.getCurrentPosition(async pos=>{
      const loc={lat:pos.coords.latitude,lng:pos.coords.longitude};
      setUserLocation(loc);
      const name=await reverseGeocode(loc.lat,loc.lng);
      setLocationLabel('📍 '+(name||'Your location'));
      setFromCoord(prev=>prev||{...loc,name:name||'My location'});
    },()=>setLocationLabel('Enable GPS for better results'),{enableHighAccuracy:true,timeout:10000});
  }

  async function loadBookings(){
    if(myBookings.length===0)setLoadingB(true);
    try{
      const bks=await api.getMyBookings();
      const enriched=await Promise.all(bks.map(async b=>{
        const existing=myBookings.find(x=>x.id===b.id);
        if(existing?.stops?.length)return{...b,stops:existing.stops};
        try{const d=await api.getTrip(b.trip_id);return{...b,stops:d.stops||[]};}
        catch{return{...b,stops:[]};}
      }));
      setMyBookings(enriched);
      const savedId=sessionStorage.getItem('selBookingId');
      if(savedId){const found=enriched.find(b=>String(b.id)===String(savedId));if(found)setSelBooking(found);}
    }catch{}finally{setLoadingB(false);}
  }

  async function searchTrips(){
    if(!toCoord){notify('Enter destination','Select from dropdown.','error');return;}
    const effectiveFrom=fromCoord||userLocation;
    setSearching(true);setMatchedTrips([]);setSearched(true);
    try{
      const all=await api.getTrips();
      const norm=s=>(s||'').toLowerCase().replace(/[,،\-_]/g,' ').replace(/\s+/g,' ').trim();
      const keywords=name=>norm(name).split(' ').filter(w=>w.length>=3);
      const nameContains=(hay,words)=>words.some(w=>norm(hay).includes(w));
      const fromWords=keywords(fromCoord?.name||'');
      const toWords=keywords(toCoord?.name||'');
      const enriched=[];
      for(const trip of all){
        const stops=trip.stops||[];
        const pickupStops=stops.filter(s=>s.type==='pickup');
        const dropoffStops=stops.filter(s=>s.type==='dropoff');
        let bestPickup=null,bestPickupDist=0;
        if(effectiveFrom&&pickupStops.length){let minD=Infinity;for(const ps of pickupStops){const d=haversineDistance(effectiveFrom.lat,effectiveFrom.lng,parseFloat(ps.lat),parseFloat(ps.lng));if(d<minD){minD=d;bestPickup={...ps,distFromUser:d};bestPickupDist=d;}}if(minD>SEARCH_RADIUS_M)bestPickup=null;}
        if(!bestPickup&&fromWords.length&&nameContains(trip.from_loc,fromWords)){bestPickup=pickupStops[0]||{type:'pickup',lat:trip.pickup_lat,lng:trip.pickup_lng,label:trip.from_loc};bestPickupDist=bestPickup?.lat&&effectiveFrom?haversineDistance(effectiveFrom.lat,effectiveFrom.lng,parseFloat(bestPickup.lat),parseFloat(bestPickup.lng)):0;}
        if(!bestPickup&&!effectiveFrom){bestPickup=pickupStops[0]||null;bestPickupDist=0;}
        let bestDropoff=null,bestDropoffDist=0;
        if(dropoffStops.length){let minD=Infinity;for(const ds of dropoffStops){const d=haversineDistance(toCoord.lat,toCoord.lng,parseFloat(ds.lat),parseFloat(ds.lng));if(d<minD){minD=d;bestDropoff={...ds,distFromDest:d};bestDropoffDist=d;}}if(minD>SEARCH_RADIUS_M)bestDropoff=null;}
        if(!bestDropoff&&toWords.length&&nameContains(trip.to_loc,toWords)){bestDropoff=dropoffStops[0]||{type:'dropoff',lat:trip.dropoff_lat,lng:trip.dropoff_lng,label:trip.to_loc};bestDropoffDist=bestDropoff?.lat?haversineDistance(toCoord.lat,toCoord.lng,parseFloat(bestDropoff.lat),parseFloat(bestDropoff.lng)):0;}
        if(bestPickup&&bestDropoff)enriched.push({...trip,bestPickup,bestDropoff,bestPickupDist,bestDropoffDist});
      }
      if(enriched.length){enriched.sort((a,b)=>(a.bestPickupDist||0)-(b.bestPickupDist||0));setMatchedTrips(enriched);}
      else{setMatchedTrips([]);}
    }catch(e){notify('Error',e.message,'error');}
    finally{setSearching(false);}
  }

  async function confirmBook(){
    if(!travelDate){notify('Select a day','Please select which day you want to travel.','error');return;}
    setBooking(true);
    try{
      await api.bookTrip({trip_id:selTrip.id,seats,pickup_note:fromCoord?.name||selPickup?.label||'',travel_date:travelDate});
      setSelTrip(null);setTravelDate('');setWeekSchedule(null);changeTab('activity');
      loadBookings();
      notify('Booking confirmed!',`${travelDate} · Pickup at ${selTrip.pickup_time}`);
    }catch(e){
      const msg=e.message||'';
      if(msg==='already_reserved'||msg.toLowerCase().includes('already')){
        notify('Already reserved','You have an active booking on this trip for this day.','warning');
        setSelTrip(null);setTravelDate('');setWeekSchedule(null);changeTab('activity');
        loadBookings();
      }
      else if(msg.toLowerCase().includes('seats'))notify('No seats available',msg,'error');
      else notify('Error',msg,'error');
    }finally{setBooking(false);}
  }

  async function loadWeekSchedule(tripId){
    try{
      const token=localStorage.getItem('shuttle_token');
      const r=await fetch(`/api/bookings/week-schedule?trip_id=${tripId}`,{headers:{Authorization:`Bearer ${token}`}});
      const data=await r.json();
      setWeekSchedule(data);
      // Auto-select first available day
      if(data.schedule){
        const firstAvail=data.schedule.find(d=>d.available>0);
        if(firstAvail&&!travelDate)setTravelDate(firstAvail.date);
      }
    }catch(e){console.error('schedule load',e);}
  }

  async function cancelBooking(id){try{await api.cancelBooking(id);notify('Cancelled','');loadBookings();}catch(e){notify('Error',e.message,'error');}}

  async function submitRating(){
    if(!ratingStars){notify('Pick stars','Tap a star.','error');return;}
    try{await api.submitRating({trip_id:rateTrip.trip_id,stars:ratingStars,comment:rateComment});notify('Rated!',`${ratingStars} stars`);setRateTrip(null);setRatingStars(0);setRateComment('');loadBookings();}
    catch(e){notify('Error',e.message,'error');}
  }

  // ── Fare accept/refuse ────────────────────────────────────
  async function handleFareAccept() {
    if (!fareOffer) return;
    try {
      const tripId=fareOffer.tripId;
      await api.respondToFare(tripId, 'accept');
      notify('Fare accepted!', 'You remain in the pool group.', 'success');
      setFareOffer(null);
      loadBookings();
      loadMyPoolRequests();
      await openPoolChat(tripId);
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  async function handleFareRefuse() {
    if (!fareOffer) return;
    try {
      await api.respondToFare(fareOffer.tripId, 'refuse');
      notify('You left the group', 'Your booking has been cancelled.', 'warning');
      setFareOffer(null);
      loadBookings();
      loadMyPoolRequests();
      // Close chat if open for this trip
      if (poolChat?.tripId === fareOffer.tripId) {
        setPoolChat(null);
        poolChatRef.current = null;
        setPoolChatStops([]);
      }
    } catch(e) { notify('Error', e.message, 'error'); }
  }

  // ── Smart Pool functions ───────────────────────────────────
  function openSmartPool(){
    if(!poolDate)setPoolDate(new Date().toISOString().slice(0,10));
    if(!poolTime){const d=new Date();d.setMinutes(d.getMinutes()+30);setPoolTime(d.toTimeString().slice(0,5));}
    setPoolResult(null);
    setShowPool(true);
  }

  async function submitPoolRequest(){
    if(!fromCoord||!toCoord){notify('Location needed','Set your pickup and destination first.','error');return;}
    if(!poolDate||!poolTime){notify('Set date & time','Pick your desired travel date and time.','error');return;}
    setPoolSubmitting(true);setPoolWaiting(true);setPoolResult(null);
    try{
      const[result]=await Promise.all([
        api.submitPoolRequest({origin_lat:fromCoord.lat,origin_lng:fromCoord.lng,origin_label:fromCoord.name,dest_lat:toCoord.lat,dest_lng:toCoord.lng,dest_label:toCoord.name,desired_date:poolDate,desired_time:poolTime,seats:poolSeats}),
        new Promise(r=>setTimeout(r,2500))
      ]);
      setPoolWaiting(false);setPoolResult(result);
      loadMyPoolRequests();
    }catch(e){setPoolWaiting(false);notify('Error',e.message,'error');}
    finally{setPoolSubmitting(false);}
  }

  async function loadMyPoolRequests(){try{setMyPoolRequests(await api.getMyPoolRequests());}catch{}}

  async function loadActivePoolGroup(){
    try{
      const reqs=await api.getMyPoolRequests();
      setMyPoolRequests(reqs);
      const active=reqs.find(r=>r.status==='pending'&&r.pool_group_id);
      setActivePoolGroup(active||null);
    }catch{}
  }

  // Only open chat when explicitly requested by user — never auto-open
  async function openPoolChat(tripId){
    try{
      const [messages, tripDetail] = await Promise.all([
        api.getPoolChat(tripId),
        api.getTrip(tripId).catch(()=>null)
      ]);
      const chatState={tripId,messages};
      setPoolChat(chatState);
      poolChatRef.current=chatState;
      setPoolChatStops(tripDetail?.stops||[]);
      // Join socket room for real-time messages
      joinPoolChat(tripId);
      setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:'smooth'}),100);
    }
    catch(e){notify('Error',e.message,'error');}
  }

  function sendChatMessage(){
    if(!chatInput.trim()||!poolChat)return;
    // Send via socket — server saves to DB and broadcasts to all members instantly
    sendPoolChatMessage(poolChat.tripId, chatInput.trim());
    setChatInput('');
  }

  const hasChatGroup = myPoolRequests.some(r=>r.group_trip_id&&r.group_status==='confirmed');
  const activePoolChatRequest = myPoolRequests.find(r=>r.group_trip_id&&r.group_status==='confirmed');

  return(
    <div style={{minHeight:'100vh',background:'#000',paddingBottom:80}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes poolGlow{0%,100%{opacity:.6}50%{opacity:1;}}
        @keyframes poolPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:0.85}}
        @keyframes poolScan{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes activePulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,0.6)}70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      {/* ── FARE OFFER MODAL ── */}
      <FareResponseModal
        fareOffer={fareOffer}
        onAccept={handleFareAccept}
        onRefuse={handleFareRefuse}
        onClose={() => setFareOffer(null)}
      />

      {/* ── GLOBAL POOL CHAT MODAL — only when explicitly opened ── */}
      {poolChat&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.97)',zIndex:500,display:'flex',flexDirection:'column'}}>
          <div style={{background:'#0d1117',borderBottom:'1px solid rgba(96,165,250,0.15)',padding:'16px 20px',display:'flex',alignItems:'center'}}>
            <button onClick={()=>{setPoolChat(null);poolChatRef.current=null;setPoolChatStops([]);}} style={{background:'transparent',border:'none',color:'#fff',fontSize:22,cursor:'pointer',marginRight:12}}>←</button>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>💬</div>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:'#fff',fontFamily:"'Sora',sans-serif"}}>Smart Pool Chat</div>
                <div style={{fontSize:11,color:'#4b7ab5'}}>Trip #{poolChat.tripId}</div>
              </div>
            </div>
          </div>
          {poolChatStops.length>0&&(
            <div style={{flexShrink:0,borderBottom:'1px solid rgba(96,165,250,0.1)'}}>
              <TripMap tripId={poolChat.tripId} stops={poolChatStops}
                pickupLat={poolChatStops.find(s=>s.type==='pickup')?.lat}
                pickupLng={poolChatStops.find(s=>s.type==='pickup')?.lng}
                dropoffLat={poolChatStops.find(s=>s.type==='dropoff')?.lat}
                dropoffLng={poolChatStops.find(s=>s.type==='dropoff')?.lng}
                passengerLat={userLocation?.lat} passengerLng={userLocation?.lng} height={180}/>
            </div>
          )}
          <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:10}}>
            {poolChat.messages.length===0&&<div style={{textAlign:'center',color:'#333',fontSize:13,marginTop:40}}>No messages yet. Say hi! 👋</div>}
            {poolChat.messages.map((m,i)=>{
              const isMe=m.user_id===user.id;
              const isDriver=m.sender_role==='driver';
              return(
                <div key={i} style={{display:'flex',flexDirection:'column',alignItems:isMe?'flex-end':'flex-start'}}>
                  <div style={{fontSize:11,color:isDriver?'#fbbf24':'#444',marginBottom:3,fontWeight:isDriver?700:400}}>
                    {isDriver?`🚗 ${m.sender_name} (Driver)`:m.sender_name}
                  </div>
                  <div style={{background:isMe?'linear-gradient(135deg,#1d4ed8,#3b82f6)':isDriver?'rgba(251,191,36,0.1)':'#111',color:'#fff',borderRadius:isMe?'16px 16px 4px 16px':'16px 16px 16px 4px',padding:'10px 14px',maxWidth:'75%',fontSize:13,lineHeight:1.5,border:isDriver&&!isMe?'1px solid rgba(251,191,36,0.2)':'none'}}>
                    {m.message}
                  </div>
                  <div style={{fontSize:10,color:'#333',marginTop:2}}>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                </div>
              );
            })}
            <div ref={chatEndRef}/>
          </div>
          <div style={{padding:'12px 16px 32px',background:'#0d1117',borderTop:'1px solid #1a1a1a',display:'flex',gap:8}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendChatMessage()}
              placeholder="Type a message…"
              style={{flex:1,background:'#111',border:'1px solid rgba(96,165,250,0.2)',borderRadius:12,padding:'12px 16px',color:'#fff',fontFamily:"'Sora',sans-serif",fontSize:13,outline:'none'}}/>
            <button onClick={sendChatMessage} disabled={sendingChat||!chatInput.trim()}
              style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',border:'none',borderRadius:12,padding:'12px 18px',color:'#fff',fontSize:16,cursor:'pointer'}}>
              {sendingChat?'…':'➤'}
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{background:'#000',borderBottom:'1px solid #1a1a1a',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <WaslneyLogo size={26}/>
        <button onClick={openNotifs} style={{background:'transparent',border:'none',cursor:'pointer',position:'relative',padding:4}}>
          <span style={{fontSize:22}}>🔔</span>
          {unread>0&&<span style={{position:'absolute',top:0,right:0,background:'#fbbf24',color:'#000',borderRadius:'50%',fontSize:9,width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>{unread}</span>}
        </button>
      </div>

      {/* ── ACTIVE TRIP BANNER — shown on every tab ── */}
      {!isAdmin&&<ActiveTripBanner
        bookings={myBookings}
        poolRequests={myPoolRequests}
        onOpenChat={openPoolChat}
        onOpenDetail={(bk,pr)=>{setTripDetailBooking(bk);setTripDetailPool(pr);setTripDetailOpen(true);}}
      />}
      {tripDetailOpen&&(
        <TripDetailSheet
          booking={tripDetailBooking}
          poolRequest={tripDetailPool}
          userLocation={userLocation}
          onOpenChat={openPoolChat}
          onClose={()=>setTripDetailOpen(false)}
          onCancel={cancelBooking}
        />
      )}

      {/* Notifications */}
      {notifOpen&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:300,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
          <div style={{background:'#111',borderRadius:'20px 20px 0 0',padding:'24px 20px',maxHeight:'70vh',overflowY:'auto'}}>
            <div style={{display:'flex',alignItems:'center',marginBottom:20}}>
              <span style={{fontSize:18,fontWeight:700,color:'#fff'}}>Notifications</span>
              <button onClick={()=>setNotifOpen(false)} style={{marginLeft:'auto',background:'transparent',border:'none',color:'#666',fontSize:24,cursor:'pointer'}}>✕</button>
            </div>
            {notifs.length===0&&<p style={{color:'#555',fontSize:14}}>No notifications yet.</p>}
            {notifs.map(n=>(
              <div key={n.id} style={{padding:'12px 0',borderBottom:'1px solid #1a1a1a',fontSize:14,color:n.is_read?'#555':'#fff'}}>
                {n.message}
                <div style={{fontSize:11,color:'#444',marginTop:4}}>{fmtDate(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{maxWidth:640,margin:'0 auto',padding:'0 16px'}}>

        {/* ── HOME TAB ── */}
        {tab==='home'&&!selTrip&&(
          <div style={{paddingTop:24}}>
            <div style={{marginBottom:24}}>
              <h2 style={{fontSize:26,fontWeight:800,color:'#fff',marginBottom:4}}>Good day, {user.name.split(' ')[0]} 👋</h2>
              <p style={{fontSize:13,color:'#555'}}>{locationLabel}</p>
            </div>

            {/* Search bar */}
            <div style={{background:'#111',borderRadius:20,padding:'16px',marginBottom:0,border:'1px solid #1a1a1a'}}>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,paddingLeft:4}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:'#fbbf24',border:'2px solid #000',boxShadow:'0 0 0 2px #fbbf24'}}/>
                    <div style={{width:1,height:20,background:'#333'}}/>
                    <div style={{width:10,height:10,borderRadius:3,background:'#60a5fa'}}/>
                  </div>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:8}}>
                    <PlaceSearch icon="📍" placeholder="Your location / pickup area" value={fromCoord} onChange={setFromCoord}/>
                    <PlaceSearch icon="🏁" placeholder="Where to?" value={toCoord} onChange={setToCoord}/>
                  </div>
                </div>
                <button onClick={searchTrips} disabled={searching||!toCoord}
                  style={{background:toCoord?'#fbbf24':'#1a1a1a',color:toCoord?'#000':'#555',border:'none',borderRadius:12,padding:'14px',fontSize:14,fontWeight:700,cursor:toCoord?'pointer':'default',fontFamily:"'Sora',sans-serif",marginTop:4,transition:'all .2s'}}>
                  {searching?'Searching…':'🔍 Find trips near me'}
                </button>
              </div>
              <p style={{fontSize:11,color:'#444',marginTop:10,textAlign:'center'}}>Finds stops within 10km · matches by area name</p>
            </div>

            <div style={{marginTop:16}}>
              {activePoolChatRequest&&(
                <div onClick={()=>{setTripDetailPool(activePoolChatRequest);setTripDetailBooking(null);setTripDetailOpen(true);}} style={{background:'linear-gradient(135deg,#0a0f1e,#0d1117)',border:'2px solid rgba(96,165,250,0.3)',borderRadius:20,padding:'16px 20px',marginBottom:14,display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
                  <div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>👥</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:800,color:'#60a5fa'}}>Your Pool Group</div>
                    <div style={{fontSize:12,color:'#4b7ab5',marginTop:2}}>{activePoolChatRequest.origin_label||'Pickup'} → {activePoolChatRequest.dest_label||'Destination'}</div>
                  </div>
                  <button onClick={()=>openPoolChat(activePoolChatRequest.group_trip_id)}
                    style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',border:'none',borderRadius:10,padding:'8px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",whiteSpace:'nowrap'}}>
                    💬 Open Chat
                  </button>
                </div>
              )}

              {activePoolGroup&&(
                <div onClick={()=>{setTripDetailPool(activePoolGroup);setTripDetailBooking(null);setTripDetailOpen(true);}} style={{background:'linear-gradient(135deg,#0a1628,#0f2347)',border:'2px solid rgba(74,222,128,0.4)',borderRadius:20,padding:'18px 20px',marginBottom:16,position:'relative',overflow:'hidden',boxShadow:'0 4px 24px rgba(74,222,128,0.1)',cursor:'pointer'}}>
                  <div style={{position:'absolute',top:16,right:16,width:12,height:12,borderRadius:'50%',background:'#4ade80',boxShadow:'0 0 0 0 rgba(74,222,128,0.6)',animation:'poolPulse 1.5s infinite'}}/>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                    <div style={{width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#14532d,#16a34a)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>👥</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:800,color:'#4ade80',fontFamily:"'Sora',sans-serif"}}>Smart Pool Group Active</div>
                      <div style={{fontSize:12,color:'rgba(74,222,128,0.7)',marginTop:1}}>
                        {activePoolGroup.group_size||1} passenger{(activePoolGroup.group_size||1)!==1?'s':''} matched · Waiting for driver
                      </div>
                    </div>
                  </div>
                  <div style={{background:'rgba(74,222,128,0.08)',borderRadius:12,padding:'10px 14px',marginBottom:14,border:'1px solid rgba(74,222,128,0.15)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:'#fbbf24'}}/>
                        <div style={{width:1,height:12,background:'#333'}}/>
                        <div style={{width:7,height:7,borderRadius:2,background:'#4ade80'}}/>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,color:'#ccc',marginBottom:5}}>{activePoolGroup.origin_label||'Your location'}</div>
                        <div style={{fontSize:13,color:'#fff',fontWeight:700}}>{activePoolGroup.dest_label||'Destination'}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:'rgba(74,222,128,0.6)',marginTop:8,paddingTop:8,borderTop:'1px solid rgba(74,222,128,0.1)'}}>{activePoolGroup.desired_date?.slice(0,10)} · {activePoolGroup.desired_time}</div>
                  </div>
                  <div style={{fontSize:12,color:'rgba(74,222,128,0.7)',textAlign:'center',lineHeight:1.5}}>
                    🚗 Nearby drivers are being notified. You'll get a notification when one accepts.
                  </div>
                </div>
              )}
              <SmartPoolBanner onClick={openSmartPool}/>
            </div>

            {searched&&!searching&&matchedTrips.length===0&&(
              <NoTripsPoolCard destName={toCoord?.name} onClick={openSmartPool}/>
            )}

            {matchedTrips.length>0&&(
              <div>
                <p style={{fontSize:13,color:'#555',marginBottom:16}}>{matchedTrips.length} trip{matchedTrips.length!==1?'s':''} found</p>
                {matchedTrips.map(t=>{
                  const avail=t.total_seats-t.booked_seats;
                  return(
                    <div key={t.id} onClick={()=>{setSelTrip(t);setSelPickup(t.bestPickup||null);setSelDropoff(t.bestDropoff||null);setSeats(1);setTravelDate('');setWeekSchedule(null);loadWeekSchedule(t.id);}}
                      style={{background:'#111',borderRadius:16,padding:'20px',marginBottom:12,cursor:'pointer',border:'1px solid #1a1a1a',transition:'border-color .15s'}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='#fbbf2466'} onMouseLeave={e=>e.currentTarget.style.borderColor='#1a1a1a'}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:16,fontWeight:700,color:'#fff',marginBottom:4}}>{t.from_loc} → {t.to_loc}</div>
                          <div style={{fontSize:12,color:'#555'}}>{fmtDate(t.date)} · {t.pickup_time}</div>
                        </div>
                        <div style={{textAlign:'right',marginLeft:16}}>
                          <div style={{fontSize:24,fontWeight:800,color:'#fbbf24'}}>{t.price}</div>
                          <div style={{fontSize:11,color:'#555'}}>EGP/seat</div>
                        </div>
                      </div>
                      {t.bestPickup&&(
                        <div style={{background:'rgba(251,191,36,0.08)',borderRadius:10,padding:'10px 12px',marginBottom:8}}>
                          <div style={{fontSize:12,color:'#fbbf24',fontWeight:600,marginBottom:2}}>🟢 {t.bestPickup.label||'Nearest pickup'}</div>
                          {t.bestPickupDist>0&&<div style={{fontSize:11,color:'#666'}}>{formatDist(t.bestPickupDist)} · {estimateWalkTime(t.bestPickupDist)}</div>}
                        </div>
                      )}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <Badge type={avail<=0?'red':avail<=3?'amber':'green'}>{avail<=0?'Full':`${avail} seats left`}</Badge>
                          <span style={{fontSize:12,color:'#fbbf24'}}>★ {parseFloat(t.avg_rating).toFixed(1)}</span>
                        </div>
                        <span style={{fontSize:12,color:'#444'}}>View →</span>
                      </div>
                      <CapBar booked={t.booked_seats} total={t.total_seats}/>
                    </div>
                  );
                })}
                <PoolUpsell onClick={openSmartPool}/>
              </div>
            )}

            {/* ── SMART POOL MODAL ── */}
            {showPool&&(
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:400,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                <div style={{background:'#0d1117',borderRadius:'24px 24px 0 0',padding:'28px 20px 44px',maxHeight:'92vh',overflowY:'auto',border:'1px solid rgba(96,165,250,0.2)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',marginBottom:24}}>
                    <div style={{width:44,height:44,borderRadius:14,background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginRight:14,flexShrink:0,boxShadow:'0 4px 16px rgba(59,130,246,0.35)'}}>🚀</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:20,fontWeight:800,color:'#fff',fontFamily:"'Sora',sans-serif"}}>Smart Pool</div>
                      <div style={{fontSize:12,color:'#60a5fa',marginTop:3,fontFamily:"'Sora',sans-serif"}}>Share your ride · Save money · Go together</div>
                    </div>
                    <button onClick={()=>setShowPool(false)} style={{background:'rgba(255,255,255,0.06)',border:'none',color:'#888',fontSize:18,cursor:'pointer',width:32,height:32,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
                  </div>

                  {poolWaiting?(
                    <div style={{textAlign:'center',padding:'20px 0 32px'}}>
                      <div style={{position:'relative',width:140,height:140,margin:'0 auto 28px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'2px solid rgba(59,130,246,0.15)',animation:'poolGlow 1.8s ease-in-out infinite'}}/>
                        <div style={{position:'absolute',inset:10,borderRadius:'50%',border:'2px solid rgba(59,130,246,0.25)',animation:'poolGlow 1.8s ease-in-out infinite',animationDelay:'0.3s'}}/>
                        <div style={{position:'absolute',inset:22,borderRadius:'50%',border:'2px solid rgba(59,130,246,0.4)',animation:'poolGlow 1.8s ease-in-out infinite',animationDelay:'0.6s'}}/>
                        <div style={{width:60,height:60,borderRadius:'50%',background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,animation:'poolPulse 1.4s ease-in-out infinite',boxShadow:'0 0 30px rgba(59,130,246,0.5)'}}>🚀</div>
                        <div style={{position:'absolute',inset:0,borderRadius:'50%',overflow:'hidden',pointerEvents:'none'}}>
                          <div style={{position:'absolute',left:0,right:0,height:2,background:'linear-gradient(90deg,transparent,rgba(96,165,250,0.8),transparent)',animation:'poolScan 1.6s linear infinite'}}/>
                        </div>
                      </div>
                      <div style={{fontSize:22,fontWeight:800,color:'#fff',marginBottom:8,fontFamily:"'Sora',sans-serif"}}>Searching for riders…</div>
                      <div style={{fontSize:13,color:'#60a5fa',lineHeight:1.7,fontFamily:"'Sora',sans-serif"}}>Looking for passengers going<br/>the same way at the same time</div>
                    </div>
                  ):poolResult?(
                    <div style={{textAlign:'center',padding:'8px 0',animation:'fadeInUp 0.4s ease-out'}}>
                      <div style={{fontSize:56,marginBottom:14,animation:'poolPulse 0.6s ease-out'}}>{poolResult.matched?'🎉':'✅'}</div>
                      <div style={{fontSize:20,fontWeight:800,color:'#fff',marginBottom:8,fontFamily:"'Sora',sans-serif"}}>
                        {poolResult.matched?`Matched! ${poolResult.compatible_count+1} riders grouped`:'Request submitted!'}
                      </div>
                      <div style={{fontSize:13,color:'#60a5fa',lineHeight:1.7,marginBottom:20,fontFamily:"'Sora',sans-serif"}}>
                        {poolResult.matched
                          ?`You've been grouped with ${poolResult.compatible_count} other passenger${poolResult.compatible_count!==1?'s':''}. A nearby driver will be notified.`
                          :"Your request is open. We'll notify you when others join and a driver accepts."}
                      </div>
                      <button onClick={()=>setShowPool(false)}
                        style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',color:'#fff',border:'none',borderRadius:14,padding:'15px',fontSize:15,fontWeight:700,cursor:'pointer',width:'100%',fontFamily:"'Sora',sans-serif",boxShadow:'0 6px 20px rgba(59,130,246,0.35)'}}>
                        {poolResult.matched?'🎉 Awesome, got it!':'Got it!'}
                      </button>
                    </div>
                  ):(
                    <div style={{display:'flex',flexDirection:'column',gap:16}}>
                      <div style={{background:'rgba(30,58,95,0.3)',borderRadius:14,padding:'14px 16px',border:'1px solid rgba(96,165,250,0.1)'}}>
                        <div style={{fontSize:11,color:'#4b7ab5',marginBottom:10,textTransform:'uppercase',letterSpacing:'.08em'}}>Route</div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:'#fbbf24'}}/>
                            <div style={{width:1,height:14,background:'#333'}}/>
                            <div style={{width:8,height:8,borderRadius:2,background:'#60a5fa'}}/>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,color:'#ccc',marginBottom:8}}>{fromCoord?.name||'Your location'}</div>
                            <div style={{fontSize:13,color:'#fff',fontWeight:600}}>{toCoord?.name||<span style={{color:'#555'}}>Set destination above</span>}</div>
                          </div>
                        </div>
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                        <div>
                          <label style={{fontSize:11,color:'#4b7ab5',display:'block',marginBottom:6,fontFamily:"'Sora',sans-serif",textTransform:'uppercase',letterSpacing:'.06em'}}>Date</label>
                          <input type="date" value={poolDate} onChange={e=>setPoolDate(e.target.value)}
                            min={new Date().toISOString().slice(0,10)}
                            style={{width:'100%',boxSizing:'border-box',background:'#111',border:'1px solid rgba(96,165,250,0.2)',borderRadius:12,padding:'13px 12px',color:'#fff',fontFamily:"'Sora',sans-serif",fontSize:13,outline:'none'}}/>
                        </div>
                        <div>
                          <label style={{fontSize:11,color:'#4b7ab5',display:'block',marginBottom:6,fontFamily:"'Sora',sans-serif",textTransform:'uppercase',letterSpacing:'.06em'}}>Time</label>
                          <input type="time" value={poolTime} onChange={e=>setPoolTime(e.target.value)}
                            style={{width:'100%',boxSizing:'border-box',background:'#111',border:'1px solid rgba(96,165,250,0.2)',borderRadius:12,padding:'13px 12px',color:'#fff',fontFamily:"'Sora',sans-serif",fontSize:13,outline:'none'}}/>
                        </div>
                      </div>

                      <div>
                        <label style={{fontSize:11,color:'#4b7ab5',display:'block',marginBottom:8,fontFamily:"'Sora',sans-serif",textTransform:'uppercase',letterSpacing:'.06em'}}>Seats needed</label>
                        <div style={{display:'flex',gap:8}}>
                          {[1,2,3,4].map(n=>(
                            <button key={n} onClick={()=>setPoolSeats(n)}
                              style={{flex:1,background:poolSeats===n?'linear-gradient(135deg,#1d4ed8,#3b82f6)':'#111',color:poolSeats===n?'#fff':'#555',border:`1px solid ${poolSeats===n?'#3b82f6':'#1a1a1a'}`,borderRadius:10,padding:'12px 0',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",transition:'all .15s',boxShadow:poolSeats===n?'0 4px 12px rgba(59,130,246,0.3)':'none'}}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{background:'rgba(30,58,95,0.25)',borderRadius:12,padding:'12px 14px',fontSize:12,color:'#60a5fa',lineHeight:1.65,border:'1px solid rgba(96,165,250,0.08)'}}>
                        <div style={{fontWeight:700,marginBottom:6,color:'#93c5fd'}}>How Smart Pool works</div>
                        <div>📍 Pickup within <strong style={{color:'#fff'}}>15 km</strong> of others</div>
                        <div>🏁 Destination within <strong style={{color:'#fff'}}>10 km</strong></div>
                        <div>⏰ Time within <strong style={{color:'#fff'}}>±15 minutes</strong></div>
                        <div>🚗 Nearest driver notified automatically</div>
                        <div>💸 Price drops as more people join</div>
                      </div>

                      <button onClick={submitPoolRequest} disabled={poolSubmitting||!poolDate||!poolTime||!toCoord}
                        style={{background:(poolDate&&poolTime&&toCoord)?'linear-gradient(135deg,#1d4ed8,#3b82f6)':'#1a1a1a',color:(poolDate&&poolTime&&toCoord)?'#fff':'#333',border:'none',borderRadius:14,padding:'16px',fontSize:15,fontWeight:700,cursor:(poolDate&&poolTime&&toCoord)?'pointer':'default',fontFamily:"'Sora',sans-serif",transition:'all .2s',boxShadow:(poolDate&&poolTime&&toCoord)?'0 6px 20px rgba(59,130,246,0.35)':'none'}}>
                        {poolSubmitting?'⏳ Matching you…':'🚀 Start Smart Pool'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── TRIP DETAIL ── */}
        {tab==='home'&&selTrip&&(
          <div style={{paddingTop:16}}>
            <button onClick={()=>{setSelTrip(null);setWeekSchedule(null);setTravelDate('');}} style={{background:'transparent',border:'none',color:'#fff',fontSize:24,cursor:'pointer',padding:'4px 0',marginBottom:16}}>←</button>
            <h2 style={{fontSize:20,fontWeight:700,color:'#fff',marginBottom:4}}>{selTrip.from_loc} → {selTrip.to_loc}</h2>
            <p style={{color:'#555',fontSize:13,marginBottom:16}}>{selTrip.pickup_time}</p>

            {/* ── DAY SELECTOR BAR (like Google Maps transit) ── */}
            <div style={{marginBottom:20}}>
              <p style={{...sectSt,marginBottom:10}}>Select travel day</p>
              {weekSchedule ? (
                <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:6}}>
                  {weekSchedule.schedule.map(day=>{
                    const isSel=travelDate===day.date;
                    const full=day.available===0;
                    return(
                      <div key={day.date}
                        onClick={()=>{if(!full)setTravelDate(day.date);}}
                        style={{
                          minWidth:72,flexShrink:0,borderRadius:14,padding:'10px 8px',textAlign:'center',cursor:full?'not-allowed':'pointer',
                          border:`2px solid ${isSel?'#fbbf24':full?'#1a1a1a':'#2a2a2a'}`,
                          background:isSel?'rgba(251,191,36,0.12)':full?'#0a0a0a':'#111',
                          opacity:full?0.5:1,transition:'all .15s',
                        }}>
                        <div style={{fontSize:11,fontWeight:800,color:isSel?'#fbbf24':'#888',marginBottom:2}}>{day.day_name}</div>
                        <div style={{fontSize:10,color:'#555',marginBottom:6}}>{day.date.slice(5)}</div>
                        <div style={{height:3,borderRadius:3,background:full?'#333':day.available<=3?'rgba(251,191,36,0.6)':'rgba(74,222,128,0.6)',marginBottom:6}}/>
                        <div style={{fontSize:10,color:full?'#f87171':day.available<=3?'#fbbf24':'#4ade80',fontWeight:700}}>
                          {full?'Full':`${day.available}`}
                        </div>
                        {day.is_surge&&<div style={{fontSize:8,color:'#fbbf24',marginTop:2}}>⚡+{day.effective_price-weekSchedule.trip.price}</div>}
                      </div>
                    );
                  })}
                </div>
              ):(
                <div style={{color:'#555',fontSize:12,padding:'10px 0'}}>Loading availability…</div>
              )}
              {travelDate&&weekSchedule&&(()=>{const dayInfo=weekSchedule.schedule.find(d=>d.date===travelDate);return dayInfo?(
                <div style={{marginTop:10,padding:'10px 14px',borderRadius:10,background:dayInfo.is_surge?'rgba(251,191,36,0.08)':'rgba(74,222,128,0.06)',border:`1px solid ${dayInfo.is_surge?'rgba(251,191,36,0.25)':'rgba(74,222,128,0.2)'}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'#fff'}}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(travelDate).getDay()]} {travelDate}</div>
                    <div style={{fontSize:11,color:'#888',marginTop:2}}>{dayInfo.available} seat(s) available</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:16,fontWeight:800,color:dayInfo.is_surge?'#fbbf24':'#fff'}}>{dayInfo.effective_price} EGP</div>
                    {dayInfo.is_surge&&<div style={{fontSize:10,color:'#a07c1a'}}>⚡ surge pricing</div>}
                  </div>
                </div>
              ):null;})()}
            </div>
            <TripMap tripId={selTrip.id} pickupLat={selPickup?.lat} pickupLng={selPickup?.lng} dropoffLat={selDropoff?.lat} dropoffLng={selDropoff?.lng} stops={selTrip.stops||[]} passengerLat={userLocation?.lat} passengerLng={userLocation?.lng} driverName={selTrip.driver_name} height={260}/>
            {userLocation&&selPickup?.lat&&(<div style={{marginBottom:14}}><p style={{fontSize:12,color:'#555',marginBottom:6}}>📍 Your location → pickup point</p><ProximityMap passengerLat={userLocation.lat} passengerLng={userLocation.lng} pickupStop={selPickup} height={160}/></div>)}
            {(selTrip.stops||[]).filter(s=>s.type==='pickup').length>1&&(
              <div style={{...card,marginBottom:14}}>
                <p style={sectSt}>Choose your pickup point</p>
                {selTrip.stops.filter(s=>s.type==='pickup').map((s,i)=>{const dist=fromCoord?haversineDistance(fromCoord.lat,fromCoord.lng,parseFloat(s.lat),parseFloat(s.lng)):null;const sel=selPickup?.lat===s.lat&&selPickup?.lng===s.lng;return(<div key={i} onClick={()=>setSelPickup(s)} style={{display:'flex',alignItems:'center',gap:10,padding:'12px',borderRadius:10,marginBottom:8,cursor:'pointer',border:`1px solid ${sel?'#fbbf24':C.border}`,background:sel?'rgba(251,191,36,0.08)':'transparent'}}><div style={{width:20,height:20,borderRadius:'50%',flexShrink:0,background:sel?'#fbbf24':C.border2,border:`2px solid ${sel?'#fbbf24':C.border}`}}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{s.label||'Pickup '+(i+1)}</div>{dist!==null&&<div style={{fontSize:11,color:'#555'}}>{formatDist(dist)} · {estimateWalkTime(dist)}</div>}</div>{sel&&<span style={{color:'#fbbf24',fontWeight:700}}>✓</span>}</div>);})}
              </div>
            )}
            <div style={{...card,marginBottom:14}}>
              {selPickup&&<DetailRow label="Pickup point" val={selPickup.label||(parseFloat(selPickup.lat).toFixed(4)+', '+parseFloat(selPickup.lng).toFixed(4))} accent="#fbbf24"/>}
              <DetailRow label="Pickup time" val={selTrip.pickup_time} accent="#fbbf24"/>
              <DetailRow label="Price/seat" val={(()=>{const d=weekSchedule?.schedule?.find(s=>s.date===travelDate);return d?`${d.effective_price} EGP${d.is_surge?` (⚡surge, base ${selTrip.price})`:''}`:`${selTrip.price} EGP`;})()}  accent="#fbbf24"/>
              {selTrip.assigned_company_name ? (
                <>
                  <DetailRow label="Company" val={selTrip.assigned_company_name} accent="#f5c842"/>
                  <DetailRow label="Driver" val={selTrip.daily_driver_name || '—'}/>
                  <DetailRow label="Vehicle" val={selTrip.daily_car_plate ? `${selTrip.daily_car_plate}${selTrip.daily_car_model ? ` · ${selTrip.daily_car_model}` : ''}` : '—'}/>
                </>
              ) : (
                <>
                  <DetailRow label="Driver" val={selTrip.driver_name}/>
                  <DetailRow label="Car" val={selTrip.driver_car}/>
                  <DetailRow label="Plate" val={selTrip.driver_plate}/>
                </>
              )}
              <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0'}}><span style={{color:'#555',fontSize:13}}>Rating</span><span style={{color:'#fbbf24'}}>★ {parseFloat(selTrip.avg_rating).toFixed(1)}</span></div>
            </div>
            <div style={{...card,marginBottom:20}}>
              <p style={sectSt}>Reserve seats</p>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:24,padding:'12px 0'}}>
                <button onClick={()=>setSeats(s=>Math.max(1,s-1))} style={{width:44,height:44,borderRadius:22,border:'1px solid #333',background:'transparent',color:'#fff',fontSize:20,cursor:'pointer'}}>−</button>
                <span style={{fontSize:32,fontWeight:800,color:'#fff',minWidth:40,textAlign:'center'}}>{seats}</span>
                <button onClick={()=>setSeats(s=>Math.min(selTrip.total_seats,s+1))} style={{width:44,height:44,borderRadius:22,border:'1px solid #333',background:'transparent',color:'#fff',fontSize:20,cursor:'pointer'}}>+</button>
              </div>
            </div>
            {!travelDate&&<div style={{textAlign:'center',fontSize:12,color:'#f87171',marginBottom:12}}>⬆ Select a travel day above first</div>}
            <button onClick={confirmBook} disabled={booking||!travelDate} style={{...btnPrimary,opacity:(booking||!travelDate)?0.4:1}}>
              {booking?'Booking…':(()=>{const d=weekSchedule?.schedule?.find(s=>s.date===travelDate);const price=d?d.effective_price:selTrip.price;return travelDate?`Confirm ${travelDate} — ${seats*price} EGP`:'Select a day to book';})()}
            </button>
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab==='activity'&&!selBooking&&(
          <div style={{paddingTop:24}}>
            <h2 style={{fontSize:22,fontWeight:800,color:'#fff',marginBottom:16}}>Your trips</h2>

            {(myPoolRequests.some(r=>r.group_trip_id&&r.group_status==='confirmed')||myPoolRequests.some(r=>r.status==='pending'&&r.pool_group_id))&&(
              <div style={{marginBottom:20}}>
                <p style={{fontSize:11,color:'#4b7ab5',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:10}}>🚀 Smart Pool</p>
                {myPoolRequests.filter(r=>r.group_trip_id&&r.group_status==='confirmed').map(r=>(
                  <div key={r.id} style={{background:'linear-gradient(135deg,#0a0f1e,#0d1117)',border:'2px solid rgba(96,165,250,0.3)',borderRadius:16,padding:'16px 20px',marginBottom:10,display:'flex',alignItems:'center',gap:14}}>
                    <div style={{width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>👥</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:800,color:'#60a5fa'}}>Pool Group Active</div>
                      <div style={{fontSize:12,color:'#4b7ab5',marginTop:2}}>{r.origin_label||'Pickup'} → {r.dest_label||'Destination'}</div>
                      <div style={{fontSize:11,color:'#334',marginTop:2}}>{r.desired_date} · {r.desired_time}</div>
                    </div>
                    {/* Chat button only in activity - explicit user action */}
                    <button onClick={()=>openPoolChat(r.group_trip_id)}
                      style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',border:'none',borderRadius:10,padding:'8px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",whiteSpace:'nowrap',flexShrink:0}}>
                      💬 Chat
                    </button>
                  </div>
                ))}
                {myPoolRequests.filter(r=>r.status==='pending'&&r.pool_group_id&&!r.group_trip_id).map(r=>(
                  <div key={r.id} style={{background:'#0d1117',border:'1px solid rgba(96,165,250,0.15)',borderRadius:16,padding:'14px 18px',marginBottom:10,display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:36,height:36,borderRadius:10,background:'rgba(96,165,250,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>⏳</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#60a5fa'}}>Waiting for driver</div>
                      <div style={{fontSize:12,color:'#4b7ab5',marginTop:2}}>{r.origin_label} → {r.dest_label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeBookings.length>0&&(
              <>
                <p style={{fontSize:11,color:'#555',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:12}}>Active</p>
                {activeBookings.map(b=>{const st=b.checkin_status;return(
                  <div key={b.id} onClick={()=>{setSelBooking(b);sessionStorage.setItem('selBookingId',b.id);}}
                    style={{background:'#111',borderRadius:16,padding:'20px',marginBottom:12,cursor:'pointer',border:`1px solid ${st==='picked'?'#4ade8044':st==='dropped'?'#60a5fa44':'#1a1a1a'}`}}>
                    <div style={{display:'flex',alignItems:'center',marginBottom:10}}>
                      <Badge type={st==='picked'?'green':st==='dropped'?'blue':'amber'}>{st==='picked'?'✅ Picked up':st==='dropped'?'🏁 Dropped off':'⏳ Confirmed'}</Badge>
                      <span style={{marginLeft:'auto',fontSize:12,color:'#555'}}>{fmtDate(b.date)}</span>
                    </div>
                    <div style={{fontSize:16,fontWeight:700,color:'#fff',marginBottom:4}}>{b.from_loc} → {b.to_loc}</div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                      <div style={{fontSize:12,color:'#555'}}>{b.driver_name} · {b.pickup_time}</div>
                      <div style={{fontSize:15,fontWeight:700,color:'#fbbf24'}}>{b.seats*(b.pool_price||b.price)} EGP</div>
                    </div>
                    {b.is_pool===1&&(
                      <button onClick={e=>{e.stopPropagation();openPoolChat(b.trip_id);}}
                        style={{marginTop:10,background:'rgba(29,78,216,0.15)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:8,padding:'7px 14px',color:'#60a5fa',fontSize:12,cursor:'pointer',fontFamily:"'Sora',sans-serif",width:'100%'}}>
                        💬 Open Smart Pool Chat
                      </button>
                    )}
                  </div>
                );})}
              </>
            )}
            {historyBookings.length>0&&(
              <>
                <p style={{fontSize:11,color:'#555',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:12,marginTop:24}}>History</p>
                {historyBookings.map(b=>(
                  <div key={b.id} style={{background:'#111',borderRadius:16,padding:'16px 20px',marginBottom:10,border:'1px solid #1a1a1a'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                      <Badge type={b.status==='completed'?'blue':'red'}>{b.status}</Badge>
                      <span style={{fontSize:11,color:'#555'}}>{fmtDate(b.date)}</span>
                    </div>
                    <div style={{fontSize:14,fontWeight:600,color:'#fff',marginBottom:4}}>{b.from_loc} → {b.to_loc}</div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,color:'#555'}}>{b.seats} seats · {b.seats*(b.pool_price||b.price)} EGP</span>
                      {b.status==='completed'&&!b.rated&&(<button onClick={()=>setRateTrip(b)} style={{background:'rgba(251,191,36,0.1)',border:'1px solid #fbbf2444',borderRadius:8,padding:'5px 12px',color:'#fbbf24',fontSize:12,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Rate ★</button>)}
                      {b.rated&&<span style={{fontSize:12,color:'#fbbf24'}}>★ Rated</span>}
                    </div>
                  </div>
                ))}
              </>
            )}
            {myPoolRequests.length>0&&(
              <>
                <p style={{fontSize:11,color:'#4b7ab5',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:12,marginTop:28}}>🚀 Smart Pool Requests</p>
                {myPoolRequests.map(r=>(
                  <div key={r.id} style={{background:'#0d1117',borderRadius:16,padding:'16px 20px',marginBottom:10,border:'1px solid rgba(96,165,250,0.15)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:20,color:r.status==='confirmed'?'#4ade80':r.status==='cancelled'?'#f87171':'#60a5fa',background:r.status==='confirmed'?'rgba(74,222,128,0.1)':r.status==='cancelled'?'rgba(248,113,113,0.1)':'rgba(96,165,250,0.1)'}}>
                        {r.status==='confirmed'?'✅ Confirmed':r.status==='cancelled'?'❌ Cancelled':'⏳ Pending'}
                      </span>
                      <span style={{fontSize:11,color:'#555'}}>{r.desired_date} · {r.desired_time}</span>
                    </div>
                    <div style={{fontSize:14,fontWeight:600,color:'#fff',marginBottom:4}}>{r.origin_label||'Your location'} → {r.dest_label||'Destination'}</div>
                    <div style={{fontSize:12,color:'#4b7ab5'}}>{r.seats} seat{r.seats>1?'s':''} · {r.group_size>0?`${r.group_size} passenger${r.group_size!==1?'s':''} in group`:'Waiting for match'}</div>
                    {r.group_trip_id&&r.group_status==='confirmed'&&(
                      <button onClick={()=>openPoolChat(r.group_trip_id)}
                        style={{marginTop:10,background:'rgba(29,78,216,0.15)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:8,padding:'7px 14px',color:'#60a5fa',fontSize:12,cursor:'pointer',fontFamily:"'Sora',sans-serif",width:'100%'}}>
                        💬 Open Group Chat
                      </button>
                    )}
                    {r.pool_group_id&&!r.group_trip_id&&r.status==='pending'&&(
                      <div style={{marginTop:8,fontSize:12,color:'rgba(96,165,250,0.5)',textAlign:'center',padding:'6px 0'}}>
                        ⏳ Waiting for a driver to accept…
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            {!loadingB&&myBookings.length===0&&myPoolRequests.length===0&&(
              <div style={{textAlign:'center',paddingTop:60}}>
                <div style={{fontSize:48,marginBottom:16}}>🎫</div>
                <p style={{color:'#555',fontSize:14}}>No trips yet</p>
                <button onClick={()=>changeTab('home')} style={{...btnPrimary,marginTop:16,maxWidth:200,margin:'16px auto 0'}}>Book a ride →</button>
              </div>
            )}
            {loadingB&&<Spinner/>}
          </div>
        )}

        {/* ── BOOKING DETAIL ── */}
        {tab==='activity'&&selBooking&&(()=>{
          const b=myBookings.find(x=>x.id===selBooking.id)||selBooking;
          const st=b.checkin_status;
          return(
            <div style={{paddingTop:16}}>
              <button onClick={()=>{setSelBooking(null);sessionStorage.removeItem('selBookingId');}} style={{background:'transparent',border:'none',color:'#fff',fontSize:24,cursor:'pointer',padding:'4px 0',marginBottom:16}}>←</button>
              <h2 style={{fontSize:20,fontWeight:700,color:'#fff',marginBottom:4}}>{b.from_loc} → {b.to_loc}</h2>
              <p style={{color:'#555',fontSize:13,marginBottom:16}}>{fmtDate(b.date)} · Pickup {b.pickup_time}</p>
              {(!st||st==='pending')&&(<div style={{padding:'14px 16px',background:'rgba(251,191,36,0.08)',border:'1px solid #fbbf2433',borderRadius:12,marginBottom:16,display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:24}}>⏳</span><div><div style={{fontSize:13,fontWeight:700,color:'#fbbf24'}}>Waiting for driver</div><div style={{fontSize:12,color:'#666',marginTop:2}}>Driver will appear on map when they start</div></div></div>)}
              {st==='picked'&&(<div style={{padding:'14px 16px',background:'rgba(74,222,128,0.08)',border:'1px solid #4ade8033',borderRadius:12,marginBottom:16,display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:24}}>✅</span><div style={{fontSize:13,fontWeight:700,color:'#4ade80'}}>You've been picked up!</div></div>)}
              <TripMap tripId={b.trip_id} stops={b.stops||[]} pickupLat={b.pickup_lat||(b.stops||[]).find(s=>s.type==='pickup')?.lat} pickupLng={b.pickup_lng||(b.stops||[]).find(s=>s.type==='pickup')?.lng} dropoffLat={b.dropoff_lat||(b.stops||[]).find(s=>s.type==='dropoff')?.lat} dropoffLng={b.dropoff_lng||(b.stops||[]).find(s=>s.type==='dropoff')?.lng} passengerLat={userLocation?.lat} passengerLng={userLocation?.lng} driverName={b.driver_name} checkinStatus={st} height={300}/>
              <div style={{...card,marginBottom:16}}>
                {/* Dispatch batch info — shown when admin has assigned a driver/company */}
                {b.batch_status === 'assigned' && b.batch_driver_name ? (
                  <>
                    <div style={{background:'rgba(74,222,128,0.08)',border:'1px solid rgba(74,222,128,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:12}}>
                      <div style={{fontSize:11,color:'#4ade80',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>✅ Vehicle Assigned</div>
                      {b.batch_company_name && <DetailRow label="Company" val={b.batch_company_name} accent="#f5c842"/>}
                      <DetailRow label="Driver" val={b.batch_driver_name} accent="#4ade80"/>
                      <DetailRow label="Vehicle" val={b.batch_car_plate ? `${b.batch_car_plate}${b.batch_car_model ? ` · ${b.batch_car_model}` : ''}` : '—'}/>
                    </div>
                  </>
                ) : b.batch_status === 'tendered' ? (
                  <div style={{background:'rgba(96,165,250,0.08)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:12}}>
                    <div style={{fontSize:11,color:'#60a5fa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>🏷 Being Assigned</div>
                    <div style={{fontSize:12,color:'#555'}}>A vehicle is being arranged for your trip. You'll be notified once confirmed.</div>
                  </div>
                ) : b.batch_status === 'pending' ? (
                  <div style={{background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:12}}>
                    <div style={{fontSize:11,color:'#fbbf24',fontWeight:700,marginBottom:4}}>⏳ Vehicle Being Arranged</div>
                    <div style={{fontSize:12,color:'#555'}}>Admin is arranging your vehicle. Details coming soon.</div>
                  </div>
                ) : b.assigned_company_name ? (
                  <>
                    <DetailRow label="Company" val={b.assigned_company_name} accent="#f5c842"/>
                    <DetailRow label="Driver" val={b.daily_driver_name || '—'}/>
                    <DetailRow label="Vehicle" val={b.daily_car_plate ? `${b.daily_car_plate}${b.daily_car_model ? ` · ${b.daily_car_model}` : ''}` : '—'}/>
                  </>
                ) : (
                  <>
                    <DetailRow label="Driver" val={b.driver_name}/>
                    <DetailRow label="Plate" val={b.driver_plate}/>
                    <DetailRow label="Car" val={b.driver_car}/>
                  </>
                )}
                <DetailRow label="Seats" val={b.seats}/>
                <DetailRow label="Pickup time" val={b.pickup_time} accent="#fbbf24"/>
                <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0'}}><span style={{color:'#555',fontSize:13}}>Total</span><span style={{color:'#fbbf24',fontWeight:700,fontSize:16}}>{b.seats*(b.pool_price||b.price)} EGP</span></div>
              </div>
              <button style={{...btnDanger,width:'100%'}} onClick={()=>{cancelBooking(b.id);setSelBooking(null);sessionStorage.removeItem('selBookingId');}}>Cancel booking</button>
            </div>
          );
        })()}

        {/* ── RATE ── */}
        {tab==='activity'&&rateTrip&&!selBooking&&(
          <div style={{paddingTop:40,textAlign:'center'}}>
            <button onClick={()=>setRateTrip(null)} style={{background:'transparent',border:'none',color:'#fff',fontSize:24,cursor:'pointer',marginBottom:20}}>←</button>
            <div style={{fontSize:56,marginBottom:12}}>⭐</div>
            <h2 style={{fontSize:22,fontWeight:800,color:'#fff',marginBottom:6}}>Rate your driver</h2>
            <p style={{color:'#555',fontSize:14,marginBottom:28}}>{rateTrip.driver_name} · {rateTrip.from_loc} → {rateTrip.to_loc}</p>
            <div style={{marginBottom:24}}><Stars n={ratingStars} interactive onSet={setRatingStars}/></div>
            <textarea value={rateComment} onChange={e=>setRateComment(e.target.value)}
              style={{width:'100%',background:'#111',border:'1px solid #222',borderRadius:12,padding:'14px',color:'#fff',fontFamily:"'Sora',sans-serif",fontSize:14,outline:'none',resize:'none',height:80,boxSizing:'border-box'}}
              placeholder="Leave a comment (optional)"/>
            <button onClick={submitRating} style={{...btnPrimary,marginTop:16}}>Submit rating</button>
          </div>
        )}

        {/* ── ACCOUNT TAB ── */}
        {/* ── ADMIN REVIEW TAB ── */}
        {tab==='review'&&(
          <div style={{paddingTop:24,paddingBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <h2 style={{fontSize:20,fontWeight:800,color:'#fff',margin:0}}>Driver Review</h2>
              <button onClick={loadPendingDrivers} style={{background:'#1a1a1a',border:'1px solid #333',borderRadius:10,padding:'8px 14px',color:'#fbbf24',fontSize:12,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
                🔄 Refresh
              </button>
            </div>

            {reviewLoading&&<div style={{textAlign:'center',padding:40}}><div style={{width:28,height:28,border:'3px solid #222',borderTopColor:'#fbbf24',borderRadius:'50%',animation:'spin .6s linear infinite',margin:'0 auto'}}/><p style={{color:'#555',marginTop:12,fontSize:13}}>Loading pending drivers…</p></div>}

            {!reviewLoading&&pendingDrivers.length===0&&(
              <div style={{textAlign:'center',padding:'60px 24px',background:'#0d0d0d',borderRadius:16,border:'1px solid #1a1a1a'}}>
                <div style={{fontSize:56,marginBottom:12}}>✅</div>
                <p style={{color:'#fff',fontWeight:700,fontSize:16,marginBottom:6}}>All clear!</p>
                <p style={{color:'#555',fontSize:13}}>No drivers pending review.</p>
              </div>
            )}

            {!reviewLoading&&pendingDrivers.map(driver=>(
              <div key={driver.id} style={{background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:16,marginBottom:12,overflow:'hidden'}}>
                {/* Header row */}
                <div onClick={()=>setExpandedDriver(expandedDriver===driver.id?null:driver.id)}
                  style={{display:'flex',alignItems:'center',gap:14,padding:'16px',cursor:'pointer'}}>
                  {driver.profile_photo
                    ? <img src={driver.profile_photo} alt="profile" style={{width:48,height:48,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
                    : <div style={{width:48,height:48,borderRadius:'50%',background:'#1a1a1a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>🧑</div>
                  }
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:2}}>{driver.name}</div>
                    <div style={{fontSize:12,color:'#666'}}>{driver.phone}</div>
                    <div style={{fontSize:11,color:'#444',marginTop:2}}>Submitted: {new Date(driver.submitted_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{color:'#555',fontSize:18,transform:expandedDriver===driver.id?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
                </div>

                {/* Expanded: documents + actions */}
                {expandedDriver===driver.id&&(
                  <div style={{borderTop:'1px solid #1a1a1a',padding:'16px'}}>
                    {/* Car info */}
                    <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
                      {driver.car&&<span style={{background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:8,padding:'5px 10px',fontSize:12,color:'#ccc'}}>🚗 {driver.car}</span>}
                      {driver.plate&&<span style={{background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:8,padding:'5px 10px',fontSize:12,color:'#ccc'}}>🪪 {driver.plate}</span>}
                    </div>

                    {/* Document photos */}
                    <p style={{fontSize:11,fontWeight:700,color:'#fbbf24',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>Documents</p>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
                      {[
                        {label:'Car License / رخصة العربية', photo:driver.car_license_photo},
                        {label:'Driver License / رخصة السائق', photo:driver.driver_license_photo},
                        {label:'Criminal Record / الفيش الجنائي', photo:driver.criminal_record_photo},
                      ].map(({label,photo})=>(
                        <div key={label}>
                          <div style={{fontSize:9,color:'#555',marginBottom:4,lineHeight:1.3}}>{label}</div>
                          {photo
                            ? <a href={photo} target="_blank" rel="noreferrer">
                                <img src={photo} alt={label} style={{width:'100%',aspectRatio:'4/3',objectFit:'cover',borderRadius:8,border:'1px solid #2a2a2a',display:'block'}}/>
                              </a>
                            : <div style={{width:'100%',aspectRatio:'4/3',background:'#1a1a1a',borderRadius:8,border:'1px solid #2a2a2a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>❓</div>
                          }
                        </div>
                      ))}
                    </div>

                    {/* Reject note input (shown when reject is triggered) */}
                    {rejectTarget===driver.id&&(
                      <div style={{marginBottom:12}}>
                        <textarea
                          value={rejectNote}
                          onChange={e=>setRejectNote(e.target.value)}
                          placeholder="Reason for rejection (optional)"
                          rows={3}
                          style={{width:'100%',boxSizing:'border-box',background:'#1a1a1a',border:'1px solid #f87171',borderRadius:10,padding:'10px 12px',color:'#fff',fontSize:13,fontFamily:"'Sora',sans-serif",resize:'vertical',outline:'none'}}
                        />
                        <div style={{display:'flex',gap:8,marginTop:8}}>
                          <button onClick={()=>handleReject(driver.id)}
                            style={{flex:1,background:'#f87171',border:'none',borderRadius:10,padding:'10px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
                            Confirm Reject ❌
                          </button>
                          <button onClick={()=>{setRejectTarget(null);setRejectNote('');}}
                            style={{background:'#1a1a1a',border:'1px solid #333',borderRadius:10,padding:'10px 16px',color:'#888',fontSize:13,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {rejectTarget!==driver.id&&(
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>handleApprove(driver.id)}
                          style={{flex:1,background:'#22c55e',border:'none',borderRadius:10,padding:'12px',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
                          ✅ Approve
                        </button>
                        <button onClick={()=>setRejectTarget(driver.id)}
                          style={{flex:1,background:'transparent',border:'1px solid #f87171',borderRadius:10,padding:'12px',color:'#f87171',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
                          ❌ Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab==='account'&&(
          <div style={{paddingTop:24}}>
            <div style={{textAlign:'center',paddingBottom:28}}>
              <Avatar name={user.name} size={72}/>
              <h2 style={{fontSize:22,fontWeight:800,color:'#fff',marginTop:16,marginBottom:4}}>{user.name}</h2>
              <p style={{color:'#555',fontSize:13}}>{user.phone} · Passenger</p>
            </div>
            <div style={{...card,marginBottom:14}}>
              <p style={sectSt}>Account info</p>
              <DetailRow label="Name" val={user.name}/>
              <DetailRow label="Phone" val={user.phone}/>
              <DetailRow label="Role" val="Passenger"/>
              <DetailRow label="Member since" val={fmtDate(user.created_at)}/>
            </div>
            <div style={{...card,marginBottom:14}}>
              <p style={sectSt}>Trip stats</p>
              <DetailRow label="Total trips" val={historyBookings.filter(b=>b.status==='completed').length}/>
              <DetailRow label="Active bookings" val={activeBookings.length}/>
              <DetailRow label="Smart Pool requests" val={myPoolRequests.length}/>
            </div>
            <button onClick={logout} style={{...btnDanger,width:'100%',marginTop:8,padding:'14px',fontSize:14}}>Sign out</button>
          </div>
        )}

      </div>
      <BottomNav active={tab} onSet={changeTab} bookingCount={activeBookings.length} isAdmin={isAdmin} pendingCount={pendingDrivers.length}/>
    </div>
  );
}
