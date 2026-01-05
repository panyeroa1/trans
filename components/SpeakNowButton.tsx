
import React, { useState, useRef, useEffect } from 'react';
import { AudioSource } from '../services/audioService';

interface SpeakNowButtonProps {
  onStart: (source: AudioSource) => void;
  onStop: () => void;
  isStreaming: boolean;
  isLoading: boolean;
  onPositionChange?: (pos: { x: number, y: number }) => void;
  initialPosition?: { x: number, y: number };
}

const SpeakNowButton: React.FC<SpeakNowButtonProps> = ({ 
  onStart, 
  onStop, 
  isStreaming, 
  isLoading, 
  onPositionChange,
  initialPosition = { x: 100, y: 100 }
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const dragRef = useRef<{ offsetX: number, offsetY: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    // Only drag if clicking the main button area, not the dropdown arrow
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
    if (isDragging) return; // Prevent action if we were dragging
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
      <div className="relative flex items-center shadow-2xl rounded-full" ref={dropdownRef}>
        {isStreaming ? (
          <button
            onClick={onStop}
            className="px-8 py-3 bg-red-600/90 hover:bg-red-700 text-white font-bold rounded-full transition-all flex items-center space-x-2 backdrop-blur-md cursor-pointer drag-handle"
          >
            <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
            <span>Stop</span>
          </button>
        ) : (
          <div className="flex">
            <button
              disabled={isLoading}
              onClick={() => handleAction(AudioSource.MIC)}
              className={`px-6 py-3 ${isLoading ? 'bg-zinc-700' : 'bg-lime-500/90 hover:bg-lime-600'} text-black font-bold rounded-l-full transition-all flex items-center space-x-2 backdrop-blur-md cursor-move drag-handle`}
            >
              {isLoading ? (
                <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              )}
              <span className="text-sm">Speak Now</span>
            </button>
            <button
              disabled={isLoading}
              onClick={() => setIsOpen(!isOpen)}
              className={`p-3 ${isLoading ? 'bg-zinc-800' : 'bg-lime-400/90 hover:bg-lime-500'} text-black rounded-r-full border-l border-lime-600/30 transition-all backdrop-blur-md`}
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
