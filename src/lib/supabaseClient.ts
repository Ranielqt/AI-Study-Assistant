import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Gets or initializes the Supabase client.
 * Using lazy initialization prevents the app from crashing on startup if keys are missing.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
    const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'https://your-project-url.supabase.co') {
      // Fallback for local dev if import.meta.env is tricky
      const url = supabaseUrl || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : '');
      const key = supabaseAnonKey || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '');
      
      if (!url || !key) {
        throw new Error(
          'Supabase configuration is missing. ' +
          'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file and RESTART the server.'
        );
      }
      supabaseInstance = createClient(url as string, key as string);
    } else {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    }
  }
  return supabaseInstance;
}

// Export a proxy as 'supabase' so we don't have to change every single line of code in other files,
// while still benefiting from lazy evaluation.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getSupabase();
    return (client as any)[prop];
  }
});
