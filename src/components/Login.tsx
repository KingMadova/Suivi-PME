import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, Mail, AlertTriangle, Monitor, RotateCw, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '../contexts/OnlineStatusContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { role } = useAuth();
  const { isOnline } = useOnlineStatus();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Veuillez remplir tous les champs.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Fetch latest token including custom claims
      const tokenResult = await user.getIdTokenResult(true);
      const currentRole = tokenResult.claims.role || null;
      
      // Redirect based on role
      if (currentRole === 'admin') {
        navigate('/admin');
      } else if (currentRole === 'gerant') {
        navigate('/gerant');
      } else if (currentRole === 'agent') {
        navigate('/agent');
      } else {
        // Fallback or default redirect
        navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Identifiants incorrects ou utilisateur inexistant.");
      } else if (err.code === 'auth/invalid-email') {
        setError("Format de l'adresse email invalide.");
      } else {
        setError("Erreur de connexion. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Veuillez saisir votre adresse email pour réinitialiser le mot de passe.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailSent(true);
      setError(null);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError("Aucun utilisateur n'est enregistré avec cette adresse email.");
      } else {
        setError("Erreur lors de l'envoi de l'email de réinitialisation. Essayez de nouveau.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 font-sans p-6">
      <div id="login-box" className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden p-8 relative">
        
        {/* Network indicator */}
        <div className="absolute top-4 right-4 flex items-center space-x-1">
          <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-xs text-slate-400 font-mono sm:inline hidden">
            {isOnline ? 'EN LIGNE' : 'HORS LIGNE'}
          </span>
        </div>

        {/* Brand / Logo */}
        <div className="text-center mb-8 mt-2">
          <div className="inline-flex justify-center items-center h-14 w-14 rounded-2xl bg-cyan-550/10 text-cyan-400 border border-cyan-500/25 mb-4 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
            <Monitor className="h-7 w-7 text-cyan-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Gestion Bureautique</h1>
          <p className="text-sm text-slate-400 mt-1.5">Portail de Connexion Multi-Sites</p>
        </div>

        {/* Success Password Reset Message */}
        {isResetMode && resetEmailSent ? (
          <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 rounded-xl p-5 mb-6 text-sm text-left">
            <div className="flex items-center space-x-2.5 mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <span className="font-semibold text-white">Email envoyé avec succès !</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Un lien permettant de configurer un nouveau mot de passe a été envoyé à l'adresse <strong>{email}</strong>.
            </p>
            <button 
              onClick={() => {
                setIsResetMode(false);
                setResetEmailSent(false);
                setError(null);
              }}
              className="mt-4 text-cyan-400 hover:text-cyan-300 font-semibold underline text-xs"
            >
              Retourner à l'écran de connexion
            </button>
          </div>
        ) : (
          <form onSubmit={isResetMode ? handlePasswordReset : handleLogin} className="space-y-5">
            {error && (
              <div className="flex items-start space-x-2.5 bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded-xl p-4 text-sm leading-relaxed">
                <AlertTriangle className="h-5 w-5 text-rose-450 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Email field */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                Adresse Email
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Mail className="h-5 w-5" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@entreprise.com"
                  className="w-full bg-slate-900/60 border border-slate-700 hover:border-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 rounded-xl pl-11 pr-4 py-3 text-slate-100 placeholder-slate-500 Outline-none transition-all duration-250 text-sm"
                  required
                />
              </div>
            </div>

            {/* Password field (only in login mode) */}
            {!isResetMode && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Mot de passe
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true);
                      setError(null);
                    }}
                    className="text-xs text-cyan-400 hover:text-cyan-300/80 transition-colors"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/60 border border-slate-700 hover:border-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 rounded-xl pl-11 pr-4 py-3 text-slate-100 placeholder-slate-500 outline-none transition-all duration-250 text-sm"
                    required
                  />
                </div>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-xl font-bold text-sm tracking-wide text-slate-900 bg-cyan-400 hover:bg-cyan-300 active:scale-[0.98] transition-all duration-200 mt-2 flex justify-center items-center space-x-2 shadow-[0_4px_15px_rgba(34,211,238,0.2)] hover:shadow-[0_4px_25px_rgba(34,211,238,0.35)] disabled:opacity-50 disabled:pointer-events-none`}
            >
              {loading ? (
                <RotateCw className="h-4.5 w-4.5 animate-spin" />
              ) : isResetMode ? (
                <span>Réinitialiser le mot de passe</span>
              ) : (
                <span>Se Connecter</span>
              )}
            </button>

            {/* Toggle back to login */}
            {isResetMode && (
              <button
                type="button"
                onClick={() => {
                  setIsResetMode(false);
                  setError(null);
                }}
                className="w-full text-center text-slate-400 hover:text-slate-350 text-xs transition-colors py-1"
              >
                Retour à la connexion
              </button>
            )}
          </form>
        )}

        {/* Demo hints */}
        <div className="mt-8 border-t border-slate-700/40 pt-5 text-center">
          <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
            Administrateur initial : <span className="text-slate-400">alvineyoka@gmail.com</span>
          </p>
        </div>
      </div>
    </div>
  );
}
