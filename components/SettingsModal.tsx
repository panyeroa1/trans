import React, { useState } from 'react';
import { SupabaseService } from '../services/supabaseService';

interface SettingsModalProps {
  onClose: () => void;
  meetingId: string;
  sourceLanguage: string;
  setSourceLanguage: (lang: string) => void;
  showTranscription: boolean;
  setShowTranscription: (val: boolean) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
  cumulativeSource: string;
  syncStatus: { status: 'idle' | 'syncing' | 'error' | 'success', message?: string };
}

const LANGUAGES = [
  "English (US)", "English (UK)", "Spanish (Spain)", "Spanish (Latin America)",
  "Portuguese (Brazil)", "Portuguese (Portugal)", "German (Germany)", "Italian",
  "Russian", "Chinese (Mandarin)", "Chinese (Cantonese)", "Japanese", "Korean",
  "Arabic (Standard)", "Hindi", "Bengali", "Urdu", "Indonesian", "Vietnamese", "Thai",
  "Turkish", "Polish", "Ukrainian", "French (France)", "Dutch (Netherlands)",
  "Tagalog (Filipino)", "Cebuano (Bisaya)", "Medumba (Cameroon)", "Swahili"
].sort((a, b) => a.localeCompare(b));

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    const res = await SupabaseService.testConnection();
    setTestResult(res);
    setTesting(false);
  };

  return (
    <div className="w-[340px] bg-zinc-950/90 border border-white/20 rounded-[40px] shadow-2xl backdrop-blur-3xl overflow-hidden flex flex-col border border-white/20">
      {/* Draggable Header */}
      <div className="settings-drag-handle px-6 py-5 border-b border-white/5 flex items-center justify-between cursor-move bg-white/5">
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-lime-500 rounded-full shadow-[0_0_10px_rgba(132,204,22,0.8)]" />
          <h3 className="text-[11px] uppercase tracking-[0.3em] font-black text-white/80">Config Relay</h3>
        </div>
        <button onClick={props.onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">✕</button>
      </div>

      <div className="p-7 space-y-7 overflow-y-auto max-h-[550px] scrollbar-hide">
        {/* Sync Status */}
        <section className="bg-white/5 p-5 rounded-3xl border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Sync Health</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
              props.syncStatus.status === 'success' ? 'bg-lime-500/20 text-lime-400' : 
              props.syncStatus.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {props.syncStatus.status}
            </span>
          </div>
          <button 
            onClick={handleTest}
            disabled={testing}
            className="w-full bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold py-3 rounded-2xl transition-all border border-white/5 active:scale-95"
          >
            {testing ? "Establishing..." : "Check Database"}
          </button>
          {testResult && (
            <p className={`text-[9px] mt-3 text-center font-bold ${testResult.success ? 'text-lime-400' : 'text-red-400'}`}>
              {testResult.message}
            </p>
          )}
        </section>

        {/* Dialect focus */}
        <section>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black block mb-3">Phonetic Focus</label>
          <select 
            value={props.sourceLanguage}
            onChange={(e) => props.setSourceLanguage(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-4 text-[13px] font-bold text-white focus:ring-2 focus:ring-lime-500/50 outline-none transition-all cursor-pointer"
          >
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </section>

        {/* Subtitles Toggle */}
        <section className="flex items-center justify-between bg-white/5 p-4 rounded-3xl border border-white/5">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Overlay Subtitles</span>
          <button 
            onClick={() => props.setShowTranscription(!props.showTranscription)} 
            className={`w-12 h-6 rounded-full relative transition-all shadow-inner ${props.showTranscription ? 'bg-lime-500' : 'bg-zinc-800'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${props.showTranscription ? 'left-7' : 'left-1'}`} />
          </button>
        </section>

        {/* Meeting Details */}
        <section>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black block mb-3">Session Identity</label>
          <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 font-mono text-[11px] text-lime-400/80 text-center tracking-tighter">
            {props.meetingId || "Awaiting Start..."}
          </div>
        </section>

        {/* Raw Log */}
        <div className="pt-6 border-t border-white/10">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black block mb-4 text-center">Live Transcript Feed</label>
          <div className="w-full h-32 bg-black/40 rounded-3xl p-5 text-[11px] font-mono overflow-y-auto text-zinc-500 leading-relaxed scrollbar-hide border border-white/5 italic">
            {props.cumulativeSource || "Start speaking to generate history..."}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;