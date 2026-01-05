
import { GoogleGenAI, Modality } from "@google/genai";
import { AudioService } from "./audioService";

export interface LiveTranscriptionCallbacks {
  onTranscription: (text: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private processor: ScriptProcessorNode | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: (process.env.API_KEY as string) });
  }

  async startStreaming(stream: MediaStream, callbacks: LiveTranscriptionCallbacks) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    try {
      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          systemInstruction: "You are a transcription assistant. Your only job is to provide real-time transcription of the incoming audio. Do not respond verbally unless asked, just facilitate transcription.",
        },
        callbacks: {
          onopen: () => {
            const source = audioContext.createMediaStreamSource(stream);
            this.processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            this.processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm = AudioService.createPCM16Blob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcm });
              });
            };

            source.connect(this.processor);
            this.processor.connect(audioContext.destination);
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              callbacks.onTranscription(text, !!message.serverContent.turnComplete);
            }
          },
          onerror: (err) => {
            callbacks.onError(err.message || "Unknown API error");
          },
          onclose: () => {
            callbacks.onClose();
          }
        }
      });

      this.session = await sessionPromise;
    } catch (err: any) {
      callbacks.onError(err.message || "Failed to connect to Gemini Live");
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
