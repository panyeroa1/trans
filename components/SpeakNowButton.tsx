import React, { useState, useRef, useEffect } from 'react';
import { AudioSource } from '../services/audioService';

interface SpeakNowButtonProps {
  onStart: (source: AudioSource) => void;
  onStop: () => void;
  isStreaming: boolean;
  isLoading: boolean;
  audioSource: AudioSource;
  setAudioSource: (src: AudioSource) => void;
  openSettings: () => void;
  stream: MediaStream | null;
}

const SpeakNowButton: React.FC<SpeakNowButtonProps> = ({ 
  onStart, 
  onStop, 
  isStreaming, 
  isLoading, 
  audioSource, 
  setAudioSource, 
  openSettings,
  stream
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [amplitudes, setAmplitudes] = useState<number[]>(new Array(12).fill(2));
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyzer: AnalyserNode | null = null;
    let animFrame: number;

    if (stream && isStreaming) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 32;
      source.connect(analyzer);
      const data = new Uint8Array(analyzer.frequencyBinCount);

      const update = () => {
        analyzer?.getByteFrequencyData(data);
        setAmplitudes(Array.from(data).slice(0, 12).map(v => Math.max(2, (v / 255) * 20)));
        animFrame = requestAnimationFrame(update);
      };
      update();
      return () => cancelAnimationFrame(animFrame);
    }
  }, [stream, isStreaming]);

  const sources = [
    { id: AudioSource.MIC, label: 'Microphone', icon: '🎤' },
    { id: AudioSource.INTERNAL, label: 'Internal Speaker', icon: '💻' },
    { id: AudioSource.SHARE, label: 'Tab Audio', icon: '🌐' }
  ];

  const currentIcon = sources.find(s => s.id === audioSource)?.icon || '🎤';

  return (
    <div className="relative flex items-center h-[48px]">
      <div className={`flex items-center h-full rounded-full shadow-2xl border border-white/10 backdrop-blur-3xl transition-all duration-500 overflow-hidden ${isStreaming ? 'bg-lime-500 text-black w-[220px]' : 'bg-zinc-900/90 text-white w-[190px]'}`}>
        
        {/* Drag Handle Grip */}
        <div className="control-drag-handle w-6 h-full flex items-center justify-center cursor-move hover:bg-white/5 active:bg-white/10 transition-colors">
          <div className="grid grid-cols-2 gap-[2px]">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`w-[2px] h-[2px] rounded-full ${isStreaming ? 'bg-black/40' : 'bg-white/40'}`} />
            ))}
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => isStreaming ? onStop() : onStart(audioSource)}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center space-x-2 px-2 h-full active:scale-95 transition-all"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : isStreaming ? (
            <div className="flex items-center space-x-1.5">
              <div className="w-2 h-2 rounded-full bg-black animate-pulse" />
              <div className="flex items-end space-x-[2px] h-3">
                {amplitudes.map((h, i) => (
                  <div key={i} className="w-[2px] bg-black rounded-full" style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          ) : (
            <span className="text-base">{currentIcon}</span>
          )}
          <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">
            {isStreaming ? 'Stop' : 'Speak Now'}
          </span>
        </button>

        <div className={`w-[1px] h-6 ${isStreaming ? 'bg-black/10' : 'bg-white/10'}`} />

        {/* Dropdown Arrow */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-10 h-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition-all"
        >
          <svg className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Settings Gear */}
      <button 
        onClick={openSettings}
        className="ml-3 w-[48px] h-[48px] rounded-full bg-zinc-900/90 border border-white/10 flex items-center justify-center hover:bg-zinc-800 transition-all active:scale-90 shadow-2xl"
      >
        <span className="text-lg">⚙️</span>
      </button>

      {/* Source Selection Dropdown */}
      {isDropdownOpen && (
        <div ref={dropdownRef} className="absolute top-full mt-3 left-0 w-56 bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-3xl p-2 z-[90] animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-1 text-[9px] uppercase tracking-widest font-black text-zinc-500 mb-1">Source</div>
          {sources.map(s => (
            <button
              key={s.id}
              onClick={() => { setAudioSource(s.id); setIsDropdownOpen(false); }}
              className={`w-full flex items-center px-4 py-3 rounded-xl text-[12px] font-bold transition-all ${audioSource === s.id ? 'bg-lime-500 text-black' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              <span className="mr-3 text-base">{s.icon}</span>
              {s.label}
              {audioSource === s.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-black" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpeakNowButton;