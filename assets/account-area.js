(() => {
  function accountDisplayName(user) {
    const metadata = user.user_metadata || {};
    const candidate = metadata.username || metadata.full_name || metadata.name;

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    const emailName = user.email?.split("@")[0];
    return emailName || "Creator";
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function setStatus(message, state = "") {
    const status = document.querySelector("[data-account-status]");
    if (!status) return;

    status.textContent = message;
    if (state) {
      status.dataset.state = state;
    } else {
      delete status.dataset.state;
    }
  }

  function signInRedirect() {
    const next = window.location.pathname === "/account/" ? "/account/" : "/dashboard/";
    window.location.replace("/signin/?next=" + encodeURIComponent(next));
  }

  function recoveryRedirectUrl() {
    return new URL("/reset-password/", window.location.origin).href;
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const client = window.novaxSupabase;
    const loading = document.querySelector("[data-account-loading]");
    const shell = document.querySelector("[data-account-shell]");
    const signoutButton = document.querySelector("[data-account-signout]");
    const resetEmailButton = document.querySelector("[data-reset-email]");
    const resetEmailMessage = document.querySelector("[data-password-reset-message]");

    function setResetEmailMessage(message) {
      if (!resetEmailMessage) return;
      resetEmailMessage.textContent = message;
      resetEmailMessage.hidden = !message;
    }

    if (!client) {
      if (loading) loading.textContent = "Account services are temporarily unavailable.";
      return;
    }

    const { data, error } = await client.auth.getUser();
    const user = data?.user;

    if (error || !user) {
      signInRedirect();
      return;
    }

    const name = accountDisplayName(user);
    const email = user.email || "Not available";

    setText("[data-account-name]", name);
    setText("[data-account-email]", email);

    if (loading) loading.hidden = true;
    if (shell) shell.hidden = false;
    if (signoutButton) signoutButton.disabled = false;
    if (resetEmailButton) resetEmailButton.disabled = !user.email;

    if (signoutButton) {
      signoutButton.addEventListener("click", async () => {
        signoutButton.disabled = true;

        try {
          const { error: signoutError } = await client.auth.signOut({ scope: "local" });
          if (signoutError) throw signoutError;
          window.location.replace("/signin/");
        } catch {
          setStatus("Sign out was not completed. Please try again.", "error");
          signoutButton.disabled = false;
        }
      });
    }

    if (resetEmailButton) {
      resetEmailButton.addEventListener("click", async () => {
        if (!user.email) {
          setStatus("No linked email address is available for this account.", "error");
          return;
        }

        resetEmailButton.disabled = true;
        setResetEmailMessage("");
        setStatus("");

        try {
          const { error: resetError } = await client.auth.resetPasswordForEmail(user.email, {
            redirectTo: recoveryRedirectUrl()
          });
          if (resetError) throw resetError;

          setResetEmailMessage("We've sent you a link to the linked email address.");
        } catch {
          setStatus("The password reset email could not be sent. Please try again.", "error");
        } finally {
          resetEmailButton.disabled = false;
        }
      });
    }
  });
})();
