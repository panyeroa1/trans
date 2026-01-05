
import React, { useState, useCallback, useRef, useEffect } from 'react';
import SpeakNowButton from './components/SpeakNowButton';
import WebhookConfig from './components/WebhookConfig';
import { AudioService, AudioSource } from './services/audioService';
import { GeminiLiveService } from './services/geminiService';

const App: React.FC = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>(() => localStorage.getItem('transcribe_webhook_url') || '');
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [recentPayloads, setRecentPayloads] = useState<any[]>([]);
  const [buttonPosition, setButtonPosition] = useState({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 + 50 });

  const audioServiceRef = useRef(new AudioService());
  const geminiServiceRef = useRef(new GeminiLiveService());
  const transcriptionTimeoutRef = useRef<any | null>(null);

  useEffect(() => {
    localStorage.setItem('transcribe_webhook_url', webhookUrl);
  }, [webhookUrl]);

  const pushToWebhook = async (text: string) => {
    if (!webhookUrl) return;
    
    let targetEndpoint = webhookUrl.replace(/\/+$/, '');
    if (!targetEndpoint.endsWith('/transcription')) {
      targetEndpoint += '/transcription';
    }

    const payload = {
      text,
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
      
      await geminiServiceRef.current.startStreaming(stream, {
        onTranscription: (text, isFinal) => {
          setTranscription(prev => {
            const next = prev ? `${prev} ${text}` : text;
            const words = next.split(' ');
            if (words.length > 15) {
              return words.slice(-12).join(' ');
            }
            return next;
          });

          pushToWebhook(text);

          if (transcriptionTimeoutRef.current) clearTimeout(transcriptionTimeoutRef.current);
          transcriptionTimeoutRef.current = setTimeout(() => {
            setTranscription('');
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
      setError(err.message || "Failed to start audio capture");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopTranscription = useCallback(() => {
    geminiServiceRef.current.stop();
    audioServiceRef.current.stop();
    setIsStreaming(false);
    setTranscription('');
    setWebhookStatus('idle');
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-zinc-100 flex flex-col items-center justify-center p-4">
      <WebhookConfig 
        url={webhookUrl} 
        onUpdate={setWebhookUrl} 
        recentPayloads={recentPayloads} 
      />
      
      {/* Floating Transcription Area: Dynamically positioned relative to the button */}
      <div 
        className="fixed z-50 pointer-events-none flex justify-center items-center h-[24px]"
        style={{ 
          left: buttonPosition.x, 
          top: buttonPosition.y - 120, 
          width: '200px', 
          transform: 'translateX(-25%)' 
        }}
      >
        <p className="font-helvetica-thin text-[16px] text-[#32CD32] whitespace-nowrap tracking-widest drop-shadow-[0_0_8px_rgba(50,205,50,0.8)] animate-in fade-in duration-500">
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
        />
      </div>

      {error && (
        <div className="fixed bottom-4 left-4 bg-red-500/80 border border-red-500/20 text-white p-4 rounded-xl text-xs font-mono z-50 backdrop-blur-md">
          <span className="font-bold mr-2">[ERROR]</span> {error}
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
