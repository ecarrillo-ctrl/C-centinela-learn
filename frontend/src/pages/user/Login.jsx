import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Máximo de recargas automáticas antes de rendirse y mostrar un error.
// Evita el bucle infinito de "Verificando acceso..." cuando el backend/BD falla
// (que además saturaba el rate limiter con ~20 req/min).
const MAX_RETRIES = 2;
const RETRY_KEY = 'loginRetries';

export default function Login() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState('Verificando acceso...');
  const [failed, setFailed] = useState(false);

  // Si ya hay usuario autenticado (via Cloudflare Access), redirigir.
  useEffect(() => {
    if (!loading && user) {
      sessionStorage.removeItem(RETRY_KEY); // reset del contador al lograr entrar
      nav(user.isAdmin || user.is_admin ? '/admin' : '/', { replace: true });
    }
  }, [user, loading, nav]);

  // Si terminó la verificación y NO hay usuario, reintentar un número acotado
  // de veces; luego mostrar un error claro en lugar de recargar indefinidamente.
  useEffect(() => {
    if (loading || user) return;

    const retries = parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10);
    if (retries >= MAX_RETRIES) {
      setFailed(true);
      setStatus('No pudimos verificar tu acceso.');
      return;
    }

    const timer = setTimeout(() => {
      sessionStorage.setItem(RETRY_KEY, String(retries + 1));
      setStatus('Reintentando autenticación corporativa...');
      window.location.reload();
    }, 3000);
    return () => clearTimeout(timer);
  }, [user, loading]);

  const retryNow = () => {
    sessionStorage.removeItem(RETRY_KEY);
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#D1CCBD' }}>
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="mb-6">
          <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>eLearning AgroAmérica</h1>
          <p className="text-gray-500 text-sm mt-1">Plataforma de Concientización en Ciberseguridad</p>
        </div>

        {!failed ? (
          <div className="py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 mb-4" style={{ borderColor: '#001B71' }} />
            <p className="text-sm text-gray-600">{status}</p>
            <p className="text-xs text-gray-400 mt-2">
              La autenticación se realiza a través de Cloudflare Access con su cuenta corporativa.
            </p>
          </div>
        ) : (
          <div className="py-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-sm font-medium text-gray-800">{status}</p>
            <p className="text-xs text-gray-500 mt-2">
              El servicio no respondió. Puede ser temporal. Vuelve a intentarlo en unos
              segundos; si el problema persiste, contacta a TI.
            </p>
            <button
              onClick={retryNow}
              className="mt-5 w-full rounded-lg py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#001B71' }}
            >
              Reintentar
            </button>
            <a
              href="/cdn-cgi/access/logout"
              className="mt-3 block text-xs underline"
              style={{ color: '#2B5597' }}
            >
              Cerrar sesión de Cloudflare y volver a autenticar
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
