import { useState, useEffect } from 'react';
import api from '../../../lib/api';

export default function Branding() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/admin/settings?category=branding'),
      // Los ajustes de diploma pueden haber quedado guardados bajo la categoría
      // "general" (comportamiento del PUT genérico), así que se leen aparte por
      // clave para no perderlos ni mostrarlos vacíos tras la primera vez que se guardan.
      api.get('/admin/settings/diploma_signer_name').catch(() => null),
      api.get('/admin/settings/diploma_signer_title').catch(() => null),
    ]).then(([branding, signerName, signerTitle]) => {
      setSettings({
        ...(branding.data.data?.branding || {}),
        ...(signerName?.data?.data ? { diploma_signer_name: signerName.data.data.setting_value } : {}),
        ...(signerTitle?.data?.data ? { diploma_signer_title: signerTitle.data.data.setting_value } : {}),
      });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings', { settings });
      alert('Marca guardada');
    } catch { alert('Error al guardar'); }
    setSaving(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    try {
      await api.post('/admin/settings/logo', fd);
      alert('Logo subido correctamente');
    } catch { alert('Error al subir logo'); }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('signature', file);
    try {
      await api.post('/admin/settings/signature', fd);
      alert('Firma subida correctamente');
    } catch { alert('Error al subir la firma'); }
  };

  if (!loaded) return <div className="text-gray-400 py-8 text-center">Cargando...</div>;

  const colors = [
    { key: 'branding_primary_color', label: 'Navy (primario)' },
    { key: 'branding_secondary_color', label: 'Azul (secundario)' },
    { key: 'branding_accent_color', label: 'Verde (acento)' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-xl font-bold" style={{ color: '#001B71' }}>Marca</h1>
        <p className="text-sm text-gray-500 mt-1">Logotipo, colores, tipografía y pie de correos.</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-gray-600">Logotipo</label>
          <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleLogoUpload}
            className="w-full text-sm mt-1" />
          <p className="text-xs text-gray-400 mt-1">PNG, JPG o SVG. Se usa en correos y reportes PDF.</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 mb-2 block">Colores corporativos</label>
          <div className="grid grid-cols-3 gap-3">
            {colors.map(c => (
              <div key={c.key}>
                <label className="text-xs text-gray-500">{c.label}</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={settings[c.key] || '#001B71'}
                    onChange={e => setSettings({ ...settings, [c.key]: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer" />
                  <input value={settings[c.key] || ''} onChange={e => setSettings({ ...settings, [c.key]: e.target.value })}
                    className="flex-1 border rounded-lg px-2 py-1 text-xs font-mono" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Tipografía títulos</label>
          <input value={settings.branding_font_title || ''} onChange={e => setSettings({ ...settings, branding_font_title: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Libre Baskerville" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Pie de correo</label>
          <textarea value={settings.branding_email_footer || ''} onChange={e => setSettings({ ...settings, branding_email_footer: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 h-20"
            placeholder="AgroAmérica — Todos los derechos reservados" />
        </div>

        <div className="pt-4 border-t border-gray-100">
          <label className="text-sm font-medium text-gray-600 mb-2 block">Diplomas de capacitación</label>
          <p className="text-xs text-gray-400 mb-3">
            Nombre, cargo y firma que aparecen en el diploma que se genera cuando un usuario completa una
            capacitación (aprobando el quiz, si tiene, en su primer intento).
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500">Nombre del firmante</label>
              <input value={settings.diploma_signer_name || ''} onChange={e => setSettings({ ...settings, diploma_signer_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Nombre del Director de TI" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Cargo del firmante</label>
              <input value={settings.diploma_signer_title || ''} onChange={e => setSettings({ ...settings, diploma_signer_title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Director de Tecnología de la Información" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Firma escaneada (opcional)</label>
            <input type="file" accept=".png,.jpg,.jpeg" onChange={handleSignatureUpload} className="w-full text-sm mt-1" />
            <p className="text-xs text-gray-400 mt-1">PNG o JPG con fondo transparente o blanco. Si no sube ninguna, el diploma muestra el nombre en cursiva.</p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#001B71' }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
