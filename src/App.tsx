import React, { useState, useEffect } from 'react';
import { LogIn, FileSpreadsheet, ExternalLink, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { initAuth, googleSignIn, logout } from './lib/firebase';
import LeadDashboard from './components/LeadDashboard';
import { User } from 'firebase/auth';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(true);

  useEffect(() => {
    // Note: initAuth won't give us the token because Auth state doesn't persist OAuth tokens.
    // For this app, we'll require sign-in to get a fresh token.
    const unsubscribe = initAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
        setNeedsAuth(false);
      },
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-[#050505] text-slate-200 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-900/5 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="z-10 w-full max-w-lg text-center space-y-12 glass p-12 rounded-[2rem] glow-emerald"
        >
          <header className="space-y-4">
            <div className="flex justify-center mb-8">
               <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/20 glow-emerald">
                  <ShieldCheck size={40} className="text-black" />
               </div>
            </div>
            <h1 className="text-4xl font-bold tracking-tight leading-tight text-white uppercase">
               Olho que <span className="text-emerald-500">Tudo Vê</span>
            </h1>
            <p className="text-zinc-500 text-[10px] uppercase tracking-[0.3em] font-bold">
               Prospecção Inteligente • CRM Comercial
            </p>
          </header>

          <div className="space-y-8">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full bg-emerald-600 text-black h-14 rounded-xl flex items-center justify-center gap-4 font-bold uppercase tracking-widest text-xs hover:bg-emerald-500 transition-all shadow-xl disabled:opacity-50"
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  <span>Iniciar Conexão Segura</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-6 text-[9px] text-zinc-600 uppercase tracking-widest font-bold">
               <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Sheets
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Gmail
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  Gemini
               </div>
            </div>
          </div>

          <footer className="pt-8 border-t border-white/5">
             <a 
               href="https://sheets.new" 
               target="_blank" 
               rel="noreferrer"
               className="text-[9px] text-zinc-500 hover:text-emerald-400 flex items-center justify-center gap-2 transition-colors font-bold tracking-tighter"
             >
                PREPARAR NOVA PLANILHA NANO-STORAGE <ExternalLink size={10} />
             </a>
          </footer>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <LeadDashboard token={token!} userEmail={user?.email || "unknown@domain.com"} />
    </AnimatePresence>
  );
}
