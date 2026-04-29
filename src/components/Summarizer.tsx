import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { summarizeNotes } from '../lib/aiAPI';
import { Summary } from '../types';
import { Upload, FileText, Loader2, Sparkles, Trash2, ExternalLink, Plus, History as HistoryIcon, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function Summarizer() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummaries();
  }, []);

  const fetchSummaries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('summaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) setSummaries(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUploading(true);
    setError(null);
    try {
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('notes')
        .upload(filePath, file);

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error("Storage bucket 'notes' not found. Please create a public bucket named 'notes' in your Supabase dashboard and add an 'insert' policy for authenticated users.");
        }
        if (uploadError.message.includes('row-level security')) {
          throw new Error("Permission denied. Please ensure your Supabase storage policies allow authenticated uploads to the 'notes' bucket.");
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('notes')
        .getPublicUrl(filePath);

      let summaryText = '';
      
      if (file.type === 'text/plain' || file.name.endsWith('.md')) {
        const textContent = await file.text();
        summaryText = await summarizeNotes(file.name, undefined, textContent);
      } else {
        // Handle PDF and other binary files via base64 for Gemini multimodal
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const base64Data = await base64Promise;
        summaryText = await summarizeNotes(file.name, { data: base64Data, mimeType: file.type });
      }

      const { data: dbData } = await supabase
        .from('summaries')
        .insert([{
          user_id: user.id,
          file_name: file.name,
          file_url: publicUrl,
          summary_text: summaryText
        }])
        .select()
        .single();

      if (dbData) {
        setSummaries(prev => [dbData, ...prev]);
        setSelectedSummary(dbData);
      }
    } catch (err: any) {
      console.error(err);
      let friendlyError = err.message;
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error?.code === 429) {
          friendlyError = "AI Quota Exceeded. You've reached the daily limit for free AI requests. Please try again later today.";
        } else if (parsed.error?.message) {
          friendlyError = parsed.error.message;
        }
      } catch {
        if (err.message?.includes('quota') || err.message?.includes('429')) {
          friendlyError = "AI Quota Exceeded. You've reached the daily limit for free AI requests. Please try again later.";
        }
      }
      setError(friendlyError);
    } finally {
      setUploading(false);
    }
  };

  const deleteSummary = async (id: string) => {
    const { error: dbError } = await supabase.from('summaries').delete().eq('id', id);
    if (!dbError) {
      setSummaries(prev => prev.filter(s => s.id !== id));
      if (selectedSummary?.id === id) setSelectedSummary(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full overflow-hidden">
      {/* Sidebar - List of Documents */}
      <div className="lg:col-span-4 flex flex-col gap-6 overflow-hidden">
        {/* Upload Button */}
        <div className="relative group">
          <label className={cn(
            "flex items-center gap-4 p-5 bg-indigo-600 rounded-[2rem] cursor-pointer shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98]",
            uploading && "opacity-50 pointer-events-none"
          )}>
            <div className="h-12 w-12 bg-white/20 rounded-2xl flex items-center justify-center text-white">
              {uploading ? <Loader2 className="animate-spin" size={24} /> : <Plus size={24} />}
            </div>
            <div>
              <p className="font-black text-white px-2">
                {uploading ? 'Analyzing...' : 'New Summary'}
              </p>
              <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest px-2">PDF, TXT, or MD</p>
            </div>
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.md,.pdf" />
          </label>
        </div>

        {/* History List */}
        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-50 shadow-[0_10px_40px_rgba(0,0,0,0.02)] p-6 overflow-hidden flex flex-col">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[10px] font-bold leading-relaxed mb-4">
              <p className="uppercase tracking-widest mb-1 opacity-50">Error:</p>
              {error}
              <button 
                onClick={() => setError(null)}
                className="block mt-2 underline uppercase tracking-tighter"
              >
                Dismiss
              </button>
            </div>
          )}
          
          <div className="flex items-center justify-between mb-6 px-2">
            <h3 className="font-black text-slate-800 tracking-tight flex items-center gap-2">
              <HistoryIcon size={18} className="text-indigo-500" />
              History
            </h3>
            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest">
              {summaries.length} total
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {summaries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
                <FileText size={40} className="mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest leading-loose">No documents<br/>recorded yet</p>
              </div>
            ) : (
              summaries.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSummary(s)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all border group",
                    selectedSummary?.id === s.id 
                      ? "bg-indigo-50 border-indigo-100 shadow-sm" 
                      : "bg-white border-transparent hover:bg-slate-50"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                    selectedSummary?.id === s.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    <FileText size={18} />
                  </div>
                  <div className="flex-1 truncate">
                    <p className={cn(
                      "text-sm font-bold truncate",
                      selectedSummary?.id === s.id ? "text-indigo-900" : "text-slate-600"
                    )}>{s.file_name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Viewer */}
      <div className="lg:col-span-8 bg-white rounded-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white overflow-hidden flex flex-col">
        {selectedSummary ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="h-full flex flex-col"
          >
            {/* Toolbar */}
            <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{selectedSummary.file_name}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <Clock size={12} className="text-slate-300" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Summarized on {new Date(selectedSummary.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a 
                  href={selectedSummary.file_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                >
                  <ExternalLink size={20} />
                </a>
                <button 
                  onClick={() => deleteSummary(selectedSummary.id)}
                  className="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-10 prose prose-slate max-w-none">
              <div className="flex items-center gap-2.5 mb-8">
                <div className="h-8 w-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                  <Sparkles size={16} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Key Takeaways</span>
              </div>
              
              <div className="bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100/50">
                <div className="text-slate-600 leading-relaxed font-medium">
                  <ReactMarkdown>
                    {selectedSummary.summary_text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-12">
            <div className="h-32 w-32 bg-slate-50 rounded-[3rem] flex items-center justify-center text-slate-200 mb-8 border-2 border-dashed border-slate-200/50">
              <FileText size={48} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Select a document</h3>
            <p className="max-w-xs text-sm font-medium text-slate-400 leading-relaxed">
              Upload your notes to see them summarized here by your AI companion.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
