import { createClient } from '@supabase/supabase-js';

// Publishable key (veilig voor in de client). Project: Peil.
const SUPABASE_URL = 'https://izorxyllmvszabnrukgg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jhuPEfI6bbNSfOY3T8_4Ag_WLZwpWFg';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
