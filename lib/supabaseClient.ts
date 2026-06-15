import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface a clear error during development instead of a cryptic
  // "fetch failed" once a request is made.
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars are missing. Copy .env.local.example to .env.local and fill in your project values."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
