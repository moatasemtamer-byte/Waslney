// frontend/api_tender.js
// Tender-system API helpers — import these alongside your existing api.js
// Usage: import * as tenderApi from '../api_tender.js';

const BASE = '/api/tender';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Company auth ──────────────────────────────────────────
export const companyRegister = (body)         => request('POST', '/company/register', body);
export const companyLogin    = (body)         => request('POST', '/company/login',    body);
export const companyMe       = (token)        => request('GET',  '/company/me', null, token);

// ── Drivers ───────────────────────────────────────────────
export const getCompanyDrivers    = (token)         => request('GET',    '/company/drivers',     null,  token);
export const addCompanyDriver     = (body, token)    => request('POST',   '/company/drivers',     body,  token);
export const deleteCompanyDriver  = (id, token)      => request('DELETE', `/company/drivers/${id}`, null, token);

// ── Cars ──────────────────────────────────────────────────
export const getCompanyCars    = (token)        => request('GET',    '/company/cars',       null,  token);
export const addCompanyCar     = (body, token)  => request('POST',   '/company/cars',       body,  token);
export const deleteCompanyCar  = (id, token)    => request('DELETE', `/company/cars/${id}`, null,  token);

// ── Tenders ───────────────────────────────────────────────
export const getTenders     = ()           => request('GET',  '/tenders');
export const getTender      = (id)         => request('GET',  `/tenders/${id}`);
export const createTender   = (body, tok)  => request('POST', '/tenders',          body, tok);
export const closeTender    = (id,   tok)  => request('POST', `/tenders/${id}/close`, {}, tok);
export const cancelTender   = (id,   tok)  => request('DELETE', `/tenders/${id}`, null, tok);

// ── Bids ──────────────────────────────────────────────────
export const placeBid = (tenderId, amount, token) =>
  request('POST', `/tenders/${tenderId}/bid`, { amount }, token);

// ── Won tenders / assign ──────────────────────────────────
export const getWonTenders       = (token)                        => request('GET',  '/won', null, token);
export const assignDriverCar     = (tenderId, body, token)        => request('POST', `/tenders/${tenderId}/assign`, body, token);

// ── Weekly daily assignments ──────────────────────────────
export const getDailyAssignments = (weekAssignmentId, token)      => request('GET',  `/won/${weekAssignmentId}/daily`, null, token);
export const setDailyAssignment  = (weekAssignmentId, body, token)=> request('POST', `/won/${weekAssignmentId}/daily`, body, token);

// ── Re-tender after week ends ─────────────────────────────
export const reTender = (tenderId, body, tok) => request('POST', `/tenders/${tenderId}/re-tender`, body, tok);

// ── Current assignment for a trip (public-ish, used by passengers) ────────
export const getTripAssignment = (tripId) => request('GET', `/trip/${tripId}/current-assignment`);

// ── Admin live bids ───────────────────────────────────────
export const getAdminLiveBids = (token) => request('GET', '/admin/live-bids', null, token);
