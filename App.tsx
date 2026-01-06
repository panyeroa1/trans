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
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('English (US)');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [translationWebhookUrl, setTranslationWebhookUrl] = useState('');
  const [showTranscription, setShowTranscription] = useState(true);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [liveTurnText, setLiveTurnText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const meetingIdRef = useRef('');
  const cumulativeSourceRef = useRef('');
  const [displayMeetingId, setDisplayMeetingId] = useState('');

  // Initial Draggable Positions
  const [transPos, setTransPos] = useState({ x: window.innerWidth / 2 - 200, y: window.innerHeight - 120 });
  const [settingsPos, setSettingsPos] = useState({ x: 100, y: 140 });
  const [controlPos, setControlPos] = useState({ x: 30, y: 30 });

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());

  const handleTranscription = useCallback((text: string, isFinal: boolean) => {
    if (!text.trim()) return;

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
      
      const currentFull = cumulativeSourceRef.current;
      const updatedFull = currentFull + (currentFull ? " " : "") + cleanText;
      cumulativeSourceRef.current = updatedFull;

      SupabaseService.saveTranscription({
        meeting_id: meetingIdRef.current,
        speaker_id: '00000000-0000-0000-0000-000000000000',
        transcribe_text_segment: cleanText,
        full_transcription: updatedFull,
        users_all: ['System']
      });

      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSegment)
        }).catch(() => {});
      }
    } else {
      setLiveTurnText(text);
    }
  }, [webhookUrl]);

  const onStart = async (source: AudioSource) => {
    setIsLoading(true);
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
        { enabled: translationEnabled, targetLanguage }
      );
      
      setIsStreaming(true);
    } catch (err) {
      alert("Session Failed: " + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const onStop = () => {
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
            targetLanguage={targetLanguage}
            setTargetLanguage={setTargetLanguage}
            translationEnabled={translationEnabled}
            setTranslationEnabled={setTranslationEnabled}
            showTranscription={showTranscription}
            setShowTranscription={setShowTranscription}
            webhookUrl={webhookUrl}
            setWebhookUrl={setWebhookUrl}
            translationWebhookUrl={translationWebhookUrl}
            setTranslationWebhookUrl={setTranslationWebhookUrl}
            cumulativeSource={cumulativeSourceRef.current}
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
    // If handleClass is specified, only allow dragging if the target (or its parent) matches the class
    if (handleClass && !(e.target as HTMLElement).closest(`.${handleClass}`)) return;
    
    // Prevent dragging when clicking on inputs/buttons inside the draggable if they aren't the handle
    const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
    if (!handleClass && (targetTag === 'button' || targetTag === 'input' || targetTag === 'select')) return;

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