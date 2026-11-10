// Browser-safe Supabase configuration. Never add secret or service_role keys here.
// Database access must be protected with Row Level Security policies.
window.novaxSupabase = null;
window.addEventListener('DOMContentLoaded', () => {
  if (!window.supabase?.createClient) return;
  window.novaxSupabase = window.supabase.createClient("https://deeegczehhbiofqhhizl.supabase.co", "sb_publishable_HxXIbPdITFexhJhqOYoXjw_uuz9mSm-");
});
