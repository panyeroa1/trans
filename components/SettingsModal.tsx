
import React from 'react';

interface SettingsModalProps {
  onClose: () => void;
  meetingId: string;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  translationEnabled: boolean;
  setTranslationEnabled: (val: boolean) => void;
  showTranscription: boolean;
  setShowTranscription: (val: boolean) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
  translationWebhookUrl: string;
  setTranslationWebhookUrl: (url: string) => void;
  cumulativeSource: string;
}

const LANGUAGES = [
  // Major Global
  "English (US)", "English (UK)", "Spanish (Spain)", "Spanish (Latin America)",
  "Portuguese (Brazil)", "Portuguese (Portugal)", "German (Germany)", "Italian",
  "Russian", "Chinese (Mandarin)", "Chinese (Cantonese)", "Japanese", "Korean",
  "Arabic (Standard)", "Hindi", "Bengali", "Urdu", "Indonesian", "Vietnamese", "Thai",
  "Turkish", "Polish", "Ukrainian", "Persian",

  // French & Dutch Variants
  "French (France)", "French (Canada)", "French (Africa)", "French (Belgium)", "French (Swiss)",
  "Dutch (Netherlands)", "Dutch (Belgium/Flemish)",

  // African Dialects (Cameroon, Ivory Coast, West/Central Africa)
  "Medumba (Cameroon)", "Baoulé (Ivory Coast)", "Dioula (Ivory Coast)", "Ewondo (Cameroon)",
  "Duala (Cameroon)", "Bassa (Cameroon)", "Bamileke (Cameroon)", "Ghomala (Cameroon)",
  "Fon (Benin)", "Wolof (Senegal)", "Yoruba (Nigeria)", "Igbo (Nigeria)", "Hausa (Nigeria)",
  "Swahili (East Africa)", "Zulu (South Africa)", "Xhosa (South Africa)", "Amharic (Ethiopia)",

  // Philippine Dialects
  "Tagalog (Filipino)", "Cebuano (Bisaya)", "Ilocano", "Hiligaynon (Ilonggo)",
  "Waray-Waray", "Kapampangan", "Pangasinan", "Bikol", "Chavacano", "Surigaonon",

  // Others
  "Greek", "Hebrew", "Swedish", "Norwegian", "Danish", "Finnish", "Hungarian", "Czech", "Romanian"
].sort((a, b) => a.localeCompare(b));

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  return (
    <div className="w-[320px] bg-zinc-950/95 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-3xl overflow-hidden flex flex-col">
      {/* Handle / Header */}
      <div className="settings-handle p-5 border-b border-white/5 flex items-center justify-between cursor-move bg-white/5">
        <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-lime-500">Relay Settings</h3>
        <button onClick={props.onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
      </div>

      <div className="p-6 space-y-6 overflow-y-auto max-h-[500px] scrollbar-hide">
        {/* Connection */}
        <section className="bg-white/5 p-4 rounded-2xl border border-white/5">
          <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-black mb-3 block">Connection</label>
          <button 
            onClick={() => (window as any).aistudio.openSelectKey()}
            className="w-full bg-lime-500/10 hover:bg-lime-500/20 text-lime-400 text-[11px] font-bold py-2.5 rounded-xl transition-all border border-lime-500/20"
          >
            Switch API Key
          </button>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[9px] text-zinc-600 mt-2 block text-center underline decoration-zinc-800">Billing Docs</a>
        </section>

        {/* Translation */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Translation</label>
            <button 
              onClick={() => props.setTranslationEnabled(!props.translationEnabled)} 
              className={`w-10 h-5 rounded-full relative transition-all ${props.translationEnabled ? 'bg-cyan-500' : 'bg-zinc-800'}`}
            >
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${props.translationEnabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <select 
            value={props.targetLanguage}
            onChange={(e) => props.setTargetLanguage(e.target.value)}
            className="w-full bg-zinc-900 border border-white/5 rounded-xl p-3 text-[12px] font-bold focus:outline-none"
          >
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </section>

        {/* Visibility */}
        <section className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Overlay Subtitles</label>
          <button 
            onClick={() => props.setShowTranscription(!props.showTranscription)} 
            className={`w-10 h-5 rounded-full relative transition-all ${props.showTranscription ? 'bg-lime-500' : 'bg-zinc-800'}`}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${props.showTranscription ? 'left-6' : 'left-1'}`} />
          </button>
        </section>

        {/* Webhooks */}
        <section className="space-y-4">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black block">Webhooks</label>
          <input 
            type="text" 
            value={props.webhookUrl} 
            onChange={e => props.setWebhookUrl(e.target.value)} 
            placeholder="Relay Endpoint..." 
            className="w-full bg-zinc-900 border border-white/5 rounded-xl p-3 text-[10px] font-mono focus:outline-none" 
          />
        </section>

        {/* History Log */}
        <div className="pt-4 border-t border-white/5">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black block mb-3">Session Log</label>
          <div className="w-full h-24 bg-black/40 rounded-xl p-3 text-[10px] font-mono overflow-y-auto text-zinc-500 leading-relaxed scrollbar-hide">
            {props.cumulativeSource || "No transcription data..."}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
