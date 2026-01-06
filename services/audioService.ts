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
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    let stream: MediaStream;

    switch (source) {
      case AudioSource.MIC:
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        break;

      case AudioSource.INTERNAL:
      case AudioSource.SHARE:
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
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
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const sysStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        
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

  static encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
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

  static createPCM16Blob(float32Array: Float32Array): { data: string; mimeType: string } {
    const l = float32Array.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Use 32767 to safely stay within Int16 range (-32768 to 32767)
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return {
      data: this.encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000'
    };
  }
}