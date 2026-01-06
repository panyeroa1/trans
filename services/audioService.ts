export enum AudioSource {
  MIC = 'mic',
  INTERNAL = 'internal',
  SHARE = 'share',
  BOTH = 'both'
}

/**
 * Advanced Text Segmentation Utility
 * Analyzes linguistic patterns, transition markers, and prosodic pauses.
 */
export class SmartSegmenter {
  private static readonly CONJUNCTIONS = ['and', 'but', 'or', 'so', 'because', 'although', 'if', 'when', 'which', 'that', 'whereas', 'while'];
  private static readonly TRANSITIONS = ['however', 'therefore', 'moreover', 'nonetheless', 'actually', 'basically', 'honestly', 'specifically', 'furthermore', 'nevertheless'];
  private static readonly QUESTION_STARTERS = ['who', 'what', 'where', 'when', 'why', 'how', 'is', 'can', 'does', 'would', 'could', 'should'];
  private static readonly SENTENCE_ENDERS = /[.!?]$/;
  private static readonly MIN_SEGMENT_LENGTH = 20;
  private static readonly MAX_SEGMENT_LENGTH = 280;

  /**
   * Evaluates if a buffer should be flushed to the database.
   * @param text The current segment text.
   * @param pauseDurationMs Time since last speech activity (silence detected).
   */
  static shouldFlush(text: string, pauseDurationMs: number): boolean {
    const trimmed = text.trim();
    if (trimmed.length < this.MIN_SEGMENT_LENGTH) return false;

    const words = trimmed.split(/\s+/);
    const lastWord = words[words.length - 1].toLowerCase().replace(/[^\w]/g, '');
    const firstWord = words[0].toLowerCase().replace(/[^\w]/g, '');
    
    const hasPunctuation = this.SENTENCE_ENDERS.test(trimmed);
    const isQuestion = this.QUESTION_STARTERS.includes(firstWord);
    const isFlowBreaking = this.TRANSITIONS.includes(lastWord);

    // 1. Grammatical Boundary: Punctuation + modest pause
    if (hasPunctuation && pauseDurationMs > 300) return true;

    // 2. Semantic Boundary: Transition words
    if (trimmed.length > 120 && isFlowBreaking && pauseDurationMs > 600) return true;

    // 3. Question Logic:
    if (isQuestion && trimmed.length > 50 && pauseDurationMs > 800) return true;

    // 4. Natural Break (Prosody):
    if (pauseDurationMs > 1500) return true;

    // 5. Size Management:
    if (trimmed.length > this.MAX_SEGMENT_LENGTH) {
      if (!this.CONJUNCTIONS.includes(lastWord)) return true;
      if (trimmed.length > 400) return true;
    }

    // 6. Linguistic Flow:
    if (this.CONJUNCTIONS.includes(lastWord)) return false;

    return false;
  }
}

export class AudioService {
  private audioContext: AudioContext | null = null;
  private currentStream: MediaStream | null = null;
  
  // VAD state for adaptive noise floor tracking
  private static noiseFloor = 0.005;
  private static readonly ALPHA = 0.02;

  async getStream(source: AudioSource): Promise<MediaStream> {
    this.stop();
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
      sampleRate: 16000,
      latencyHint: 'interactive'
    });
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    let rawStream: MediaStream;

    try {
      switch (source) {
        case AudioSource.MIC:
          rawStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } 
          });
          break;
        case AudioSource.INTERNAL:
        case AudioSource.SHARE:
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { sampleRate: 16000, channelCount: 1 }
          });
          if (displayStream.getAudioTracks().length === 0) {
            displayStream.getTracks().forEach(t => t.stop());
            throw new Error("No system audio detected. Please check 'Share system audio' when sharing screen.");
          }
          rawStream = new MediaStream(displayStream.getAudioTracks());
          break;
        case AudioSource.BOTH:
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          if (sys.getAudioTracks().length === 0) {
            sys.getTracks().forEach(t => t.stop());
            // Fallback to just mic if system audio failed
            rawStream = mic;
          } else {
            const dest = this.audioContext.createMediaStreamDestination();
            this.audioContext.createMediaStreamSource(mic).connect(dest);
            this.audioContext.createMediaStreamSource(sys).connect(dest);
            rawStream = dest.stream;
          }
          break;
        default:
          throw new Error("Invalid source");
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error("Permission denied. Please allow microphone/screen access in your browser settings.");
      }
      throw err;
    }

    const sourceNode = this.audioContext.createMediaStreamSource(rawStream);
    
    const hpFilter = this.audioContext.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 100;

    const presenceBoost = this.audioContext.createBiquadFilter();
    presenceBoost.type = 'peaking';
    presenceBoost.frequency.value = 3500;
    presenceBoost.gain.value = 4;

    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, this.audioContext.currentTime);
    compressor.knee.setValueAtTime(30, this.audioContext.currentTime);
    compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
    compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
    compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);

    const voiceDestination = this.audioContext.createMediaStreamDestination();
    
    sourceNode.connect(hpFilter);
    hpFilter.connect(presenceBoost);
    presenceBoost.connect(compressor);
    compressor.connect(voiceDestination);

    this.currentStream = voiceDestination.stream;
    return this.currentStream;
  }

  stop() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  static isVoiceActive(float32Array: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    const rms = Math.sqrt(sum / float32Array.length);
    if (rms < this.noiseFloor * 1.5) {
      this.noiseFloor = (this.ALPHA * rms) + (1 - this.ALPHA) * this.noiseFloor;
    }
    const adaptiveThreshold = Math.max(0.006, this.noiseFloor * 2.5);
    return rms > adaptiveThreshold;
  }

  static encode(bytes: Uint8Array): string {
    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  }

  static createPCM16Blob(float32Array: Float32Array): { data: string; mimeType: string } {
    const l = float32Array.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return {
      data: this.encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000'
    };
  }
}