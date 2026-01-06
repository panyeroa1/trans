import React, { useState, useRef, useEffect } from 'react';
import { AudioSource } from '../services/audioService';

interface SpeakNowButtonProps {
  onStart: (source: AudioSource) => void;
  onStop: () => void;
  isStreaming: boolean;
  isLoading: boolean;
  isVADActive: boolean;
  audioSource: AudioSource;
  setAudioSource: (src: AudioSource) => void;
  openSettings: () => void;
  stream: MediaStream | null;
  isHost: boolean; // Tracks if current user is allowed to speak
}

const SpeakNowButton: React.FC<SpeakNowButtonProps> = ({ 
  onStart, 
  onStop, 
  isStreaming, 
  isLoading, 
  audioSource, 
  setAudioSource, 
  openSettings,
  isHost
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
    { id: AudioSource.INTERNAL, label: 'System Audio', icon: '💻' }
  ];

  const handleAction = () => {
    if (!isHost) {
      // Logic for requesting mic could be added here
      alert("Mic is currently occupied. Please wait for the speaker to finish.");
      return;
    }
    if (isStreaming) onStop();
    else onStart(audioSource);
  };

  return (
    <div className="flex items-center space-x-2 font-helvetica-thin">
      <div className={`flex items-center h-[52px] rounded-full shadow-3xl border border-white/10 backdrop-blur-2xl transition-all duration-700 ${isStreaming ? 'bg-lime-500 scale-105 shadow-lime-500/20' : isHost ? 'bg-zinc-900' : 'bg-red-500/20 opacity-80'}`}>
        
        {/* Drag Handle */}
        <div className="drag-handle h-full w-8 flex items-center justify-center cursor-move opacity-30 hover:opacity-60">
          <div className="grid grid-cols-2 gap-0.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`w-0.5 h-0.5 rounded-full ${isStreaming ? 'bg-black' : 'bg-white'}`} />
            ))}
          </div>
        </div>

        {/* Speak Now Label */}
        <button
          onClick={handleAction}
          disabled={isLoading}
          className={`px-6 h-full flex items-center justify-center font-black uppercase tracking-[0.3em] text-[10px] active:scale-95 transition-all ${isStreaming ? 'text-black' : 'text-white'}`}
        >
          {isLoading ? (
            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>{isStreaming ? 'Mute' : isHost ? 'Speak Now' : 'Request Mic'}</span>
          )}
        </button>

        <div className={`w-[1px] h-6 ${isStreaming ? 'bg-black/10' : 'bg-white/10'}`} />

        {/* Dropdown Arrow */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`w-10 h-full flex items-center justify-center rounded-r-full hover:bg-white/5 transition-all ${isStreaming ? 'text-black' : 'text-white'}`}
        >
          <svg className={`w-3 h-3 transition-transform duration-500 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <button 
        onClick={openSettings}
        className="w-[52px] h-[52px] rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center hover:bg-zinc-800 transition-all active:scale-90 shadow-2xl group"
      >
        <span className="text-lg group-hover:rotate-45 transition-transform duration-500">⚙️</span>
      </button>

      {isDropdownOpen && (
        <div ref={dropdownRef} className="absolute top-[60px] left-0 w-64 bg-zinc-950/95 border border-white/10 rounded-3xl shadow-4xl backdrop-blur-3xl p-3 z-[999] animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="px-4 py-2 mb-2 border-b border-white/5">
            <p className="text-[8px] uppercase tracking-[0.3em] text-zinc-500 font-black">Audio Path</p>
          </div>
          {sources.map(s => (
            <button
              key={s.id}
              onClick={() => { setAudioSource(s.id); setIsDropdownOpen(false); }}
              className={`w-full flex items-center px-4 py-3 rounded-2xl text-[11px] font-bold transition-all mb-1 ${audioSource === s.id ? 'bg-lime-500 text-black' : 'text-zinc-400 hover:bg-white/5'}`}
            >
              <span className="mr-3 text-sm">{s.icon}</span>
              <span className="tracking-widest uppercase text-[9px]">{s.label}</span>
              {audioSource === s.id && <div className="ml-auto w-1 h-1 rounded-full bg-black" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpeakNowButton;