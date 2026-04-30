import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { generateQuiz } from '../lib/aiAPI';
import { Quiz, Summary } from '../types';
import { Trophy, MessageSquare, FileText, Menu, ExternalLink, Trash2, Plus, Clock, History, CheckCircle, XCircle, BrainCircuit, Loader2, Sparkles, ClipboardList, Paperclip, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function QuizGenerator() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [generating, setGenerating] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [topic, setTopic] = useState('');
  const [selectedSummaryId, setSelectedSummaryId] = useState<string>('');
  const [attachedFile, setAttachedFile] = useState<{ name: string, data: string, mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

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
      setTopic('');
      setSelectedSummaryId('');
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: qData } = await supabase.from('quizzes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const { data: sData } = await supabase.from('summaries').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

    if (qData) setQuizzes(qData);
    if (sData) setSummaries(sData);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    let source = '';
    
    if (attachedFile) {
      source = `Please generate a quiz based on the attached document content. (Document: ${attachedFile.name})`;
    } else if (selectedSummaryId) {
      source = summaries.find(s => s.id === selectedSummaryId)?.summary_text || '';
    } else {
      source = topic;
    }
    
    if (!source || generating) return;

    setGenerating(true);
    setError(null);
    try {
      const questions = await generateQuiz(
        source, 
        attachedFile ? { data: attachedFile.data, mimeType: attachedFile.mimeType } : undefined
      );
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data } = await supabase
        .from('quizzes')
        .insert([{
          user_id: user?.id,
          topic_or_notes_ref: attachedFile ? attachedFile.name : (selectedSummaryId ? summaries.find(s => s.id === selectedSummaryId)?.file_name : topic),
          questions_json: questions,
          score: null
        }])
        .select()
        .single();

      if (data) {
        setQuizzes(prev => [data, ...prev]);
        setAttachedFile(null);
        setTopic('');
        setSelectedSummaryId('');
        startQuiz(data);
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
    } finally {
      setGenerating(false);
    }
  };

  const startQuiz = (quiz: Quiz) => {
    setActiveQuiz(quiz);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setShowResults(false);
  };

  const handleAnswer = (optionIndex: number) => {
    if (answers.length > currentQuestionIndex) return;
    const newAnswers = [...answers, optionIndex];
    setAnswers(newAnswers);
  };

  const handleNext = async () => {
    if (currentQuestionIndex < (activeQuiz?.questions_json.length || 0) - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      const score = Math.round((answers.filter((ans, idx) => ans === activeQuiz?.questions_json[idx].correctAnswer).length / (activeQuiz?.questions_json.length || 1)) * 100);
      
      if (activeQuiz) {
        await supabase.from('quizzes').update({ score }).eq('id', activeQuiz.id);
        setQuizzes(prev => prev.map(q => q.id === activeQuiz.id ? { ...q, score } : q));
      }
      setShowResults(true);
    }
  };

  if (activeQuiz && !showResults) {
    const q = activeQuiz.questions_json[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / activeQuiz.questions_json.length) * 100;
    const isAnswered = answers.length > currentQuestionIndex;
    const selectedOption = answers[currentQuestionIndex];

    return (
      <div className="max-w-3xl mx-auto h-full flex flex-col overflow-y-auto custom-scrollbar px-4 pb-20 pt-4">
        <div className="mb-10 flex-shrink-0">
          <div className="flex justify-between items-end mb-4 px-2">
            <div>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">In Progress</p>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight truncate max-w-md">{activeQuiz.topic_or_notes_ref}</h2>
                <button 
                  onClick={() => setActiveQuiz(null)}
                  className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                  title="Quit Quiz"
                >
                  <XCircle size={18} />
                </button>
              </div>
            </div>
            <p className="text-xs font-bold text-slate-400">
              Q <span className="text-indigo-600">{currentQuestionIndex + 1}</span> / {activeQuiz.questions_json.length}
            </p>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/30">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600"
            />
          </div>
        </div>

        <motion.div 
          key={currentQuestionIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 lg:p-12 rounded-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white flex-shrink-0"
        >
          <h3 className="text-xl font-bold text-slate-800 mb-10 leading-relaxed">
            {q.question}
          </h3>

          <div className="space-y-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
                disabled={isAnswered}
                onClick={() => handleAnswer(i)}
                className={cn(
                  "w-full p-5 text-left rounded-2xl font-bold transition-all border flex items-center justify-between group",
                  isAnswered 
                    ? i === q.correctAnswer 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                      : i === selectedOption ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-slate-50 border-transparent text-slate-400 opacity-50"
                    : "bg-slate-50 border-transparent text-slate-600 hover:bg-white hover:border-indigo-600 hover:text-indigo-600 hover:shadow-lg hover:shadow-indigo-50"
                )}
              >
                <span>{opt}</span>
                {isAnswered && i === q.correctAnswer && <CheckCircle size={20} className="text-emerald-500" />}
                {isAnswered && i === selectedOption && i !== q.correctAnswer && <XCircle size={20} className="text-rose-500" />}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {isAnswered && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-10 p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={14} className="text-indigo-600" />
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Assistant Note</span>
                </div>
                <p className="text-sm font-medium text-indigo-900 leading-relaxed">{q.explanation}</p>
                <button
                  onClick={handleNext}
                  className="mt-6 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-600 shadow-xl transition-all active:scale-95"
                >
                  {currentQuestionIndex + 1 === activeQuiz.questions_json.length ? 'Review Stats' : 'Continue'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  if (showResults && activeQuiz) {
    const finalScore = Math.round((answers.filter((ans, idx) => ans === activeQuiz.questions_json[idx].correctAnswer).length / activeQuiz.questions_json.length) * 100);
    const correctCount = answers.filter((ans, idx) => ans === activeQuiz.questions_json[idx].correctAnswer).length;
    
    return (
      <div className="max-w-2xl mx-auto h-full flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-12 rounded-[3.5rem] shadow-[0_40px_80px_rgba(0,0,0,0.06)] border border-white text-center w-full"
        >
          <div className="inline-flex items-center justify-center h-24 w-24 bg-indigo-50 text-indigo-600 rounded-[2.5rem] mb-8 rotate-3 shadow-xl shadow-indigo-100">
            <Trophy size={48} />
          </div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Great Work!</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-10">Review Complete</p>
          
          <div className="relative inline-block mb-12">
            <div className="text-7xl font-black text-slate-900 leading-none">{finalScore}%</div>
            <div className="absolute -top-6 -right-6 h-12 w-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center font-black animate-bounce">
              <Sparkles size={20} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-12">
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-3xl font-black text-slate-900">{correctCount}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Correct</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-3xl font-black text-slate-900 text-rose-500">{activeQuiz.questions_json.length - correctCount}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Retry</p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => startQuiz(activeQuiz)}
              className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
            >
              Retake Now
            </button>
            <button
              onClick={() => setActiveQuiz(null)}
              className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all active:scale-95"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full overflow-hidden">
      {/* Create Quiz Side */}
      <div className="lg:col-span-12 xl:col-span-5 space-y-8">
        <div className="bg-white p-10 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.02)] border border-white">
          <div className="flex items-center gap-4 mb-10">
            <div className="h-14 w-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-indigo-100 rotate-3 animate-pulse">
              <BrainCircuit size={30} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Learn Faster</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">AI Guided Quiz</p>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-8">
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
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Knowledge Source</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select
                  className="w-full bg-slate-50 border-2 border-transparent rounded-[1.5rem] px-6 py-4 outline-none focus:bg-white focus:border-indigo-600 transition-all font-bold text-slate-700 appearance-none disabled:opacity-50"
                  value={selectedSummaryId}
                  disabled={!!attachedFile}
                  onChange={(e) => { setSelectedSummaryId(e.target.value); if(e.target.value) setTopic(''); }}
                >
                  <option value="">Choose a summary</option>
                  {summaries.map(s => <option key={s.id} value={s.id}>{s.file_name}</option>)}
                </select>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 py-4 rounded-[1.5rem] border-2 border-dashed font-bold transition-all",
                      attachedFile 
                        ? "bg-indigo-50 border-indigo-200 text-indigo-600" 
                        : "bg-slate-50 border-slate-200 text-slate-400 hover:border-indigo-400 hover:text-indigo-600"
                    )}
                  >
                    <Paperclip size={18} />
                    <span className="text-sm truncate max-w-[120px]">
                      {attachedFile ? attachedFile.name : 'Upload Doc'}
                    </span>
                    {attachedFile && (
                      <X 
                        size={14} 
                        className="ml-auto hover:text-rose-500" 
                        onClick={(e) => { e.stopPropagation(); setAttachedFile(null); }}
                      />
                    )}
                  </button>
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".txt,.md,.pdf"
                  />
                </div>
              </div>
            </div>

            {!selectedSummaryId && !attachedFile && (
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Write your topic</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. Calculus Basics, Civil War..."
                    className="w-full bg-slate-50 border-2 border-transparent rounded-[1.5rem] px-6 py-4 outline-none focus:bg-white focus:border-indigo-600 transition-all font-bold text-slate-700 placeholder:text-slate-300"
                    value={topic}
                    onChange={(e) => { setTopic(e.target.value); if(e.target.value) setSelectedSummaryId(''); }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={generating || (!topic && !selectedSummaryId && !attachedFile)}
              className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-sm hover:bg-slate-900 transition-all active:scale-[0.98] disabled:opacity-30 shadow-xl shadow-indigo-100"
            >
              {generating ? (
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="animate-spin" size={20} />
                  <span>Curating Knowledge...</span>
                </div>
              ) : 'Generate Quiz'}
            </button>
          </form>
        </div>
      </div>

      {/* History Side */}
      <div className="lg:col-span-12 xl:col-span-7 flex flex-col overflow-hidden">
        <div className="flex-1 bg-white rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.02)] border border-white p-10 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Progress Log</h3>
            <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
              <History size={20} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar px-2">
            {quizzes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-20">
                <ClipboardList size={60} className="mb-4" />
                <p className="text-xs font-black uppercase tracking-[0.2em]">Start your first test</p>
              </div>
            ) : (
              quizzes.map(q => (
                <div 
                  key={q.id}
                  className="bg-slate-50 p-6 rounded-[2rem] flex items-center justify-between hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200 group"
                >
                  <div className="flex items-center gap-5 truncate">
                    <div className={cn(
                      "h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm font-black text-lg border-2",
                      (q.score || 0) >= 80 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                      (q.score || 0) >= 50 ? "bg-amber-50 border-amber-100 text-amber-600" :
                      "bg-rose-50 border-rose-100 text-rose-600"
                    )}>
                      {q.score !== null ? `${q.score}%` : '--'}
                    </div>
                    <div className="truncate">
                      <h4 className="font-extrabold text-slate-900 truncate">{q.topic_or_notes_ref}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {q.questions_json.length} Qs • {new Date(q.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => startQuiz(q)}
                    className="h-11 px-6 bg-white rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-900 shadow-sm hover:bg-indigo-600 hover:text-white transition-all active:scale-95 border border-slate-100"
                  >
                    Load
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}