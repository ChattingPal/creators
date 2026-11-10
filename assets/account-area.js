(() => {
  function accountDisplayName(user) {
    const metadata = user.user_metadata || {};
    const candidate =
      metadata.display_name || metadata.username || metadata.full_name || metadata.name;

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
    const nameOpenButton = document.querySelector("[data-edit-name-open]");
    const nameDialog = document.querySelector("[data-name-edit-dialog]");
    const nameForm = document.querySelector("[data-name-edit-form]");
    const nameInput = nameForm?.elements["display-name"];
    const nameCancelButton = document.querySelector("[data-name-edit-cancel]");
    const nameSaveButton = nameForm?.querySelector('button[type="submit"]');
    const nameStatus = document.querySelector("[data-name-edit-status]");
    const deleteOpenButton = document.querySelector("[data-delete-account-open]");
    const deleteDialog = document.querySelector("[data-delete-account-dialog]");
    const deleteCheckbox = document.querySelector("[data-delete-account-checkbox]");
    const deleteCancelButton = document.querySelector("[data-delete-account-cancel]");
    const deleteConfirmButton = document.querySelector("[data-delete-account-confirm]");
    const deleteStatus = document.querySelector("[data-delete-account-status]");

    function setResetEmailMessage(message) {
      if (!resetEmailMessage) return;
      resetEmailMessage.textContent = message;
      resetEmailMessage.hidden = !message;
    }

    if (!client) {
      if (loading) loading.textContent = "Account services are temporarily unavailable.";
      return;
    }

    let user = null;
    let redirectStarted = false;
    let deletionCompleted = false;
    let deletionInProgress = false;
    let nameUpdateInProgress = false;

    function setNameStatus(message, state = "") {
      if (!nameStatus) return;
      nameStatus.textContent = message;
      if (state) {
        nameStatus.dataset.state = state;
      } else {
        delete nameStatus.dataset.state;
      }
    }

    function resetNameDialog() {
      nameUpdateInProgress = false;
      if (nameInput) nameInput.disabled = false;
      if (nameCancelButton) nameCancelButton.disabled = false;
      if (nameSaveButton) nameSaveButton.disabled = false;
      setNameStatus("");
    }

    function setDeleteStatus(message, state = "") {
      if (!deleteStatus) return;
      deleteStatus.textContent = message;
      if (state) {
        deleteStatus.dataset.state = state;
      } else {
        delete deleteStatus.dataset.state;
      }
    }

    function resetDeleteDialog() {
      deletionInProgress = false;
      if (deleteCheckbox) {
        deleteCheckbox.checked = false;
        deleteCheckbox.disabled = false;
      }
      if (deleteCancelButton) deleteCancelButton.disabled = false;
      if (deleteConfirmButton) deleteConfirmButton.disabled = true;
      setDeleteStatus("");
    }

    function redirectToSignInOnce() {
      if (redirectStarted) return;
      redirectStarted = true;
      signInRedirect();
    }

    function renderUser(nextUser) {
      if (!nextUser) return;
      user = nextUser;

      setText("[data-account-name]", accountDisplayName(user));
      setText("[data-account-email]", user.email || "Not available");

      if (loading) loading.hidden = true;
      if (shell) shell.hidden = false;
      if (signoutButton) signoutButton.disabled = false;
      if (resetEmailButton) resetEmailButton.disabled = !user.email;
      if (nameOpenButton) nameOpenButton.disabled = false;
      if (deleteOpenButton) deleteOpenButton.disabled = false;
    }

    client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === "SIGNED_OUT") {
          if (!deletionCompleted) redirectToSignInOnce();
          return;
        }

        if (session?.user) {
          renderUser(session.user);
        }
      }, 0);
    });

    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError || !sessionData.session) {
      redirectToSignInOnce();
      return;
    }

    const { data: userData, error: userError } = await client.auth.getUser();
    user = userData?.user;

    if (userError || !user) {
      redirectToSignInOnce();
      return;
    }

    renderUser(user);

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

    if (nameOpenButton && nameDialog && nameInput) {
      nameOpenButton.addEventListener("click", () => {
        resetNameDialog();
        nameInput.value = accountDisplayName(user);
        nameDialog.showModal();
        nameInput.focus();
        nameInput.select();
      });

      nameDialog.addEventListener("close", () => {
        resetNameDialog();
        nameForm?.reset();
        nameOpenButton.focus();
      });

      nameDialog.addEventListener("cancel", (event) => {
        if (nameUpdateInProgress) event.preventDefault();
      });

      nameDialog.addEventListener("click", (event) => {
        if (!nameUpdateInProgress && event.target === nameDialog) nameDialog.close();
      });
    }

    if (nameCancelButton && nameDialog) {
      nameCancelButton.addEventListener("click", () => {
        nameDialog.close();
      });
    }

    if (nameForm && nameInput) {
      nameForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!nameForm.reportValidity()) return;

        const displayName = nameInput.value.trim().replace(/\s+/g, " ");
        if (!displayName || displayName.length > 80) {
          setNameStatus("Enter a name between 1 and 80 characters.", "error");
          return;
        }

        nameUpdateInProgress = true;
        nameInput.disabled = true;
        if (nameCancelButton) nameCancelButton.disabled = true;
        if (nameSaveButton) nameSaveButton.disabled = true;
        setNameStatus("Saving your name...");

        try {
          const { data: updateData, error: updateError } = await client.auth.updateUser({
            data: { display_name: displayName }
          });
          if (updateError || !updateData.user) throw updateError || new Error("No user returned.");

          user = updateData.user;
          renderUser(user);
          nameDialog.close();
          setStatus("Your name has been updated.", "success");
        } catch {
          nameUpdateInProgress = false;
          nameInput.disabled = false;
          if (nameCancelButton) nameCancelButton.disabled = false;
          if (nameSaveButton) nameSaveButton.disabled = false;
          setNameStatus("Your name could not be updated. Please try again.", "error");
          nameInput.focus();
        }
      });
    }

    if (deleteOpenButton && deleteDialog) {
      deleteOpenButton.addEventListener("click", () => {
        resetDeleteDialog();
        deleteDialog.showModal();
        deleteCheckbox?.focus();
      });

      deleteDialog.addEventListener("close", () => {
        resetDeleteDialog();
        deleteOpenButton.focus();
      });

      deleteDialog.addEventListener("cancel", (event) => {
        if (deletionInProgress) event.preventDefault();
      });

      deleteDialog.addEventListener("click", (event) => {
        if (!deletionInProgress && event.target === deleteDialog) deleteDialog.close();
      });
    }

    if (deleteCheckbox && deleteConfirmButton) {
      deleteCheckbox.addEventListener("change", () => {
        deleteConfirmButton.disabled = !deleteCheckbox.checked;
      });
    }

    if (deleteCancelButton && deleteDialog) {
      deleteCancelButton.addEventListener("click", () => {
        deleteDialog.close();
      });
    }

    if (deleteConfirmButton && deleteCheckbox) {
      deleteConfirmButton.addEventListener("click", async () => {
        if (!deleteCheckbox.checked || deleteConfirmButton.disabled) return;

        deletionInProgress = true;
        deleteCheckbox.disabled = true;
        deleteConfirmButton.disabled = true;
        if (deleteCancelButton) deleteCancelButton.disabled = true;
        setDeleteStatus("Deleting your account...");

        try {
          const { data: deletionData, error: deletionError } = await client.functions.invoke(
            "delete-account",
            { body: { confirmation: "DELETE_MY_ACCOUNT" } }
          );

          if (deletionError || deletionData?.deleted !== true) {
            throw deletionError || new Error("Account deletion was not confirmed.");
          }

          deletionCompleted = true;
          setDeleteStatus("Your account has been deleted.", "success");

          try {
            await client.auth.signOut({ scope: "local" });
          } catch {
            // The server has already removed the account and its sessions.
          }

          window.location.replace("/signin/");
        } catch {
          deletionInProgress = false;
          deleteCheckbox.disabled = false;
          deleteConfirmButton.disabled = !deleteCheckbox.checked;
          if (deleteCancelButton) deleteCancelButton.disabled = false;
          setDeleteStatus(
            "Your account could not be deleted. Please try again or contact support.",
            "error"
          );
        }
      });
    }
  });
})();
