
import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import WebhookConfig from './components/WebhookConfig';
import { AudioService, AudioSource } from './services/audioService';
import { GeminiLiveService } from './services/geminiService';

const EMOTION_COLORS: Record<string, string> = {
  'JOYFUL': '#FFD700', // Gold
  'ANGRY': '#FF4500',  // OrangeRed
  'SAD': '#1E90FF',    // DodgerBlue
  'NEUTRAL': '#32CD32' // LimeGreen
};

const SPEAKER_COLORS = [
  '#32CD32', // Speaker 0 (Default Lime)
  '#FF00FF', // Speaker 1 (Magenta)
  '#00FFFF', // Speaker 2 (Cyan)
  '#FFFFFF', // Speaker 3 (White)
  '#FFA500', // Speaker 4 (Orange)
];

interface TranscriptionSegment {
  id: string;
  text: string;
  speaker: string;
  emotion: string;
  isNew: boolean;
}

/**
 * Renders text character-by-character at a high speed to simulate 
 * professional videoke/karaoke subtitles while keeping up with word-stream speed.
 */
const TypewriterText: React.FC<{ 
  text: string; 
  color: string; 
  isNew: boolean;
}> = ({ text, color, isNew }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset if the segment text changes significantly
    if (text.length < displayedText.length) {
      setDisplayedText('');
    }

    const reveal = () => {
      if (displayedText.length < text.length) {
        const distance = text.length - displayedText.length;
        const increment = distance > 10 ? 3 : 1;
        
        setDisplayedText(text.slice(0, displayedText.length + increment));
        
        const delay = distance > 5 ? 10 : 25;
        timerRef.current = window.setTimeout(reveal, delay);
      } else {
        setIsComplete(true);
      }
    };

    timerRef.current = window.setTimeout(reveal, 20);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, displayedText]);

  return (
    <p 
      className={`font-helvetica-thin text-[16px] tracking-wide transition-all duration-300 ${isNew ? 'brightness-150' : ''}`}
      style={{ 
        color: color,
        textShadow: isNew 
          ? `0 0 15px ${color}, 0 0 5px #000` 
          : `0 0 5px rgba(0,0,0,0.8)`
      }}
    >
      {displayedText}
      {!isComplete && isNew && (
        <span className="inline-block w-[2px] h-[14px] bg-white ml-0.5 animate-pulse" />
      )}
    </p>
  );
};

const App: React.FC = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker 0');
  const [currentEmotion, setCurrentEmotion] = useState('NEUTRAL');
  const [error, setError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>(() => localStorage.getItem('transcribe_webhook_url') || '');
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [recentPayloads, setRecentPayloads] = useState<any[]>([]);
  const [buttonPosition, setButtonPosition] = useState({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 + 50 });
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());
  const transcriptionTimeoutRef = useRef<any | null>(null);
  const highlightTimeoutRef = useRef<any | null>(null);

  useEffect(() => {
    localStorage.setItem('transcribe_webhook_url', webhookUrl);
  }, [webhookUrl]);

  const pushToWebhook = async (text: string, emotion: string, speaker: string) => {
    if (!webhookUrl) return;
    
    let targetEndpoint = webhookUrl.replace(/\/+$/, '');
    if (!targetEndpoint.endsWith('/transcription')) {
      targetEndpoint += '/transcription';
    }

    const payload = {
      text,
      emotion,
      speaker,
      timestamp: new Date().toISOString(),
      type: 'transcription_chunk',
    };

    setRecentPayloads(prev => [payload, ...prev].slice(0, 5));
    setWebhookStatus('sending');
    
    try {
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setWebhookStatus('success');
      } else {
        setWebhookStatus('error');
      }
    } catch (e) {
      console.error('Webhook push failed:', e);
      setWebhookStatus('error');
    }
  };

  const parseTranscription = (rawText: string) => {
    let text = rawText;
    let speaker = currentSpeaker;
    let emotion = currentEmotion;

    const speakerMatch = text.match(/\[Speaker (\d+)\]/i);
    if (speakerMatch) {
      speaker = `Speaker ${speakerMatch[1]}`;
      text = text.replace(speakerMatch[0], '');
    }

    const emotionTags = Object.keys(EMOTION_COLORS);
    for (const tag of emotionTags) {
      const pattern = `[${tag}]`;
      if (text.toUpperCase().includes(pattern)) {
        emotion = tag;
        text = text.replace(new RegExp(`\\[${tag}\\]`, 'gi'), '');
        break;
      }
    }

    return { speaker, emotion, cleanText: text.trim() };
  };

  const handleStartTranscription = async (source: AudioSource) => {
    setIsLoading(true);
    setError(null);
    setSegments([]);
    
    try {
      const stream = await audioServiceRef.current.getStream(source);
      setActiveStream(stream);
      
      await geminiServiceRef.current.startStreaming(stream, {
        onTranscription: (text, isFinal) => {
          const { speaker, emotion, cleanText } = parseTranscription(text);
          if (!cleanText) return;

          setCurrentSpeaker(speaker);
          setCurrentEmotion(emotion);

          const newSegment: TranscriptionSegment = {
            id: Math.random().toString(36).substring(2, 9),
            text: cleanText,
            speaker,
            emotion,
            isNew: true
          };

          setSegments(prev => {
            const next = [...prev, newSegment];
            return next.slice(-8);
          });

          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = setTimeout(() => {
            setSegments(prev => prev.map(s => s.id === newSegment.id ? { ...s, isNew: false } : s));
          }, 1200);

          pushToWebhook(cleanText, emotion, speaker);

          if (transcriptionTimeoutRef.current) clearTimeout(transcriptionTimeoutRef.current);
          transcriptionTimeoutRef.current = setTimeout(() => {
            setSegments([]);
            setCurrentEmotion('NEUTRAL');
          }, 8000);
        },
        onError: (err) => {
          setError(err);
          handleStopTranscription();
        },
        onClose: () => {
          handleStopTranscription();
        }
      });

      setIsStreaming(true);
    } catch (err: any) {
      setError(err.message || "Failed to start capture.");
      handleStopTranscription();
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopTranscription = useCallback(() => {
    geminiServiceRef.current.stop();
    audioServiceRef.current.stop();
    setIsStreaming(false);
    setSegments([]);
    setCurrentEmotion('NEUTRAL');
    setWebhookStatus('idle');
    setActiveStream(null);
    if (transcriptionTimeoutRef.current) clearTimeout(transcriptionTimeoutRef.current);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

  const getSpeakerIndex = (speaker: string) => {
    const num = parseInt(speaker.split(' ')[1]) || 0;
    return num % SPEAKER_COLORS.length;
  };

  return (
    <div className="min-h-screen bg-transparent text-zinc-100 flex flex-col items-center justify-center p-4">
      <WebhookConfig 
        url={webhookUrl} 
        onUpdate={setWebhookUrl} 
        recentPayloads={recentPayloads} 
        status={webhookStatus}
      />
      
      {/* Transcription Output (Diarized, Segmented, Character-by-Character reveal) */}
      <div 
        className={`fixed z-50 pointer-events-none flex justify-center items-center transition-opacity duration-500 ${segments.length > 0 ? 'opacity-100' : 'opacity-0'}`}
        style={{ 
          left: buttonPosition.x, 
          top: buttonPosition.y - 180, 
          width: '800px', 
          transform: 'translateX(-40%)' 
        }}
      >
        <div className="inline-flex flex-wrap justify-center items-center gap-x-3 gap-y-2 max-w-full bg-black/25 backdrop-blur-xl px-8 py-3 rounded-3xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all duration-500 overflow-hidden">
          {segments.map((seg, idx) => (
            <div 
              key={seg.id}
              className={`flex items-center space-x-2 transition-all duration-700 ease-out transform ${seg.isNew ? 'scale-105 translate-y-[-2px] opacity-100' : 'scale-100 translate-y-0 opacity-80'}`}
            >
              {(idx === 0 || segments[idx-1].speaker !== seg.speaker) && (
                <span 
                  className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter shadow-sm flex-shrink-0"
                  style={{ 
                    backgroundColor: SPEAKER_COLORS[getSpeakerIndex(seg.speaker)],
                    color: '#000'
                  }}
                >
                  {seg.speaker}
                </span>
              )}
              
              <TypewriterText 
                text={seg.text} 
                color={EMOTION_COLORS[seg.emotion] || EMOTION_COLORS.NEUTRAL} 
                isNew={seg.isNew} 
              />
            </div>
          ))}
        </div>
      </div>

      <div className="fixed z-40">
        <SpeakNowButton 
          onStart={handleStartTranscription}
          onStop={handleStopTranscription}
          isStreaming={isStreaming}
          isLoading={isLoading}
          onPositionChange={setButtonPosition}
          initialPosition={buttonPosition}
          stream={activeStream}
        />
      </div>

      {error && (
        <div className="fixed bottom-4 left-4 bg-red-950/90 border border-red-500/20 text-white p-4 rounded-2xl text-[10px] font-mono z-50 backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-left-6">
          <div className="flex items-center space-x-3">
            <span className="bg-red-500 px-1.5 py-0.5 rounded font-black">ERR</span>
            <span className="max-w-xs">{error}</span>
            <button onClick={() => setError(null)} className="opacity-40 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="fixed bottom-4 right-4 flex items-center space-x-3 bg-black/40 px-5 py-2 rounded-full border border-white/5 backdrop-blur-xl z-50 shadow-2xl animate-in fade-in slide-in-from-right-6">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
          </div>
          <span className="text-[10px] uppercase tracking-widest font-black text-lime-500/80">
            {currentSpeaker} • {currentEmotion}
          </span>
        </div>
      )}
    </div>
  );
};

export default App;
