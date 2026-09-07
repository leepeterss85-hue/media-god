import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Home from './pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import PlayerRemote from '@/pages/PlayerRemote';
import ProtectedRoute from '@/components/ProtectedRoute';

const AuthenticatedApp = () => {
  const isPlayerRemotePath =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/remote/');

  const {
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
  } = useAuth();

  // The QR phone remote is intentionally public and protected by a long,
  // short-lived bearer session code rather than the TV user's login session.
  if (isPlayerRemotePath) {
    return (
      <Routes>
        <Route path="/remote/:sessionCode" element={<PlayerRemote />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors. Do not let a stale auth_required state
  // push an already authenticated Fire TV session back into the login flow.
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' && !isAuthenticated) {
      navigateToLogin();
      return null;
    }
  }

  const publicOnly = (element) =>
    isAuthenticated
      ? <Navigate to="/" replace />
      : element;

  // Render the main app. Auth screens are public-only: if Fire TV/WebView
  // browser history lands on /login after Google sign-in, immediately replace
  // it with Home instead of showing the login box again.
  return (
    <Routes>
      <Route path="/login" element={publicOnly(<Login />)} />
      <Route path="/register" element={publicOnly(<Register />)} />
      <Route path="/forgot-password" element={publicOnly(<ForgotPassword />)} />
      <Route path="/reset-password" element={publicOnly(<ResetPassword />)} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App