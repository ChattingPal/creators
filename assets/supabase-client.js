// Browser-safe Supabase configuration. Never add secret or service_role keys here.
(() => {
  const createClient = window.supabase?.createClient;
  if (!createClient) {
    window.novaxSupabase = null;
    return;
  }

  let sessionStorageAvailable = false;
  try {
    const testKey = "novax-auth-storage-test";
    window.sessionStorage.setItem(testKey, "1");
    window.sessionStorage.removeItem(testKey);
    sessionStorageAvailable = true;
  } catch {
    sessionStorageAvailable = false;
  }

  const authOptions = {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: sessionStorageAvailable,
    storageKey: "novax-creator-hub-auth"
  };

  if (sessionStorageAvailable) {
    authOptions.storage = window.sessionStorage;
  }

  window.novaxSupabase = createClient(
    "https://deeegczehhbiofqhhizl.supabase.co",
    "sb_publishable_HxXIbPdITFexhJhqOYoXjw_uuz9mSm-",
    { auth: authOptions }
  );
})();
