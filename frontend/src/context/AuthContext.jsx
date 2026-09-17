import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Intenta autenticarse:
    // 1. Si hay Bearer token en localStorage, lo usa
    // 2. Si no hay token, hace GET /auth/me igual — el backend detecta
    //    el Cf-Access-Jwt-Assertion que Cloudflare inyecta automáticamente
    //    y autentica al usuario sin necesidad de login manual.
    api.get('/auth/me')
      .then(r => {
        const u = r.data.user;
        // Normalize isAdmin to boolean for consistent checks across the app
        u.isAdmin = u.isAdmin === true || u.is_admin === 1 || u.is_admin === '1';
        setUser(u);
        localStorage.setItem('user', JSON.stringify(u));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    const u = data.user;
    u.isAdmin = u.isAdmin === true || u.is_admin === 1 || u.is_admin === '1';
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    // Redirigir al logout de Cloudflare Access para limpiar la sesión
    window.location.href = '/cdn-cgi/access/logout';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
