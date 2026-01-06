import React, { useState, useEffect, useRef } from 'react';
import { SupabaseService } from '../services/supabaseService';

interface SettingsModalProps {
  onClose: () => void;
  userId: string;
  meetingId: string;
  setMeetingId: (id: string) => void;
  participants: string[];
  setParticipants: (users: string[]) => void;
  sourceLanguage: string;
  setSourceLanguage: (lang: string) => void;
  learningContext: string;
  setLearningContext: (context: string) => void;
  showTranscription: boolean;
  setShowTranscription: (val: boolean) => void;
  cumulativeSource: string;
  syncStatus: { status: 'idle' | 'syncing' | 'error' | 'success', message?: string };
  isTranslatorActive: boolean;
  toggleTranslator: () => void;
  translatorAnalyser: AnalyserNode | null;
}

const LANGUAGES = [
  "English (US)", "English (UK)", "Spanish (Spain)", "Portuguese (Brazil)", "German (Germany)", "Italian (Italy)", "Japanese", "Korean", "Chinese (Mandarin)", "French (France)", "Arabic", "Hindi", "Russian"
].sort((a, b) => a.localeCompare(b));

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [newParticipant, setNewParticipant] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(label);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const addParticipant = () => {
    if (newParticipant.trim() && !props.participants.includes(newParticipant.trim())) {
      props.setParticipants([...props.participants, newParticipant.trim()]);
      setNewParticipant('');
    }
  };

  // Audio Visualizer Loop
  useEffect(() => {
    if (!props.isTranslatorActive || !props.translatorAnalyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = props.translatorAnalyser;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId: number;
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = `rgba(132, 204, 22, ${dataArray[i]/255})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [props.isTranslatorActive, props.translatorAnalyser]);

  return (
    <div className="w-[380px] bg-zinc-950/90 border border-white/10 rounded-[2rem] shadow-3xl backdrop-blur-2xl overflow-hidden flex flex-col font-helvetica-thin">
      
      {/* TRANSLATOR HEADER */}
      <div className="p-8 bg-lime-500/5 border-b border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${props.isTranslatorActive ? 'bg-lime-500 border-lime-400 text-black animate-pulse' : 'bg-zinc-900 border-white/10 text-zinc-500'}`}>
              <span className="text-lg">🔊</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Listen to Translation</p>
              <p className="text-[8px] uppercase tracking-widest text-zinc-500">Read aloud by Orus</p>
            </div>
          </div>
          <button 
            onClick={props.toggleTranslator}
            className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${props.isTranslatorActive ? 'bg-red-500 text-white' : 'bg-white text-black hover:bg-zinc-200'}`}
          >
            {props.isTranslatorActive ? 'STOP' : 'START'}
          </button>
        </div>
        
        {props.isTranslatorActive && (
          <canvas ref={canvasRef} width={300} height={30} className="w-full h-[30px] rounded-lg opacity-60" />
        )}
      </div>

      <div className="settings-drag-handle px-8 py-4 border-b border-white/5 flex items-center justify-between cursor-move bg-black/10">
        <h3 className="text-[9px] uppercase tracking-[0.5em] font-black text-zinc-500">Conference Room</h3>
        <button onClick={props.onClose} className="text-zinc-500 hover:text-white">✕</button>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto max-h-[500px] scrollbar-hide">
        {/* IDS SECTION */}
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Your Identity</label>
            <div className="flex items-center bg-zinc-900/50 border border-white/5 rounded-2xl px-4 py-3">
              <code className="text-[12px] font-bold text-lime-400 flex-1">{props.userId}</code>
              <button onClick={() => copyToClipboard(props.userId, 'User ID')} className="text-[10px] text-zinc-500 hover:text-white font-black ml-2">
                {copyStatus === 'User ID' ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Room ID</label>
            <div className="flex items-center bg-zinc-900/50 border border-white/5 rounded-2xl px-4 py-3">
              <input type="text" value={props.meetingId} onChange={(e) => props.setMeetingId(e.target.value)} className="bg-transparent text-[12px] font-bold text-white outline-none flex-1" />
              <button onClick={() => copyToClipboard(props.meetingId, 'Room ID')} className="text-[10px] text-zinc-500 hover:text-white font-black ml-2">
                {copyStatus === 'Room ID' ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>
        </section>

        {/* PARTICIPANTS SECTION */}
        <section className="space-y-3">
          <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Add Participants</label>
          <div className="flex space-x-2">
            <input type="text" value={newParticipant} onChange={(e) => setNewParticipant(e.target.value)} placeholder="Enter User ID..." className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-[11px] text-white outline-none" />
            <button onClick={addParticipant} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {props.participants.map(p => (
              <div key={p} className="bg-lime-500/10 border border-lime-500/20 px-3 py-1 rounded-full text-[10px] text-lime-400 font-bold">
                {p === props.userId ? 'YOU' : p}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6 pt-4 border-t border-white/5">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Translation Language</label>
            <select value={props.sourceLanguage} onChange={(e) => props.setSourceLanguage(e.target.value)} className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-4 text-[13px] font-bold text-white outline-none">
              {LANGUAGES.map(l => <option key={l} value={l} className="bg-zinc-950">{l}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Context Jargon</label>
            <textarea value={props.learningContext} onChange={(e) => props.setLearningContext(e.target.value)} placeholder="Industry terms..." className="w-full h-20 bg-zinc-900 border border-white/10 rounded-2xl p-4 text-[11px] text-white outline-none resize-none" />
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsModal;