
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

    switch (source) {
      case AudioSource.MIC:
        return await navigator.mediaDevices.getUserMedia({ audio: true });

      case AudioSource.INTERNAL:
      case AudioSource.SHARE:
        // getDisplayMedia is used for both 'internal' (tab audio) and 'share screen'
        // User must check "Share tab audio" or "Share system audio"
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          }
        });
        
        // Return only audio tracks if we only need transcription
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach(t => t.stop());
          throw new Error("No audio track found in display media. Please ensure 'Share audio' is checked.");
        }
        return new MediaStream(audioTracks);

      case AudioSource.BOTH:
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const sysStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        
        const destination = this.audioContext.createMediaStreamDestination();
        
        const micSource = this.audioContext.createMediaStreamSource(micStream);
        const sysSource = this.audioContext.createMediaStreamSource(sysStream);
        
        micSource.connect(destination);
        sysSource.connect(destination);
        
        return destination.stream;

      default:
        throw new Error("Invalid audio source");
    }
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

  static createPCM16Blob(float32Array: Float32Array): { data: string; mimeType: string } {
    const l = float32Array.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = Math.max(-1, Math.min(1, float32Array[i])) * 0x7FFF;
    }
    const binary = String.fromCharCode(...new Uint8Array(int16.buffer));
    return {
      data: btoa(binary),
      mimeType: 'audio/pcm;rate=16000'
    };
  }
}
