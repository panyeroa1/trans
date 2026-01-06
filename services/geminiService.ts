
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
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

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
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    this.nextStartTime = 0;
    
    const instruction = `High-Fidelity Verbatim Engine (EBURON.AI).
MODE: INSTANT LEARNING & ADAPTATION.

CRITICAL INSTRUCTIONS:
1. LOCK-ON: Instantly adapt to the speaker's language, accent, and dialect (${sourceLanguage}). 
2. NO NORMALIZATION: Do not correct grammar, do not translate, do not "clean up" slang. Transcribe EXACTLY what is said immediately.
3. PHONETIC PRECISION: If a speaker uses local Medumba, Tagalog, or regional variants, output the text in that dialect without hesitation.
4. ZERO LATENCY: Stream every syllable as text. 
5. OUTPUT: Pure text stream only. No labels.`;

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
            const outputTrans = message.serverContent?.outputTranscription;
            
            if (inputTrans) {
              callbacks.onTranscription(inputTrans.text, !!message.serverContent.turnComplete);
            } else if (outputTrans) {
              callbacks.onTranscription(outputTrans.text, !!message.serverContent.turnComplete);
            }

            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const buffer = await AudioService.decodeAudioData(AudioService.decode(audioData), this.outputAudioContext, 24000, 1);
              const sourceNode = this.outputAudioContext.createBufferSource();
              sourceNode.buffer = buffer;
              sourceNode.connect(this.outputAudioContext.destination);
              sourceNode.start(this.nextStartTime);
              this.nextStartTime += buffer.duration;
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
    if (this.outputAudioContext) this.outputAudioContext.close();
    if (this.session) this.session.close();
  }
}
