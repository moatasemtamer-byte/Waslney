const BASE = '/api';

function getToken() {
  return localStorage.getItem('shuttle_token');
}

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const get    = (p)    => request('GET',    p);
const post   = (p, b) => request('POST',   p, b);
const put    = (p, b) => request('PUT',    p, b);
const del    = (p)    => request('DELETE', p);

// ── AUTH ──────────────────────────────────────────────────
export const sendOTP      = (phone)        => post('/auth/send-otp',  { phone });
export const register     = (body)         => post('/auth/register',  body);
export const login        = (phone, pass)  => post('/auth/login',     { phone, password: pass });
export const getMe        = ()             => get('/auth/me');

// ── TRIPS ─────────────────────────────────────────────────
export const getTrips        = ()    => get('/trips');
export const getDriverTrips  = ()    => get('/trips/driver');
export const getTrip         = (id)  => get(`/trips/${id}`);
export const createTrip      = (b)   => post('/trips', b);
export const updateTrip      = (id,b)=> put(`/trips/${id}`, b);
export const deleteTrip      = (id)  => del(`/trips/${id}`);
export const startTrip       = (id)  => post(`/trips/${id}/start`);
export const completeTrip    = (id)  => post(`/trips/${id}/complete`);

// ── BOOKINGS ──────────────────────────────────────────────
export const getMyBookings   = ()    => get('/bookings/mine');
export const bookTrip        = (b)   => post('/bookings', b);
export const cancelBooking   = (id)  => put(`/bookings/${id}/cancel`);
export const getTripBookings = (tid) => get(`/bookings/trip/${tid}`);

// ── CHECKINS ──────────────────────────────────────────────
export const updateCheckin   = (bookingId, status) => put(`/checkins/${bookingId}`, { status });
export const markStopArrived = (trip_id, stop_index) => post('/checkins/stop-arrived', { trip_id, stop_index });

// ── RATINGS ───────────────────────────────────────────────
export const submitRating    = (b)   => post('/ratings', b);
export const getDriverRatings= (id)  => get(`/ratings/driver/${id}`);

// ── NOTIFICATIONS ─────────────────────────────────────────
export const getNotifications = ()   => get('/notifications/mine');
export const markNotifRead    = ()   => put('/notifications/read-all');

// ── LOCATION ──────────────────────────────────────────────
export const getTripLocation  = (id) => get(`/location/trip/${id}`);
export const getAllLocations   = ()   => get('/location/all');

// ── USERS (admin) ─────────────────────────────────────────
export const getUsers         = ()   => get('/users');
export const getDrivers       = ()   => get('/users/drivers');

// ── POOL RIDES ────────────────────────────────────────────
export const submitPoolRequest    = (b)       => post('/pool/requests', b);
export const getMyPoolRequests    = ()        => get('/pool/requests/mine');
export const getPoolInvitations   = ()        => get('/pool/invitations');
export const acceptPoolInvitation = (id, body={}) => post(`/pool/invitations/${id}/accept`, body);
export const declinePoolInvitation= (id, body={}) => post(`/pool/invitations/${id}/decline`, body);
export const getPoolFarePreview   = (id)         => get(`/pool/invitations/${id}/fare-preview`);
export const updatePoolStops      = (tid, s)  => put(`/pool/trips/${tid}/stops`, { stops: s });
export const getPoolChat          = (tid)     => get(`/pool/chat/${tid}`);
export const sendPoolMessage      = (tid, msg)=> post(`/pool/chat/${tid}`, { message: msg });
export const getNearbyPoolGroups  = (q)       => get(`/pool/groups/nearby?${new URLSearchParams(q)}`);

