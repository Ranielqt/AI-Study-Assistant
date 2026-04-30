import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Chatbot from './Chatbot';
import Summarizer from './Summarizer';
import QuizGenerator from './QuizGenerator';
import { 
  LogOut, 
  MessageSquare, 
  FileText, 
  ClipboardList, 
  LayoutDashboard,
  Menu,
  X,
  GraduationCap
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'chat' | 'summarize' | 'quiz'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const navItems = [
    { id: 'chat', label: 'Tutor', icon: MessageSquare, description: 'Ask questions' },
    { id: 'summarize', label: 'Notes', icon: FileText, description: 'Summarize docs' },
    { id: 'quiz', label: 'Quiz', icon: ClipboardList, description: 'Test yourself' },
  ] as const;

  return (
    <div className="flex h-screen bg-[#FDF2F2] overflow-hidden p-0 lg:p-4">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-72 bg-white lg:bg-transparent z-50 lg:relative lg:translate-x-0 transition-transform duration-300 transform",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 h-full flex flex-col">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-12 w-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-200/50 -rotate-3">
              <GraduationCap size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 leading-none">AI Study</h1>
                <span className="bg-indigo-600 text-white text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter">v2.0</span>
              </div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Assistant</p>
            </div>
          </div>

          <nav className="flex-1 space-y-3">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-4 px-5 py-4 rounded-[1.5rem] transition-all duration-300 group relative",
                  activeTab === item.id 
                    ? "bg-white text-indigo-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)] border border-white" 
                    : "text-slate-500 hover:bg-white/50 hover:text-slate-900"
                )}
              >
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeTab === item.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                )}>
                  <item.icon size={20} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">{item.label}</p>
                  <p className="text-[10px] opacity-60 font-medium">{item.description}</p>
                </div>
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-8">
            <div className="p-5 bg-white/40 backdrop-blur-sm rounded-3xl border border-white/60 mb-6">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">My Profile</p>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                  S
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-white lg:rounded-[3rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.04)] border border-white">
        {/* Top Header */}
        <header className="px-8 py-5 flex items-center justify-between lg:justify-end border-b border-slate-50">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 lg:hidden text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
          >
            <Menu size={24} />
          </button>
          
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
              <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest">System Ready</span>
            </div>
          </div>
        </header>

        {/* Tab View Container */}
        <div className="flex-1 p-6 lg:p-10 overflow-hidden bg-slate-50/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'chat' && <Chatbot />}
              {activeTab === 'summarize' && <Summarizer />}
              {activeTab === 'quiz' && <QuizGenerator />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
