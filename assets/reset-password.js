(() => {
  const RECOVERY_PARAMETERS = [
    "code",
    "token_hash",
    "type",
    "error",
    "error_code",
    "error_description"
  ];

  function recoveryCallbackDetails() {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    const value = (key) => url.searchParams.get(key) || hash.get(key) || "";

    return {
      code: value("code"),
      error: value("error"),
      errorCode: value("error_code"),
      tokenHash: value("token_hash"),
      type: value("type")
    };
  }

  function recoveryErrorMessage(errorCode, errorName = "") {
    const code = errorCode || errorName;

    if (code === "otp_expired") {
      return "This password reset link has expired or has already been used. Request a new link.";
    }

    if (code === "flow_state_expired" || code === "flow_state_not_found") {
      return "This password reset request is no longer valid. Request a new link.";
    }

    if (code === "bad_code_verifier") {
      return "This browser could not verify the password reset request. Request a new link and open it in the same browser profile.";
    }

    if (code === "access_denied") {
      return "This password reset link was rejected. It may be expired or already used. Request a new link.";
    }

    return "This password reset link is invalid or has expired. Request a new link.";
  }

  function scrubRecoveryUrl() {
    const url = new URL(window.location.href);
    RECOVERY_PARAMETERS.forEach((key) => {
      url.searchParams.delete(key);
    });
    url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  // Supabase detects and exchanges PKCE callback codes during client initialization.
  // Capture callback errors now and do not exchange the same one-time code a second time.
  const initialRecoveryCallback = recoveryCallbackDetails();

  window.addEventListener("DOMContentLoaded", async () => {
    const client = window.novaxSupabase;
    const form = document.querySelector("[data-reset-password-form]");
    const status = document.querySelector("[data-reset-status]");
    const complete = document.querySelector("[data-reset-complete]");
    const invalid = document.querySelector("[data-reset-invalid]");
    const invalidMessage = invalid?.querySelector("p");
    const submitButton = form?.querySelector('button[type="submit"]');
    const callback = initialRecoveryCallback;
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

    function showInvalid(message = recoveryErrorMessage("")) {
      if (recoverySessionDetected) return;
      if (form) form.hidden = true;
      if (complete) complete.hidden = true;
      if (invalid) invalid.hidden = false;
      if (invalidMessage) invalidMessage.textContent = message;
      setStatus("", "error");
      scrubRecoveryUrl();
    }

    if (!client || !form) {
      setStatus("Password reset is temporarily unavailable. Please try again later.", "error");
      if (invalid) invalid.hidden = false;
      return;
    }

    if (callback.error || callback.errorCode) {
      showInvalid(recoveryErrorMessage(callback.errorCode, callback.error));
      return;
    }

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        showForm();
      } else if (event === "SIGNED_OUT") {
        showInvalid("Your password recovery session is no longer active. Request a new link.");
      }
    });

    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session) {
        showInvalid(recoveryErrorMessage(sessionError?.code || ""));
      } else {
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError || !userData.user) {
          showInvalid(recoveryErrorMessage(userError?.code || ""));
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
