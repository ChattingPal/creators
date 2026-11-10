(() => {
  function scrubRecoveryUrl() {
    const url = new URL(window.location.href);
    ["code", "token_hash", "type", "error", "error_code", "error_description"].forEach((key) => {
      url.searchParams.delete(key);
    });
    url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const client = window.novaxSupabase;
    const form = document.querySelector("[data-reset-password-form]");
    const status = document.querySelector("[data-reset-status]");
    const complete = document.querySelector("[data-reset-complete]");
    const invalid = document.querySelector("[data-reset-invalid]");
    const submitButton = form?.querySelector('button[type="submit"]');
    let recoverySessionDetected = false;

    function setStatus(message, state = "") {
      if (!status) return;
      status.textContent = message;
      if (state) {
        status.dataset.state = state;
      } else {
        delete status.dataset.state;
      }
    }

    function showForm() {
      recoverySessionDetected = true;
      if (form) form.hidden = false;
      if (invalid) invalid.hidden = true;
      if (complete) complete.hidden = true;
      if (submitButton) submitButton.disabled = false;
      setStatus("");
      scrubRecoveryUrl();
    }

    function showInvalid() {
      if (recoverySessionDetected) return;
      if (form) form.hidden = true;
      if (complete) complete.hidden = true;
      if (invalid) invalid.hidden = false;
      setStatus("", "error");
    }

    if (!client || !form) {
      setStatus("Password reset is temporarily unavailable. Please try again later.", "error");
      if (invalid) invalid.hidden = false;
      return;
    }

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        showForm();
      }
    });

    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session) {
        showInvalid();
      } else {
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError || !userData.user) {
          showInvalid();
        } else {
          showForm();
        }
      }
    } catch {
      showInvalid();
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const passwordInput = form.elements["new-password"];
      const confirmationInput = form.elements["confirm-password"];
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

        form.reset();
        form.hidden = true;
        if (complete) complete.hidden = false;
        setStatus("Your password has been updated.", "success");
      } catch {
        setStatus("The password could not be updated. Request a new reset link and try again.", "error");
        if (submitButton) submitButton.disabled = false;
      } finally {
        passwordInput.value = "";
        confirmationInput.value = "";
      }
    });
  });
})();
