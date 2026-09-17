import EmptyState from '../../../components/EmptyState';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';

export default function MobileApp() {
  const flags = useFeatureFlags();
  if (!flags.mobileApp) return <div className="text-center py-16 text-gray-400">App movil no disponible en este momento.</div>;

  return (
    <div className="space-y-6">
      <h1 className="font-title text-2xl font-bold" style={{ color: '#001B71' }}>App Movil</h1>
      <EmptyState title="eLearning AgroAmérica PWA" icon={'\u{1F4F1}'} description="Instale la aplicacion movil para acceder a sus capacitaciones desde cualquier dispositivo. Escanee el codigo QR o visite el enlace de instalacion." />
    </div>
  );
}
