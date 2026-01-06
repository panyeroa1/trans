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
  private session: any = null;
  private processor: ScriptProcessorNode | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  async startStreaming(
    stream: MediaStream, 
    callbacks: LiveTranscriptionCallbacks, 
    translation: TranslationConfig = { enabled: false, targetLanguage: 'English' }
  ) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      callbacks.onError("API Key missing. Check your connection or select a valid key.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    // Initialize Audio Contexts for high-quality audio processing
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    this.nextStartTime = 0;
    
    // Enhanced system instruction for the requested dialects and automatic detection
    let instruction = `You are the EBURON.AI Multilingual Real-Time Transcription Relay.
CORE OBJECTIVE:
- AUTOMATICALLY detect the source language being spoken.
- Output ONLY verbatim text. NO tags, NO speaker labels, NO metadata.

HIGH-PRIORITY DIALECT SUPPORT:
You must provide ultra-accurate transcription for:
- French (France and African variations)
- Dutch (Netherlands and Flemish)
- Medumba (Cameroon)
- Ivory Coast dialects: Baoulé and Dioula.

OPERATIONAL CONSTRAINTS:
1. Verbatim relay only. Do not attempt to fix grammar unless it clearly clarifies the dialect's intent.
2. NO conversational responses. You are a transcription tool, not a chat assistant.
3. Transcribe in the original language by default.`;
    
    if (translation.enabled) {
      instruction += `\n\nTRANSLATION OVERRIDE:
- Translate the detected source language into ${translation.targetLanguage}.
- Format: [Source Text] -> [Translation]`;
    }

    try {
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (!this.inputAudioContext) return;
            const source = this.inputAudioContext.createMediaStreamSource(stream);
            this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
            
            this.processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm = AudioService.createPCM16Blob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcm });
              }).catch(err => console.debug("Input send fail", err));
            };

            source.connect(this.processor);
            this.processor.connect(this.inputAudioContext.destination);
            console.debug("Gemini session opened. Auto-detecting source audio...");
          },
          onmessage: async (message: any) => {
            // 1. Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              callbacks.onTranscription(message.serverContent.inputTranscription.text, !!message.serverContent.turnComplete);
            } else if (message.serverContent?.outputTranscription) {
              callbacks.onTranscription(message.serverContent.outputTranscription.text, !!message.serverContent.turnComplete);
            }

            // 2. Handle Audio Output (Mandatory for maintaining session connectivity)
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const buffer = await AudioService.decodeAudioData(
                AudioService.decode(audioData),
                this.outputAudioContext,
                24000,
                1
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = buffer;
              source.connect(this.outputAudioContext.destination);
              source.addEventListener('ended', () => this.activeSources.delete(source));
              source.start(this.nextStartTime);
              this.nextStartTime += buffer.duration;
              this.activeSources.add(source);
            }

            // 3. Handle Interruptions
            if (message.serverContent?.interrupted) {
              this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
              this.activeSources.clear();
              this.nextStartTime = 0;
            }
          },
          onerror: (err: any) => {
            console.error("Gemini Socket Error:", err);
            callbacks.onError(err.message || "Network error. Please verify your API key and network.");
          },
          onclose: () => {
            callbacks.onClose();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {}, 
          systemInstruction: instruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          }
        }
      });

      this.session = await sessionPromise;
    } catch (err: any) {
      callbacks.onError(err.message || "Failed to establish Gemini connection.");
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.activeSources.clear();
    if (this.session) {
      try { this.session.close(); } catch (e) {}
      this.session = null;
    }
  }
}