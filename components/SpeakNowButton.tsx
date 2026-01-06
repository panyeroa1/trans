
import React, { useState, useRef, useEffect } from 'react';
import { AudioSource } from '../services/audioService';
import { TranscriptionSegment } from '../App';

interface SpeakNowButtonProps {
  onStart: (source: AudioSource, translate?: boolean) => void;
  onStop: () => void;
  isStreaming: boolean;
  isLoading: boolean;
  onPositionChange?: (pos: { x: number, y: number }) => void;
  initialPosition?: { x: number, y: number };
  stream: MediaStream | null;
  audioSource: AudioSource;
  setAudioSource: (src: AudioSource) => void;
  translationEnabled: boolean;
  setTranslationEnabled: (val: boolean) => void;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
  translationWebhookUrl: string;
  setTranslationWebhookUrl: (url: string) => void;
  showTranscription: boolean;
  setShowTranscription: (val: boolean) => void;
  segments: TranscriptionSegment[];
  cumulativeSource: string;
  liveTurnText: string;
  meetingId?: string;
}

const LANGUAGES = [
  "English (US)", "English (UK)", "Spanish (Spain)", "French (France)", "Dutch (Netherlands)",
  "German (Germany)", "Chinese (Mandarin)", "Japanese", "Korean", "Italian", "Portuguese (Brazil)",
  "Hindi", "Arabic (Standard)", "Russian", "Tagalog (Filipino)", "Medumba", "Baoulé", "Dioula"
].sort((a, b) => a.localeCompare(b));

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
  setWebhookUrl,
  translationWebhookUrl,
  setTranslationWebhookUrl,
  showTranscription,
  setShowTranscription,
  segments,
  cumulativeSource,
  liveTurnText,
  meetingId
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [amplitudes, setAmplitudes] = useState<number[]>(new Array(20).fill(2));
  
  const dragRef = useRef<{ offsetX: number, offsetY: number } | null>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const liveBoxEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (liveBoxEndRef.current) {
      liveBoxEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, cumulativeSource, liveTurnText]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyzer: AnalyserNode | null = null;

    if (stream && isStreaming) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      sourceNode = audioCtx.createMediaStreamSource(stream);
      analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256; 
      analyzer.smoothingTimeConstant = 0.75; 
      sourceNode.connect(analyzer);

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const update = () => {
        if (!analyzer) return;
        analyzer.getByteFrequencyData(dataArray);
        const barsCount = 20;
        const newAmplitudes = new Array(barsCount).fill(2);
        for (let i = 0; i < barsCount; i++) {
          let sum = 0;
          const startBin = Math.floor(i * (40 / barsCount));
          const endBin = Math.floor((i + 1) * (40 / barsCount));
          for (let j = startBin; j < endBin; j++) sum += dataArray[j] || 0;
          const avg = sum / (endBin - startBin || 1);
          newAmplitudes[i] = Math.max(3, (avg / 255) * 28);
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

  const audioSources = [
    { id: AudioSource.MIC, label: 'Microphone', icon: '🎤' },
    { id: AudioSource.INTERNAL, label: 'System Audio', icon: '💻' },
    { id: AudioSource.SHARE, label: 'Tab Audio', icon: '🌐' },
    { id: AudioSource.BOTH, label: 'Mixed Audio', icon: '🎚️' },
  ];

  return (
    <>
      <div 
        ref={buttonContainerRef}
        className="fixed z-[60] select-none touch-none"
        style={{ left: position.x, top: position.y }}
        onMouseDown={onMouseDown}
      >
        <div className="relative flex items-center h-[52px]">
          {isStreaming ? (
            <div className="flex bg-lime-500/90 rounded-full items-center overflow-hidden w-[280px] h-full shadow-[0_20px_50px_rgba(132,204,22,0.3)] border border-white/20 backdrop-blur-xl transition-all duration-300">
              <button
                onClick={onStop}
                className="px-6 h-full text-black font-black transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-95 group"
              >
                <div className="relative flex items-center justify-center">
                  <span className="w-2.5 h-2.5 bg-black rounded-sm group-hover:scale-110 transition-transform" />
                  <span className="absolute w-2.5 h-2.5 bg-black rounded-sm animate-ping opacity-40" />
                </div>
                <span className="text-[12px] uppercase tracking-tighter">Stop</span>
              </button>
              <div className="flex-1 flex items-center justify-center space-x-[2px] pr-5 h-full opacity-90 drag-handle cursor-move">
                {amplitudes.map((h, i) => (
                  <div key={i} className="w-[2px] bg-black rounded-full transition-all duration-75 ease-out" style={{ height: `${h}px`, opacity: 0.4 + (h / 28) * 0.6 }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full shadow-2xl rounded-full overflow-visible border border-white/10 bg-zinc-900/80 backdrop-blur-3xl group/btn">
              {/* Main "Speak Now" Button */}
              <button
                disabled={isLoading}
                onClick={() => onStart(audioSource, translationEnabled)}
                className={`flex items-center px-6 h-full ${isLoading ? 'bg-zinc-700/50' : 'bg-lime-500 hover:bg-lime-400'} text-black font-black rounded-l-full transition-all active:scale-[0.98] group drag-handle cursor-move`}
              >
                {isLoading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full mr-2" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-[12px] uppercase tracking-tight">Speak Now</span>
              </button>

              {/* Arrow Down Dropdown Trigger */}
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-[44px] h-full bg-lime-500/90 hover:bg-lime-400 text-black border-l border-black/10 transition-all flex items-center justify-center active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Settings Trigger */}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="w-[52px] h-full bg-zinc-800/80 hover:bg-zinc-700 text-white rounded-r-full border-l border-white/10 transition-all flex items-center justify-center active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Source Selection Dropdown */}
              {isDropdownOpen && (
                <div 
                  ref={dropdownRef}
                  className="absolute bottom-full mb-3 left-0 w-56 bg-zinc-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl p-2 animate-in slide-in-from-bottom-2 duration-200"
                >
                  <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500 font-black border-b border-white/5 mb-1">Select Source</div>
                  {audioSources.map(src => (
                    <button
                      key={src.id}
                      onClick={() => {
                        setAudioSource(src.id);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center px-4 py-3 rounded-xl text-[12px] font-bold transition-all ${audioSource === src.id ? 'bg-lime-500/10 text-lime-400' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
                    >
                      <span className="mr-3 text-base">{src.icon}</span>
                      {src.label}
                      {audioSource === src.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-lime-500" />}
                    </button>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => setTranslationEnabled(!translationEnabled)}
                      className={`w-full flex items-center px-4 py-3 rounded-xl text-[12px] font-bold transition-all ${translationEnabled ? 'text-cyan-400' : 'text-zinc-400'}`}
                    >
                      <span className="mr-3 text-base">🌐</span>
                      Translation Mode
                      <div className={`ml-auto w-8 h-4 rounded-full transition-all relative ${translationEnabled ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${translationEnabled ? 'left-4.5' : 'left-0.5'}`} />
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[90] backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`fixed top-0 right-0 h-full w-80 bg-zinc-950/98 border-l border-white/10 shadow-[-20px_0_60px_rgba(0,0,0,0.8)] backdrop-blur-3xl z-[100] transform transition-transform duration-500 ease-out p-8 overflow-y-auto scrollbar-hide ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-[11px] uppercase tracking-[0.2em] font-black text-lime-500 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-500 mr-2" /> Settings
          </h3>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-zinc-500 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-8">
          {meetingId && (
            <section className="bg-lime-500/10 border border-lime-500/20 rounded-xl p-4">
              <label className="text-[9px] uppercase tracking-widest text-lime-500 font-black mb-2 block">Recording Session ID</label>
              <div className="text-[11px] font-mono text-lime-200 select-all">{meetingId}</div>
            </section>
          )}

          <section>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-4 block">Translation Target</label>
            <div className="relative">
              <select 
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[12px] font-bold text-zinc-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all appearance-none cursor-pointer"
              >
                {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
              </select>
            </div>
          </section>

          <section>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-4 block">Live Monitoring</label>
            <div className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-[10px] font-mono overflow-y-auto leading-relaxed text-lime-400/80 scrollbar-hide mb-4">
              {cumulativeSource}
              {liveTurnText && <span className="text-white brightness-125 animate-pulse ml-1 inline">{liveTurnText}</span>}
              {!cumulativeSource && !liveTurnText && <span className="text-zinc-700 italic">Listening for audio...</span>}
              <div ref={liveBoxEndRef} />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Show Overlay</span>
              <button 
                onClick={() => setShowTranscription(!showTranscription)}
                className={`w-10 h-5 rounded-full transition-all relative ${showTranscription ? 'bg-lime-500' : 'bg-zinc-700'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${showTranscription ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black block">Webhooks</label>
            <div>
              <span className="text-[9px] text-zinc-600 mb-1.5 font-bold uppercase block">Transcription</span>
              <input
                type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-lime-100 placeholder:text-zinc-800 focus:outline-none focus:ring-2 focus:ring-lime-500/50 transition-all"
              />
            </div>
            <div>
              <span className="text-[9px] text-zinc-600 mb-1.5 font-bold uppercase block">Translation</span>
              <input
                type="text" value={translationWebhookUrl} onChange={(e) => setTranslationWebhookUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-cyan-100 placeholder:text-zinc-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              />
            </div>
          </section>

          <button onClick={() => setIsSidebarOpen(false)} className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] uppercase tracking-[0.2em] font-black rounded-2xl transition-all border border-white/5">
            Close Panel
          </button>
        </div>
      </div>
    </>
  );
};

export default SpeakNowButton;
