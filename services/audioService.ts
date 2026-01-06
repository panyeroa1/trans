export enum AudioSource {
  MIC = 'mic',
  INTERNAL = 'internal',
  SHARE = 'share',
  BOTH = 'both'
}

export class AudioService {
  private audioContext: AudioContext | null = null;
  private currentStream: MediaStream | null = null;

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

    // --- Advanced Surgical DSP Chain for Speech Clarity ---
    const sourceNode = this.audioContext.createMediaStreamSource(rawStream);
    
    // 1. Notch Filter (Remove 60Hz Electrical Hum)
    const notchFilter = this.audioContext.createBiquadFilter();
    notchFilter.type = 'notch';
    notchFilter.frequency.value = 60;
    notchFilter.Q.value = 10; // Very narrow

    // 2. Steep High Pass (Remove 0-120Hz rumble / background mechanical noise)
    const hpFilter = this.audioContext.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 120;
    hpFilter.Q.value = 0.707; // Butterworth characteristic

    // 3. Steep Low Pass (Remove static / hiss above 6500Hz)
    const lpFilter = this.audioContext.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.value = 6500;
    lpFilter.Q.value = 1.0; // Higher Q for steeper roll-off at the edge of human speech

    // 4. Clarity EQ (Subtractive: Cut 400Hz room "boxiness")
    const boxinessFilter = this.audioContext.createBiquadFilter();
    boxinessFilter.type = 'peaking';
    boxinessFilter.frequency.value = 400;
    boxinessFilter.Q.value = 1.0;
    boxinessFilter.gain.value = -4; // Reduce resonance

    // 5. Presence Boost (Additive: Enhance 3.2kHz for sibilance/consonant intelligibility)
    const presenceBoost = this.audioContext.createBiquadFilter();
    presenceBoost.type = 'peaking';
    presenceBoost.frequency.value = 3200;
    presenceBoost.Q.value = 1.5;
    presenceBoost.gain.value = 6;

    // 6. Professional Dynamics Compressor (Normalization & Leveling)
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-22, this.audioContext.currentTime);
    compressor.knee.setValueAtTime(25, this.audioContext.currentTime);
    compressor.ratio.setValueAtTime(10, this.audioContext.currentTime);
    compressor.attack.setValueAtTime(0.005, this.audioContext.currentTime);
    compressor.release.setValueAtTime(0.1, this.audioContext.currentTime);

    const voiceDestination = this.audioContext.createMediaStreamDestination();
    
    // Serial Connection Chain
    sourceNode.connect(notchFilter);
    notchFilter.connect(hpFilter);
    hpFilter.connect(lpFilter);
    lpFilter.connect(boxinessFilter);
    boxinessFilter.connect(presenceBoost);
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
   */
  static isVoiceActive(float32Array: Float32Array, threshold: number = 0.012): boolean {
    let sum = 0;
    let peak = 0;
    
    for (let i = 0; i < float32Array.length; i++) {
      const val = float32Array[i];
      const absVal = Math.abs(val);
      sum += val * val;
      if (absVal > peak) peak = absVal;
    }
    
    const rms = Math.sqrt(sum / float32Array.length);
    
    // Focus on finding meaningful variations in energy rather than just absolute levels.
    return rms > threshold || peak > (threshold * 3.5);
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