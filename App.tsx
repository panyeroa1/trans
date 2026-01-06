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
  const [segments, setSegments] = useState<string>("");
  const [liveTurnText, setLiveTurnText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ status: 'idle' | 'syncing' | 'error' | 'success', message?: string }>({ status: 'idle' });
  
  // Strict Session ID persistence
  const getPersistentId = () => {
    let sid = sessionStorage.getItem('eburon_session_v3');
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem('eburon_session_v3', sid);
    }
    return sid;
  };

  const meetingIdRef = useRef(getPersistentId());
  const cumulativeSourceRef = useRef(''); 
  const segmentBufferRef = useRef(''); 
  const displayBufferRef = useRef(''); 
  const silenceTimeoutRef = useRef<number | null>(null);
  const flushTimeoutRef = useRef<number | null>(null); 

  // Position management
  const [transPos, setTransPos] = useState(() => {
    const saved = localStorage.getItem('cs_trans_pos_v2');
    return saved ? JSON.parse(saved) : { x: window.innerWidth / 2 - 100, y: window.innerHeight - 80 };
  });
  const [settingsPos, setSettingsPos] = useState(() => {
    const saved = localStorage.getItem('cs_settings_pos_v2');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 380, y: 50 };
  });
  const [controlPos, setControlPos] = useState(() => {
    const saved = localStorage.getItem('cs_control_pos_v2');
    return saved ? JSON.parse(saved) : { x: 50, y: 50 };
  });

  useEffect(() => localStorage.setItem('cs_trans_pos_v2', JSON.stringify(transPos)), [transPos]);
  useEffect(() => localStorage.setItem('cs_settings_pos_v2', JSON.stringify(settingsPos)), [settingsPos]);
  useEffect(() => localStorage.setItem('cs_control_pos_v2', JSON.stringify(controlPos)), [controlPos]);

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());

  const shipSegment = async (text: string) => {
    if (!text.trim()) return;
    const cleanText = text.trim();
    
    const previousHistory = cumulativeSourceRef.current;
    const newHistory = (previousHistory + (previousHistory ? " " : "") + cleanText).trim();
    cumulativeSourceRef.current = newHistory;
    
    setSyncStatus({ status: 'syncing' });
    const result = await SupabaseService.upsertTranscription({
      id: meetingIdRef.current, // USES STABLE ID: Updates existing row if DB configured with ID as PK
      meeting_id: meetingIdRef.current,
      speaker_id: '00000000-0000-0000-0000-000000000000',
      transcribe_text_segment: cleanText,
      full_transcription: newHistory,
      users_all: ['System']
    });

    setSyncStatus({ status: result.success ? 'success' : 'error', message: result.error });
  };

  const handleTranscription = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;

    if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    
    if (isFinal) {
      const trimmed = text.trim();
      segmentBufferRef.current = (segmentBufferRef.current + " " + trimmed).trim();
      
      // Update the display buffer. We fill the width before clearing.
      // Character limit is ~120 for a compact 2-line visual
      let newDisplay = (displayBufferRef.current + " " + trimmed).trim();
      if (newDisplay.length > 140) {
        newDisplay = trimmed; // Start fresh if too long
      }
      displayBufferRef.current = newDisplay;
      
      setSegments(newDisplay);
      setLiveTurnText('');

      // Ship to DB every ~2 sentences or after a length threshold
      const sentenceMatch = segmentBufferRef.current.match(/[.!?]/g);
      if ((sentenceMatch && sentenceMatch.length >= 2) || segmentBufferRef.current.length > 120) {
        shipSegment(segmentBufferRef.current);
        segmentBufferRef.current = '';
      } else {
        flushTimeoutRef.current = window.setTimeout(() => {
          if (segmentBufferRef.current.trim()) {
            shipSegment(segmentBufferRef.current);
            segmentBufferRef.current = '';
          }
        }, 3000);
      }
    } else {
      setLiveTurnText(text.trim());
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

  const currentDisplay = liveTurnText || segments;

  return (
    <div className="fixed inset-0 bg-transparent pointer-events-none w-screen h-screen overflow-hidden">
      {showTranscription && currentDisplay && (
        <Draggable initialPos={transPos} onPosChange={setTransPos}>
          <div className="relative group max-w-[420px] min-w-[120px]">
            <div className="bg-black/90 backdrop-blur-2xl px-3 py-1.5 rounded-lg border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)] ring-1 ring-white/5 flex items-center justify-center transition-all duration-300">
              <p className="text-[14px] font-helvetica-thin text-white/95 tracking-normal text-center leading-tight antialiased break-words max-w-full">
                {currentDisplay}
              </p>
            </div>
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