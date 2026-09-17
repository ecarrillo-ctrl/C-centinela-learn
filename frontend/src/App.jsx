import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminLayout from './components/AdminLayout';
import LearnerLayout from './components/LearnerLayout';
import Login from './pages/user/Login';
import './lib/i18n';

// Learner pages
import UserDashboard from './pages/user/Dashboard';
import Training from './pages/user/Training';
import Library from './pages/user/Library';
import Badges from './pages/user/Badges';
import Messages from './pages/user/messages/Messages';
import MobileApp from './pages/user/mobile/MobileApp';
import Profile from './pages/user/profile/Profile';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminCampaigns from './pages/admin/Campaigns';
import AdminContent from './pages/admin/Content';
import AdminPhishing from './pages/admin/phishing/Phishing';
import AdminTraining from './pages/admin/training/Training';
import AdminASAP from './pages/admin/asap/ASAP';
import AdminUSBTest from './pages/admin/physical/USBTest';
import AdminQRTest from './pages/admin/physical/QRTest';
import AdminReports from './pages/admin/reports/Reports';
import AuditLog from './pages/admin/AuditLog';
import PersonalSettings from './pages/admin/settings/PersonalSettings';

// Users module sub-pages
import UsersLayout from './pages/admin/users/UsersLayout';
import UsersList from './pages/admin/users/UsersList';
import UserGroups from './pages/admin/users/Groups';
import GroupDetail from './pages/admin/users/GroupDetail';
import UserImport from './pages/admin/users/Import';
import UserProvisioning from './pages/admin/users/Provisioning';
import UserMerge from './pages/admin/users/Merge';
import UserMessages from './pages/admin/users/Messages';
import SecurityRoles from './pages/admin/users/SecurityRoles';

// Settings sub-pages
import SettingsLayout from './pages/admin/settings/SettingsLayout';
import ProgramOwner from './pages/admin/settings/ProgramOwner';
import Licensing from './pages/admin/settings/Licensing';
import Privacy from './pages/admin/settings/Privacy';
import Organization from './pages/admin/settings/Organization';
import Branding from './pages/admin/settings/Branding';
import Placeholders from './pages/admin/settings/Placeholders';
import { UserManagement, PhishingSettings, TrainingSettings, Integrations, ReportsSettings, Labs } from './pages/admin/settings/SettingsPages';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#D1CCBD' }}><p style={{ color: '#001B71' }}>Cargando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.isAdmin && user.is_admin !== 1) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Learner Portal — also used for admin's "Mi capacitacion" via /learn */}
          <Route element={<ProtectedRoute><LearnerLayout /></ProtectedRoute>}>
            <Route index element={<UserDashboard />} />
            <Route path="/learn" element={<UserDashboard />} />
            <Route path="/training" element={<Training />} />
            <Route path="/library" element={<Library />} />
            <Route path="/badges" element={<Badges />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/mobile-app" element={<MobileApp />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          {/* Admin Console */}
          <Route element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/phishing" element={<AdminPhishing />} />
            <Route path="/admin/training" element={<AdminTraining />} />
            <Route path="/admin/users" element={<UsersLayout />}>
              <Route index element={<UsersList />} />
              <Route path="groups" element={<UserGroups />} />
              <Route path="groups/:type/:rawId" element={<GroupDetail />} />
              <Route path="import" element={<UserImport />} />
              <Route path="provisioning" element={<UserProvisioning />} />
              <Route path="merge" element={<UserMerge />} />
              <Route path="messages" element={<UserMessages />} />
              <Route path="security-roles" element={<SecurityRoles />} />
            </Route>
            <Route path="/admin/asap" element={<AdminASAP />} />
            <Route path="/admin/physical/usb" element={<AdminUSBTest />} />
            <Route path="/admin/physical/qr" element={<AdminQRTest />} />
            <Route path="/admin/content" element={<AdminContent />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/campaigns" element={<AdminCampaigns />} />
            <Route path="/admin/audit-log" element={<AuditLog />} />

            {/* Settings with sidebar */}
            <Route path="/admin/settings" element={<SettingsLayout />}>
              <Route index element={<ProgramOwner />} />
              <Route path="personal" element={<PersonalSettings />} />
              <Route path="licensing" element={<Licensing />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="organization" element={<Organization />} />
              <Route path="branding" element={<Branding />} />
              <Route path="placeholders" element={<Placeholders />} />
              <Route path="user-management" element={<UserManagement />} />
              <Route path="phishing" element={<PhishingSettings />} />
              <Route path="training" element={<TrainingSettings />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="reports" element={<ReportsSettings />} />
              <Route path="labs" element={<Labs />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
