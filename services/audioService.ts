export enum AudioSource {
  MIC = 'mic',
  INTERNAL = 'internal',
  SHARE = 'share',
  BOTH = 'both'
}

/**
 * Advanced Text Segmentation Utility (EBURON.AI)
 * Analyzes linguistic patterns and pauses to identify natural thought boundaries.
 */
export class SmartSegmenter {
  private static readonly CONJUNCTIONS = [
    'and', 'but', 'or', 'so', 'because', 'although', 'if', 'when', 'which', 'that', 
    'while', 'whereas', 'unless', 'since', 'as'
  ];

  private static readonly DISCOURSE_MARKERS = [
    'however', 'therefore', 'moreover', 'nonetheless', 'furthermore', 
    'consequently', 'instead', 'meanwhile', 'otherwise'
  ];

  private static readonly FILLERS = [
    'um', 'uh', 'er', 'ah', 'like', 'literally', 'basically', 'actually', 'you know'
  ];

  private static readonly SENTENCE_ENDERS = /[.!?…]["'”]?\s*$/;

  /**
   * Evaluates if a buffer should be flushed based on linguistic weight and pause duration.
   */
  static shouldFlush(text: string, pauseDurationMs: number): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 20) return false;

    const words = trimmed.toLowerCase().split(/\s+/);
    const lastWord = words[words.length - 1].replace(/[^\w]/g, '');
    const penultimateWord = words.length > 1 ? words[words.length - 2].replace(/[^\w]/g, '') : '';
    
    const hasPunctuation = this.SENTENCE_ENDERS.test(trimmed);
    const endsWithConjunction = this.CONJUNCTIONS.includes(lastWord);
    const endsWithFiller = this.FILLERS.includes(lastWord);
    const endsWithDiscourseMarker = this.DISCOURSE_MARKERS.includes(lastWord);

    // 1. High Confidence Split: Clean punctuation + modest pause
    // If the sentence is grammatically complete, 600ms is a clear thought break.
    if (hasPunctuation && !endsWithFiller && pauseDurationMs > 600) return true;

    // 2. Mid-Thought Split Protection:
    // If we just said "and", "but", or a filler, don't split unless the silence is massive.
    if ((endsWithConjunction || endsWithFiller) && pauseDurationMs < 3000) return false;

    // 3. Discourse Shift:
    // If the segment is getting long and we hit a discourse marker after a decent pause, 
    // it's a good place to start a new record.
    if (trimmed.length > 120 && endsWithDiscourseMarker && pauseDurationMs > 800) return true;

    // 4. Natural Boundary:
    // Long silence (2.5s+) is usually an intentional break regardless of grammar.
    if (pauseDurationMs > 2500) return true;

    // 5. Buffer Management:
    // If the segment is becoming a "wall of text" (>280 chars), 
    // we search for ANY logical break like a comma.
    if (trimmed.length > 280) {
      if (trimmed.includes(',') && pauseDurationMs > 1000) return true;
      if (pauseDurationMs > 1500) return true;
      
      // Absolute cap at 450 characters for system performance
      if (trimmed.length > 450) return true;
    }

    return false;
  }
}

export class AudioService {
  private audioContext: AudioContext | null = null;
  private currentStream: MediaStream | null = null;
  
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

  static isVoiceActive(float32Array: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    const rms = Math.sqrt(sum / float32Array.length);
    
    if (rms < this.noiseFloor * 1.8) {
      this.noiseFloor = (this.ALPHA * rms) + (1 - this.ALPHA) * this.noiseFloor;
    }
    
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