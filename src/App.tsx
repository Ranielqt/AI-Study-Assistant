import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { Loader2, XCircle } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    } catch (err: any) {
      console.error('Supabase initialization error:', err);
      setErrorMessage(err.message);
      setLoading(false);
    }
  }, []);

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDF2F2] px-4">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white text-center">
          <div className="h-20 w-20 bg-rose-50 text-rose-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 rotate-3">
            <XCircle size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-3">Setup Required</h2>
          <p className="text-slate-500 font-medium mb-8 leading-relaxed">
            {errorMessage}
          </p>
          <div className="text-sm text-slate-500 bg-slate-50 p-6 rounded-2xl text-left border border-slate-100">
            <p className="font-black text-slate-800 uppercase tracking-widest text-[10px] mb-4">How to fix:</p>
            <ol className="list-decimal ml-5 space-y-2 font-medium">
              <li>Open the <span className="font-bold text-indigo-600">Secrets</span> panel.</li>
              <li>Add <span className="font-bold text-slate-800">VITE_SUPABASE_URL</span>.</li>
              <li>Add <span className="font-bold text-slate-800">VITE_SUPABASE_ANON_KEY</span>.</li>
              <li>Click <span className="font-bold text-indigo-600">Restart Server</span>.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDF2F2]">
        <div className="text-center">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto" />
            <div className="absolute inset-0 h-12 w-12 bg-indigo-100 rounded-full blur-xl opacity-40 animate-pulse mx-auto" />
          </div>
          <p className="mt-6 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Prepping your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full font-sans antialiased">
      {!session ? (
        <Auth onSuccess={() => {}} />
      ) : (
        <Dashboard />
      )}
    </div>
  );
}
