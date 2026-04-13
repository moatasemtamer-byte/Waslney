/**
 * Smart Pool — backend routes (production-ready)
 */
const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

function haversine(lat1,lng1,lat2,lng2){const R=6371000;const a=Math.sin((lat2-lat1)*Math.PI/360)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin((lng2-lng1)*Math.PI/360)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function bearing(lat1,lng1,lat2,lng2){const y=Math.sin((lng2-lng1)*Math.PI/180)*Math.cos(lat2*Math.PI/180);const x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lng2-lng1)*Math.PI/180);return(Math.atan2(y,x)*180/Math.PI+360)%360;}
function routeSim(oA,dA,oB,dB){const bA=bearing(+oA.lat,+oA.lng,+dA.lat,+dA.lng);const bB=bearing(+oB.lat,+oB.lng,+dB.lat,+dB.lng);const d=Math.abs(bA-bB)%360;return 1-Math.min(d,360-d)/180;}
function toMin(t){const[h,m]=(t||'00:00').split(':').map(Number);return h*60+m;}
function travelMin(m){return Math.round(m/1000/40*60);}

const PRICE_PER_KM=3.5,MIN_FARE=15;
const DISCOUNTS={1:1.0,2:0.90,3:0.82,4:0.75};
function calcPrice(distM,n=1){return Math.round(Math.max(MIN_FARE,distM/1000*PRICE_PER_KM)*(DISCOUNTS[Math.min(n,4)]??0.70)*100)/100;}

function matchScore(a,b){
  const od=haversine(+a.origin_lat,+a.origin_lng,+b.origin_lat,+b.origin_lng);
  const dd=haversine(+a.dest_lat,+a.dest_lng,+b.dest_lat,+b.dest_lng);
  const td=Math.abs(toMin(a.desired_time)-toMin(b.desired_time));
  const rs=routeSim({lat:a.origin_lat,lng:a.origin_lng},{lat:a.dest_lat,lng:a.dest_lng},{lat:b.origin_lat,lng:b.origin_lng},{lat:b.dest_lat,lng:b.dest_lng});
  return (od/15000)*0.4+(td/15)*0.3+(1-rs)*0.3;
}

function optimiseOrder(dLat,dLng,pax){
  if(pax.length<=1)return pax;
  const rem=[...pax],ord=[];let cLat=+dLat,cLng=+dLng;
  while(rem.length){let b=0,bd=Infinity;for(let i=0;i<rem.length;i++){const d=haversine(cLat,cLng,+rem[i].origin_lat,+rem[i].origin_lng);if(d<bd){bd=d;b=i;}}const p=rem.splice(b,1)[0];ord.push(p);cLat=+p.origin_lat;cLng=+p.origin_lng;}
  return ord;
}

async function notify(uid,msg){try{await db.query('INSERT INTO notifications(user_id,message)VALUES(?,?)',[uid,msg]);}catch(_){}}

async function suggestDrivers(groupId){
  try{
    const[[g]]=await db.query('SELECT * FROM pool_groups WHERE id=?',[groupId]);
    if(!g)return;
    const[reqs]=await db.query("SELECT * FROM pool_requests WHERE pool_group_id=? AND status='pending'",[groupId]);
    if(!reqs.length)return;
    const avgLat=reqs.reduce((s,r)=>s+(+r.origin_lat),0)/reqs.length;
    const avgLng=reqs.reduce((s,r)=>s+(+r.origin_lng),0)/reqs.length;
    const[drivers]=await db.query(`SELECT dl.driver_id,dl.lat,dl.lng,u.name FROM driver_locations dl JOIN users u ON u.id=dl.driver_id WHERE dl.updated_at>DATE_SUB(NOW(),INTERVAL 60 MINUTE)`);
    for(const d of drivers){
      if(haversine(+d.lat,+d.lng,avgLat,avgLng)>15000)continue;
      const[ex]=await db.query('SELECT id FROM pool_invitations WHERE group_id=? AND driver_id=?',[groupId,d.driver_id]);
      if(ex.length)continue;
      await db.query('INSERT INTO pool_invitations(group_id,driver_id,expires_at)VALUES(?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[groupId,d.driver_id]);
      await notify(d.driver_id,`🚗 Smart Pool: ${reqs.length} passenger(s) need a ride to ${g.dest_label||'destination'} on ${g.desired_date} at ${g.desired_time}. Check Pool tab!`);
    }
  }catch(e){console.error('suggestDrivers',e);}
}

async function buildStops(tripId,ordered,farthest){
  let o=0;
  for(const p of ordered){
    await db.query(`INSERT INTO trip_stops(trip_id,type,label,lat,lng,stop_order,passenger_id,pool_request_id)VALUES(?,?,?,?,?,?,?,?)`,[tripId,'pickup',p.origin_label||p.passenger_name+' pickup',p.origin_lat,p.origin_lng,o++,p.passenger_id,p.id]);
  }
  const dests=[];
  for(const p of ordered){
    const ex=dests.find(d=>haversine(+d.lat,+d.lng,+p.dest_lat,+p.dest_lng)<300);
    if(!ex)dests.push({lat:p.dest_lat,lng:p.dest_lng,label:p.dest_label,isFar:p.passenger_id===farthest.passenger_id});
  }
  const origin=ordered[0];
  dests.sort((a,b)=>haversine(+origin.origin_lat,+origin.origin_lng,+a.lat,+a.lng)-haversine(+origin.origin_lat,+origin.origin_lng,+b.lat,+b.lng));
  for(const d of dests){await db.query(`INSERT INTO trip_stops(trip_id,type,label,lat,lng,stop_order,passenger_id,pool_request_id)VALUES(?,?,?,?,?,?,?,?)`,[tripId,'dropoff',d.label||'Dropoff',d.lat,d.lng,o++,null,null]);}
}

async function verifyMember(tripId,userId){
  const[[b]]=await db.query("SELECT id FROM bookings WHERE trip_id=? AND passenger_id=? AND status='confirmed'",[tripId,userId]);
  const[[t]]=await db.query('SELECT id FROM trips WHERE id=? AND driver_id=?',[tripId,userId]);
  return!!(b||t);
}

// ── PASSENGER ──────────────────────────────────────────────────

router.post('/requests',requireAuth,requireRole('passenger'),async(req,res)=>{
  const{origin_lat,origin_lng,origin_label,dest_lat,dest_lng,dest_label,desired_time,desired_date,seats}=req.body;
  if(!origin_lat||!origin_lng||!dest_lat||!dest_lng||!desired_time||!desired_date)return res.status(400).json({error:'Missing fields'});
  const seatsN=Math.max(1,Math.min(16,parseInt(seats)||1));
  try{
    const[r]=await db.query(`INSERT INTO pool_requests(passenger_id,origin_lat,origin_lng,origin_label,dest_lat,dest_lng,dest_label,desired_time,desired_date,seats)VALUES(?,?,?,?,?,?,?,?,?,?)`,[req.user.id,origin_lat,origin_lng,origin_label||'',dest_lat,dest_lng,dest_label||'',desired_time,desired_date,seatsN]);
    const reqId=r.insertId;
    // Find candidates: same date, ±30 min window (relaxed from 15), not same user
    const[candidates]=await db.query(
      `SELECT pr.*,u.name AS passenger_name FROM pool_requests pr
       JOIN users u ON u.id=pr.passenger_id
       WHERE pr.id!=? AND pr.status='pending' AND pr.desired_date=?
       AND pr.passenger_id!=?
       AND ABS(TIME_TO_SEC(TIMEDIFF(pr.desired_time,?)))<=1800`,
      [reqId,desired_date,req.user.id,desired_time]
    );
    // Filter: origin within 15km, dest within 10km, score < 0.85 (relaxed)
    const compatible=candidates.filter(c=>{
      const od=haversine(+c.origin_lat,+c.origin_lng,+origin_lat,+origin_lng);
      const dd=haversine(+c.dest_lat,+c.dest_lng,+dest_lat,+dest_lng);
      const score=matchScore(c,{origin_lat,origin_lng,dest_lat,dest_lng,desired_time});
      return od<=15000 && dd<=10000 && score<0.85;
    });
    let groupId=null,matched=false,groupMembers=[];
    if(compatible.length>0){
      matched=true;
      const wg=compatible.find(c=>c.pool_group_id);
      if(wg){
        groupId=wg.pool_group_id;
      } else {
        const[grp]=await db.query(
          `INSERT INTO pool_groups(desired_date,desired_time,dest_lat,dest_lng,dest_label,status)VALUES(?,?,?,?,?,'pending')`,
          [desired_date,desired_time,dest_lat,dest_lng,dest_label||'']
        );
        groupId=grp.insertId;
        for(const c of compatible.filter(x=>!x.pool_group_id)){
          await db.query('UPDATE pool_requests SET pool_group_id=? WHERE id=?',[groupId,c.id]);
        }
      }
      await db.query('UPDATE pool_requests SET pool_group_id=? WHERE id=?',[groupId,reqId]);
      const[[nr]]=await db.query('SELECT pr.*,u.name AS passenger_name FROM pool_requests pr JOIN users u ON u.id=pr.passenger_id WHERE pr.id=?',[reqId]);
      for(const c of compatible){
        await notify(c.passenger_id,`👥 ${nr.passenger_name} joined your Smart Pool group! ${compatible.length+1} passengers now going to ${dest_label||'destination'}.`);
      }
      // Fetch all group members to return in response
      const[allMembers]=await db.query(
        `SELECT pr.id,pr.passenger_id,pr.origin_label,pr.dest_label,pr.seats,u.name AS passenger_name
         FROM pool_requests pr JOIN users u ON u.id=pr.passenger_id
         WHERE pr.pool_group_id=? AND pr.status='pending'`,
        [groupId]
      );
      groupMembers=allMembers;
      await suggestDrivers(groupId);
    }
    res.status(201).json({id:reqId,group_id:groupId,matched,compatible_count:compatible.length,group_members:groupMembers});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.get('/requests/mine',requireAuth,async(req,res)=>{
  try{
    const[rows]=await db.query(`SELECT pr.*,pg.status AS group_status,pg.trip_id AS group_trip_id,(SELECT COUNT(*) FROM pool_requests pr2 WHERE pr2.pool_group_id=pr.pool_group_id AND pr2.status='pending') AS group_size FROM pool_requests pr LEFT JOIN pool_groups pg ON pg.id=pr.pool_group_id WHERE pr.passenger_id=? ORDER BY pr.created_at DESC`,[req.user.id]);
    res.json(rows);
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.delete('/requests/:id',requireAuth,requireRole('passenger'),async(req,res)=>{
  try{
    const[[r]]=await db.query('SELECT * FROM pool_requests WHERE id=? AND passenger_id=?',[req.params.id,req.user.id]);
    if(!r)return res.status(404).json({error:'Not found'});
    if(r.status==='confirmed')return res.status(400).json({error:'Trip already confirmed'});
    await db.query("UPDATE pool_requests SET status='cancelled' WHERE id=?",[req.params.id]);
    if(r.pool_group_id){
      const[members]=await db.query("SELECT passenger_id FROM pool_requests WHERE pool_group_id=? AND passenger_id!=? AND status='pending'",[r.pool_group_id,req.user.id]);
      for(const m of members)await notify(m.passenger_id,'ℹ️ A passenger left your Smart Pool group. The group has been updated.');
    }
    res.json({message:'Cancelled'});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.get('/groups/nearby',requireAuth,async(req,res)=>{
  const{dest_lat,dest_lng,desired_date}=req.query;
  if(!dest_lat||!dest_lng)return res.json({count:0,groups:[]});
  try{
    const[groups]=await db.query(`SELECT pg.*,COUNT(pr.id) AS member_count FROM pool_groups pg LEFT JOIN pool_requests pr ON pr.pool_group_id=pg.id AND pr.status='pending' WHERE pg.status='pending' AND pg.desired_date=? GROUP BY pg.id`,[desired_date||new Date().toISOString().slice(0,10)]);
    const nearby=groups.filter(g=>haversine(+g.dest_lat,+g.dest_lng,+dest_lat,+dest_lng)<=10000);
    res.json({count:nearby.reduce((s,g)=>s+parseInt(g.member_count),0),groups:nearby});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

// ── DRIVER ─────────────────────────────────────────────────────

router.get('/invitations',requireAuth,requireRole('driver'),async(req,res)=>{
  try{
    const[invs]=await db.query(`SELECT pi.*,pg.desired_date,pg.desired_time,pg.dest_lat,pg.dest_lng,pg.dest_label,pg.status AS group_status,pg.trip_id AS group_trip_id FROM pool_invitations pi JOIN pool_groups pg ON pg.id=pi.group_id WHERE pi.driver_id=? AND pi.response IN('pending','accepted') AND(pi.expires_at IS NULL OR pi.expires_at>NOW()) ORDER BY pg.desired_date ASC,pg.desired_time ASC`,[req.user.id]);
    for(const inv of invs){
      const[members]=await db.query(`SELECT pr.*,u.name AS passenger_name FROM pool_requests pr JOIN users u ON u.id=pr.passenger_id WHERE pr.pool_group_id=? AND pr.status='pending'`,[inv.group_id]);
      if(members.length){
        let td=0;for(const m of members)td+=haversine(+m.origin_lat,+m.origin_lng,+m.dest_lat,+m.dest_lng);
        inv.price_preview=calcPrice(td/members.length,members.length);
        inv.total_seats=members.reduce((s,m)=>s+(m.seats||1),0);
      }
      inv.members=members;
    }
    res.json(invs);
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.post('/invitations/:id/accept',requireAuth,requireRole('driver'),async(req,res)=>{
  try{
    const[[inv]]=await db.query('SELECT * FROM pool_invitations WHERE id=? AND driver_id=?',[req.params.id,req.user.id]);
    if(!inv)return res.status(404).json({error:'Not found'});
    if(inv.response!=='pending')return res.status(400).json({error:'Already responded'});
    const[[group]]=await db.query('SELECT * FROM pool_groups WHERE id=?',[inv.group_id]);
    if(!group||group.status!=='pending')return res.status(400).json({error:'Group unavailable'});
    const[members]=await db.query(`SELECT pr.*,u.name AS passenger_name FROM pool_requests pr JOIN users u ON u.id=pr.passenger_id WHERE pr.pool_group_id=? AND pr.status='pending'`,[inv.group_id]);
    if(!members.length)return res.status(400).json({error:'No passengers'});
    const[[dl]]=await db.query('SELECT lat,lng FROM driver_locations WHERE driver_id=?',[req.user.id]).catch(()=>[[null]]);
    const dLat=dl?.lat||members[0].origin_lat,dLng=dl?.lng||members[0].origin_lng;
    const ordered=optimiseOrder(dLat,dLng,members);
    let fDist=0,fPax=members[0];
    for(const m of members){const d=haversine(+dLat,+dLng,+m.dest_lat,+m.dest_lng);if(d>fDist){fDist=d;fPax=m;}}
    const gs=members.length,ts=members.reduce((s,m)=>s+(m.seats||1),0);
    const[[driver]]=await db.query('SELECT * FROM users WHERE id=?',[req.user.id]);
    const price=calcPrice(haversine(+ordered[0].origin_lat,+ordered[0].origin_lng,+fPax.dest_lat,+fPax.dest_lng),gs);
    const[tr]=await db.query(`INSERT INTO trips(from_loc,to_loc,pickup_time,date,price,total_seats,driver_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,status,is_pool)VALUES(?,?,?,?,?,?,?,?,?,?,?,'upcoming',1)`,[ordered[0].origin_label||'Pool pickup',fPax.dest_label||'Pool destination',group.desired_time,group.desired_date,price,Math.max(ts+2,4),req.user.id,ordered[0].origin_lat,ordered[0].origin_lng,fPax.dest_lat,fPax.dest_lng]);
    const tripId=tr.insertId;
    await buildStops(tripId,ordered,fPax);
    await db.query("UPDATE pool_groups SET trip_id=?,status='confirmed',driver_id=? WHERE id=?",[tripId,req.user.id,inv.group_id]);
    await db.query("UPDATE pool_invitations SET response='declined' WHERE group_id=? AND driver_id!=?",[inv.group_id,req.user.id]);
    await db.query("UPDATE pool_invitations SET response='accepted' WHERE id=?",[inv.id]);
    await db.query("UPDATE pool_requests SET status='confirmed' WHERE pool_group_id=?",[inv.group_id]);
    let cumTime=0;
    for(let i=0;i<ordered.length;i++){
      const m=ordered[i];
      if(i>0)cumTime+=travelMin(haversine(+ordered[i-1].origin_lat,+ordered[i-1].origin_lng,+m.origin_lat,+m.origin_lng));
      const pp=calcPrice(haversine(+m.origin_lat,+m.origin_lng,+m.dest_lat,+m.dest_lng),gs);
      await db.query(`INSERT INTO bookings(trip_id,passenger_id,seats,pickup_note,status)VALUES(?,?,?,?,'confirmed')`,[tripId,m.passenger_id,m.seats||1,m.origin_label||'']);
      await notify(m.passenger_id,`🎉 Smart Pool confirmed! ${driver.name} picks you up on ${group.desired_date} at ${group.desired_time}${cumTime>0?` (+~${cumTime}min)`:''}. Pickup: ${m.origin_label||'your location'}. Fare: ${pp} EGP. Open app to chat.`);
    }
    await db.query('INSERT INTO pool_chats(trip_id,group_id)VALUES(?,?) ON DUPLICATE KEY UPDATE trip_id=VALUES(trip_id)',[tripId,inv.group_id]);
    await notify(req.user.id,`✅ Smart Pool accepted! ${members.length} passenger(s) on ${group.desired_date}. First pickup: ${ordered[0].origin_label||'first stop'}.`);
    res.json({tripId,message:'Pool trip created',member_count:members.length});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.post('/invitations/:id/decline',requireAuth,requireRole('driver'),async(req,res)=>{
  try{
    const[[inv]]=await db.query('SELECT * FROM pool_invitations WHERE id=? AND driver_id=?',[req.params.id,req.user.id]);
    if(!inv)return res.status(404).json({error:'Not found'});
    await db.query("UPDATE pool_invitations SET response='declined' WHERE id=?",[req.params.id]);
    const[[group]]=await db.query('SELECT * FROM pool_groups WHERE id=?',[inv.group_id]);
    if(group&&group.status==='pending'){
      const[pending]=await db.query("SELECT id FROM pool_invitations WHERE group_id=? AND response='pending'",[inv.group_id]);
      if(!pending.length)await suggestDrivers(inv.group_id);
    }
    res.json({message:'Declined'});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.put('/trips/:tripId/stops',requireAuth,requireRole('driver'),async(req,res)=>{
  const{stops}=req.body;
  if(!stops?.length)return res.status(400).json({error:'stops required'});
  try{
    const[[trip]]=await db.query('SELECT * FROM trips WHERE id=? AND driver_id=?',[req.params.tripId,req.user.id]);
    if(!trip)return res.status(403).json({error:'Not your trip'});
    const notified=new Set();
    for(const s of stops){
      const[[prev]]=await db.query('SELECT * FROM trip_stops WHERE id=? AND trip_id=?',[s.id,req.params.tripId]);
      if(!prev)continue;
      await db.query('UPDATE trip_stops SET lat=?,lng=?,label=? WHERE id=?',[s.lat,s.lng,s.label,s.id]);
      if(prev.passenger_id&&!notified.has(prev.passenger_id)){notified.add(prev.passenger_id);await notify(prev.passenger_id,`📍 Your ${prev.type} point updated to: "${s.label||'new location'}". Check your trip.`);}
    }
    const[bks]=await db.query("SELECT DISTINCT passenger_id FROM bookings WHERE trip_id=? AND status='confirmed'",[req.params.tripId]);
    for(const b of bks)if(!notified.has(b.passenger_id))await notify(b.passenger_id,'🔄 Driver updated route stops for your Smart Pool trip.');
    res.json({message:'Updated'});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.post('/trips/:tripId/noshow/:passengerId',requireAuth,requireRole('driver'),async(req,res)=>{
  try{
    const[[trip]]=await db.query('SELECT * FROM trips WHERE id=? AND driver_id=?',[req.params.tripId,req.user.id]);
    if(!trip)return res.status(403).json({error:'Not your trip'});
    await db.query("UPDATE bookings SET status='cancelled' WHERE trip_id=? AND passenger_id=?",[req.params.tripId,req.params.passengerId]);
    await db.query("DELETE FROM trip_stops WHERE trip_id=? AND passenger_id=? AND type='pickup'",[req.params.tripId,req.params.passengerId]);
    await notify(req.params.passengerId,'⚠️ You were marked as no-show. Booking cancelled. Trip continues for others.');
    const[rem]=await db.query("SELECT DISTINCT passenger_id FROM bookings WHERE trip_id=? AND status='confirmed'",[req.params.tripId]);
    for(const b of rem)await notify(b.passenger_id,'ℹ️ A passenger was removed (no-show). Route updated.');
    res.json({message:'No-show processed'});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

// ── CHAT ───────────────────────────────────────────────────────

router.get('/chat/:tripId',requireAuth,async(req,res)=>{
  try{
    if(!await verifyMember(req.params.tripId,req.user.id))return res.status(403).json({error:'Not a member'});
    const[msgs]=await db.query(`SELECT m.*,u.name AS sender_name,u.role AS sender_role FROM pool_chat_messages m JOIN users u ON u.id=m.user_id WHERE m.trip_id=? ORDER BY m.created_at ASC`,[req.params.tripId]);
    res.json(msgs);
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.post('/chat/:tripId',requireAuth,async(req,res)=>{
  const{message}=req.body;
  if(!message?.trim())return res.status(400).json({error:'Message required'});
  try{
    if(!await verifyMember(req.params.tripId,req.user.id))return res.status(403).json({error:'Not a member'});
    await db.query('INSERT INTO pool_chat_messages(trip_id,user_id,message)VALUES(?,?,?)',[req.params.tripId,req.user.id,message.trim()]);
    res.status(201).json({ok:true});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

router.post('/expire-groups',async(req,res)=>{
  try{
    const[exp]=await db.query(`SELECT id FROM pool_groups WHERE status='pending' AND TIMESTAMP(desired_date,desired_time)<DATE_SUB(NOW(),INTERVAL 30 MINUTE)`);
    for(const g of exp){
      await db.query("UPDATE pool_groups SET status='cancelled' WHERE id=?",[g.id]);
      await db.query("UPDATE pool_requests SET status='cancelled' WHERE pool_group_id=?",[g.id]);
      const[members]=await db.query('SELECT passenger_id FROM pool_requests WHERE pool_group_id=?',[g.id]);
      for(const m of members)await db.query('INSERT INTO notifications(user_id,message)VALUES(?,?)',[m.passenger_id,'⏰ No driver accepted your Smart Pool in time. Please try again.']);
    }
    res.json({expired:exp.length});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});


// ── DEBUG (remove after testing) ──────────────────────────────
router.get('/debug',async(req,res)=>{
  try{
    const[requests]=await db.query(`
      SELECT pr.id, pr.passenger_id, u.name, pr.status, pr.desired_date, pr.desired_time,
             pr.origin_lat, pr.origin_lng, pr.origin_label,
             pr.dest_lat, pr.dest_lng, pr.dest_label,
             pr.pool_group_id, pr.seats, pr.created_at
      FROM pool_requests pr
      JOIN users u ON u.id=pr.passenger_id
      ORDER BY pr.created_at DESC
      LIMIT 20
    `);
    const[groups]=await db.query(`SELECT * FROM pool_groups ORDER BY created_at DESC LIMIT 10`);
    
    // Also show why last two requests didn't match
    let matchAnalysis=[];
    if(requests.length>=2){
      const a=requests[0], b=requests[1];
      const od=haversine(+a.origin_lat,+a.origin_lng,+b.origin_lat,+b.origin_lng);
      const dd=haversine(+a.dest_lat,+a.dest_lng,+b.dest_lat,+b.dest_lng);
      const timeDiff=Math.abs((a.desired_time||'00:00').split(':').reduce((h,m,i)=>h+(i===0?+m*60:+m),0) - (b.desired_time||'00:00').split(':').reduce((h,m,i)=>h+(i===0?+m*60:+m),0));
      const sameUser=a.passenger_id===b.passenger_id;
      const sameDate=a.desired_date?.toISOString?.().slice(0,10)===b.desired_date?.toISOString?.().slice(0,10) || String(a.desired_date)===String(b.desired_date);
      matchAnalysis={
        request_1:{id:a.id,user:a.name,passenger_id:a.passenger_id,date:a.desired_date,time:a.desired_time,origin:a.origin_label,dest:a.dest_label},
        request_2:{id:b.id,user:b.name,passenger_id:b.passenger_id,date:b.desired_date,time:b.desired_time,origin:b.origin_label,dest:b.dest_label},
        checks:{
          same_user_FAIL: sameUser,
          same_date: sameDate,
          origin_distance_m: Math.round(od)+' (must be <=15000)',
          dest_distance_m: Math.round(dd)+' (must be <=10000)',
          time_diff_minutes: Math.round(timeDiff)+' (must be <=30)',
          WOULD_MATCH: !sameUser && sameDate && od<=15000 && dd<=10000 && timeDiff<=30
        }
      };
    }
    res.json({requests, groups, matchAnalysis});
  }catch(e){res.status(500).json({error:e.message});}
});

module.exports=router;
module.exports.suggestDriversForGroup=suggestDrivers;
module.exports.calcPrice=calcPrice;
