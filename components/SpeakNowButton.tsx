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

  const sources = [
    { id: AudioSource.MIC, label: 'Microphone', icon: '🎤' },
    { id: AudioSource.INTERNAL, label: 'System Audio', icon: '💻' },
    { id: AudioSource.SHARE, label: 'Tab Only', icon: '🌐' }
  ];

  return (
    <div className="flex items-center space-x-2">
      <div className={`flex items-center h-[52px] rounded-full shadow-2xl border border-white/20 backdrop-blur-3xl transition-all duration-300 ${isStreaming ? 'bg-lime-500 w-[240px]' : 'bg-zinc-900 w-[200px]'}`}>
        
        {/* Drag Handle */}
        <div className="drag-handle h-full w-8 flex items-center justify-center cursor-move hover:bg-white/5 rounded-l-full transition-colors">
          <div className="grid grid-cols-2 gap-1 opacity-40">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`w-1 h-1 rounded-full ${isStreaming ? 'bg-black' : 'bg-white'}`} />
            ))}
          </div>
        </div>

        {/* Main Speak Now Button */}
        <button
          onClick={() => isStreaming ? onStop() : onStart(audioSource)}
          disabled={isLoading}
          className={`flex-1 h-full flex items-center justify-center space-x-3 px-2 ${isStreaming ? 'text-black' : 'text-white'} font-black uppercase tracking-widest text-[12px] active:scale-95 transition-all`}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-lg">{isStreaming ? '⏹' : '🎤'}</span>
              <span>{isStreaming ? 'Stop' : 'Speak Now'}</span>
            </div>
          )}
        </button>

        <div className={`w-[1px] h-6 ${isStreaming ? 'bg-black/20' : 'bg-white/20'}`} />

        {/* Source Switcher Arrow */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`w-12 h-full flex items-center justify-center hover:bg-white/5 rounded-r-full transition-all ${isDropdownOpen ? 'rotate-180' : ''}`}
        >
          <svg className={`w-4 h-4 ${isStreaming ? 'text-black' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Independent Settings Button */}
      <button 
        onClick={openSettings}
        className="w-[52px] h-[52px] rounded-full bg-zinc-900 border border-white/20 flex items-center justify-center hover:bg-zinc-800 transition-all active:scale-90 shadow-2xl backdrop-blur-3xl"
      >
        <span className="text-xl">⚙️</span>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div ref={dropdownRef} className="absolute top-[60px] left-0 w-64 bg-zinc-950/95 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-3xl p-3 z-[999] animate-in fade-in slide-in-from-top-4">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500 mb-2 border-b border-white/5">Audio Input</div>
          {sources.map(s => (
            <button
              key={s.id}
              onClick={() => { setAudioSource(s.id); setIsDropdownOpen(false); }}
              className={`w-full flex items-center px-4 py-3.5 rounded-2xl text-[13px] font-bold transition-all mb-1 ${audioSource === s.id ? 'bg-lime-500 text-black shadow-lg shadow-lime-500/20' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              <span className="mr-4 text-xl">{s.icon}</span>
              {s.label}
              {audioSource === s.id && <div className="ml-auto w-2 h-2 rounded-full bg-black" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpeakNowButton;