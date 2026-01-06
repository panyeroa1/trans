import React, { useState } from 'react';
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
}

const LANGUAGES = [
  "English (US)", "English (UK)", "English (Australia)", "English (Canada)", "English (India)", "English (Nigeria)", "English (Philippines)",
  "Spanish (Spain)", "Spanish (Mexico)", "Spanish (Latin America)", "Spanish (USA)",
  "Portuguese (Brazil)", "Portuguese (Portugal)", "German (Germany)", "Italian (Italy)", "Japanese", "Korean", "Chinese (Mandarin)", "French (France)", "Arabic", "Hindi", "Russian"
].sort((a, b) => a.localeCompare(b));

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [newParticipant, setNewParticipant] = useState('');

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

  const handleTest = async () => {
    setTesting(true);
    const res = await SupabaseService.testConnection();
    setTestResult(res);
    setTesting(false);
  };

  return (
    <div className="w-[380px] bg-zinc-950/90 border border-white/10 rounded-[2rem] shadow-3xl backdrop-blur-2xl overflow-hidden flex flex-col font-helvetica-thin">
      <div className="settings-drag-handle px-8 py-6 border-b border-white/5 flex items-center justify-between cursor-move bg-black/20">
        <h3 className="text-[10px] uppercase tracking-[0.5em] font-black text-zinc-500">Conference Settings</h3>
        <button onClick={props.onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto max-h-[600px] scrollbar-hide">
        
        {/* IDS SECTION */}
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Your Unique Identity</label>
            <div className="flex items-center bg-zinc-900/50 border border-white/5 rounded-2xl px-4 py-3 group">
              <code className="text-[12px] font-bold text-lime-400 flex-1">{props.userId}</code>
              <button 
                onClick={() => copyToClipboard(props.userId, 'User ID')}
                className="text-[10px] text-zinc-500 hover:text-white font-black ml-2"
              >
                {copyStatus === 'User ID' ? 'COPIED!' : 'COPY'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Room / Meeting ID</label>
            <div className="flex items-center bg-zinc-900/50 border border-white/5 rounded-2xl px-4 py-3 group">
              <input 
                type="text" 
                value={props.meetingId}
                onChange={(e) => props.setMeetingId(e.target.value)}
                className="bg-transparent text-[12px] font-bold text-white outline-none flex-1"
              />
              <button 
                onClick={() => copyToClipboard(props.meetingId, 'Room ID')}
                className="text-[10px] text-zinc-500 hover:text-white font-black ml-2"
              >
                {copyStatus === 'Room ID' ? 'COPIED!' : 'COPY'}
              </button>
            </div>
          </div>
        </section>

        {/* PARTICIPANTS SECTION */}
        <section className="space-y-3">
          <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Joined Participants</label>
          <div className="flex space-x-2">
            <input 
              type="text"
              value={newParticipant}
              onChange={(e) => setNewParticipant(e.target.value)}
              placeholder="Enter User ID to join..."
              className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-[11px] text-white outline-none focus:ring-1 focus:ring-lime-500"
            />
            <button 
              onClick={addParticipant}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {props.participants.map(p => (
              <div key={p} className="bg-lime-500/10 border border-lime-500/20 px-3 py-1 rounded-full text-[10px] text-lime-400 font-bold flex items-center">
                {p === props.userId ? 'YOU' : p}
              </div>
            ))}
          </div>
        </section>

        {/* LANGUAGE & CONTEXT */}
        <section className="space-y-6 pt-4 border-t border-white/5">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Target Language</label>
            <select 
              value={props.sourceLanguage}
              onChange={(e) => props.setSourceLanguage(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-4 text-[13px] font-bold text-white outline-none"
            >
              {LANGUAGES.map(l => <option key={l} value={l} className="bg-zinc-950">{l}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Translation Vocabulary Context</label>
            <textarea 
              value={props.learningContext}
              onChange={(e) => props.setLearningContext(e.target.value)}
              placeholder="Paste relevant documents or jargon here..."
              className="w-full h-24 bg-zinc-900 border border-white/10 rounded-2xl p-4 text-[11px] text-white outline-none focus:ring-1 focus:ring-lime-500 transition-all resize-none"
            />
          </div>
        </section>

        <section className="flex items-center justify-between bg-white/5 p-5 rounded-[1.5rem] border border-white/5">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Overlay Display</span>
          <button 
            onClick={() => props.setShowTranscription(!props.showTranscription)} 
            className={`w-10 h-5 rounded-full relative transition-all ${props.showTranscription ? 'bg-lime-500' : 'bg-zinc-800'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${props.showTranscription ? 'left-5.5' : 'left-0.5'}`} />
          </button>
        </section>
      </div>
    </div>
  );
};

export default SettingsModal;