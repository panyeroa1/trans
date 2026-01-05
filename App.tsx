
import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import WebhookConfig from './components/WebhookConfig';
import { AudioService, AudioSource } from './services/audioService';
import { GeminiLiveService } from './services/geminiService';

const EMOTION_COLORS: Record<string, string> = {
  'JOYFUL': '#FFD700', // Gold/Yellow
  'ANGRY': '#FF4500',  // OrangeRed
  'SAD': '#1E90FF',    // DodgerBlue
  'NEUTRAL': '#32CD32' // LimeGreen
};

const App: React.FC = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState('');
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

  useEffect(() => {
    localStorage.setItem('transcribe_webhook_url', webhookUrl);
  }, [webhookUrl]);

  const pushToWebhook = async (text: string, emotion: string) => {
    if (!webhookUrl) return;
    
    let targetEndpoint = webhookUrl.replace(/\/+$/, '');
    if (!targetEndpoint.endsWith('/transcription')) {
      targetEndpoint += '/transcription';
    }

    const payload = {
      text,
      emotion,
      timestamp: new Date().toISOString(),
      type: 'transcription_chunk',
      session_id: 'live_session_' + Date.now().toString(36)
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

  const handleStartTranscription = async (source: AudioSource) => {
    setIsLoading(true);
    setError(null);
    try {
      const stream = await audioServiceRef.current.getStream(source);
      setActiveStream(stream);
      
      await geminiServiceRef.current.startStreaming(stream, {
        onTranscription: (text, isFinal) => {
          let cleanText = text;
          let detectedEmotion = 'NEUTRAL';

          // Extract emotion tag if present: [EMOTION] text
          const emotionMatch = text.match(/^\[(JOYFUL|ANGRY|SAD|NEUTRAL)\]\s*(.*)/i);
          if (emotionMatch) {
            detectedEmotion = emotionMatch[1].toUpperCase();
            cleanText = emotionMatch[2];
            setCurrentEmotion(detectedEmotion);
          }

          setTranscription(prev => {
            const next = prev ? `${prev} ${cleanText}` : cleanText;
            const words = next.split(' ');
            if (words.length > 15) {
              return words.slice(-12).join(' ');
            }
            return next;
          });

          pushToWebhook(cleanText, detectedEmotion);

          if (transcriptionTimeoutRef.current) clearTimeout(transcriptionTimeoutRef.current);
          transcriptionTimeoutRef.current = setTimeout(() => {
            setTranscription('');
            setCurrentEmotion('NEUTRAL');
          }, 5000);
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
      if (err.name === 'NotAllowedError') {
        setError("Permission denied: Please grant access to your microphone or screen audio to continue.");
      } else if (err.name === 'NotFoundError') {
        setError("Audio device not found. Please check your hardware connections.");
      } else {
        setError(err.message || "An unexpected error occurred while starting audio capture.");
      }
      console.error(err);
      handleStopTranscription(); // Ensure everything is cleaned up
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopTranscription = useCallback(() => {
    geminiServiceRef.current.stop();
    audioServiceRef.current.stop();
    setIsStreaming(false);
    setTranscription('');
    setCurrentEmotion('NEUTRAL');
    setWebhookStatus('idle');
    setActiveStream(null);
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-zinc-100 flex flex-col items-center justify-center p-4">
      <WebhookConfig 
        url={webhookUrl} 
        onUpdate={setWebhookUrl} 
        recentPayloads={recentPayloads} 
      />
      
      <div 
        className="fixed z-50 pointer-events-none flex justify-center items-center h-[24px]"
        style={{ 
          left: buttonPosition.x, 
          top: buttonPosition.y - 120, 
          width: '200px', 
          transform: 'translateX(-25%)' 
        }}
      >
        <p 
          className="font-helvetica-thin text-[16px] whitespace-nowrap tracking-widest drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] animate-in fade-in duration-500 transition-colors"
          style={{ color: EMOTION_COLORS[currentEmotion] || EMOTION_COLORS.NEUTRAL }}
        >
          {transcription}
        </p>
      </div>

      <div className="fixed z-40 transition-all duration-300">
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
        <div className="fixed bottom-4 left-4 bg-red-900/90 border border-red-500/50 text-white p-4 rounded-xl text-xs font-mono z-50 backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-left-4">
          <div className="flex items-center space-x-3">
            <span className="bg-red-500 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">ERROR</span>
            <span className="max-w-xs">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-2 text-white/50 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="fixed bottom-4 right-4 flex items-center space-x-3 bg-black/40 px-4 py-1 rounded-full border border-white/5 backdrop-blur-md z-50">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-lime-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
          </span>
          <span className="text-[10px] uppercase tracking-widest font-bold text-lime-500">LIVE BROADCAST</span>
        </div>
      )}
    </div>
  );
};

export default App;
