import { createClient } from "@supabase/supabase-js";

// Vite requires 'import.meta.env' prefix for public environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if credentials exist to avoid cryptic runtime errors
if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file."
  );
}

/**
 * MAIN SUPABASE CLIENT
 * This client is used throughout the frontend to communicate directly with Supabase.
 * PERSIST SESSION is false because this is likely a dashboard/monitorying app where we 
 * might not want browser-based auth persistence by default.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});


