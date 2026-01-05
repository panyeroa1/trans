
import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import { AudioService, AudioSource } from './services/audioService';
import { GeminiLiveService } from './services/geminiService';

const EMOTION_COLORS: Record<string, string> = {
  'JOYFUL': '#FFD700', // Gold
  'ANGRY': '#FF4500',  // OrangeRed
  'SAD': '#1E90FF',    // DodgerBlue
  'NEUTRAL': '#32CD32' // LimeGreen
};

const EMOTION_STYLES: Record<string, { fontSize: string, fontWeight: string, scale: string, letterSpacing: string }> = {
  'JOYFUL': { fontSize: '19px', fontWeight: '400', scale: '1.08', letterSpacing: '0.02em' },
  'ANGRY': { fontSize: '18px', fontWeight: '700', scale: '1.04', letterSpacing: '-0.01em' },
  'SAD': { fontSize: '15px', fontWeight: '100', scale: '0.96', letterSpacing: '0.05em' },
  'NEUTRAL': { fontSize: '16px', fontWeight: '100', scale: '1.0', letterSpacing: 'normal' }
};

const SPEAKER_COLORS = [
  '#32CD32', // Speaker 0 (Default Lime)
  '#FF00FF', // Speaker 1 (Magenta)
  '#00FFFF', // Speaker 2 (Cyan)
  '#FFFFFF', // Speaker 3 (White)
  '#FFA500', // Speaker 4 (Orange)
];

export interface TranscriptionSegment {
  id: string;
  text: string;
  translation?: string;
  speaker: string;
  emotion: string;
  isNew: boolean;
  isFinal: boolean;
}

const TypewriterText: React.FC<{ 
  text: string; 
  color: string; 
  isNew: boolean;
  emotion: string;
}> = ({ text, color, isNew, emotion }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (text.length > displayedText.length) {
      setIsTyping(true);
      const reveal = () => {
        const distance = text.length - displayedText.length;
        const increment = distance > 10 ? 3 : 1;
        const next = text.slice(0, displayedText.length + increment);
        setDisplayedText(next);
        if (next.length === text.length) setIsTyping(false);
      };
      const distance = text.length - displayedText.length;
      const delay = distance > 5 ? 10 : 25;
      timerRef.current = window.setTimeout(reveal, delay);
    } else {
      setIsTyping(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text, displayedText]);

  const style = EMOTION_STYLES[emotion] || EMOTION_STYLES.NEUTRAL;

  return (
    <p 
      className={`font-helvetica-thin tracking-wide transition-all duration-700 ease-out ${isNew ? 'brightness-150' : ''}`}
      style={{ 
        color, 
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        transform: `scale(${style.scale})`,
        transformOrigin: 'left center',
        textShadow: isNew ? `0 0 15px ${color}, 0 0 5px #000` : `0 0 5px rgba(0,0,0,0.8)` 
      }}
    >
      {displayedText}
      {isTyping && isNew && <span className="inline-block w-[2px] h-[14px] bg-white ml-0.5 animate-pulse" />}
    </p>
  );
};

const App: React.FC = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [cumulativeSource, setCumulativeSource] = useState<string>("");
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker 0');
  const [currentEmotion, setCurrentEmotion] = useState('NEUTRAL');
  const [error, setError] = useState<string | null>(null);
  
  // Settings State
  const [audioSource, setAudioSource] = useState<AudioSource>(AudioSource.MIC);
  const [webhookUrl, setWebhookUrl] = useState<string>(() => localStorage.getItem('transcribe_webhook_url') || '');
  const [translationWebhookUrl, setTranslationWebhookUrl] = useState<string>(() => localStorage.getItem('translate_webhook_url') || '');
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("English (US)");
  const [showTranscription, setShowTranscription] = useState(true);
  
  const [buttonPosition, setButtonPosition] = useState({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 + 50 });
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());
  const transcriptionTimeoutRef = useRef<any | null>(null);
  const highlightTimeoutRef = useRef<any | null>(null);
  const currentTurnIdRef = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem('transcribe_webhook_url', webhookUrl);
  }, [webhookUrl]);

  useEffect(() => {
    localStorage.setItem('translate_webhook_url', translationWebhookUrl);
  }, [translationWebhookUrl]);

  const pushToWebhook = async (text: string, emotion: string, speaker: string, type: 'transcription' | 'translation', translation?: string) => {
    const url = type === 'translation' ? translationWebhookUrl : webhookUrl;
    if (!url) return;
    
    let targetEndpoint = url.replace(/\/+$/, '') + (type === 'translation' ? '/translation' : '/transcription');
    const payload = { 
      text, 
      translation,
      emotion, 
      speaker, 
      type, 
      timestamp: new Date().toISOString(), 
      language: type === 'translation' ? targetLanguage : 'Source' 
    };
    
    try {
      await fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) { console.error(`Webhook push failed for ${type}:`, e); }
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

    let source = text.trim();
    let translation = '';

    if (translationEnabled && source.includes(' -> ')) {
      const parts = source.split(' -> ');
      source = parts[0].trim();
      translation = parts[1].trim();
    }

    return { speaker, emotion, source, translation };
  };

  const handleStartTranscription = async (source: AudioSource, translate: boolean = false) => {
    setIsLoading(true);
    setError(null);
    setSegments([]);
    setCumulativeSource("");
    setTranslationEnabled(translate);
    currentTurnIdRef.current = null;
    
    try {
      const stream = await audioServiceRef.current.getStream(source);
      setActiveStream(stream);
      await geminiServiceRef.current.startStreaming(stream, {
        onTranscription: (text, isFinal) => {
          const { speaker, emotion, source: cleanSource, translation: cleanTranslation } = parseTranscription(text);
          if (!cleanSource) return;
          
          setCurrentSpeaker(speaker);
          setCurrentEmotion(emotion);
          
          setSegments(prev => {
            const lastSeg = prev[prev.length - 1];
            // If we have an active turn that isn't final, and it matches the current turn ID, update it
            if (lastSeg && !lastSeg.isFinal && currentTurnIdRef.current === lastSeg.id) {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...lastSeg,
                text: cleanSource,
                translation: translate ? cleanTranslation : undefined,
                emotion,
                speaker,
                isFinal,
                isNew: true
              };
              return updated;
            } else {
              // Start a new turn
              const newId = Math.random().toString(36).substring(2, 9);
              currentTurnIdRef.current = newId;
              const newSegment: TranscriptionSegment = {
                id: newId,
                text: cleanSource,
                translation: translate ? cleanTranslation : undefined,
                speaker,
                emotion,
                isNew: true,
                isFinal
              };
              return [...prev, newSegment].slice(-40);
            }
          });

          // Update cumulative source only on final turns to prevent stuttering/repetition in the "God-view"
          if (isFinal) {
            setCumulativeSource(prev => prev + (prev ? " " : "") + cleanSource);
            pushToWebhook(cleanSource, emotion, speaker, translate ? 'translation' : 'transcription', cleanTranslation);
            currentTurnIdRef.current = null; // Reset turn ID after finalization
          }

          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = setTimeout(() => {
            setSegments(prev => prev.map(s => ({ ...s, isNew: false })));
          }, 1200);

          if (transcriptionTimeoutRef.current) clearTimeout(transcriptionTimeoutRef.current);
          transcriptionTimeoutRef.current = setTimeout(() => {
            setSegments([]);
            setCurrentEmotion('NEUTRAL');
          }, 30000);
        },
        onError: (err) => { setError(err); handleStopTranscription(); },
        onClose: () => { handleStopTranscription(); }
      }, { enabled: translate, targetLanguage });
      setIsStreaming(true);
    } catch (err: any) {
      setError(err.message || "Capture failed.");
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
    setCumulativeSource("");
    setCurrentEmotion('NEUTRAL');
    setActiveStream(null);
    currentTurnIdRef.current = null;
    if (transcriptionTimeoutRef.current) clearTimeout(transcriptionTimeoutRef.current);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

  const getSpeakerIndex = (speaker: string) => {
    const num = parseInt(speaker.split(' ')[1]) || 0;
    return num % SPEAKER_COLORS.length;
  };

  return (
    <div className="min-h-screen bg-transparent text-zinc-100 flex flex-col items-center justify-center p-4">
      {/* Subtitle Display */}
      {showTranscription && (
        <div 
          className={`fixed z-50 pointer-events-none flex justify-center items-center transition-opacity duration-500 ${segments.length > 0 ? 'opacity-100' : 'opacity-0'}`}
          style={{ left: buttonPosition.x, top: buttonPosition.y - 180, width: '800px', transform: 'translateX(-40%)' }}
        >
          <div className="inline-flex flex-wrap justify-center items-center gap-x-3 gap-y-2 max-w-full bg-black/25 backdrop-blur-xl px-8 py-3 rounded-3xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all duration-500 overflow-hidden">
            {segments.slice(-5).map((seg, idx) => (
              <div key={seg.id} className={`flex items-center space-x-2 transition-all duration-700 ease-out transform ${seg.isNew ? 'scale-105 translate-y-[-2px] opacity-100' : 'scale-100 translate-y-0 opacity-80'}`}>
                {(idx === 0 || segments.slice(-5)[idx-1].speaker !== seg.speaker) && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter shadow-sm flex-shrink-0" style={{ backgroundColor: SPEAKER_COLORS[getSpeakerIndex(seg.speaker)], color: '#000' }}>{seg.speaker}</span>
                )}
                <TypewriterText 
                  text={translationEnabled ? (seg.translation || seg.text) : seg.text} 
                  color={EMOTION_COLORS[seg.emotion] || EMOTION_COLORS.NEUTRAL} 
                  isNew={seg.isNew} 
                  emotion={seg.emotion}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fixed z-40">
        <SpeakNowButton 
          onStart={handleStartTranscription}
          onStop={handleStopTranscription}
          isStreaming={isStreaming}
          isLoading={isLoading}
          onPositionChange={setButtonPosition}
          initialPosition={buttonPosition}
          stream={activeStream}
          // Settings Props
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
            {translationEnabled ? `Translating to ${targetLanguage}` : `${currentSpeaker} • ${currentEmotion}`}
          </span>
        </div>
      )}
    </div>
  );
};

export default App;
