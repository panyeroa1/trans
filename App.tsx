import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
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
  const [cumulativeSource, setCumulativeSource] = useState('');
  const [meetingId, setMeetingId] = useState('');

  // Draggable state for transcription
  const [transPos, setTransPos] = useState({ x: window.innerWidth / 2 - 200, y: window.innerHeight - 150 });
  const [isDraggingTrans, setIsDraggingTrans] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

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
      setCumulativeSource(prev => prev + (prev ? " " : "") + cleanText);

      SupabaseService.saveTranscription({
        meeting_id: meetingId,
        speaker_id: '00000000-0000-0000-0000-000000000000', // Default UUID for tagless
        transcribe_text_segment: cleanText,
        full_transcription: cumulativeSource + (cumulativeSource ? " " : "") + cleanText,
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
  }, [meetingId, webhookUrl, cumulativeSource]);

  const onStart = async (source: AudioSource) => {
    setIsLoading(true);
    const newMeetingId = `ORBIT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setMeetingId(newMeetingId);
    setSegments([]);
    setCumulativeSource('');
    
    try {
      const mediaStream = await audioServiceRef.current.getStream(source);
      setStream(mediaStream);
      
      await geminiServiceRef.current.startStreaming(
        mediaStream,
        {
          onTranscription: handleTranscription,
          onError: (err) => {
            console.error("Gemini Error:", err);
            onStop();
          },
          onClose: () => onStop()
        },
        { enabled: translationEnabled, targetLanguage }
      );
      
      setIsStreaming(true);
    } catch (err) {
      alert("Capture Failed: " + (err as Error).message);
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

  // Global mouse handlers for dragging transcription
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingTrans) {
        setTransPos({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y
        });
      }
    };
    const handleMouseUp = () => setIsDraggingTrans(false);

    if (isDraggingTrans) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTrans]);

  const startDragging = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragStartPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    setIsDraggingTrans(true);
  };

  const currentDisplay = liveTurnText || (segments.length > 0 ? segments[segments.length - 1].text : "");

  return (
    <div className="min-h-screen bg-black/10 text-white font-sans relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-lime-500/5 blur-[150px] rounded-full pointer-events-none" />
      
      {/* HUD Header */}
      <header className="fixed top-6 left-6 z-50 flex items-center space-x-4">
        <div className="h-2 w-2 rounded-full bg-lime-500 animate-pulse" />
        <h1 className="text-[10px] font-black tracking-[0.3em] uppercase text-zinc-400">
          EBURON.AI <span className="text-zinc-600">Flash Relay</span>
        </h1>
      </header>

      {/* Single-Line Draggable Transcription */}
      {showTranscription && (currentDisplay) && (
        <div 
          className="fixed z-[60] cursor-grab active:cursor-grabbing pointer-events-auto"
          style={{ left: transPos.x, top: transPos.y }}
          onMouseDown={startDragging}
        >
          <div className="bg-black/20 backdrop-blur-xl px-6 py-2 rounded-full border border-white/5 whitespace-nowrap flex items-center shadow-2xl">
            <p className="text-[14px] font-helvetica-thin text-white tracking-wide">
              {currentDisplay}
            </p>
          </div>
        </div>
      )}

      {/* Pill Control */}
      <SpeakNowButton 
        onStart={onStart}
        onStop={onStop}
        isStreaming={isStreaming}
        isLoading={isLoading}
        stream={stream}
        audioSource={audioSource}
        setAudioSource={setAudioSource}
        translationEnabled={translationEnabled}
        setTranslationEnabled={setTranslationEnabled}
        targetLanguage={targetLanguage}
        setTargetLanguage={setTargetLanguage}
        webhookUrl={webhookUrl}
        setWebhookUrl={setWebhookUrl}
        translationWebhookUrl={translationWebhookUrl}
        setTranslationWebhookUrl={setTranslationWebhookUrl}
        showTranscription={showTranscription}
        setShowTranscription={setShowTranscription}
        segments={segments}
        cumulativeSource={cumulativeSource}
        liveTurnText={liveTurnText}
        meetingId={meetingId}
      />
    </div>
  );
};

export default App;