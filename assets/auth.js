(() => {
  const AUTH_CALLBACK_PARAMETERS = [
    "code",
    "token_hash",
    "type",
    "error",
    "error_code",
    "error_description"
  ];

  function scrubAuthUrl() {
    const url = new URL(window.location.href);
    let changed = false;

    AUTH_CALLBACK_PARAMETERS.forEach((parameter) => {
      if (url.searchParams.has(parameter)) {
        url.searchParams.delete(parameter);
        changed = true;
      }
    });

    if (url.hash) {
      url.hash = "";
      changed = true;
    }

    if (changed) {
      const cleanUrl = url.pathname + url.search;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  function safeErrorMessage(error, mode) {
    const code = error?.code || "";

    if (code === "invalid_credentials") {
      return "The email or password is incorrect.";
    }

    if (code === "email_not_confirmed") {
      return "Confirm your email address before signing in.";
    }

    if (code === "user_already_exists" || code === "email_exists") {
      return "An account with this email may already exist. Try signing in instead.";
    }

    if (code === "weak_password") {
      return "Choose a stronger password with at least eight characters.";
    }

    if (code === "signup_disabled") {
      return "Account creation is temporarily unavailable.";
    }

    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
      return "Too many attempts were made. Please wait and try again.";
    }

    return mode === "signup"
      ? "The account could not be created. Please check the details and try again."
      : "Sign in was not completed. Please try again.";
  }

  window.addEventListener("DOMContentLoaded", () => {
    const client = window.novaxSupabase;
    const form = document.querySelector("[data-auth-form]");
    const status = document.querySelector("[data-auth-status]");
    const googleButton = document.querySelector("[data-google-signin]");
    const oauthGroup = document.querySelector("[data-oauth-group]");
    const signedInPanel = document.querySelector("[data-signed-in]");
    const signoutButton = document.querySelector("[data-signout]");
    const mode = form?.dataset.authForm || "signin";

    function setStatus(message, state = "") {
      if (!status) return;
      status.textContent = message;
      if (state) {
        status.dataset.state = state;
      } else {
        delete status.dataset.state;
      }
    }

    function setBusy(isBusy) {
      const controls = [form?.querySelector('button[type="submit"]'), googleButton, signoutButton];
      controls.forEach((control) => {
        if (control) control.disabled = isBusy;
      });
    }

    function showSignedIn(isSignedIn) {
      if (form) form.hidden = isSignedIn;
      if (oauthGroup) oauthGroup.hidden = isSignedIn;
      if (signedInPanel) signedInPanel.hidden = !isSignedIn;
    }

    if (!client || !form) {
      setStatus("Authentication is temporarily unavailable. Please try again later.", "error");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = false;
    if (googleButton) googleButton.disabled = false;
    if (signoutButton) signoutButton.disabled = false;

    const initialUrl = new URL(window.location.href);
    if (initialUrl.searchParams.has("error") || initialUrl.searchParams.has("error_description")) {
      setStatus("Google sign in was not completed. Please try again.", "error");
      scrubAuthUrl();
    }

    client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (session) {
          showSignedIn(true);
          setStatus("Signed in successfully.", "success");
        } else if (event === "SIGNED_OUT") {
          showSignedIn(false);
          setStatus("You have been signed out.", "success");
        }

        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          scrubAuthUrl();
        }
      }, 0);
    });

    client.auth.getSession()
      .then(({ data }) => {
        showSignedIn(Boolean(data.session));
        if (data.session) {
          setStatus("Signed in successfully.", "success");
          scrubAuthUrl();
        }
      })
      .catch(() => {
        showSignedIn(false);
        setStatus("The current session could not be checked. You can still try to sign in.", "error");
      });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const emailInput = form.elements.email;
      const passwordInput = form.elements.password;
      const usernameInput = form.elements.username;
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      setBusy(true);
      setStatus(mode === "signup" ? "Creating your account..." : "Signing you in...");

      try {
        if (mode === "signup") {
          const username = usernameInput.value.trim();

          if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
            setStatus("Use 3 to 30 letters, numbers or underscores for the username.", "error");
            return;
          }

          const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
              data: { username },
              emailRedirectTo: new URL("/signin/", window.location.origin).href
            }
          });

          if (error) throw error;

          form.reset();

          if (data.session) {
            showSignedIn(true);
            setStatus("Account created. You are signed in.", "success");
          } else {
            setStatus("Account created. Check your email to confirm the address before signing in.", "success");
          }
        } else {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;

          form.reset();
          showSignedIn(true);
          setStatus("Signed in successfully.", "success");
        }
      } catch (error) {
        setStatus(safeErrorMessage(error, mode), "error");
      } finally {
        passwordInput.value = "";
        setBusy(false);
      }
    });

    if (googleButton) {
      googleButton.addEventListener("click", async () => {
        setBusy(true);
        setStatus("Opening Google sign in...");

        try {
          const { error } = await client.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: new URL("/signin/", window.location.origin).href
            }
          });

          if (error) throw error;
        } catch (error) {
          setStatus(safeErrorMessage(error, "signin"), "error");
          setBusy(false);
        }
      });
    }

    if (signoutButton) {
      signoutButton.addEventListener("click", async () => {
        setBusy(true);

        try {
          const { error } = await client.auth.signOut({ scope: "local" });
          if (error) throw error;
          showSignedIn(false);
          setStatus("You have been signed out.", "success");
          scrubAuthUrl();
        } catch {
          setStatus("Sign out was not completed. Please try again.", "error");
        } finally {
          setBusy(false);
        }
      });
    }
  });
})();
