// Google Calendar OAuth client ID (type: Web application). See README.
export const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";

// Supabase project, for sharing with Kang. In your project:
//   Settings > API Keys  -> copy the Publishable key (starts with sb_publishable_)
//   Settings > API       -> copy the Project URL
// New Supabase projects no longer issue a legacy "anon" key; the publishable
// key is its drop-in replacement and works the same with the client library.
// Until both are filled in, the Together tab stays dormant and the rest of the
// app works fully offline.
export const SUPABASE_URL = "YOUR_PROJECT.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "YOUR_PUBLISHABLE_KEY";
