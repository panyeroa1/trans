import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import SettingsModal from './components/SettingsModal';
import { AudioService, AudioSource } from './services/audioService';
import { GeminiLiveService } from './services/geminiService';
import { SupabaseService } from './services/supabaseService';

const App: React.FC = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
  const currentSegmentIdRef = useRef<string | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  
  // Throttle references for Supabase updates
  const lastSaveTimeRef = useRef<number>(0);
  const pendingSaveRef = useRef<boolean>(false);

  // Position management with Persistence
  const [transPos, setTransPos] = useState(() => {
    const saved = localStorage.getItem('cs_trans_pos');
    return saved ? JSON.parse(saved) : { x: window.innerWidth / 2 - 200, y: window.innerHeight - 150 };
  });
  const [settingsPos, setSettingsPos] = useState(() => {
    const saved = localStorage.getItem('cs_settings_pos');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 380, y: 50 };
  });
  const [controlPos, setControlPos] = useState(() => {
    const saved = localStorage.getItem('cs_control_pos');
    return saved ? JSON.parse(saved) : { x: 50, y: 50 };
  });

  // Save positions on change
  useEffect(() => localStorage.setItem('cs_trans_pos', JSON.stringify(transPos)), [transPos]);
  useEffect(() => localStorage.setItem('cs_settings_pos', JSON.stringify(settingsPos)), [settingsPos]);
  useEffect(() => localStorage.setItem('cs_control_pos', JSON.stringify(controlPos)), [controlPos]);

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());

  const pushToDB = async (text: string, isFinal: boolean) => {
    if (!text.trim()) return;

    const now = Date.now();
    if (!isFinal && (now - lastSaveTimeRef.current < 1000)) {
      pendingSaveRef.current = true;
      return;
    }

    if (!currentSegmentIdRef.current) currentSegmentIdRef.current = crypto.randomUUID();

    setSyncStatus({ status: 'syncing' });
    lastSaveTimeRef.current = now;
    pendingSaveRef.current = false;

    const result = await SupabaseService.upsertTranscription({
      id: currentSegmentIdRef.current,
      meeting_id: meetingIdRef.current,
      speaker_id: '00000000-0000-0000-0000-000000000000',
      transcribe_text_segment: text.trim(),
      full_transcription: cumulativeSourceRef.current + (cumulativeSourceRef.current ? " " : "") + text.trim(),
      users_all: ['System']
    });

    if (result.success) {
      setSyncStatus({ status: 'success' });
      if (isFinal) {
        cumulativeSourceRef.current += (cumulativeSourceRef.current ? " " : "") + text.trim();
        currentSegmentIdRef.current = null;
        lastSaveTimeRef.current = 0;
      }
    } else {
      setSyncStatus({ status: 'error', message: result.error });
    }
  };

  const handleTranscription = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;
    if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
    
    if (isFinal) {
      setSegments(prev => [{ id: Date.now(), text: text.trim() }, ...prev].slice(0, 10));
      setLiveTurnText('');
      pushToDB(text, true);
    } else {
      setLiveTurnText(text);
      pushToDB(text, false);
      silenceTimeoutRef.current = window.setTimeout(() => handleTranscription(text, true), 2000);
    }
  }, []);

  const onStart = async (source: AudioSource) => {
    setIsLoading(true);
    setSyncStatus({ status: 'idle' });
    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) await (window as any).aistudio.openSelectKey();
    } catch (e) {}

    meetingIdRef.current = `ORBIT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    cumulativeSourceRef.current = '';
    currentSegmentIdRef.current = null;
    lastSaveTimeRef.current = 0;
    
    try {
      const mediaStream = await audioServiceRef.current.getStream(source);
      setStream(mediaStream);
      await geminiServiceRef.current.startStreaming(mediaStream, {
        onTranscription: handleTranscription,
        onError: () => onStop(),
        onClose: () => onStop()
      }, sourceLanguage);
      setIsStreaming(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const onStop = () => {
    if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
    geminiServiceRef.current.stop();
    audioServiceRef.current.stop();
    setIsStreaming(false);
    setStream(null);
    setLiveTurnText('');
    currentSegmentIdRef.current = null;
  };

  const currentDisplay = liveTurnText || (segments.length > 0 ? segments[0].text : "");

  return (
    <div className="fixed inset-0 bg-transparent pointer-events-none w-screen h-screen">
      {/* Subtitles Overlay */}
      {showTranscription && currentDisplay && (
        <Draggable initialPos={transPos} onPosChange={setTransPos}>
          <div className="bg-black/90 backdrop-blur-3xl px-8 py-5 rounded-[2rem] border border-white/20 shadow-2xl min-w-[400px] max-w-[70vw] pointer-events-auto ring-1 ring-white/5">
            <p className="text-[22px] font-helvetica-thin text-white tracking-wide text-center leading-relaxed antialiased">
              {currentDisplay}
            </p>
          </div>
        </Draggable>
      )}

      {/* Main Trigger Button */}
      <Draggable initialPos={controlPos} onPosChange={setControlPos} handleClass="drag-handle">
        <div className="pointer-events-auto transition-transform hover:scale-105 active:scale-95">
          <SpeakNowButton 
            onStart={onStart} onStop={onStop}
            isStreaming={isStreaming} isLoading={isLoading}
            audioSource={audioSource} setAudioSource={setAudioSource}
            openSettings={() => setIsSettingsOpen(!isSettingsOpen)}
            stream={stream}
          />
        </div>
      </Draggable>

      {/* Settings Panel */}
      {isSettingsOpen && (
        <Draggable initialPos={settingsPos} onPosChange={setSettingsPos} handleClass="settings-drag-handle">
          <div className="pointer-events-auto">
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
          </div>
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
      className={`fixed cursor-grab active:cursor-grabbing z-[999] ${isDragging ? 'opacity-80 scale-[1.02] duration-0' : 'duration-150 transition-transform'}`} 
      style={{ left: pos.x, top: pos.y, userSelect: isDragging ? 'none' : 'auto' }} 
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
};

export default App;
