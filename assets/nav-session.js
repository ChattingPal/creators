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

    client.auth.onAuthStateChange((_event, session) => {
      render(Boolean(session));
    });

    try {
      const { data, error } = await client.auth.getSession();
      render(!error && Boolean(data.session));
    } catch {
      render(false);
    }
  });
})();
