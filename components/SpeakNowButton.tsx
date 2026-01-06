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
}

const AudioVisualizer: React.FC<{ stream: MediaStream | null; isStreaming: boolean; isVADActive: boolean }> = ({ stream, isStreaming, isVADActive }) => {
  const [amplitudes, setAmplitudes] = useState([0, 0, 0, 0, 0]);
  const animationRef = useRef<number>(null);
  const analyserRef = useRef<AnalyserNode>(null);
  const contextRef = useRef<AudioContext>(null);

  useEffect(() => {
    if (isStreaming && stream) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 32;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      analyserRef.current = analyser;
      contextRef.current = audioContext;

      const update = () => {
        analyser.getByteFrequencyData(dataArray);
        const newAmplitudes = [
          dataArray[0] / 255,
          dataArray[2] / 255,
          dataArray[4] / 255,
          dataArray[2] / 255,
          dataArray[0] / 255,
        ];
        setAmplitudes(newAmplitudes);
        animationRef.current = requestAnimationFrame(update);
      };
      
      update();
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (contextRef.current) contextRef.current.close();
      setAmplitudes([0, 0, 0, 0, 0]);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (contextRef.current) contextRef.current.close();
    };
  }, [isStreaming, stream]);

  return (
    <div className="flex items-end justify-center space-x-[2px] h-3 w-6">
      {amplitudes.map((amp, i) => (
        <div 
          key={i} 
          className={`w-[2px] rounded-full transition-all duration-75 ${isStreaming ? (isVADActive ? 'bg-black scale-y-110 shadow-[0_0_4px_rgba(0,0,0,0.5)]' : 'bg-black opacity-60') : 'bg-white/30'}`}
          style={{ height: `${Math.max(15, amp * 100)}%` }}
        />
      ))}
    </div>
  );
};

const SpeakNowButton: React.FC<SpeakNowButtonProps> = ({ 
  onStart, 
  onStop, 
  isStreaming, 
  isLoading, 
  isVADActive,
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
    { id: AudioSource.INTERNAL, label: 'Internal Speaker', icon: '💻' },
    { id: AudioSource.SHARE, label: 'Browser Tab', icon: '🌐' }
  ];

  const currentSourceLabel = sources.find(s => s.id === audioSource)?.label || 'Select Source';

  return (
    <div className="flex items-center space-x-3">
      <div className={`flex items-center h-[56px] rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/20 backdrop-blur-3xl transition-all duration-300 relative ${isStreaming ? (isVADActive ? 'bg-lime-400 w-[260px]' : 'bg-lime-600 w-[260px]') : 'bg-zinc-900 w-[240px]'}`}>
        
        {/* VAD Status Indicator */}
        {isStreaming && (
          <div className="absolute -top-2 -right-2 flex space-x-1 items-center">
             <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg border ${isVADActive ? 'bg-white text-black border-lime-200' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
               {isVADActive ? 'Voice' : 'Silence'}
             </div>
          </div>
        )}

        {/* Drag Handle */}
        <div className="drag-handle h-full w-10 flex items-center justify-center cursor-move hover:bg-white/5 rounded-l-full transition-colors">
          <div className="grid grid-cols-2 gap-1.5 opacity-40">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`w-1 h-1 rounded-full ${isStreaming ? 'bg-black' : 'bg-white'}`} />
            ))}
          </div>
        </div>

        {/* Main Speak Now Button */}
        <button
          onClick={() => isStreaming ? onStop() : onStart(audioSource)}
          disabled={isLoading}
          className={`flex-1 h-full flex items-center justify-center space-x-3 px-1 ${isStreaming ? 'text-black' : 'text-white'} font-black uppercase tracking-[0.15em] text-[13px] active:scale-95 transition-all`}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-3 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-6 h-6">
                {isStreaming ? <AudioVisualizer stream={stream} isStreaming={isStreaming} isVADActive={isVADActive} /> : <span className="text-xl">🎤</span>}
              </div>
              <span>{isStreaming ? 'Stop Session' : 'Speak Now'}</span>
            </div>
          )}
        </button>

        <div className={`w-[1px] h-8 ${isStreaming ? 'bg-black/10' : 'bg-white/10'}`} />

        {/* Source Switcher Arrow */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`w-14 h-full flex items-center justify-center hover:bg-white/10 rounded-r-full transition-all ${isDropdownOpen ? 'bg-white/10' : ''}`}
          title="Select Audio Source"
        >
          <svg className={`w-5 h-5 transition-transform duration-300 ${isStreaming ? 'text-black' : 'text-white'} ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <button 
        onClick={openSettings}
        className="w-[56px] h-[56px] rounded-full bg-zinc-900 border border-white/20 flex items-center justify-center hover:bg-zinc-800 transition-all active:scale-90 shadow-2xl backdrop-blur-3xl"
      >
        <span className="text-2xl">⚙️</span>
      </button>

      {isDropdownOpen && (
        <div ref={dropdownRef} className="absolute top-[70px] left-0 w-72 bg-zinc-950 border border-white/10 rounded-[2rem] shadow-[0_32px_64px_rgba(0,0,0,0.6)] backdrop-blur-3xl p-4 z-[999] animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="px-4 py-2 text-[10px] uppercase tracking-[0.3em] font-black text-zinc-500 mb-3 border-b border-white/5">Source Selection</div>
          {sources.map(s => (
            <button
              key={s.id}
              onClick={() => { setAudioSource(s.id); setIsDropdownOpen(false); }}
              className={`w-full flex items-center px-4 py-4 rounded-2xl text-[14px] font-bold transition-all mb-1 ${audioSource === s.id ? 'bg-lime-500 text-black shadow-[0_10px_20px_rgba(132,204,22,0.3)]' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              <span className="mr-4 text-2xl">{s.icon}</span>
              <div className="flex flex-col items-start">
                <span className="leading-tight">{s.label}</span>
                <span className={`text-[9px] font-medium opacity-60 uppercase tracking-tighter ${audioSource === s.id ? 'text-black' : 'text-zinc-500'}`}>
                  {s.id === AudioSource.MIC ? 'Default Hardware' : 'System Loopback'}
                </span>
              </div>
              {audioSource === s.id && <div className="ml-auto w-2.5 h-2.5 rounded-full bg-black animate-pulse" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpeakNowButton;