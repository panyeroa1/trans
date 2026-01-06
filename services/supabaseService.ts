
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xscdwdnjujpkczfhqrgu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY2R3ZG5qdWpwa2N6Zmhxcmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzEwNjgsImV4cCI6MjA3NjkwNzA2OH0.xuVAkWA5y1oDW_jC52I8JJXF-ovU-5LIBsY9yXzy6cA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface TranscriptionInsert {
  meeting_id: string;
  speaker_id: string; 
  transcribe_text_segment: string;
  full_transcription: string;
  users_all: string[];
}

export class SupabaseService {
  /**
   * Saves a finalized transcription segment to the database.
   */
  static async saveTranscription(data: TranscriptionInsert): Promise<{ success: boolean; error?: string }> {
    try {
      // Robustness check: Ensure users_all is at least an empty array
      const payload = {
        ...data,
        users_all: data.users_all || ['System']
      };

      const { error } = await supabase
        .from('transcriptions')
        .insert([payload]);

      if (error) {
        console.error('Supabase Error:', error.message, error.details);
        return { success: false, error: `${error.message}: ${error.details}` };
      }

      return { success: true };
    } catch (err: any) {
      console.error('Supabase Exception:', err);
      return { success: false, error: err.message || "Unknown exception during save" };
    }
  }

  /**
   * Quick check to see if the table exists and is accessible
   */
  static async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const { data, error } = await supabase
        .from('transcriptions')
        .select('*')
        .limit(1);
      
      if (error) throw error;
      return { success: true, message: "Connection Successful" };
    } catch (err: any) {
      return { success: false, message: err.message || "Table 'transcriptions' not found or RLS restricted." };
    }
  }
}
