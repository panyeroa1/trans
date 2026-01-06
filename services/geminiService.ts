import { GoogleGenAI, Modality } from "@google/genai";
import { AudioService } from "./audioService";

export interface LiveTranscriptionCallbacks {
  onTranscription: (text: string, isFinal: boolean) => void;
  onVADChange: (isActive: boolean) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export class GeminiLiveService {
  private session: any = null;
  private processor: ScriptProcessorNode | null = null;
  private inputAudioContext: AudioContext | null = null;

  async startStreaming(
    stream: MediaStream, 
    callbacks: LiveTranscriptionCallbacks, 
    sourceLanguage: string = 'English (US)',
    learningContext: string = ''
  ) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      callbacks.onError("API Key missing.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();

    const instruction = `High-Fidelity Verbatim Engine (EBURON.AI).
MODE: REAL-TIME VOICE ISOLATION & TRANSCRIPTION.

CRITICAL INSTRUCTIONS:
1. VOICE FOCUS: Ignore background hum, keyboard clicks, or distant noises.
2. VERBATIM: Output EXACTLY what the human speaker says.
3. LANGUAGE: ${sourceLanguage}.
4. PUNCTUATION: Ensure complete sentences are marked with periods, question marks, or exclamation points to assist downstream segmentation.
5. NO DIALOGUE: Never speak back. You are a passive observer.
${learningContext ? `\nSPECIALIZED CONTEXT/VOCABULARY TO RECOGNIZE:\n${learningContext}\nUse the above terms to resolve phonetic ambiguities.` : ''}`;

    try {
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (!this.inputAudioContext) return;
            const source = this.inputAudioContext.createMediaStreamSource(stream);
            this.processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);
            
            let lastVADState = false;

            this.processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const isVoice = AudioService.isVoiceActive(inputData);
              if (isVoice !== lastVADState) {
                lastVADState = isVoice;
                callbacks.onVADChange(isVoice);
              }

              const pcm = AudioService.createPCM16Blob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcm });
              }).catch(() => {});
            };

            source.connect(this.processor);
            this.processor.connect(this.inputAudioContext.destination);
          },
          onmessage: async (message: any) => {
            const inputTrans = message.serverContent?.inputTranscription;
            if (inputTrans) {
              callbacks.onTranscription(inputTrans.text, !!message.serverContent.turnComplete);
            }
          },
          onerror: (err: any) => callbacks.onError(err.message),
          onclose: () => callbacks.onClose()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {}, 
          systemInstruction: instruction
        }
      });

      this.session = await sessionPromise;
    } catch (err: any) {
      callbacks.onError(err.message);
    }
  }

  stop() {
    if (this.processor) this.processor.disconnect();
    if (this.inputAudioContext) this.inputAudioContext.close();
    if (this.session) this.session.close();
  }
}