
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
      callbacks.onError("API Key missing. Please use the Select API Key button in settings.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    this.nextStartTime = 0;
    
    const instruction = `You are the EBURON.AI High-Fidelity Pure Transcription Engine.
YOUR MISSION:
- Transcribe audio with 100% verbatim accuracy. 
- You are optimized for: ${sourceLanguage}. 
- Understand the phonetic nuances, slang, and cultural context of ${sourceLanguage} specifically.

DIALECT & ROBUSTNESS RULES:
1. PURE TRANSCRIPTION: Output ONLY the text of what is being spoken. 
2. NO TRANSLATION: Do not translate to English if the speaker is using another language. Transcribe the spoken language as is.
3. NO CHAT: You are not an assistant. Do not reply, do not explain, do not add metadata like [laughter] or [music].
4. DIALECT PRECISION: If the speaker uses Medumba, Duala, Tagalog, or specific French/Dutch dialects, transcribe the exact words used in those dialects.
5. ROBUSTNESS: If the audio is noisy, use context to provide the most likely verbatim transcription.

FORMAT:
- Continuous, clean stream of text.
- No speaker labels.
- No punctuation correction unless it's necessary for readability of the transcript.`;

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
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.inputTranscription) {
              callbacks.onTranscription(message.serverContent.inputTranscription.text, !!message.serverContent.turnComplete);
            } else if (message.serverContent?.outputTranscription) {
              callbacks.onTranscription(message.serverContent.outputTranscription.text, !!message.serverContent.turnComplete);
            }

            // Audio output consumption to prevent socket error
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && this.outputAudioContext) {
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              const buffer = await AudioService.decodeAudioData(
                AudioService.decode(audioData),
                this.outputAudioContext,
                24000,
                1
              );
              const sourceNode = this.outputAudioContext.createBufferSource();
              sourceNode.buffer = buffer;
              sourceNode.connect(this.outputAudioContext.destination);
              sourceNode.addEventListener('ended', () => this.activeSources.delete(sourceNode));
              sourceNode.start(this.nextStartTime);
              this.nextStartTime += buffer.duration;
              this.activeSources.add(sourceNode);
            }

            if (message.serverContent?.interrupted) {
              this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
              this.activeSources.clear();
              this.nextStartTime = 0;
            }
          },
          onerror: (err: any) => {
            console.error("Gemini Socket Error:", err);
            callbacks.onError(err.message || "Network error.");
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
      callbacks.onError(err.message || "Failed to establish connection.");
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
