import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { cn } from '../lib/utils';
import { GraduationCap, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface AuthProps {
  onSuccess: () => void;
}

export default function Auth({ onSuccess }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        if (data.user && data.session === null) {
          setError("Verification required: We've sent a link to your email. Please confirm it to finish setting up your account.");
        } else {
          onSuccess();
        }
        return;
      }
      onSuccess();
    } catch (err: any) {
      let friendlyError = err.message;
      if (err.message?.includes('rate limit')) {
        friendlyError = "Sign-up email limit reached (2 per hour for free Supabase tier). To fix this, go to your Supabase Project -> Authentication -> Providers -> Email and DISABLE 'Confirm email'.";
      }
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-page" className="min-h-screen flex items-center justify-center bg-[#FDF2F2] px-4 overflow-hidden relative">
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100 rounded-full blur-[120px] opacity-60 animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-100 rounded-full blur-[120px] opacity-60 animate-pulse [animation-delay:2s]" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full z-10"
      >
        <div className="bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white relative overflow-hidden">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="mx-auto h-16 w-16 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-100 rotate-3">
              <GraduationCap className="h-10 w-10" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">
              {isLogin ? 'Hello!' : 'Join Us'}
            </h2>
            <p className="mt-3 text-slate-500 font-medium">
              Your AI-powered study companion.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-0 outline-none transition-all placeholder:text-slate-300 font-medium"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" title="Password" className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  className="w-full px-5 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-0 outline-none transition-all placeholder:text-slate-300 font-medium"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "p-4 rounded-2xl text-sm font-medium",
                  error.includes('successful') ? "bg-green-50 text-green-700 border border-green-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                )}
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-4 px-4 rounded-2xl shadow-lg shadow-indigo-100 text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-8 text-center pt-8 border-t border-slate-50">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-slate-400 hover:text-indigo-600 font-bold transition-colors"
            >
              {isLogin ? "New here? Create an account" : "Have an account? Sign in"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
