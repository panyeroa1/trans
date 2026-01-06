
import { GoogleGenAI, Modality } from "@google/genai";
import { AudioService } from "./audioService";

export interface LiveTranscriptionCallbacks {
  onTranscription: (text: string, isFinal: boolean) => void;
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
    sourceLanguage: string = 'English (US)'
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
MODE: PURE TRANSCRIPTION (STT).

CRITICAL INSTRUCTIONS:
1. LOCK-ON: Instantly adapt to the speaker's language: ${sourceLanguage}. 
2. NO SPEECH: You are a silent listener. Do not respond verbally. Do not translate. 
3. VERBATIM: Transcribe EXACTLY what is said. No corrections.
4. PHONETIC PRECISION: Support regional variants and dialects without hesitation.
5. OUTPUT: Pure text stream of user input only.`;

    try {
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (!this.inputAudioContext) return;
            const source = this.inputAudioContext.createMediaStreamSource(stream);
            this.processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);
            
            this.processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
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
            
            // Only handle user input transcription. 
            // We ignore outputTranscription and modelTurn audio to remove translation/AI voice.
            if (inputTrans) {
              callbacks.onTranscription(inputTrans.text, !!message.serverContent.turnComplete);
            }
          },
          onerror: (err: any) => callbacks.onError(err.message),
          onclose: () => callbacks.onClose()
        },
        config: {
          responseModalities: [Modality.AUDIO], // Required for Live API connectivity
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
