import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { getMe } from './api.js';
import { connectSocket } from './socket.js';
import Landing    from './pages/Landing.jsx';
import PassengerDash from './pages/passenger/PassengerDash.jsx';
import DriverDash    from './pages/driver/DriverDash.jsx';
import AdminDash     from './pages/admin/AdminDash.jsx';
import Toast         from './components/Toast.jsx';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);

  const notify = useCallback((title, body, type = 'default') => {
    setToast({ title, body, type });
    setTimeout(() => setToast(null), 3800);
  }, []);

  // Restore session on reload
  useEffect(() => {
    const token = localStorage.getItem('shuttle_token');
    if (!token) { setLoading(false); return; }
    getMe()
      .then(u => { setUser(u); connectSocket(u.id, u.role); })
      .catch(() => localStorage.removeItem('shuttle_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('shuttle_token', token);
    setUser(userData);
    connectSocket(userData.id, userData.role);
  };

  const logout = () => {
    localStorage.removeItem('shuttle_token');
    setUser(null);
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:36 }}>🚐</div>
      <div style={{ color:'#fbbf24', fontFamily:"'Sora',sans-serif", fontSize:13, letterSpacing:'.15em', fontWeight:700 }}>WASLNEY</div>
      <div style={{ width:24, height:24, border:'2px solid #1a1a1a', borderTopColor:'#fbbf24', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, login, logout, notify }}>
      <div style={{ minHeight:'100vh', background:'#000', color:'#fff', fontFamily:"'Sora',sans-serif" }}>
        {!user                       && <Landing />}
        {user?.role === 'passenger'  && <PassengerDash />}
        {user?.role === 'driver'     && <DriverDash />}
        {user?.role === 'admin'      && <AdminDash />}
        <Toast msg={toast} />
      </div>
    </AuthContext.Provider>
  );
}
