import React from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OnlineStatusProvider, useOnlineStatus } from './contexts/OnlineStatusContext';

import Login from './components/Login';
import DashboardAgent from './components/DashboardAgent';
import DashboardGerant from './components/DashboardGerant';
import DashboardAdmin from './components/DashboardAdmin';
import { WifiOff, ShieldAlert, RotateCw } from 'lucide-react';

/**
 * 1. ProtectedRoute Shell component
 * Safeguards routes to match authenticated users and exact role allocations.
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'gerant' | 'agent')[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-905 text-slate-100 font-sans">
        <div className="relative flex flex-col items-center">
          <RotateCw className="h-10 w-10 text-cyan-405 animate-spin mb-4" />
          <p className="text-sm font-semibold tracking-wide text-slate-400">Vérification de la session en cours...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    // Force login redirect
    return <Navigate to="/login" replace />;
  }

  if (role && !allowedRoles.includes(role)) {
    // Authorized but incorrect role -> bounce to safe home
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

/**
 * 2. Home redirection shell
 * When loading "/" directly, bounces to respective role page or login.
 */
const HomeRedirect: React.FC = () => {
  const { currentUser, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-910">
        <RotateCw className="h-8 w-8 text-cyan-405 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'admin') {
    return <Navigate to="/admin" replace />;
  } else if (role === 'gerant') {
    return <Navigate to="/gerant" replace />;
  } else if (role === 'agent') {
    return <Navigate to="/agent" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 text-center">
      <div className="max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl space-y-4">
        <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold">Rôle non assigné</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Votre compte est bien authentifié mais aucun rôle ne vous a encore été attribué par l'administrateur de l'entreprise.
        </p>
        <p className="text-xs text-slate-500 font-mono">
          Email : {currentUser.email}
        </p>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <OnlineStatusProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Authentification and roles portals */}
            <Route path="/login" element={<Login />} />

            {/* Protected dashboard views */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <DashboardAdmin />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/gerant" 
              element={
                <ProtectedRoute allowedRoles={['gerant']}>
                  <DashboardGerant />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/agent" 
              element={
                <ProtectedRoute allowedRoles={['agent']}>
                  <DashboardAgent />
                </ProtectedRoute>
              } 
            />

            {/* Default fallback redirects */}
            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </OnlineStatusProvider>
  );
}
