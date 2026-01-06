export enum AudioSource {
  MIC = 'mic',
  INTERNAL = 'internal',
  SHARE = 'share',
  BOTH = 'both'
}

/**
 * Advanced Text Segmentation Utility
 * Analyzes linguistic patterns and pauses to find natural boundaries.
 */
export class SmartSegmenter {
  private static readonly CONJUNCTIONS = ['and', 'but', 'or', 'so', 'because', 'although', 'if', 'when', 'which', 'that'];
  private static readonly SENTENCE_ENDERS = /[.!?]$/;

  /**
   * Evaluates if a buffer should be flushed to the database.
   * @param text The current segment text.
   * @param pauseDurationMs Time since last speech activity.
   */
  static shouldFlush(text: string, pauseDurationMs: number): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 15) return false; // Don't flush tiny fragments

    const words = trimmed.split(/\s+/);
    const lastWord = words[words.length - 1].toLowerCase().replace(/[^\w]/g, '');
    const hasPunctuation = this.SENTENCE_ENDERS.test(trimmed);

    // 1. Definite end: Punctuation + a meaningful pause
    if (hasPunctuation && pauseDurationMs > 450) return true;

    // 2. Natural break: Long silence (2s+) regardless of grammar
    if (pauseDurationMs > 2000) return true;

    // 3. Size-based: If buffer is long, look for a "safe" split point
    if (trimmed.length > 180) {
      // Avoid splitting in the middle of a connecting thought
      if (this.CONJUNCTIONS.includes(lastWord)) return false;
      
      // If we have a comma or just a long pause in a long sentence, it's safe
      if (trimmed.includes(',') && pauseDurationMs > 800) return true;
      
      // Emergency cap to prevent massive single-row transcriptions
      if (trimmed.length > 350) return true;
    }

    return false;
  }
}

export class AudioService {
  private audioContext: AudioContext | null = null;
  private currentStream: MediaStream | null = null;
  
  // VAD state for adaptive noise floor tracking
  private static noiseFloor = 0.005;
  private static readonly ALPHA = 0.02; // Smoothing factor for noise tracking

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
        rawStream = new MediaStream(displayStream.getAudioTracks());
        break;
      case AudioSource.BOTH:
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const dest = this.audioContext.createMediaStreamDestination();
        this.audioContext.createMediaStreamSource(mic).connect(dest);
        this.audioContext.createMediaStreamSource(sys).connect(dest);
        rawStream = dest.stream;
        break;
      default:
        throw new Error("Invalid source");
    }

    const sourceNode = this.audioContext.createMediaStreamSource(rawStream);
    
    // EQ Chain for clarity
    const notchFilter = this.audioContext.createBiquadFilter();
    notchFilter.type = 'notch';
    notchFilter.frequency.value = 60;
    notchFilter.Q.value = 10;

    const hpFilter = this.audioContext.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 120;

    const lpFilter = this.audioContext.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.value = 6500;

    const presenceBoost = this.audioContext.createBiquadFilter();
    presenceBoost.type = 'peaking';
    presenceBoost.frequency.value = 3200;
    presenceBoost.gain.value = 6;

    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-22, this.audioContext.currentTime);
    compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);

    const voiceDestination = this.audioContext.createMediaStreamDestination();
    
    sourceNode.connect(notchFilter);
    notchFilter.connect(hpFilter);
    hpFilter.connect(lpFilter);
    lpFilter.connect(presenceBoost);
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

  /**
   * Refined VAD with dynamic noise floor tracking.
   * Adjusts sensitivity based on environment energy levels.
   */
  static isVoiceActive(float32Array: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    const rms = Math.sqrt(sum / float32Array.length);
    
    // Update Noise Floor: If RMS is consistently low, track it as noise
    if (rms < this.noiseFloor * 1.8) {
      this.noiseFloor = (this.ALPHA * rms) + (1 - this.ALPHA) * this.noiseFloor;
    }
    
    // Adaptive Threshold: Voice must be significantly higher than tracked noise floor
    // Floor the threshold at 0.008 to prevent hyper-sensitivity in silent rooms
    const adaptiveThreshold = Math.max(0.008, this.noiseFloor * 2.2);
    
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