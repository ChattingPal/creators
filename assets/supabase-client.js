// Browser-safe Supabase configuration. Never add secret or service_role keys here.
(() => {
  const createClient = window.supabase?.createClient;
  if (!createClient) {
    window.novaxSupabase = null;
    return;
  }

  const authOptions = {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
    storageKey: "novax-creator-hub-auth"
  };

  window.novaxSupabase = createClient(
    "https://deeegczehhbiofqhhizl.supabase.co",
    "sb_publishable_HxXIbPdITFexhJhqOYoXjw_uuz9mSm-",
    { auth: authOptions }
  );
})();
