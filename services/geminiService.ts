
import { GoogleGenAI, Modality } from "@google/genai";
import { AudioService } from "./audioService";

export interface LiveTranscriptionCallbacks {
  onTranscription: (text: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export interface TranslationConfig {
  enabled: boolean;
  targetLanguage: string;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private processor: ScriptProcessorNode | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: (process.env.API_KEY as string) });
  }

  async startStreaming(
    stream: MediaStream, 
    callbacks: LiveTranscriptionCallbacks, 
    translation: TranslationConfig = { enabled: false, targetLanguage: 'English' }
  ) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    let instruction = "You are a professional real-time transcriptionist and speaker diarization expert. Your task is to transcribe audio and identify speakers. For every segment, detect the speaker and prepend with a tag like [Speaker 0], [Speaker 1], etc. Also detect the emotion and prepend it in uppercase brackets like [JOYFUL], [ANGRY], [SAD], or [NEUTRAL]. Example: '[Speaker 0] [JOYFUL] Good morning!'. If the speaker changes, update the tag immediately. Keep transcription verbatim.";
    
    if (translation.enabled) {
      instruction += ` Additionally, for every segment, you MUST provide the original source text followed by ' -> ' and its translation into ${translation.targetLanguage}. Format: [Speaker N] [EMOTION] Original verbatim text -> Translated text. Ensure the translation follows the source text after the arrow.`;
    }

    try {
      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          systemInstruction: instruction,
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
