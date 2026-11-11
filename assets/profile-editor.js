(() => {
  const TABLE_NAME = "creator_profiles";
  const BUCKET_NAME = "creator-avatars";
  const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
  const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
  const ALLOWED_AVATAR_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);

  window.addEventListener("DOMContentLoaded", async () => {
    const client = window.novaxSupabase;
    const dialog = document.querySelector("[data-profile-edit-dialog]");
    const form = document.querySelector("[data-profile-edit-form]");
    const closeButton = document.querySelector("[data-profile-edit-close]");
    const cancelButton = document.querySelector("[data-profile-edit-cancel]");
    const saveButton = document.querySelector("[data-profile-edit-save]");
    const handleInput = form?.elements["edit-handle"];
    const handleError = document.querySelector("[data-profile-edit-handle-error]");
    const verifiedMessage = document.querySelector("[data-verified-handle-message]");
    const avatarInput = form?.elements["edit-avatar"];
    const avatarImage = document.querySelector("[data-profile-edit-avatar-image]");
    const avatarPlaceholder = document.querySelector("[data-profile-edit-avatar-placeholder]");
    const avatarRemoveButton = document.querySelector("[data-profile-edit-avatar-remove]");
    const avatarError = document.querySelector("[data-profile-edit-avatar-error]");
    const descriptionInput = form?.elements["edit-description"];
    const descriptionCount = document.querySelector("[data-profile-edit-description-count]");
    const status = document.querySelector("[data-profile-edit-status]");

    if (!client || !dialog || !form || !handleInput || !descriptionInput || !avatarInput) return;

    let user = null;
    let profile = null;
    let openingButton = null;
    let selectedAvatar = null;
    let removeAvatar = false;
    let previewUrl = "";
    let saving = false;

    function setMessage(element, message, state = "") {
      if (!element) return;
      element.textContent = message;
      if (state) {
        element.dataset.state = state;
      } else {
        delete element.dataset.state;
      }
    }

    function releasePreview() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = "";
      }
    }

    function setAvatarPlaceholder(handle) {
      releasePreview();
      if (avatarImage) {
        avatarImage.removeAttribute("src");
        avatarImage.hidden = true;
      }
      if (avatarPlaceholder) {
        avatarPlaceholder.textContent = (handle || "NX").slice(0, 2).toUpperCase();
        avatarPlaceholder.hidden = false;
      }
    }

    function showAvatar(path, handle) {
      if (!path || !avatarImage) {
        setAvatarPlaceholder(handle);
        return;
      }

      const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(path);
      if (!data?.publicUrl) {
        setAvatarPlaceholder(handle);
        return;
      }

      releasePreview();
      avatarImage.src = data.publicUrl;
      avatarImage.hidden = false;
      if (avatarPlaceholder) avatarPlaceholder.hidden = true;
    }

    function showSelectedAvatar(file) {
      releasePreview();
      previewUrl = URL.createObjectURL(file);
      if (avatarImage) {
        avatarImage.src = previewUrl;
        avatarImage.hidden = false;
      }
      if (avatarPlaceholder) avatarPlaceholder.hidden = true;
    }

    function setBusy(isBusy) {
      saving = isBusy;
      closeButton.disabled = isBusy;
      cancelButton.disabled = isBusy;
      saveButton.disabled = isBusy;
      descriptionInput.disabled = isBusy;
      avatarInput.disabled = isBusy;
      avatarRemoveButton.disabled = isBusy;
      handleInput.disabled = isBusy || profile?.verified === true;
    }

    function renderProfile(nextProfile) {
      profile = nextProfile;
      form.reset();
      selectedAvatar = null;
      removeAvatar = false;
      handleInput.value = profile.handle;
      handleInput.disabled = profile.verified === true;
      verifiedMessage.hidden = profile.verified !== true;
      descriptionInput.value = profile.description || "";
      descriptionCount.textContent = `${descriptionInput.value.length} / 500`;
      avatarRemoveButton.hidden = !profile.avatar_path;
      setMessage(handleError, "");
      handleInput.setCustomValidity("");
      setMessage(avatarError, "");
      setMessage(status, "");
      showAvatar(profile.avatar_path, profile.handle);
    }

    async function loadOwnedProfile(profileId) {
      const { data, error } = await client
        .from(TABLE_NAME)
        .select("id, ownerid, handle, description, avatar_path, verified")
        .eq("id", profileId)
        .single();
      if (error || !data || data.ownerid !== user?.id) {
        throw error || new Error("Profile ownership could not be confirmed.");
      }
      return data;
    }

    async function openEditor(button) {
      if (!user || saving) return;
      openingButton = button;
      button.disabled = true;

      try {
        const nextProfile = await loadOwnedProfile(button.dataset.profileEdit);
        renderProfile(nextProfile);
        dialog.showModal();
        window.setTimeout(() => {
          if (nextProfile.verified) {
            avatarInput.focus();
          } else {
            handleInput.focus();
            handleInput.select();
          }
        }, 0);
      } catch {
        window.dispatchEvent(new CustomEvent("novax:profile-edit-error"));
      } finally {
        button.disabled = false;
      }
    }

    client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (session?.user) user = session.user;
        if (event === "SIGNED_OUT") user = null;
      }, 0);
    });

    const { data: sessionData } = await client.auth.getSession();
    user = sessionData.session?.user || null;

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-profile-edit]");
      if (button) openEditor(button);
    });

    closeButton.addEventListener("click", () => {
      if (!saving) dialog.close();
    });
    cancelButton.addEventListener("click", () => {
      if (!saving) dialog.close();
    });
    dialog.addEventListener("cancel", (event) => {
      if (saving) event.preventDefault();
    });
    dialog.addEventListener("close", () => {
      setBusy(false);
      releasePreview();
      profile = null;
      selectedAvatar = null;
      removeAvatar = false;
      form.reset();
      openingButton?.focus();
      openingButton = null;
    });

    handleInput.addEventListener("input", () => {
      handleInput.setCustomValidity("");
      setMessage(handleError, "");
    });

    descriptionInput.addEventListener("input", () => {
      descriptionCount.textContent = `${descriptionInput.value.length} / 500`;
    });

    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files?.[0] || null;
      setMessage(avatarError, "");
      if (!file) return;

      if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
        avatarInput.value = "";
        setMessage(avatarError, "Choose a JPEG, PNG or WebP image.", "error");
        return;
      }

      if (file.size > MAX_AVATAR_BYTES) {
        avatarInput.value = "";
        setMessage(avatarError, "The image must be 5 MB or smaller.", "error");
        return;
      }

      selectedAvatar = file;
      removeAvatar = false;
      avatarRemoveButton.hidden = false;
      showSelectedAvatar(file);
    });

    avatarRemoveButton.addEventListener("click", () => {
      selectedAvatar = null;
      removeAvatar = true;
      avatarInput.value = "";
      avatarRemoveButton.hidden = true;
      setMessage(avatarError, "");
      setAvatarPlaceholder(handleInput.value);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saving || !profile) return;
      setMessage(status, "");

      const { data: currentSessionData, error: sessionError } = await client.auth.getSession();
      const currentUser = currentSessionData.session?.user;
      if (sessionError || !currentUser || currentUser.id !== user?.id) {
        setMessage(status, "Your session has expired. Sign in again before saving.", "error");
        return;
      }

      let authoritativeProfile;
      try {
        authoritativeProfile = await loadOwnedProfile(profile.id);
      } catch {
        setMessage(status, "This profile could not be verified. Refresh the page and try again.", "error");
        return;
      }

      const requestedHandle = handleInput.value;
      if (!authoritativeProfile.verified && !HANDLE_PATTERN.test(requestedHandle)) {
        const message = "Use 3 to 30 letters, numbers or underscores.";
        handleInput.setCustomValidity(message);
        setMessage(handleError, message, "error");
        handleInput.focus();
        return;
      }

      if (descriptionInput.value.length > 500 || !form.reportValidity()) return;

      setBusy(true);
      setMessage(status, "Saving your profile...");
      let uploadedPath = "";

      try {
        const update = {
          description: descriptionInput.value,
          avatar_path: removeAvatar ? null : authoritativeProfile.avatar_path
        };
        if (!authoritativeProfile.verified) update.handle = requestedHandle;

        if (selectedAvatar) {
          const extension = ALLOWED_AVATAR_TYPES.get(selectedAvatar.type);
          uploadedPath = `${currentUser.id}/${authoritativeProfile.id}/avatar-${window.crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await client.storage
            .from(BUCKET_NAME)
            .upload(uploadedPath, selectedAvatar, {
              cacheControl: "3600",
              contentType: selectedAvatar.type,
              upsert: false
            });
          if (uploadError) throw uploadError;
          update.avatar_path = uploadedPath;
        }

        const { data: updatedProfile, error: updateError } = await client
          .from(TABLE_NAME)
          .update(update)
          .eq("id", authoritativeProfile.id)
          .eq("ownerid", currentUser.id)
          .select("id, ownerid, handle, description, avatar_path, verified")
          .single();
        if (updateError || !updatedProfile) throw updateError || new Error("No updated profile returned.");

        if (
          authoritativeProfile.avatar_path &&
          authoritativeProfile.avatar_path !== updatedProfile.avatar_path
        ) {
          await client.storage.from(BUCKET_NAME).remove([authoritativeProfile.avatar_path]);
        }

        profile = updatedProfile;
        setMessage(status, "Your profile has been updated.", "success");
        window.dispatchEvent(new CustomEvent("novax:profile-updated", { detail: updatedProfile }));
        dialog.close();
      } catch (error) {
        if (uploadedPath) await client.storage.from(BUCKET_NAME).remove([uploadedPath]);
        if (error?.code === "23505") {
          const message = "That handle is already taken. Choose another handle.";
          handleInput.setCustomValidity(message);
          setMessage(handleError, message, "error");
          handleInput.focus();
        } else if (error?.code === "42501" && authoritativeProfile.verified) {
          setMessage(
            status,
            "Verified creator handles must be changed through the support team.",
            "error"
          );
        } else {
          setMessage(status, "Your profile could not be updated. Please try again.", "error");
        }
        setBusy(false);
      }
    });
  });
})();
