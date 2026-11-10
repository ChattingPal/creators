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
    const url = new URL("/account/", window.location.origin);
    url.searchParams.set("password_recovery", "1");
    return url.href;
  }

  function clearRecoveryUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("password_recovery");
    url.searchParams.delete("code");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const client = window.novaxSupabase;
    const loading = document.querySelector("[data-account-loading]");
    const shell = document.querySelector("[data-account-shell]");
    const signoutButton = document.querySelector("[data-account-signout]");
    const resetEmailButton = document.querySelector("[data-reset-email]");
    const resetEmailMessage = document.querySelector("[data-password-reset-message]");
    const resetForm = document.querySelector("[data-password-reset-form]");
    const resetCancel = document.querySelector("[data-reset-cancel]");
    const recoveryRequested =
      new URL(window.location.href).searchParams.get("password_recovery") === "1";

    function setResetEmailMessage(message) {
      if (!resetEmailMessage) return;
      resetEmailMessage.textContent = message;
      resetEmailMessage.hidden = !message;
    }

    function openPasswordForm() {
      if (!resetForm) return;
      resetForm.hidden = false;
      if (resetEmailButton) resetEmailButton.hidden = true;
      setResetEmailMessage("");
      resetForm.querySelector('input[name="new-password"]')?.focus();
    }

    if (!client) {
      if (loading) loading.textContent = "Account services are temporarily unavailable.";
      return;
    }

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        openPasswordForm();
      }
    });

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

    if (recoveryRequested) {
      openPasswordForm();
    }

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

    if (resetCancel && resetForm && resetEmailButton) {
      resetCancel.addEventListener("click", () => {
        resetForm.reset();
        resetForm.hidden = true;
        resetEmailButton.hidden = false;
        setStatus("");
        clearRecoveryUrl();
      });
    }

    if (resetForm) {
      const submitButton = resetForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = false;

      resetForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!resetForm.reportValidity()) return;

        const passwordInput = resetForm.elements["new-password"];
        const confirmationInput = resetForm.elements["confirm-password"];
        const password = passwordInput.value;
        const confirmation = confirmationInput.value;

        if (password !== confirmation) {
          setStatus("The new passwords do not match.", "error");
          confirmationInput.value = "";
          confirmationInput.focus();
          return;
        }

        if (password.length < 8) {
          setStatus("Use at least 8 characters for the new password.", "error");
          return;
        }

        if (submitButton) submitButton.disabled = true;
        setStatus("Updating your password...");

        try {
          const { error: updateError } = await client.auth.updateUser({ password });
          if (updateError) throw updateError;

          resetForm.reset();
          resetForm.hidden = true;
          if (resetEmailButton) resetEmailButton.hidden = false;
          clearRecoveryUrl();
          setStatus("Your password has been updated.", "success");
        } catch {
          setStatus("The password could not be updated. Open a new reset link and try again.", "error");
        } finally {
          passwordInput.value = "";
          confirmationInput.value = "";
          if (submitButton) submitButton.disabled = false;
        }
      });
    }
  });
})();
