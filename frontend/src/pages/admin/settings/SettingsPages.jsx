import { useState, useEffect } from 'react';
import api from '../../../lib/api';

function SettingsSection({ title, description, children, onSave, saving }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>{title}</h1>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {children}
        {onSave && (
          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3">
            <button onClick={onSave} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#001B71' }}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function useSettings(category) {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get(`/admin/settings?category=${category}`)
      .then(r => { setSettings(r.data.data?.[category] || {}); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [category]);

  const save = async (overrides) => {
    setSaving(true);
    try {
      await api.put('/admin/settings', { settings: overrides || settings });
      alert('Configuración guardada');
    } catch { alert('Error al guardar'); }
    setSaving(false);
  };

  const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
  return { settings, set, save, saving, loaded };
}

function Field({ label, value, onChange, type = 'text', placeholder, hint }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-600">{label}</label>
      {type === 'textarea' ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 h-20"
          placeholder={placeholder} />
      ) : (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
          placeholder={placeholder} />
      )}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export function UserManagement() {
  const { settings, set, save, saving, loaded } = useSettings('integrations');
  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <SettingsSection title="Administración de usuarios"
      description="Proveedor de sincronización, roles de seguridad y configuración de login."
      onSave={() => save(settings)} saving={saving}>
      <div className="space-y-4">
        <Field label="Dominio AD" value={settings.ad_domain} onChange={v => set('ad_domain', v)}
          placeholder="CORPORATIVOAGROAMERICA.CORP" />
        <Field label="Base DN" value={settings.ad_base_dn} onChange={v => set('ad_base_dn', v)}
          placeholder="DC=CORPORATIVOAGROAMERICA,DC=CORP" />
        <Field label="Frecuencia de sync" value="Cada hora (automático)" type="text"
          onChange={() => { }} hint="El sync se ejecuta automáticamente cada hora vía cron job." />
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h4 className="text-sm font-bold text-blue-800 mb-2">Roles disponibles</h4>
          <ul className="text-xs text-blue-700 space-y-1">
            <li><strong>Administrador:</strong> Acceso total a la consola de gestión</li>
            <li><strong>Colaborador:</strong> Solo portal del aprendiz y reportes PAB</li>
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
          <h4 className="text-sm font-bold text-amber-800 mb-2">Login sin contraseña</h4>
          <p className="text-xs text-amber-700">
            La autenticación se realiza a través de Cloudflare Access.
            Los usuarios no necesitan contraseña — se autentican con su cuenta corporativa (SSO).
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

export function PhishingSettings() {
  const { settings, set, save, saving, loaded } = useSettings('phishing');
  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <SettingsSection title="Phishing"
      description="Ajustes de campañas, página de aterrizaje, dominios de tracking y throttling."
      onSave={() => save(settings)} saving={saving}>
      <div className="space-y-4">
        <Field label="URL de página educativa" value={settings.phishing_landing_url}
          onChange={v => set('phishing_landing_url', v)} placeholder="/educacion"
          hint="Los usuarios que hagan clic serán redirigidos a esta página educativa." />
        <Field label="Dominio de tracking" value={settings.phishing_tracking_domain}
          onChange={v => set('phishing_tracking_domain', v)} placeholder="track.empresa.com"
          hint="Dominio personalizado para los enlaces de tracking (pixel y clicks)." />
        <Field label="Throttle (correos/min)" value={settings.phishing_throttle_per_min}
          onChange={v => set('phishing_throttle_per_min', v)} type="number"
          hint="Cantidad máxima de correos de phishing simulado enviados por minuto." />
        <div className="bg-green-50 border border-green-100 rounded-lg p-4">
          <h4 className="text-sm font-bold text-green-800 mb-2">Mejores prácticas</h4>
          <ul className="text-xs text-green-700 space-y-1 list-disc list-inside">
            <li>Use un throttle bajo (20-50/min) para simular envíos realistas</li>
            <li>Configure una landing page educativa clara y no punitiva</li>
            <li>Rote las plantillas entre dificultad fácil, media y difícil</li>
            <li>Espere al menos 2 semanas entre campañas al mismo grupo</li>
          </ul>
        </div>
      </div>
    </SettingsSection>
  );
}

export function TrainingSettings() {
  const { settings, set, save, saving, loaded } = useSettings('training');
  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <SettingsSection title="Capacitación"
      description="Ajustes del LMS, seguimiento SCORM y configuración de evaluaciones."
      onSave={() => save(settings)} saving={saving}>
      <div className="space-y-4">
        <Field label="Puntaje mínimo para aprobar (%)" value={settings.training_pass_score}
          onChange={v => set('training_pass_score', v)} type="number"
          hint="Los usuarios deben obtener este porcentaje o más para completar un quiz." />
        <Field label="Días de recordatorio antes del vencimiento"
          value={settings.training_reminder_days}
          onChange={v => set('training_reminder_days', v)} type="number"
          hint="Se enviará un correo de recordatorio X días antes de la fecha límite." />
        <div>
          <label className="text-sm font-medium text-gray-600">Permitir reintentos</label>
          <select value={settings.training_allow_retake || '1'}
            onChange={e => set('training_allow_retake', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1">
            <option value="1">Sí — ilimitados</option>
            <option value="0">No — un solo intento</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Si se permiten reintentos, el usuario puede tomar el quiz múltiples veces hasta aprobar.
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h4 className="text-sm font-bold text-blue-800 mb-2">SCORM</h4>
          <p className="text-xs text-blue-700">
            Se soportan paquetes SCORM 1.2 y SCORM 2004. El progreso se reporta via
            la API de comunicación SCORM inyectada en el iframe del visor.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

export function Integrations() {
  const { settings, set, save, saving, loaded } = useSettings('integrations');
  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <SettingsSection title="Integraciones de la cuenta"
      description="Active Directory, SMTP, Cloudflare Access y webhooks."
      onSave={() => save(settings)} saving={saving}>
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#001B71' }}>Active Directory / LDAP</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Dominio" value={settings.ad_domain} onChange={v => set('ad_domain', v)}
              placeholder="CORPORATIVOAGROAMERICA.CORP" />
            <Field label="Base DN" value={settings.ad_base_dn} onChange={v => set('ad_base_dn', v)}
              placeholder="DC=CORPORATIVOAGROAMERICA,DC=CORP" />
          </div>
        </div>
        <hr className="border-gray-100" />
        <div>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#001B71' }}>SMTP (Correo)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Host SMTP" value={settings.smtp_host} onChange={v => set('smtp_host', v)}
              placeholder="smtp.office365.com" />
            <Field label="Puerto" value={settings.smtp_port} onChange={v => set('smtp_port', v)}
              placeholder="587" type="number" />
            <Field label="Remitente (From)" value={settings.smtp_from}
              onChange={v => set('smtp_from', v)} placeholder="noreply@agroamerica.com" />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Las credenciales SMTP se configuran vía variables de entorno del servidor (SMTP_USER, SMTP_PASSWORD) por seguridad.
          </p>
        </div>
        <hr className="border-gray-100" />
        <div>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#001B71' }}>Cloudflare Access</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Team domain" value={settings.cf_team_domain}
              onChange={v => set('cf_team_domain', v)} placeholder="agroamerica" />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            El AUD (audience tag) se configura en la variable CF_ACCESS_AUD del servidor.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

export function ReportsSettings() {
  const { settings, set, save, saving, loaded } = useSettings('reports');
  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  return (
    <SettingsSection title="Informes"
      description="Preferencias de reportería, frecuencia y destinatarios."
      onSave={() => save(settings)} saving={saving}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Frecuencia de reporte ejecutivo</label>
          <select value={settings.reports_schedule || 'weekly'}
            onChange={e => set('reports_schedule', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1">
            <option value="daily">Diario</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quincenal</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>
        <Field label="Destinatarios (separados por coma)"
          value={settings.reports_recipients}
          onChange={v => set('reports_recipients', v)}
          placeholder="ciberseguridad@agroamerica.com, gerencia@agroamerica.com"
          hint="El reporte PDF ejecutivo se enviará automáticamente a estos correos." />
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-bold text-gray-700 mb-2">Contenido del reporte</h4>
          <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
            <li>Resumen ejecutivo de riesgo por organización</li>
            <li>Tendencia de phish-prone percentage</li>
            <li>Progreso de capacitación por OU</li>
            <li>Top 10 usuarios de mayor riesgo</li>
            <li>Mapa de calor: OU × tipo de amenaza</li>
          </ul>
        </div>
      </div>
    </SettingsSection>
  );
}

export function Labs() {
  return (
    <SettingsSection title="Laboratorio"
      description="Funciones experimentales. Pueden cambiar o ser removidas sin previo aviso.">
      <div className="space-y-4">
        <LabToggle label="App móvil (PWA)" description="Habilitar enlace de instalación PWA en el portal del aprendiz."
          flagKey="mobileApp" />
        <LabToggle label="Pruebas físicas" description="USB drop test y QR code scan en las instalaciones."
          flagKey="physicalTests" defaultOn />
        <LabToggle label="ASAP" description="Plan automatizado de concientización basado en nivel de riesgo."
          flagKey="asap" defaultOn />
      </div>
    </SettingsSection>
  );
}

function LabToggle({ label, description, flagKey, defaultOn = false }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-gray-100">
      <div>
        <p className="text-sm font-medium" style={{ color: '#001B71' }}>{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button onClick={() => setOn(!on)}
        className={`w-12 h-6 rounded-full transition-colors relative ${on ? 'bg-green-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'left-6' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
