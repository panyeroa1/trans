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

  // Translator specific
  private translatorSession: any = null;
  private outputAudioContext: AudioContext | null = null;
  private translatorAnalyser: AnalyserNode | null = null;
  private nextStartTime: number = 0;

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
1. VOICE FOCUS: Verbatim output only.
2. LANGUAGE: ${sourceLanguage}.
3. PUNCTUATION: Complete sentences only.
${learningContext ? `\nSPECIALIZED CONTEXT:\n${learningContext}` : ''}`;

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

  async startTranslatorSession(targetLanguage: string) {
    const apiKey = process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.translatorAnalyser = this.outputAudioContext.createAnalyser();
    this.translatorAnalyser.fftSize = 256;
    this.translatorAnalyser.connect(this.outputAudioContext.destination);
    
    this.nextStartTime = 0;

    const instruction = `You are "Orus", an elite real-time translator for EBURON.AI.
TARGET LANGUAGE: ${targetLanguage}.
TASK: Translate the incoming text verbatim and read it aloud naturally.
VOICE CHARACTER: Calm, professional, and clear.
DO NOT respond with text. Only output Modality.AUDIO.`;

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => console.log("Translator Live"),
        onmessage: async (message: any) => {
          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio && this.outputAudioContext) {
            const bytes = this.decode(base64Audio);
            const audioBuffer = await this.decodeAudioData(bytes, this.outputAudioContext, 24000, 1);
            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.translatorAnalyser!);
            
            this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
          }
        },
        onerror: (e) => console.error("Translator Error", e),
        onclose: () => console.log("Translator Closed")
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
        },
        systemInstruction: instruction
      }
    });

    this.translatorSession = await sessionPromise;
  }

  sendTranslationText(text: string) {
    if (this.translatorSession) {
      this.translatorSession.sendRealtimeInput({
        message: `Translate and speak: ${text}`
      });
    }
  }

  getTranslatorAnalyser() {
    return this.translatorAnalyser;
  }

  stopTranslator() {
    if (this.translatorSession) this.translatorSession.close();
    if (this.outputAudioContext) this.outputAudioContext.close();
    this.translatorSession = null;
    this.outputAudioContext = null;
  }

  stop() {
    if (this.processor) this.processor.disconnect();
    if (this.inputAudioContext) this.inputAudioContext.close();
    if (this.session) this.session.close();
    this.stopTranslator();
  }

  private decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  }
}