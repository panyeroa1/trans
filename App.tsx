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
  const [learningContext, setLearningContext] = useState(() => localStorage.getItem('cs_learning_context') || '');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showTranscription, setShowTranscription] = useState(true);
  const [segments, setSegments] = useState<string>("");
  const [liveTurnText, setLiveTurnText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ status: 'idle' | 'syncing' | 'error' | 'success', message?: string }>({ status: 'idle' });
  
  // Persistent Session ID
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

  // Responsive position management
  const [transPos, setTransPos] = useState(() => {
    const saved = localStorage.getItem('cs_trans_pos_v2');
    return saved ? JSON.parse(saved) : { x: window.innerWidth / 2 - 400, y: window.innerHeight - 100 };
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
  useEffect(() => localStorage.setItem('cs_learning_context', learningContext), [learningContext]);

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
      id: meetingIdRef.current,
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
      
      let newDisplay = (displayBufferRef.current + (displayBufferRef.current ? " " : "") + trimmed).trim();
      
      // FLATTENED FLOW: Refined sliding window for 800px width.
      // Increased to 320 chars to ensure the strip stays full longer.
      if (newDisplay.length > 320) {
        const cutoff = newDisplay.length - 240;
        const nextSpace = newDisplay.indexOf(' ', cutoff);
        newDisplay = newDisplay.substring(nextSpace !== -1 ? nextSpace : cutoff).trim();
      }
      
      displayBufferRef.current = newDisplay;
      setSegments(newDisplay);
      setLiveTurnText('');

      const sentenceMatch = segmentBufferRef.current.match(/[.!?]/g);
      if ((sentenceMatch && sentenceMatch.length >= 2) || segmentBufferRef.current.length > 200) {
        shipSegment(segmentBufferRef.current);
        segmentBufferRef.current = '';
      } else {
        flushTimeoutRef.current = window.setTimeout(() => {
          if (segmentBufferRef.current.trim()) {
            shipSegment(segmentBufferRef.current);
            segmentBufferRef.current = '';
          }
        }, 6000); // Wait longer for final thought
      }
    } else {
      setLiveTurnText(text.trim());
      silenceTimeoutRef.current = window.setTimeout(() => handleTranscription(text, true), 2200);
    }
  }, []);

  const handleVADChange = useCallback((isActive: boolean) => {
    setIsVADActive(isActive);
  }, []);

  const onStart = async (source: AudioSource) => {
    setIsLoading(true);
    setSyncStatus({ status: 'idle' });
    
    // Clear display ONLY when starting a fresh session
    setSegments('');
    displayBufferRef.current = '';
    segmentBufferRef.current = '';
    
    SupabaseService.clearCache(meetingIdRef.current);

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
      }, sourceLanguage, learningContext);
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
    
    // Final save before stopping
    if (segmentBufferRef.current.trim()) shipSegment(segmentBufferRef.current);
    
    geminiServiceRef.current.stop();
    audioServiceRef.current.stop();
    setIsStreaming(false);
    setIsVADActive(false);
    setStream(null);
    setLiveTurnText('');
    
    // DO NOT clear segments here. Let them stay visible for the user to read.
    // The next session's onStart will clear it.
  };

  const renderText = segments ? (liveTurnText ? `${segments} ${liveTurnText}` : segments) : liveTurnText;

  return (
    <div className="fixed inset-0 bg-transparent pointer-events-none w-screen h-screen overflow-hidden">
      {showTranscription && (
        <Draggable initialPos={transPos} onPosChange={setTransPos}>
          <div className="relative group w-[800px]">
            {/* Wider, Flattened Glass Strip */}
            <div className={`bg-black/85 backdrop-blur-3xl px-8 py-3 rounded-[2rem] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-center transition-all duration-500 min-h-[52px] ${!renderText && !isStreaming ? 'opacity-50 grayscale scale-95' : 'opacity-100 scale-100'}`}>
              
              <p className={`text-[15px] font-helvetica-thin tracking-wide text-center leading-tight antialiased break-words w-full ${renderText ? 'text-white' : 'text-zinc-500 italic'}`}>
                {renderText || (isStreaming ? "Calibrating..." : "Standby. Press Speak Now to record.")}
                {isStreaming && !liveTurnText && (
                  <span className="ml-3 inline-flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-lime-400/60 rounded-full animate-pulse delay-75" />
                    <span className="w-1.5 h-1.5 bg-lime-400/30 rounded-full animate-pulse delay-150" />
                  </span>
                )}
              </p>

              {/* Sync Status Overlay (Subtle) */}
              {syncStatus.status === 'syncing' && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2">
                  <div className="w-2 h-2 border-2 border-lime-500/50 border-t-lime-500 rounded-full animate-spin" />
                  <span className="text-[9px] uppercase tracking-widest text-lime-500/70 font-black">Persisting to Vault...</span>
                </div>
              )}
            </div>
            
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 backdrop-blur px-4 py-1 rounded-full text-[9px] uppercase tracking-tighter text-white/50 pointer-events-none font-bold border border-white/5">
              Drag Transcription Strip
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
            learningContext={learningContext}
            setLearningContext={setLearningContext}
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
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offset.current.y))
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
      className={`fixed cursor-grab active:cursor-grabbing z-[999] pointer-events-auto ${isDragging ? 'opacity-80 scale-[1.01] duration-0' : 'duration-300 transition-all'}`} 
      style={{ left: pos.x, top: pos.y, userSelect: isDragging ? 'none' : 'auto' }} 
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
};

export default App;