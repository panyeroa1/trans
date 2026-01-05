
import React, { useState, useRef, useEffect } from 'react';
import { AudioSource } from '../services/audioService';

interface SpeakNowButtonProps {
  onStart: (source: AudioSource) => void;
  onStop: () => void;
  isStreaming: boolean;
  isLoading: boolean;
  onPositionChange?: (pos: { x: number, y: number }) => void;
  initialPosition?: { x: number, y: number };
  stream: MediaStream | null;
  // Settings props
  audioSource: AudioSource;
  setAudioSource: (src: AudioSource) => void;
  translationEnabled: boolean;
  setTranslationEnabled: (val: boolean) => void;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
}

const LANGUAGES = [
  "English", "Spanish", "French", "German", "Chinese", "Japanese", "Korean", "Tagalog", "Russian", "Arabic"
];

const SpeakNowButton: React.FC<SpeakNowButtonProps> = ({ 
  onStart, 
  onStop, 
  isStreaming, 
  isLoading, 
  onPositionChange,
  initialPosition = { x: 100, y: 100 },
  stream,
  audioSource,
  setAudioSource,
  translationEnabled,
  setTranslationEnabled,
  targetLanguage,
  setTargetLanguage,
  webhookUrl,
  setWebhookUrl
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [amplitudes, setAmplitudes] = useState<number[]>(new Array(20).fill(2));
  
  const dragRef = useRef<{ offsetX: number, offsetY: number } | null>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyzer: AnalyserNode | null = null;

    if (stream && isStreaming) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      source = audioCtx.createMediaStreamSource(stream);
      analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256; 
      analyzer.smoothingTimeConstant = 0.75; 
      source.connect(analyzer);

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const update = () => {
        if (!analyzer) return;
        analyzer.getByteFrequencyData(dataArray);
        const barsCount = 20;
        const newAmplitudes = new Array(barsCount).fill(2);
        const vocalBins = 40; 
        const binsPerBar = vocalBins / barsCount;
        for (let i = 0; i < barsCount; i++) {
          let sum = 0;
          const startBin = Math.floor(i * binsPerBar);
          const endBin = Math.floor((i + 1) * binsPerBar);
          let count = 0;
          for (let j = startBin; j < endBin; j++) {
            sum += dataArray[j] || 0;
            count++;
          }
          const avg = count > 0 ? sum / count : 0;
          const intensity = Math.pow(avg / 255, 1.2);
          newAmplitudes[i] = Math.max(3, intensity * 28);
        }
        setAmplitudes(newAmplitudes);
        animationFrameRef.current = requestAnimationFrame(update);
      };
      update();
      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioCtx) audioCtx.close();
      };
    } else {
      setAmplitudes(new Array(20).fill(2));
    }
  }, [stream, isStreaming]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragRef.current) {
        const newPos = {
          x: e.clientX - dragRef.current.offsetX,
          y: e.clientY - dragRef.current.offsetY
        };
        setPosition(newPos);
        onPositionChange?.(newPos);
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onPositionChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.drag-handle')) {
      const rect = buttonContainerRef.current?.getBoundingClientRect();
      if (rect) {
        dragRef.current = {
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top
        };
        setIsDragging(true);
      }
    }
  };

  const toggleStreaming = () => {
    if (isStreaming) {
      onStop();
    } else {
      onStart(audioSource);
    }
  };

  return (
    <>
      {/* Draggable Main Button Container */}
      <div 
        ref={buttonContainerRef}
        className="fixed z-[60] select-none touch-none"
        style={{ left: position.x, top: position.y }}
        onMouseDown={onMouseDown}
      >
        <div className="relative flex items-center h-[48px]">
          {isStreaming ? (
            <div className="flex bg-red-600/90 rounded-full items-center overflow-hidden w-[260px] h-[48px] shadow-2xl border border-white/10 backdrop-blur-xl transition-all duration-300">
              <button
                onClick={onStop}
                className="px-6 h-full text-white font-black transition-all flex items-center justify-center space-x-2 cursor-pointer drag-handle active:scale-95 group"
              >
                <div className="relative flex items-center justify-center">
                  <span className="w-2.5 h-2.5 bg-white rounded-sm group-hover:scale-110 transition-transform" />
                  <span className="absolute w-2.5 h-2.5 bg-white rounded-sm animate-ping opacity-40" />
                </div>
                <span className="text-[13px] uppercase tracking-tighter">Stop</span>
              </button>
              <div className="flex-1 flex items-center justify-center space-x-[2px] pr-5 h-full opacity-90">
                {amplitudes.map((h, i) => (
                  <div key={i} className="w-[2px] bg-white rounded-full transition-all duration-75 ease-out" style={{ height: `${h}px`, opacity: 0.4 + (h / 28) * 0.6 }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-[48px] w-[220px] shadow-2xl rounded-full overflow-visible border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
              {/* LEFT: Speak */}
              <button
                disabled={isLoading}
                onClick={toggleStreaming}
                className={`flex-1 px-5 py-3 ${isLoading ? 'bg-zinc-700/50' : 'bg-lime-500/95 hover:bg-lime-400'} text-black font-black rounded-l-full transition-all flex items-center justify-center space-x-2 cursor-move drag-handle active:scale-[0.98] group`}
              >
                {isLoading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-[13px] uppercase tracking-tighter truncate">Speak</span>
              </button>

              {/* RIGHT: Settings Icon */}
              <button
                disabled={isLoading}
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`w-[56px] h-full ${isLoading ? 'bg-zinc-800/50' : 'bg-zinc-800/80 hover:bg-zinc-700'} text-white rounded-r-full border-l border-white/10 transition-all flex items-center justify-center active:scale-95 group`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-500 ${isSidebarOpen ? 'rotate-90' : 'group-hover:rotate-45'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-[90] backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Right Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-zinc-950/95 border-l border-white/10 shadow-[-20px_0_60px_rgba(0,0,0,0.8)] backdrop-blur-3xl z-[100] transform transition-transform duration-500 ease-out p-8 overflow-y-auto ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between mb-10">
          <h3 className="text-[11px] uppercase tracking-[0.2em] font-black text-lime-500 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-500 mr-2" /> Configuration
          </h3>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 text-zinc-500 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-10">
          {/* Audio Source */}
          <section>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-4 block">Audio Input Source</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: AudioSource.MIC, label: 'Microphone', icon: '🎤' },
                { id: AudioSource.INTERNAL, label: 'System Audio', icon: '💻' },
                { id: AudioSource.SHARE, label: 'Tab Audio', icon: '🌐' },
                { id: AudioSource.BOTH, label: 'Mixed Audio', icon: '🎚️' },
              ].map(src => (
                <button
                  key={src.id}
                  onClick={() => setAudioSource(src.id)}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl text-[10px] font-bold border transition-all gap-2 ${audioSource === src.id ? 'bg-lime-500/10 border-lime-500 text-lime-500 shadow-lg shadow-lime-500/10' : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:border-white/10'}`}
                >
                  <span className="text-lg">{src.icon}</span>
                  {src.label}
                </button>
              ))}
            </div>
          </section>

          {/* Translation Mode */}
          <section className="pt-8 border-t border-white/5">
            <div className="flex items-center justify-between mb-4">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Translation Mode</label>
              <button 
                onClick={() => setTranslationEnabled(!translationEnabled)}
                className={`w-10 h-5 rounded-full transition-all relative ${translationEnabled ? 'bg-lime-500' : 'bg-zinc-700'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${translationEnabled ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>
            {translationEnabled && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <p className="text-[9px] text-zinc-500 mb-2 font-bold uppercase tracking-tight">Target Language</p>
                <div className="relative">
                  <select 
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[12px] font-bold text-zinc-300 focus:outline-none focus:ring-2 focus:ring-lime-500/50 transition-all appearance-none cursor-pointer"
                  >
                    {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Webhook Configuration */}
          <section className="pt-8 border-t border-white/5">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-4 block">Webhook Endpoint (API)</label>
            <div className="relative">
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-api.com/webhooks"
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-[11px] font-mono text-lime-100 placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-lime-500/50 transition-all"
              />
              <div className="mt-2 text-[9px] text-zinc-600 italic">
                Logs will be POSTed here as JSON chunks.
              </div>
            </div>
          </section>
          
          <div className="pt-10 flex flex-col gap-3">
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="w-full py-4 bg-lime-500/10 hover:bg-lime-500/20 text-lime-500 text-[11px] uppercase tracking-[0.2em] font-black rounded-2xl transition-all border border-lime-500/20 shadow-lg shadow-lime-500/5"
            >
              Apply & Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SpeakNowButton;
