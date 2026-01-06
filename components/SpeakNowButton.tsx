
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [amplitudes, setAmplitudes] = useState<number[]>(new Array(15).fill(2));
  
  const dragRef = useRef<{ offsetX: number, offsetY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

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
      sourceNode = audioCtx.createMediaStreamSource(stream);
      analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 64;
      sourceNode.connect(analyzer);

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const update = () => {
        if (!analyzer) return;
        analyzer.getByteFrequencyData(dataArray);
        const newAmplitudes = Array.from({ length: 15 }, (_, i) => {
          const val = dataArray[i] || 0;
          return Math.max(2, (val / 255) * 24);
        });
        setAmplitudes(newAmplitudes);
        animationFrameRef.current = requestAnimationFrame(update);
      };
      update();
      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioCtx) audioCtx.close();
      };
    } else {
      setAmplitudes(new Array(15).fill(2));
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
    const handleMouseUp = () => setIsDragging(false);
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
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        dragRef.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
        setIsDragging(true);
      }
    }
  };

  const audioSources = [
    { id: AudioSource.MIC, label: 'Microphone', icon: '🎤' },
    { id: AudioSource.INTERNAL, label: 'Internal Speaker', icon: '💻' },
    { id: AudioSource.SHARE, label: 'Tab Audio', icon: '🌐' },
    { id: AudioSource.BOTH, label: 'Mixed Audio', icon: '🎚️' },
  ];

  const currentSourceIcon = audioSources.find(s => s.id === audioSource)?.icon || '🎤';

  return (
    <>
      <div 
        ref={containerRef}
        className="fixed z-[70] select-none"
        style={{ left: position.x, top: position.y }}
        onMouseDown={onMouseDown}
      >
        <div className="relative flex items-center group">
          {/* Main Pill Button */}
          <div className={`flex items-center h-[52px] rounded-full shadow-2xl transition-all duration-300 border border-white/10 backdrop-blur-3xl overflow-hidden ${isStreaming ? 'bg-lime-500 text-black' : 'bg-zinc-900/90 text-white'}`}>
            
            {/* Left: Speak Now / Waveform */}
            <button
              disabled={isLoading}
              onClick={() => isStreaming ? onStop() : onStart(audioSource, translationEnabled)}
              className="flex items-center px-6 h-full transition-all active:scale-[0.97] disabled:opacity-50 drag-handle cursor-move"
            >
              {isLoading ? (
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-3" />
              ) : isStreaming ? (
                <div className="flex items-center space-x-1.5 mr-3">
                  <div className="w-2 h-2 rounded-full bg-black animate-pulse" />
                  <div className="flex items-end space-x-[2px] h-4">
                    {amplitudes.slice(0, 8).map((h, i) => (
                      <div key={i} className="w-[2px] bg-black rounded-full" style={{ height: `${h}px` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <span className="mr-3 text-lg opacity-80 group-hover:scale-110 transition-transform">{currentSourceIcon}</span>
              )}
              <span className="text-[13px] font-black uppercase tracking-widest">
                {isStreaming ? 'Stop Now' : 'Speak Now'}
              </span>
            </button>

            {/* Middle: Separator */}
            <div className={`w-[1px] h-6 ${isStreaming ? 'bg-black/10' : 'bg-white/10'}`} />

            {/* Right: Dropdown Arrow */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`px-4 h-full flex items-center justify-center transition-all active:scale-[0.97] ${isStreaming ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div 
              ref={dropdownRef}
              className="absolute top-full mt-3 right-0 w-64 bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-3xl p-2 animate-in fade-in slide-in-from-top-2 duration-200"
            >
              <div className="px-4 py-2 text-[9px] uppercase tracking-[0.2em] font-black text-zinc-500 border-b border-white/5 mb-1">Select Audio Source</div>
              {audioSources.map(src => (
                <button
                  key={src.id}
                  onClick={() => {
                    setAudioSource(src.id);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center px-4 py-3 rounded-xl text-[12px] font-bold transition-all ${audioSource === src.id ? 'bg-lime-500 text-black' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
                >
                  <span className="mr-3 text-base">{src.icon}</span>
                  {src.label}
                  {audioSource === src.id && <span className={`ml-auto w-1.5 h-1.5 rounded-full ${audioSource === src.id ? 'bg-black' : 'bg-lime-500'}`} />}
                </button>
              ))}

              <div className="mt-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => {
                    setTranslationEnabled(!translationEnabled);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center px-4 py-3 rounded-xl text-[12px] font-bold transition-all ${translationEnabled ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-500 hover:text-white'}`}
                >
                  <span className="mr-3 text-base">🌐</span>
                  Translation: {translationEnabled ? 'ON' : 'OFF'}
                  <div className={`ml-auto w-6 h-3 rounded-full transition-all relative ${translationEnabled ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${translationEnabled ? 'left-3.5' : 'left-0.5'}`} />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsSidebarOpen(true);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center px-4 py-3 rounded-xl text-[12px] font-bold text-zinc-500 hover:bg-white/5 hover:text-white transition-all"
                >
                  <span className="mr-3 text-base">⚙️</span>
                  Full Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay Sidebar (Drawer) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}>
          <div 
            className="absolute right-0 top-0 h-full w-80 bg-zinc-950 border-l border-white/10 p-8 shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[11px] uppercase tracking-widest font-black text-lime-500">Settings</h3>
              <button onClick={() => setIsSidebarOpen(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <div className="space-y-8">
              {meetingId && (
                <div className="bg-lime-500/10 border border-lime-500/20 rounded-xl p-4">
                  <div className="text-[9px] uppercase font-black text-lime-500 mb-2">Active Meeting ID</div>
                  <div className="text-[11px] font-mono text-lime-200 select-all">{meetingId}</div>
                </div>
              )}

              <section>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-3 block">Translation Target</label>
                <select 
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-[12px] font-bold focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all appearance-none cursor-pointer"
                >
                  {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                </select>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Overlay Subtitles</label>
                  <button onClick={() => setShowTranscription(!showTranscription)} className={`w-8 h-4 rounded-full relative ${showTranscription ? 'bg-lime-500' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showTranscription ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                </div>
              </section>

              <section className="space-y-4">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black block">Webhook Integration</label>
                <div>
                  <span className="text-[9px] text-zinc-600 mb-1 font-bold uppercase block">Transcription URL</span>
                  <input type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://..." className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-[11px] font-mono focus:outline-none" />
                </div>
                <div>
                  <span className="text-[9px] text-zinc-600 mb-1 font-bold uppercase block">Translation URL</span>
                  <input type="text" value={translationWebhookUrl} onChange={(e) => setTranslationWebhookUrl(e.target.value)} placeholder="https://..." className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-[11px] font-mono focus:outline-none" />
                </div>
              </section>

              <div className="pt-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-3">Live Log</div>
                <div className="w-full h-32 bg-black rounded-xl p-3 text-[10px] font-mono overflow-y-auto text-lime-400/60 leading-relaxed scrollbar-hide">
                  {cumulativeSource || "No data yet..."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SpeakNowButton;
