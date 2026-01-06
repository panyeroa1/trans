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
    
    // Use 'interactive' latency hint to minimize buffer sizes at the OS level
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
      sampleRate: 16000,
      latencyHint: 'interactive'
    });
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    let stream: MediaStream;

    switch (source) {
      case AudioSource.MIC:
        // Optimize constraints for real-time mono transcription
        stream = await navigator.mediaDevices.getUserMedia({ 
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
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        });
        
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach(t => t.stop());
          throw new Error("No audio track found. Please ensure 'Share audio' is checked in the dialog.");
        }
        stream = new MediaStream(audioTracks);
        break;

      case AudioSource.BOTH:
        const micStream = await navigator.mediaDevices.getUserMedia({ 
          audio: { sampleRate: 16000, channelCount: 1 } 
        });
        const sysStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true, 
          audio: { sampleRate: 16000, channelCount: 1 } 
        });
        
        const destination = this.audioContext.createMediaStreamDestination();
        
        const micSource = this.audioContext.createMediaStreamSource(micStream);
        const sysSource = this.audioContext.createMediaStreamSource(sysStream);
        
        micSource.connect(destination);
        sysSource.connect(destination);
        
        stream = destination.stream;
        break;

      default:
        throw new Error("Invalid audio source");
    }

    this.currentStream = stream;
    return stream;
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
   * Optimized Base64 encoding using chunked fromCharCode
   */
  static encode(bytes: Uint8Array): string {
    const CHUNK_SIZE = 0x8000; // 32KB chunks to prevent stack overflow
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  }

  static decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  static async decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  /**
   * Optimized PCM conversion with direct float manipulation
   */
  static createPCM16Blob(float32Array: Float32Array): { data: string; mimeType: string } {
    const l = float32Array.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Direct clamping and conversion for speed
      const s = float32Array[i];
      int16[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return {
      data: this.encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000'
    };
  }
}