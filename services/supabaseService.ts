
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xscdwdnjujpkczfhqrgu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY2R3ZG5qdWpwa2N6Zmhxcmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzEwNjgsImV4cCI6MjA3NjkwNzA2OH0.xuVAkWA5y1oDW_jC52I8JJXF-ovU-5LIBsY9yXzy6cA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface TranscriptionInsert {
  meeting_id: string;
  speaker_id: string; // UUID string
  transcribe_text_segment: string;
  full_transcription: string;
  users_all: string[];
}

export class SupabaseService {
  /**
   * Saves a finalized transcription segment to the database.
   */
  static async saveTranscription(data: TranscriptionInsert) {
    try {
      const { error } = await supabase
        .from('transcriptions')
        .insert([data]);

      if (error) {
        console.error('Supabase Insert Error:', error);
        throw error;
      }
    } catch (err) {
      console.error('Failed to save transcription to Supabase:', err);
    }
  }
}
