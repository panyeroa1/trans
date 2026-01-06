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
  // Major World Languages & European Variants
  "English (US)", "English (UK)", "English (Australia)", "English (Canada)", "English (India)", "English (Nigeria)", "English (Philippines)",
  "Spanish (Spain)", "Spanish (Mexico)", "Spanish (Latin America)", "Spanish (USA)",
  "Portuguese (Brazil)", "Portuguese (Portugal)", "Portuguese (Angola)", "Portuguese (Mozambique)",
  "German (Germany)", "German (Austria)", "German (Switzerland)",
  "Italian (Italy)", "Italian (Switzerland)",
  "Russian", "Chinese (Mandarin - Simplified)", "Chinese (Mandarin - Traditional)", "Chinese (Cantonese)", "Chinese (Hokkien)",
  "Japanese", "Korean", "Arabic (Modern Standard)", "Arabic (Egyptian)", "Arabic (Gulf)", "Arabic (Maghrebi)", "Arabic (Levantine)",
  "Hindi", "Bengali", "Urdu", "Indonesian", "Vietnamese", "Thai", "Turkish", "Polish", "Ukrainian", "Persian (Farsi)", "Persian (Dari)",
  "Greek", "Hebrew", "Swedish", "Norwegian", "Danish", "Finnish", "Czech", "Slovak", "Hungarian", "Romanian", "Bulgarian", "Serbian", "Croatian",
  "Icelandic", "Estonian", "Latvian", "Lithuanian", "Basque", "Catalan", "Galician", "Albanian", "Macedonian", "Georgian", "Armenian", "Azerbaijani", "Kazakh", "Uzbek", "Tatar", "Mongolian", "Tibetan", "Nepali",

  // French Focus (Comprehensive)
  "French (France)", "French (Canada)", "French (Belgium)", "French (Switzerland)", "French (Cameroon)", "French (DR Congo)", "French (Ivory Coast)", "French (Senegal)", "French (Mali)", "French (Haiti)", "French (Maghreb)",

  // Dutch Focus (Comprehensive)
  "Dutch (Netherlands)", "Dutch (Belgium/Flemish)", "Dutch (Suriname)", "Dutch (Antilles)", "Afrikaans",

  // Cameroon Focus (Dialects & Local Languages)
  "Medumba (Cameroon)", "Melumba (Cameroon)", "Duala (Cameroon)", "Ewondo (Cameroon)", "Bassa (Cameroon)", "Bamum (Cameroon)", "Ghomala' (Cameroon)", "Fulfulde (Cameroon)", "Cameroonian Pidgin English", "Bakweri (Cameroon)", "Bulu (Cameroon)", "Mungaka (Cameroon)", "Ngiemboon (Cameroon)", "Fe'fe' (Cameroon)",

  // Philippines Focus (Dialects & Local Languages)
  "Tagalog (Filipino)", "Cebuano (Bisaya)", "Ilocano", "Hiligaynon (Ilonggo)", "Waray-Waray", "Kapampangan", "Pangasinan", "Bicolano (Central)", "Chavacano (Zamboangueño)", "Maranao", "Maguindanao", "Tausug", "Surigaonon", "Masbateño", "Aklanon", "Ibanag", "Ivatan", "Kinaray-a",

  // Global African Languages
  "Swahili (East Africa)", "Amharic (Ethiopia)", "Yoruba (Nigeria)", "Igbo (Nigeria)", "Hausa (West Africa)", "Zulu (South Africa)", "Xhosa (South Africa)", "Kinyarwanda (Rwanda)", "Wolof (Senegal)", "Shona (Zimbabwe)", "Oromo (Ethiopia/Kenya)", "Somali", "Tigrinya (Eritrea/Ethiopia)", "Lingala (Congo)", "Luganda (Uganda)", "Twi (Ghana)",

  // Global Asian & Oceanic Languages
  "Malay (Malaysia)", "Javanese (Indonesia)", "Sundanese (Indonesia)", "Tamil", "Telugu", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Sinhala (Sri Lanka)", "Burmese (Myanmar)", "Khmer (Cambodia)", "Lao", "Maori (New Zealand)", "Samoan", "Tongan", "Fijian"
].sort((a, b) => a.localeCompare(b));

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    const res = await SupabaseService.testConnection();
    setTestResult(res);
    setTesting(false);
  };

  const copyEmbedCode = () => {
    const url = window.location.href;
    const code = `<iframe src="${url}" style="position:fixed; top:0; left:0; width:100%; height:100%; border:none; z-index:999999; pointer-events:none; background:transparent;" allow="microphone; display-capture"></iframe>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-[360px] bg-zinc-950/95 border border-white/20 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] backdrop-blur-3xl overflow-hidden flex flex-col">
      {/* Draggable Header */}
      <div className="settings-drag-handle px-8 py-6 border-b border-white/5 flex items-center justify-between cursor-move bg-gradient-to-r from-white/5 to-transparent">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 bg-lime-500 rounded-full shadow-[0_0_15px_rgba(132,204,22,0.8)] animate-pulse" />
          <h3 className="text-[12px] uppercase tracking-[0.4em] font-black text-white/90">EBURON CONFIG</h3>
        </div>
        <button onClick={props.onClose} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-white/5">✕</button>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto max-h-[600px] scrollbar-hide">
        {/* Sync Status */}
        <section className="bg-white/5 p-6 rounded-[2rem] border border-white/10 ring-1 ring-white/5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold">Sync Relay</span>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
              props.syncStatus.status === 'success' ? 'bg-lime-500 text-black' : 
              props.syncStatus.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {props.syncStatus.status}
            </span>
          </div>
          <button 
            onClick={handleTest}
            disabled={testing}
            className="w-full bg-white/10 hover:bg-white/20 text-white text-[12px] font-black py-4 rounded-2xl transition-all border border-white/10 active:scale-95 uppercase tracking-widest"
          >
            {testing ? "Probing..." : "Test Supabase"}
          </button>
          {testResult && (
            <p className={`text-[10px] mt-4 text-center font-bold tracking-tight ${testResult.success ? 'text-lime-400' : 'text-red-400'}`}>
              {testResult.message}
            </p>
          )}
        </section>

        {/* Embed Widget */}
        <section className="bg-lime-500/5 p-6 rounded-[2rem] border border-lime-500/20">
          <div className="flex items-center space-x-2 mb-4">
            <span className="text-lg">🔗</span>
            <span className="text-[11px] uppercase tracking-widest text-lime-400 font-black">Embed Widget</span>
          </div>
          <p className="text-[11px] text-zinc-500 mb-4 leading-relaxed font-medium">Add this draggable transcription engine to any website.</p>
          <button 
            onClick={copyEmbedCode}
            className={`w-full py-4 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all active:scale-95 border ${copied ? 'bg-lime-500 text-black border-lime-500' : 'bg-transparent text-lime-400 border-lime-500/30 hover:bg-lime-500/10'}`}
          >
            {copied ? "Copied to Clipboard!" : "Get Iframe Code"}
          </button>
        </section>

        {/* Dialect focus */}
        <section>
          <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-black block mb-4">Phonetic Language Focus</label>
          <select 
            value={props.sourceLanguage}
            onChange={(e) => props.setSourceLanguage(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl p-4 text-[14px] font-bold text-white focus:ring-2 focus:ring-lime-500/50 outline-none transition-all cursor-pointer appearance-none"
          >
            {LANGUAGES.map(l => <option key={l} value={l} className="bg-zinc-950">{l}</option>)}
          </select>
        </section>

        {/* Subtitles Toggle */}
        <section className="flex items-center justify-between bg-white/5 p-5 rounded-[1.5rem] border border-white/5">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-black">Subtitles</span>
            <span className="text-[9px] text-zinc-600 font-medium tracking-tight">Floating Overlay</span>
          </div>
          <button 
            onClick={() => props.setShowTranscription(!props.showTranscription)} 
            className={`w-14 h-7 rounded-full relative transition-all shadow-inner ${props.showTranscription ? 'bg-lime-500' : 'bg-zinc-800'}`}
          >
            <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-xl transition-all ${props.showTranscription ? 'left-8' : 'left-1'}`} />
          </button>
        </section>

        {/* Meeting Details */}
        <section>
          <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-black block mb-4">Session UUID</label>
          <div className="bg-black/50 p-4 rounded-2xl border border-white/5 font-mono text-[12px] text-lime-400/90 text-center tracking-widest shadow-inner select-all">
            {props.meetingId || "GEN_SESSION_REQUIRED"}
          </div>
        </section>

        {/* Raw Log */}
        <div className="pt-8 border-t border-white/10">
          <div className="flex items-center justify-between mb-5">
            <label className="text-[11px] uppercase tracking-widest text-zinc-500 font-black">Live Data Stream</label>
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          </div>
          <div className="w-full h-40 bg-black/60 rounded-[2rem] p-6 text-[12px] font-mono overflow-y-auto text-zinc-400 leading-relaxed scrollbar-hide border border-white/5 shadow-inner italic antialiased">
            {props.cumulativeSource || "// No data captured yet. Initialize voice session to begin relay..."}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;