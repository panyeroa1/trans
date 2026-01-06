import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import SettingsModal from './components/SettingsModal';
import { AudioService, AudioSource } from './services/audioService';
import { GeminiLiveService } from './services/geminiService';
import { SupabaseService } from './services/supabaseService';

const App: React.FC = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVADActive, setIsVADActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>(AudioSource.MIC);
  const [sourceLanguage, setSourceLanguage] = useState('English (US)');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showTranscription, setShowTranscription] = useState(true);
  const [segments, setSegments] = useState<any[]>([]);
  const [liveTurnText, setLiveTurnText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ status: 'idle' | 'syncing' | 'error' | 'success', message?: string }>({ status: 'idle' });
  
  const meetingIdRef = useRef('');
  const cumulativeSourceRef = useRef(''); 
  const segmentBufferRef = useRef(''); 
  const displayHistoryRef = useRef<string[]>([]); // Sliding window for display
  const silenceTimeoutRef = useRef<number | null>(null);
  const flushTimeoutRef = useRef<number | null>(null); 

  // Position management
  const [transPos, setTransPos] = useState(() => {
    const saved = localStorage.getItem('cs_trans_pos');
    return saved ? JSON.parse(saved) : { x: window.innerWidth / 2 - 150, y: window.innerHeight - 120 };
  });
  const [settingsPos, setSettingsPos] = useState(() => {
    const saved = localStorage.getItem('cs_settings_pos');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 380, y: 50 };
  });
  const [controlPos, setControlPos] = useState(() => {
    const saved = localStorage.getItem('cs_control_pos');
    return saved ? JSON.parse(saved) : { x: 50, y: 50 };
  });

  useEffect(() => localStorage.setItem('cs_trans_pos', JSON.stringify(transPos)), [transPos]);
  useEffect(() => localStorage.setItem('cs_settings_pos', JSON.stringify(settingsPos)), [settingsPos]);
  useEffect(() => localStorage.setItem('cs_control_pos', JSON.stringify(controlPos)), [controlPos]);

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());

  const countSentences = (text: string): number => {
    const sentences = text.match(/([.!?\u2026])(\s+|$)/g);
    return sentences ? sentences.length : 0;
  };

  const shipSegment = async (text: string) => {
    if (!text.trim()) return;
    const cleanText = text.trim();
    
    // Logic: Append to history and update ONE row identified by the meeting ID
    const previousHistory = cumulativeSourceRef.current;
    const newHistory = (previousHistory + (previousHistory ? " " : "") + cleanText).trim();
    cumulativeSourceRef.current = newHistory;
    
    setSyncStatus({ status: 'syncing' });
    const result = await SupabaseService.upsertTranscription({
      id: meetingIdRef.current, // Use Session ID as primary key to update same row
      meeting_id: meetingIdRef.current,
      speaker_id: '00000000-0000-0000-0000-000000000000',
      transcribe_text_segment: cleanText,
      full_transcription: newHistory,
      users_all: ['System']
    });

    if (result.success) {
      setSyncStatus({ status: 'success' });
    } else {
      setSyncStatus({ status: 'error', message: result.error });
    }
  };

  const handleTranscription = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;

    if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    
    if (isFinal) {
      segmentBufferRef.current = (segmentBufferRef.current + " " + text.trim()).trim();
      
      displayHistoryRef.current.push(text.trim());
      if (displayHistoryRef.current.length > 2) { // Even tighter display window
        displayHistoryRef.current.shift();
      }
      
      setSegments([{ id: Date.now(), text: displayHistoryRef.current.join(" ") }]);
      setLiveTurnText('');

      const sentenceCount = countSentences(segmentBufferRef.current);
      if (sentenceCount >= 2 || segmentBufferRef.current.length > 80) {
        shipSegment(segmentBufferRef.current);
        segmentBufferRef.current = '';
      } else {
        flushTimeoutRef.current = window.setTimeout(() => {
          if (segmentBufferRef.current.trim()) {
            shipSegment(segmentBufferRef.current);
            segmentBufferRef.current = '';
          }
        }, 2500);
      }
    } else {
      const currentStable = displayHistoryRef.current.join(" ");
      setLiveTurnText((currentStable + (currentStable ? " " : "") + text).trim());
      silenceTimeoutRef.current = window.setTimeout(() => handleTranscription(text, true), 1500);
    }
  }, []);

  const handleVADChange = useCallback((isActive: boolean) => {
    setIsVADActive(isActive);
  }, []);

  const onStart = async (source: AudioSource) => {
    setIsLoading(true);
    setSyncStatus({ status: 'idle' });
    
    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) await (window as any).aistudio.openSelectKey();
    } catch (e) {}

    // Persistent ID for this specific session
    meetingIdRef.current = crypto.randomUUID();
    cumulativeSourceRef.current = '';
    segmentBufferRef.current = '';
    displayHistoryRef.current = [];
    setSegments([]);
    
    try {
      const mediaStream = await audioServiceRef.current.getStream(source);
      setStream(mediaStream);
      await geminiServiceRef.current.startStreaming(mediaStream, {
        onTranscription: handleTranscription,
        onVADChange: handleVADChange,
        onError: () => onStop(),
        onClose: () => onStop()
      }, sourceLanguage);
      setIsStreaming(true);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

  const onStop = () => {
    if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    if (segmentBufferRef.current.trim()) shipSegment(segmentBufferRef.current);
    
    geminiServiceRef.current.stop();
    audioServiceRef.current.stop();
    setIsStreaming(false);
    setIsVADActive(false);
    setStream(null);
    setLiveTurnText('');
    segmentBufferRef.current = '';
  };

  const currentDisplay = liveTurnText || (segments.length > 0 ? segments[0].text : "");

  return (
    <div className="fixed inset-0 bg-transparent pointer-events-none w-screen h-screen">
      {showTranscription && (isStreaming || currentDisplay) && (
        <Draggable initialPos={transPos} onPosChange={setTransPos}>
          <div className="relative group max-w-[70vw] w-fit">
            {currentDisplay ? (
              <div className="bg-black/90 backdrop-blur-3xl px-5 py-2.5 rounded-[1.25rem] border border-white/20 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.8)] w-full ring-1 ring-white/10 flex items-center justify-center">
                <p className="text-[17px] font-helvetica-thin text-white tracking-wide text-center leading-snug antialiased px-1 break-words max-w-full">
                  {currentDisplay}
                </p>
              </div>
            ) : isStreaming && (
              <div className="bg-black/70 backdrop-blur-xl px-6 h-[40px] rounded-full border border-white/10 flex items-center justify-center space-x-2.5 opacity-60 shadow-xl">
                <div className="flex space-x-1">
                  <div className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s] ${isVADActive ? 'bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.9)]' : 'bg-white'}`} />
                  <div className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s] ${isVADActive ? 'bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.9)]' : 'bg-white'}`} />
                  <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isVADActive ? 'bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.9)]' : 'bg-white'}`} />
                </div>
                <span className={`text-[10px] uppercase tracking-[0.2em] font-black italic transition-colors ${isVADActive ? 'text-lime-400' : 'text-white/60'}`}>
                  {isVADActive ? 'Live' : 'Ready'}
                </span>
              </div>
            )}
          </div>
        </Draggable>
      )}

      <Draggable initialPos={controlPos} onPosChange={setControlPos} handleClass="drag-handle">
        <div className="transition-transform hover:scale-105 active:scale-95">
          <SpeakNowButton 
            onStart={onStart} onStop={onStop}
            isStreaming={isStreaming} isLoading={isLoading}
            isVADActive={isVADActive}
            audioSource={audioSource} setAudioSource={setAudioSource}
            openSettings={() => setIsSettingsOpen(!isSettingsOpen)}
            stream={stream}
          />
        </div>
      </Draggable>

      {isSettingsOpen && (
        <Draggable initialPos={settingsPos} onPosChange={setSettingsPos} handleClass="settings-drag-handle">
          <SettingsModal 
            onClose={() => setIsSettingsOpen(false)}
            meetingId={meetingIdRef.current}
            sourceLanguage={sourceLanguage}
            setSourceLanguage={setSourceLanguage}
            showTranscription={showTranscription}
            setShowTranscription={setShowTranscription}
            webhookUrl={webhookUrl}
            setWebhookUrl={setWebhookUrl}
            cumulativeSource={cumulativeSourceRef.current}
            syncStatus={syncStatus}
          />
        </Draggable>
      )}
    </div>
  );
};

const Draggable: React.FC<{ children: React.ReactNode; initialPos: { x: number, y: number }; onPosChange?: (pos: { x: number, y: number }) => void; handleClass?: string; }> = ({ children, initialPos, onPosChange, handleClass }) => {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    if (handleClass && !(e.target as HTMLElement).closest(`.${handleClass}`)) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDragging(true);
    e.stopPropagation();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newPos = { 
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - offset.current.y))
      };
      setPos(newPos);
      onPosChange?.(newPos);
    };
    const onMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  return (
    <div 
      className={`fixed cursor-grab active:cursor-grabbing z-[999] pointer-events-auto ${isDragging ? 'opacity-80 scale-[1.01] duration-0' : 'duration-150 transition-transform'}`} 
      style={{ left: pos.x, top: pos.y, userSelect: isDragging ? 'none' : 'auto' }} 
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
};

export default App;