// Keeps the public navigation consistent with the current Supabase session.
(() => {
  const SIGN_IN_LABEL = "Sign in";
  const DASHBOARD_LABEL = "Go To Dashboard";
  const SIGN_IN_URL = "/signin/";
  const DASHBOARD_URL = "/dashboard/";

  window.addEventListener("DOMContentLoaded", async () => {
    const link = document.querySelector(".nav-signin");
    if (!link) return;

    const client = window.novaxSupabase;
    const signedOutPageIsCurrent = link.getAttribute("aria-current") === "page";

    function render(isSignedIn) {
      link.textContent = isSignedIn ? DASHBOARD_LABEL : SIGN_IN_LABEL;
      link.href = isSignedIn ? DASHBOARD_URL : SIGN_IN_URL;

      if (isSignedIn) {
        link.removeAttribute("aria-current");
      } else if (signedOutPageIsCurrent) {
        link.setAttribute("aria-current", "page");
      }
    }

    render(false);
    if (!client) return;

    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session) return;

      const { data: userData, error: userError } = await client.auth.getUser();
      render(!userError && Boolean(userData.user));
    } catch {
      render(false);
    }

    client.auth.onAuthStateChange((_event, session) => {
      render(Boolean(session));
    });
  });
})();
