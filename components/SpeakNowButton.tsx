
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
}

const SpeakNowButton: React.FC<SpeakNowButtonProps> = ({ 
  onStart, 
  onStop, 
  isStreaming, 
  isLoading, 
  onPositionChange,
  initialPosition = { x: 100, y: 100 },
  stream
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [amplitudes, setAmplitudes] = useState<number[]>(new Array(20).fill(2));
  
  const dragRef = useRef<{ offsetX: number, offsetY: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Audio Visualization Logic - Enhanced for Granularity
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyzer: AnalyserNode | null = null;

    if (stream && isStreaming) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      source = audioCtx.createMediaStreamSource(stream);
      analyzer = audioCtx.createAnalyser();
      // Increase FFT size for more granular frequency data
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
        
        // We focus on the vocal range (lower frequencies)
        // Roughly mapping the first 40-60 bins to 20 bars
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
          // Apply a slight exponential scaling for more dramatic movement
          const intensity = Math.pow(avg / 255, 1.2);
          const scaledHeight = Math.max(3, intensity * 28); // Max height 28px
          newAmplitudes[i] = scaledHeight;
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

  const handleAction = (source: AudioSource) => {
    if (isDragging) return;
    setIsOpen(false);
    onStart(source);
  };

  return (
    <div 
      ref={buttonContainerRef}
      className="fixed z-50 select-none touch-none"
      style={{ left: position.x, top: position.y }}
      onMouseDown={onMouseDown}
    >
      <div className="relative flex items-center h-[48px]" ref={dropdownRef}>
        {isStreaming ? (
          <div className="flex bg-red-600/90 rounded-full items-center overflow-hidden w-[240px] h-[48px] shadow-2xl border border-white/10 backdrop-blur-xl transition-all duration-300">
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
            
            {/* Enhanced Symmetrical Waveform Visualizer */}
            <div className="flex-1 flex items-center justify-center space-x-[2px] pr-5 h-full opacity-90">
              {amplitudes.map((h, i) => (
                <div 
                  key={i} 
                  className="w-[2px] bg-white rounded-full transition-all duration-75 ease-out"
                  style={{ 
                    height: `${h}px`,
                    opacity: 0.4 + (h / 28) * 0.6 // More reactive opacity
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-[48px] w-[220px] shadow-2xl rounded-full overflow-visible">
            <button
              disabled={isLoading}
              onClick={() => handleAction(AudioSource.MIC)}
              className={`flex-1 px-5 py-3 ${isLoading ? 'bg-zinc-700' : 'bg-lime-500/95 hover:bg-lime-400'} text-black font-black rounded-l-full transition-all flex items-center justify-center space-x-2 backdrop-blur-md cursor-move drag-handle active:scale-[0.98] group`}
            >
              {isLoading ? (
                <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              )}
              <span className="text-[13px] uppercase tracking-tighter truncate">Speak Now</span>
            </button>
            <button
              disabled={isLoading}
              onClick={() => setIsOpen(!isOpen)}
              className={`w-[48px] h-full ${isLoading ? 'bg-zinc-800' : 'bg-lime-400/95 hover:bg-lime-300'} text-black rounded-r-full border-l border-black/10 transition-all backdrop-blur-md flex items-center justify-center active:scale-95`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {isOpen && (
          <div className="absolute left-0 bottom-full mb-3 w-52 origin-bottom-left rounded-2xl bg-zinc-900/98 border border-white/10 shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out">
            <div className="p-1.5 space-y-0.5">
              {[
                { id: AudioSource.MIC, label: 'Microphone', icon: '🎤' },
                { id: AudioSource.INTERNAL, label: 'Internal Audio', icon: '💻' },
                { id: AudioSource.SHARE, label: 'Share Tab', icon: '📑' },
                { id: AudioSource.BOTH, label: 'Mix Mode', icon: '🎚️' },
              ].map((src) => (
                <button
                  key={src.id}
                  onClick={() => handleAction(src.id)}
                  className="flex items-center w-full text-left px-4 py-3 rounded-xl text-[12px] font-bold text-zinc-300 hover:bg-lime-500 hover:text-black transition-all group"
                >
                  <span className="mr-3 group-hover:scale-125 transition-transform">{src.icon}</span>
                  {src.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpeakNowButton;
