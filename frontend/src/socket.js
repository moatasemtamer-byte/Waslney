import { io } from 'socket.io-client';

const socket = io('/', { autoConnect: false, transports: ['websocket', 'polling'] });

export function connectSocket(userId, role, tripId = null) {
  if (!socket.connected) socket.connect();
  socket.emit('auth', { userId, role, tripId });
  if (role === 'admin') socket.emit('join:admin');
}

export function watchTrip(tripId) {
  socket.emit('watch:trip', { tripId });
}

export function sendLocation(tripId, lat, lng) {
  socket.emit('driver:location', { tripId, lat, lng });
}

export function emitFareProposed(tripId, farePerPassenger, driverName, passengerIds) {
  socket.emit('fare:proposed', { tripId, farePerPassenger, driverName, passengerIds });
}

export function emitTripStarted(tripId)   { socket.emit('trip:started',   { tripId }); }
export function emitTripCompleted(tripId) { socket.emit('trip:completed', { tripId }); }
export function emitPoolConfirmed(tripId, passengerIds) { socket.emit('pool:confirmed', { tripId, passengerIds }); }
export function emitCheckinUpdate(tripId, bookingId, status) {
  socket.emit('checkin:update', { tripId, bookingId, status });
}

export default socket;
