
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
  const [amplitudes, setAmplitudes] = useState<number[]>(new Array(10).fill(2));
  
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

  // Audio Visualization Logic
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyzer: AnalyserNode | null = null;

    if (stream && isStreaming) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Ensure context is running (fixes browser suspension policies)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      source = audioCtx.createMediaStreamSource(stream);
      analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 128; // Small FFT for low latency and specific bar count
      analyzer.smoothingTimeConstant = 0.6; // Smoother transitions
      source.connect(analyzer);

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const update = () => {
        if (!analyzer) return;
        analyzer.getByteFrequencyData(dataArray);
        
        // Map frequency bins to our 10 bars
        // Using a non-linear mapping to focus on vocal/audible range
        const newAmplitudes = [];
        const barsCount = 10;
        const step = Math.floor(bufferLength / barsCount);
        
        for(let i = 0; i < barsCount; i++) {
          // Average a few bins for each bar to reduce jitter
          let sum = 0;
          const sampleSize = 2;
          for (let j = 0; j < sampleSize; j++) {
            sum += dataArray[(i * step) + j] || 0;
          }
          const avg = sum / sampleSize;
          // Scale to max height of ~20px, minimum 2px
          const scaled = Math.max(2, (avg / 255) * 24);
          newAmplitudes.push(scaled);
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
      setAmplitudes(new Array(10).fill(2));
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
    if ((e.target as HTMLElement).closest('.drag-handle')) {
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
      className="fixed z-50 select-none"
      style={{ left: position.x, top: position.y }}
      onMouseDown={onMouseDown}
    >
      <div className="relative flex items-center shadow-2xl rounded-full h-[48px]" ref={dropdownRef}>
        {isStreaming ? (
          <div className="flex bg-red-600/90 rounded-full items-center overflow-hidden w-[180px] h-[48px]">
            <button
              onClick={onStop}
              className="flex-1 px-4 py-3 text-white font-bold transition-all flex items-center justify-center space-x-2 backdrop-blur-md cursor-pointer drag-handle"
            >
              <span className="w-2 h-2 bg-white rounded-full animate-pulse shrink-0" />
              <span className="text-sm">Stop</span>
            </button>
            {/* Visualizer inside the stop button */}
            <div className="flex items-center space-x-1 px-3 h-full pb-0.5 opacity-80">
              {amplitudes.map((h, i) => (
                <div 
                  key={i} 
                  className="w-[3px] bg-white/90 rounded-full transition-all duration-75"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-[48px] w-[220px]">
            <button
              disabled={isLoading}
              onClick={() => handleAction(AudioSource.MIC)}
              className={`flex-1 px-4 py-3 ${isLoading ? 'bg-zinc-700' : 'bg-lime-500/90 hover:bg-lime-600'} text-black font-bold rounded-l-full transition-all flex items-center justify-center space-x-2 backdrop-blur-md cursor-move drag-handle overflow-hidden`}
            >
              {isLoading ? (
                <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              )}
              <span className="text-sm truncate">Speak Now</span>
            </button>
            <button
              disabled={isLoading}
              onClick={() => setIsOpen(!isOpen)}
              className={`w-[48px] h-full ${isLoading ? 'bg-zinc-800' : 'bg-lime-400/90 hover:bg-lime-500'} text-black rounded-r-full border-l border-lime-600/30 transition-all backdrop-blur-md flex items-center justify-center`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {isOpen && (
          <div className="absolute left-0 bottom-full mb-2 w-48 origin-bottom-left rounded-xl bg-zinc-900/95 border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="py-1">
              {[
                { id: AudioSource.MIC, label: 'Microphone' },
                { id: AudioSource.INTERNAL, label: 'Internal Audio' },
                { id: AudioSource.SHARE, label: 'Share Tab' },
                { id: AudioSource.BOTH, label: 'Mix Mode' },
              ].map((src) => (
                <button
                  key={src.id}
                  onClick={() => handleAction(src.id)}
                  className="block w-full text-left px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-lime-500 hover:text-black transition-all"
                >
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
