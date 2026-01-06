import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import SettingsModal from './components/SettingsModal';
import { AudioService, AudioSource, SmartSegmenter } from './services/audioService';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Unique User ID for this instance
  const [userId] = useState(() => {
    let uid = localStorage.getItem('eburon_user_id');
    if (!uid) {
      uid = `USR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      localStorage.setItem('eburon_user_id', uid);
    }
    return uid;
  });

  // Meeting ID (The room)
  const [meetingId, setMeetingId] = useState(() => {
    let sid = sessionStorage.getItem('eburon_session_v3');
    if (!sid) {
      sid = `ROOM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      sessionStorage.setItem('eburon_session_v3', sid);
    }
    return sid;
  });

  // Collaborative State
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([userId]);

  const [showTranscription, setShowTranscription] = useState(true);
  const [segments, setSegments] = useState<string>("");
  const [liveTurnText, setLiveTurnText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ status: 'idle' | 'syncing' | 'error' | 'success', message?: string }>({ status: 'idle' });
  
  const cumulativeSourceRef = useRef(''); 
  const segmentBufferRef = useRef(''); 
  const displayBufferRef = useRef(''); 
  const lastActivityTimeRef = useRef<number>(Date.now());
  const silenceTimeoutRef = useRef<number | null>(null);
  const flushTimeoutRef = useRef<number | null>(null); 
  const scrollRef = useRef<HTMLDivElement>(null);

  const [transPos, setTransPos] = useState(() => {
    const saved = localStorage.getItem('cs_trans_pos_v2');
    return saved ? JSON.parse(saved) : { x: 0, y: window.innerHeight - 180 };
  });
  const [settingsPos, setSettingsPos] = useState(() => {
    const saved = localStorage.getItem('cs_settings_pos_v2');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 380, y: 50 };
  });
  const [controlPos, setControlPos] = useState(() => {
    const saved = localStorage.getItem('cs_control_pos_v2');
    return saved ? JSON.parse(saved) : { x: 40, y: 40 };
  });

  useEffect(() => localStorage.setItem('cs_trans_pos_v2', JSON.stringify(transPos)), [transPos]);
  useEffect(() => localStorage.setItem('cs_settings_pos_v2', JSON.stringify(settingsPos)), [settingsPos]);
  useEffect(() => localStorage.setItem('cs_control_pos_v2', JSON.stringify(controlPos)), [controlPos]);
  useEffect(() => localStorage.setItem('cs_learning_context', learningContext), [learningContext]);
  useEffect(() => sessionStorage.setItem('eburon_session_v3', meetingId), [meetingId]);

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
      id: `${meetingId}-${Date.now()}`,
      meeting_id: meetingId,
      speaker_id: userId,
      transcribe_text_segment: cleanText,
      full_transcription: newHistory,
      users_all: participants
    });

    setSyncStatus({ status: result.success ? 'success' : 'error', message: result.error });
  };

  const handleTranscription = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;

    const now = Date.now();
    const pauseDuration = now - lastActivityTimeRef.current;
    lastActivityTimeRef.current = now;

    if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
    if (flushTimeoutRef.current) window.clearTimeout(flushTimeoutRef.current);
    
    if (isFinal) {
      const trimmed = text.trim();
      segmentBufferRef.current = (segmentBufferRef.current + " " + trimmed).trim();
      
      let newDisplay = (displayBufferRef.current + (displayBufferRef.current ? " " : "") + trimmed).trim();
      
      if (newDisplay.length > 500) {
        newDisplay = trimmed;
      }
      
      displayBufferRef.current = newDisplay;
      setSegments(newDisplay);
      setLiveTurnText('');

      if (SmartSegmenter.shouldFlush(segmentBufferRef.current, pauseDuration)) {
        shipSegment(segmentBufferRef.current);
        segmentBufferRef.current = '';
      } else {
        flushTimeoutRef.current = window.setTimeout(() => {
          if (segmentBufferRef.current.trim()) {
            shipSegment(segmentBufferRef.current);
            segmentBufferRef.current = '';
          }
        }, 4000); 
      }
    } else {
      setLiveTurnText(text.trim());
      silenceTimeoutRef.current = window.setTimeout(() => handleTranscription(text, true), 2000);
    }
  }, [meetingId, userId, participants]);

  const onStart = async (source: AudioSource) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSegments('');
    displayBufferRef.current = '';
    segmentBufferRef.current = '';

    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) await (window as any).aistudio.openSelectKey();
    } catch (e) {}

    try {
      const mediaStream = await audioServiceRef.current.getStream(source);
      setStream(mediaStream);
      await geminiServiceRef.current.startStreaming(mediaStream, {
        onTranscription: handleTranscription,
        onVADChange: (active) => setIsVADActive(active),
        onError: (err) => {
          setErrorMessage(err);
          onStop();
        },
        onClose: () => onStop()
      }, sourceLanguage, learningContext);
      setIsStreaming(true);
      setActiveSpeakerId(userId);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Permission denied. Please allow device access.");
      setActiveSpeakerId(null);
      setIsStreaming(false);
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
    setActiveSpeakerId(null);
  };

  const subtitleStyle: React.CSSProperties = {
    textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)',
    WebkitFontSmoothing: 'antialiased'
  };

  return (
    <div className="fixed inset-0 bg-transparent pointer-events-none w-screen h-screen overflow-hidden">
      {/* Error Message Toast */}
      {errorMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl backdrop-blur-xl pointer-events-auto z-[9999] animate-in fade-in slide-in-from-top-4">
          ⚠️ {errorMessage}
          <button onClick={() => setErrorMessage(null)} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {showTranscription && (
        <Draggable initialPos={transPos} onPosChange={setTransPos}>
          <div className="relative group w-screen flex flex-col items-center px-16">
            <div className={`relative w-full flex items-end justify-center min-h-[120px] transition-all duration-500 ${!segments && !liveTurnText && !isStreaming ? 'opacity-0' : 'opacity-100'}`}>
              <div className="w-full text-center">
                <p 
                  style={subtitleStyle}
                  className="text-[22px] font-helvetica-thin tracking-widest leading-[1.7] antialiased text-white break-words"
                >
                  {segments}
                  {liveTurnText && (
                    <span className="ml-2 text-lime-400/90 italic transition-all duration-300">
                      {liveTurnText}
                    </span>
                  )}
                  {isStreaming && !segments && !liveTurnText && (
                    <span className="text-zinc-500 opacity-40 text-[14px] uppercase tracking-[0.3em]">Syncing Room...</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </Draggable>
      )}

      <Draggable initialPos={controlPos} onPosChange={setControlPos} handleClass="drag-handle">
        <SpeakNowButton 
          onStart={onStart} onStop={onStop}
          isStreaming={isStreaming} isLoading={isLoading}
          isVADActive={isVADActive}
          audioSource={audioSource} setAudioSource={setAudioSource}
          openSettings={() => setIsSettingsOpen(!isSettingsOpen)}
          stream={stream}
          isHost={activeSpeakerId === userId || activeSpeakerId === null}
        />
      </Draggable>

      {isSettingsOpen && (
        <Draggable initialPos={settingsPos} onPosChange={setSettingsPos} handleClass="settings-drag-handle">
          <SettingsModal 
            onClose={() => setIsSettingsOpen(false)}
            userId={userId}
            meetingId={meetingId}
            setMeetingId={setMeetingId}
            participants={participants}
            setParticipants={setParticipants}
            sourceLanguage={sourceLanguage}
            setSourceLanguage={setSourceLanguage}
            learningContext={learningContext}
            setLearningContext={setLearningContext}
            showTranscription={showTranscription}
            setShowTranscription={setShowTranscription}
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
      className={`fixed cursor-grab active:cursor-grabbing z-[999] pointer-events-auto ${isDragging ? 'opacity-70 scale-[1.02] duration-0' : 'duration-300 transition-all'}`} 
      style={{ left: pos.x, top: pos.y }} 
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
};

export default App;