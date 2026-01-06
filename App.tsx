
import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import SettingsModal from './components/SettingsModal';
import { AudioService, AudioSource } from './services/audioService';
import { GeminiLiveService } from './services/geminiService';
import { SupabaseService } from './services/supabaseService';

export interface TranscriptionSegment {
  id: string;
  speaker: string;
  text: string;
  emotion: string;
  timestamp: number;
}

const App: React.FC = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>(AudioSource.MIC);
  const [sourceLanguage, setSourceLanguage] = useState('English (US)');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showTranscription, setShowTranscription] = useState(true);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [liveTurnText, setLiveTurnText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ status: 'idle' | 'syncing' | 'error' | 'success', message?: string }>({ status: 'idle' });
  
  const meetingIdRef = useRef('');
  const cumulativeSourceRef = useRef('');
  const [displayMeetingId, setDisplayMeetingId] = useState('');
  
  // Ref for proactive saving (if turnComplete is slow)
  const lastTextRef = useRef('');
  const silenceTimeoutRef = useRef<number | null>(null);

  // Initial Draggable Positions
  const [transPos, setTransPos] = useState({ x: window.innerWidth / 2 - 200, y: window.innerHeight - 120 });
  const [settingsPos, setSettingsPos] = useState({ x: 100, y: 140 });
  const [controlPos, setControlPos] = useState({ x: 30, y: 30 });

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());

  const saveToSupabase = async (text: string) => {
    if (!text.trim()) return;
    setSyncStatus({ status: 'syncing' });
    
    const currentFull = cumulativeSourceRef.current;
    const updatedFull = currentFull + (currentFull ? " " : "") + text.trim();
    cumulativeSourceRef.current = updatedFull;

    const result = await SupabaseService.saveTranscription({
      meeting_id: meetingIdRef.current,
      speaker_id: '00000000-0000-0000-0000-000000000000',
      transcribe_text_segment: text.trim(),
      full_transcription: updatedFull,
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

    // Proactive "Silence" Detection
    // If Gemini hasn't sent 'isFinal' but text stopped changing, we save it after 3 seconds
    if (silenceTimeoutRef.current) window.clearTimeout(silenceTimeoutRef.current);
    
    if (isFinal) {
      const cleanText = text.trim();
      const newSegment: TranscriptionSegment = {
        id: crypto.randomUUID(),
        speaker: 'System',
        text: cleanText,
        emotion: 'NEUTRAL',
        timestamp: Date.now()
      };

      setSegments(prev => [...prev, newSegment].slice(-20));
      setLiveTurnText('');
      saveToSupabase(cleanText);

      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSegment)
        }).catch(() => {});
      }
    } else {
      setLiveTurnText(text);
      lastTextRef.current = text;
      
      // Proactive save timer
      silenceTimeoutRef.current = window.setTimeout(() => {
        if (lastTextRef.current) {
          // If we have text that hasn't changed, treat it as a segment
          handleTranscription(lastTextRef.current, true);
        }
      }, 3500);
    }
  }, [webhookUrl]);

  const onStart = async (source: AudioSource) => {
    setIsLoading(true);
    setSyncStatus({ status: 'idle' });
    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
      }
    } catch (e) {
      console.warn("API Key check skipped");
    }

    const newMeetingId = `ORBIT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    meetingIdRef.current = newMeetingId;
    setDisplayMeetingId(newMeetingId);
    cumulativeSourceRef.current = '';
    setSegments([]);
    
    try {
      const mediaStream = await audioServiceRef.current.getStream(source);
      setStream(mediaStream);
      
      await geminiServiceRef.current.startStreaming(
        mediaStream,
        {
          onTranscription: handleTranscription,
          onError: (err) => {
            console.error("Gemini Error:", err);
            if (err.includes("not found")) (window as any).aistudio.openSelectKey();
            onStop();
          },
          onClose: () => onStop()
        },
        sourceLanguage
      );
      
      setIsStreaming(true);
    } catch (err) {
      alert("Session Failed: " + (err as Error).message);
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
  };

  const currentDisplay = liveTurnText || (segments.length > 0 ? segments[segments.length - 1].text : "");

  return (
    <div className="min-h-screen bg-transparent text-white font-sans relative overflow-hidden">
      {/* Draggable Subtitle Overlay */}
      {showTranscription && currentDisplay && (
        <Draggable initialPos={transPos} onPosChange={setTransPos}>
          <div className="bg-black/40 backdrop-blur-2xl px-8 py-3 rounded-full border border-white/10 whitespace-nowrap flex items-center shadow-2xl">
            <p className="text-[16px] font-helvetica-thin text-white tracking-wider">
              {currentDisplay}
            </p>
          </div>
        </Draggable>
      )}

      {/* Draggable Main Control Button */}
      <Draggable initialPos={controlPos} onPosChange={setControlPos} handleClass="control-drag-handle">
        <SpeakNowButton 
          onStart={onStart}
          onStop={onStop}
          isStreaming={isStreaming}
          isLoading={isLoading}
          audioSource={audioSource}
          setAudioSource={setAudioSource}
          openSettings={() => setIsSettingsOpen(!isSettingsOpen)}
          stream={stream}
        />
      </Draggable>

      {/* Draggable Settings Modal */}
      {isSettingsOpen && (
        <Draggable initialPos={settingsPos} onPosChange={setSettingsPos} handleClass="settings-handle">
          <SettingsModal 
            onClose={() => setIsSettingsOpen(false)}
            meetingId={displayMeetingId}
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

// Robust Draggable Wrapper Component
const Draggable: React.FC<{ 
  children: React.ReactNode; 
  initialPos: { x: number, y: number }; 
  onPosChange?: (pos: { x: number, y: number }) => void;
  handleClass?: string;
}> = ({ children, initialPos, onPosChange, handleClass }) => {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    if (handleClass && !(e.target as HTMLElement).closest(`.${handleClass}`)) return;
    const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
    if (!handleClass && (targetTag === 'button' || targetTag === 'input' || targetTag === 'select' || targetTag === 'textarea')) return;

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
  }, [isDragging, onPosChange]);

  return (
    <div 
      className={`fixed cursor-grab active:cursor-grabbing z-[80] transition-shadow duration-200 ${isDragging ? 'shadow-2xl' : ''}`}
      style={{ left: pos.x, top: pos.y, userSelect: isDragging ? 'none' : 'auto' }}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
};

export default App;
