import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { generateStudyResponse, getSmartRecommendations, getAI } from '../lib/aiAPI';
import { Chat as ChatType } from '../types';
import { Send, Loader2, Sparkles, Bot, Clock, Paperclip, X, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function Chatbot() {
  const [messages, setMessages] = useState<ChatType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [attachedFile, setAttachedFile] = useState<{ name: string, data: string, mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchChatHistory();

    // Subscribe to new messages
    const channel = supabase
      .channel('chatbot-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chats'
        },
        (payload) => {
          const newMessage = payload.new as ChatType;
          setMessages(prev => {
            // Avoid duplicates if we already added it optimistically
            if (prev.find(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const fetchChatHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
      // Removed automatic recommendation call on mount to save quota
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        data: reader.result as string,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (text: string = input) => {
    if ((!text.trim() && !attachedFile) || loading) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);
    setError(null);
    const currentInput = text;
    const currentFile = attachedFile;
    
    // Optimistic update: Add the user's message to the UI immediately
    const tempId = 'temp-' + Date.now();
    const optimisticMessage: ChatType = {
      id: tempId,
      user_id: user.id,
      question: currentFile 
        ? `${currentInput}${currentInput ? '\n\n' : ''}[Attached: ${currentFile.name}]`
        : currentInput,
      answer: '', // Empty answer for now
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    setInput('');
    setAttachedFile(null);
    
    try {
      const history = messages.map(m => ([
        { role: "user" as const, parts: [{ text: m.question }] },
        { role: "model" as const, parts: [{ text: m.answer }] }
      ])).flat();

      const ai = getAI();
      const currentParts: any[] = [{ text: currentInput || (currentFile ? `Analyze this file: ${currentFile.name}` : "") }];
      if (currentFile) {
        currentParts.push({
          inlineData: {
            data: currentFile.data.split(',')[1] || currentFile.data,
            mimeType: currentFile.mimeType
          }
        });
      }

      const contents = [...history, { role: "user", parts: currentParts }];

      const result = await ai.models.generateContentStream({
        model: "gemini-2.0-flash",
        contents,
        config: {
          systemInstruction: `You are a helpful AI Study Assistant. Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} and the current time is ${new Date().toLocaleTimeString()}. Answer the student's questions clearly and concisely. Use markdown formatting for readability. If a file is attached, analyze its content to provide the best answer.`,
        },
      });

      let fullResponse = "";
      for await (const chunk of result) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullResponse += chunkText;
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, answer: fullResponse } : m));
        }
      }

      const { data, error: dbError } = await supabase
        .from('chats')
        .insert([{
          user_id: user.id,
          question: optimisticMessage.question,
          answer: fullResponse
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      if (data) {
        setMessages(prev => prev.map(m => m.id === tempId ? data : m));
        
        if (messages.length + 1 >= 3) {
          const recs = await getSmartRecommendations([...messages, data].slice(-5).map(m => m.question));
          setRecommendations(recs);
        }
      }
    } catch (err: any) {
      console.error(err);
      
      let friendlyError = err.message;
      try {
        const parsed = typeof err.message === 'string' ? JSON.parse(err.message) : err;
        if (parsed.error?.code === 429 || parsed.status === "RESOURCE_EXHAUSTED") {
          friendlyError = "AI Quota Exceeded. You've reached the free limit for today. Please wait a few minutes or try again later.";
        } else if (parsed.error?.message) {
          friendlyError = parsed.error.message;
        }
      } catch {
        if (err.message?.includes('quota') || err.message?.includes('429') || err.message?.includes('EXHAUSTED')) {
          friendlyError = "AI Quota Exceeded. You've reached the free limit for today. Please wait a few minutes or try again later.";
        }
      }
      
      setError(friendlyError);

      // Update the optimistic message to show the error instead of just vanishing
      setMessages(prev => prev.map(m => m.id === tempId ? {
        ...m,
        answer: `⚠️ **Error:** ${friendlyError}`
      } : m));

      // Put content back in input only if it's NOT a quota error (so user can retry different phrasing)
      // Actually, user explicitly asked to "remove the text in the text box after sending it", 
      // so we will respect that and NOT restore it.
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.02)] border border-white overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 rotate-3">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="font-black text-slate-900 tracking-tight">AI Tutor</h2>
            <div className="flex items-center gap-3 mt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Active</p>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded-full">
                <Clock size={10} className="text-slate-400" />
                <p className="text-[9px] font-bold text-slate-500 font-mono">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth"
      >
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold leading-relaxed mb-4">
            <p className="uppercase tracking-widest mb-1 opacity-50">Error:</p>
            {error}
            <button 
              onClick={() => setError(null)}
              className="block mt-2 text-[10px] underline uppercase tracking-tighter"
            >
              Dismiss
            </button>
          </div>
        )}

        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="h-20 w-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-400 mb-6 rotate-6">
              <Sparkles size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">What's on your mind?</h3>
            <p className="text-slate-400 font-medium max-w-sm leading-relaxed">
              Ask me anything! From complex physics to literature summaries, I'm here to help you study smarter.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className="space-y-6">
            {/* User Message */}
            <div className="flex justify-end pr-2">
              <div className="bg-slate-900 text-white rounded-[2rem] rounded-tr-none px-6 py-4 max-w-[85%] shadow-xl shadow-slate-200/50">
                <p className="text-sm font-medium leading-relaxed">{m.question}</p>
                <div className="flex items-center gap-1 mt-2 opacity-40 justify-end">
                  <Clock size={10} />
                  <p className="text-[9px] font-bold uppercase tracking-wider">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
            {/* AI Message */}
            <div className="flex gap-4">
              <div className="h-10 w-10 bg-indigo-50 rounded-2xl flex-shrink-0 flex items-center justify-center text-indigo-600 -rotate-6">
                <Bot size={20} />
              </div>
              <div className="bg-white text-slate-700 rounded-[2rem] rounded-tl-none px-6 py-4 max-w-[85%] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border border-slate-50">
                <div className="prose prose-sm prose-indigo leading-relaxed">
                  <ReactMarkdown>{m.answer}</ReactMarkdown>
                </div>
                <div className="flex items-center gap-1 mt-3 text-slate-300">
                  <Clock size={10} />
                  <p className="text-[9px] font-bold uppercase tracking-wider">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-4">
            <div className="h-10 w-10 bg-indigo-50 rounded-2xl flex-shrink-0 flex items-center justify-center text-indigo-400 animate-pulse">
              <Bot size={20} />
            </div>
            <div className="bg-white rounded-[2rem] rounded-tl-none px-6 py-5 w-24 flex items-center shadow-sm border border-slate-50">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Input */}
      <div className="p-8 bg-white border-t border-slate-50">
        <AnimatePresence>
          {attachedFile && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-3 mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100 max-w-sm"
            >
              <div className="h-8 w-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center">
                <FileText size={16} />
              </div>
              <div className="flex-1 truncate">
                <p className="text-[10px] font-black text-indigo-900 truncate leading-none mb-1">{attachedFile.name}</p>
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{Math.round(attachedFile.data.length * 0.75 / 1024)} KB</p>
              </div>
              <button 
                onClick={() => setAttachedFile(null)}
                className="p-1 hover:bg-white rounded-md text-indigo-400 transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="relative flex items-center gap-3"
        >
          <div className="relative flex-1 flex items-center">
            <input
              autoFocus
              type="text"
              placeholder={loading ? "Thinking..." : "What should I explain next?"}
              className="flex-1 bg-slate-50 border-2 border-transparent rounded-2xl pl-6 pr-14 py-4 outline-none focus:bg-white focus:border-indigo-500 transition-all text-sm font-medium placeholder:text-slate-300 disabled:opacity-50"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute right-4 p-2 text-slate-300 hover:text-indigo-600 transition-colors"
            >
              <Paperclip size={20} />
            </button>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".txt,.md,.pdf,.png,.jpg,.jpeg"
            />
          </div>
          <button
            type="submit"
            disabled={(!input.trim() && !attachedFile) || loading}
            className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl shadow-indigo-100 active:scale-95"
          >
            <Send size={22} />
          </button>
        </form>
      </div>
    </div>
  );
}
