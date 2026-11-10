(() => {
  const TABLE_NAME = "creator_profiles";
  const BUCKET_NAME = "creator-avatars";
  const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
  const ALLOWED_AVATAR_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);
  const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = options.text;
    return element;
  }

  function safeProfileError(error) {
    if (error?.code === "23505") {
      return "That username is already taken. Choose another username.";
    }

    if (["42P01", "PGRST202", "PGRST205"].includes(error?.code)) {
      return "Creator profile setup is not available yet. Please try again later.";
    }

    return "Your creator profile could not be created. Please try again.";
  }

  function profileUrl(profileId) {
    return "/profile/?profile=" + encodeURIComponent(profileId);
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const client = window.novaxSupabase;
    const openButton = document.querySelector("[data-create-profile-open]");
    const dialog = document.querySelector("[data-profile-dialog]");
    const closeButton = document.querySelector("[data-profile-close]");
    const cancelButton = document.querySelector("[data-profile-cancel]");
    const form = document.querySelector("[data-profile-form]");
    const detailsStep = document.querySelector("[data-profile-details-step]");
    const plansStep = document.querySelector("[data-profile-plans-step]");
    const handleInput = form?.elements.handle;
    const descriptionInput = form?.elements.description;
    const avatarInput = form?.elements.avatar;
    const termsInput = form?.elements.terms;
    const continueButton = document.querySelector("[data-profile-continue]");
    const backButton = document.querySelector("[data-profile-back]");
    const betaButton = document.querySelector("[data-beta-continue]");
    const descriptionCount = document.querySelector("[data-description-count]");
    const handleError = document.querySelector("[data-handle-error]");
    const avatarError = document.querySelector("[data-avatar-error]");
    const formStatus = document.querySelector("[data-profile-form-status]");
    const submitStatus = document.querySelector("[data-profile-submit-status]");
    const avatarImage = document.querySelector("[data-avatar-image]");
    const avatarPlaceholder = document.querySelector("[data-avatar-placeholder]");
    const avatarRemoveButton = document.querySelector("[data-avatar-remove]");
    const tableBody = document.querySelector("[data-profile-table-body]");
    const listStatus = document.querySelector("[data-profile-list-status]");
    const billingButtons = document.querySelectorAll("[data-billing-period]");
    const billingSummary = document.querySelector("[data-billing-summary]");
    const basicPrice = document.querySelector("[data-basic-price]");
    const basicPeriod = document.querySelector("[data-basic-period]");
    const basicSaving = document.querySelector("[data-basic-saving]");
    const premiumPrice = document.querySelector("[data-premium-price]");
    const premiumPeriod = document.querySelector("[data-premium-period]");
    const premiumSaving = document.querySelector("[data-premium-saving]");

    if (!client || !openButton || !dialog || !form) return;

    let user = null;
    let selectedAvatar = null;
    let avatarPreviewUrl = "";
    let submitting = false;
    let discardOnClose = false;
    let creationToken = "";

    function draftStorageKey() {
      return user ? `novax-creator-profile-draft:${user.id}` : "";
    }

    function setMessage(element, message, state = "") {
      if (!element) return;
      element.textContent = message;
      if (state) {
        element.dataset.state = state;
      } else {
        delete element.dataset.state;
      }
    }

    function setHandleError(message) {
      if (handleError) handleError.textContent = message;
      handleInput?.setCustomValidity(message);
    }

    function validateHandle(showMessage = false) {
      if (!handleInput) return false;
      const handle = handleInput.value;
      const valid = HANDLE_PATTERN.test(handle);

      if (!valid && showMessage) {
        setHandleError("Use 3 to 30 letters, numbers or underscores.");
      } else if (valid || !showMessage) {
        setHandleError("");
      }

      return valid;
    }

    function updateContinueState() {
      if (!continueButton) return;
      const handleIsValid = validateHandle(false);
      const descriptionIsValid = (descriptionInput?.value.length || 0) <= 500;
      const avatarIsValid = !avatarError?.textContent;
      continueButton.disabled = !(
        handleIsValid &&
        descriptionIsValid &&
        avatarIsValid &&
        termsInput?.checked
      );
    }

    function saveDraft() {
      const key = draftStorageKey();
      if (!key || !creationToken) return;

      try {
        window.sessionStorage.setItem(
          key,
          JSON.stringify({
            creationToken,
            handle: handleInput?.value || "",
            description: descriptionInput?.value || ""
          })
        );
      } catch {
        // The database token still protects a submitted retry if browser storage is unavailable.
      }
    }

    function loadDraft() {
      const key = draftStorageKey();
      let draft = null;

      try {
        draft = key ? JSON.parse(window.sessionStorage.getItem(key) || "null") : null;
      } catch {
        draft = null;
      }

      creationToken =
        typeof draft?.creationToken === "string" && draft.creationToken
          ? draft.creationToken
          : window.crypto.randomUUID();
      if (handleInput) handleInput.value = typeof draft?.handle === "string" ? draft.handle : "";
      if (descriptionInput) {
        descriptionInput.value =
          typeof draft?.description === "string" ? draft.description.slice(0, 500) : "";
      }
      if (termsInput) termsInput.checked = false;
      saveDraft();
    }

    function clearDraft() {
      const key = draftStorageKey();
      if (key) {
        try {
          window.sessionStorage.removeItem(key);
        } catch {
          // No action is needed when storage is unavailable.
        }
      }
      creationToken = "";
    }

    function releaseAvatarPreview() {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        avatarPreviewUrl = "";
      }
    }

    function resetAvatar() {
      releaseAvatarPreview();
      selectedAvatar = null;
      if (avatarInput) avatarInput.value = "";
      if (avatarImage) {
        avatarImage.removeAttribute("src");
        avatarImage.hidden = true;
      }
      if (avatarPlaceholder) avatarPlaceholder.hidden = false;
      if (avatarRemoveButton) avatarRemoveButton.hidden = true;
      setMessage(avatarError, "");
      updateContinueState();
    }

    function showDetailsStep() {
      if (detailsStep) detailsStep.hidden = false;
      if (plansStep) plansStep.hidden = true;
      setMessage(submitStatus, "");
      window.setTimeout(() => handleInput?.focus(), 0);
    }

    function showPlansStep() {
      if (detailsStep) detailsStep.hidden = true;
      if (plansStep) plansStep.hidden = false;
      setMessage(formStatus, "");
      window.setTimeout(() => backButton?.focus(), 0);
    }

    function resetBillingPeriod() {
      updateBillingPeriod("monthly");
    }

    function updateBillingPeriod(period) {
      const yearly = period === "yearly";
      billingButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.billingPeriod === period));
      });

      if (basicPrice) basicPrice.textContent = yearly ? "£47.99" : "£4.99";
      if (basicPeriod) basicPeriod.textContent = yearly ? "/year" : "/month";
      if (basicSaving) basicSaving.hidden = !yearly;
      if (premiumPrice) premiumPrice.textContent = yearly ? "£104.99" : "£9.99";
      if (premiumPeriod) premiumPeriod.textContent = yearly ? "/year" : "/month";
      if (premiumSaving) premiumSaving.hidden = !yearly;
      if (billingSummary) {
        billingSummary.textContent = yearly
          ? "Showing planned yearly prices with the advertised savings."
          : "Showing planned monthly prices.";
      }
    }

    function setSubmitting(isSubmitting) {
      submitting = isSubmitting;
      const controls = dialog.querySelectorAll("button, input, textarea");
      controls.forEach((control) => {
        if (control === betaButton) {
          control.disabled = isSubmitting;
        } else if (isSubmitting) {
          control.disabled = true;
        }
      });

      if (!isSubmitting) {
        closeButton.disabled = false;
        cancelButton.disabled = false;
        backButton.disabled = false;
        if (handleInput) handleInput.disabled = false;
        if (descriptionInput) descriptionInput.disabled = false;
        if (avatarInput) avatarInput.disabled = false;
        if (termsInput) termsInput.disabled = false;
        billingButtons.forEach((button) => {
          button.disabled = false;
        });
        if (betaButton) betaButton.disabled = false;
        if (avatarRemoveButton) avatarRemoveButton.disabled = false;
        updateContinueState();
      }
    }

    function discardDraftAndClose() {
      if (submitting) return;
      discardOnClose = true;
      clearDraft();
      dialog.close();
    }

    function profileStatusText(status) {
      return status === "beta" ? "Beta" : "Active";
    }

    function renderProfiles(profiles) {
      if (!tableBody) return;
      tableBody.replaceChildren();

      if (!profiles.length) {
        const row = createElement("tr");
        const cell = createElement("td", {
          className: "empty-row",
          text: "No creator profiles yet. Create one to join the beta."
        });
        cell.colSpan = 4;
        row.append(cell);
        tableBody.append(row);
        return;
      }

      profiles.forEach((profile) => {
        const row = createElement("tr");
        const handleCell = createElement("td");
        const handleLink = createElement("a", {
          className: "profile-table-link",
          text: `@${profile.handle}`
        });
        handleLink.href = profileUrl(profile.id);
        handleCell.append(handleLink);

        const statusCell = createElement("td");
        statusCell.append(
          createElement("span", {
            className: "profile-table-status",
            text: profileStatusText(profile.status)
          })
        );

        const createdCell = createElement("td", {
          text: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
            new Date(profile.created_at)
          )
        });
        const actionCell = createElement("td");
        const viewLink = createElement("a", { className: "profile-table-action", text: "View" });
        viewLink.href = profileUrl(profile.id);
        actionCell.append(viewLink);

        row.append(handleCell, statusCell, createdCell, actionCell);
        tableBody.append(row);
      });
    }

    async function loadProfiles() {
      if (!user || !tableBody) return;
      openButton.disabled = true;
      setMessage(listStatus, "");

      const { data, error } = await client
        .from(TABLE_NAME)
        .select("id, handle, status, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        renderProfiles([]);
        openButton.disabled = true;
        openButton.textContent = ["42P01", "PGRST205"].includes(error.code)
          ? "Create New Profile - Setup Pending"
          : "Create New Profile";
        setMessage(
          listStatus,
          ["42P01", "PGRST205"].includes(error.code)
            ? "Creator profile database setup has not been applied yet."
            : "Your creator profiles could not be loaded. Please refresh the page.",
          "error"
        );
        return false;
      }

      renderProfiles(data || []);
      openButton.textContent = "Create New Profile";
      openButton.disabled = false;
      return true;
    }

    client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (session?.user) {
          user = session.user;
          loadProfiles();
        } else if (event === "SIGNED_OUT") {
          openButton.disabled = true;
        }
      }, 0);
    });

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.user) return;

    user = sessionData.session.user;
    await loadProfiles();

    openButton.addEventListener("click", () => {
      discardOnClose = false;
      form.reset();
      resetAvatar();
      loadDraft();
      if (descriptionCount) descriptionCount.textContent = `${descriptionInput.value.length} / 500`;
      setHandleError("");
      setMessage(formStatus, "");
      setMessage(submitStatus, "");
      resetBillingPeriod();
      showDetailsStep();
      updateContinueState();
      dialog.showModal();
      window.setTimeout(() => handleInput?.focus(), 0);
    });

    closeButton?.addEventListener("click", discardDraftAndClose);
    cancelButton?.addEventListener("click", discardDraftAndClose);

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      discardDraftAndClose();
    });

    dialog.addEventListener("close", () => {
      setSubmitting(false);
      releaseAvatarPreview();
      selectedAvatar = null;
      form.reset();
      if (!discardOnClose) saveDraft();
      discardOnClose = false;
      openButton.focus();
    });

    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.closest("[hidden]") && element.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    handleInput?.addEventListener("input", () => {
      setHandleError("");
      setMessage(formStatus, "");
      saveDraft();
      updateContinueState();
    });

    handleInput?.addEventListener("blur", () => {
      validateHandle(Boolean(handleInput.value));
      updateContinueState();
    });

    descriptionInput?.addEventListener("input", () => {
      if (descriptionCount) descriptionCount.textContent = `${descriptionInput.value.length} / 500`;
      saveDraft();
      updateContinueState();
    });

    termsInput?.addEventListener("change", updateContinueState);

    avatarInput?.addEventListener("change", () => {
      const file = avatarInput.files?.[0] || null;
      resetAvatar();
      if (!file) return;

      if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
        setMessage(avatarError, "Choose a JPEG, PNG or WebP image.", "error");
        updateContinueState();
        return;
      }

      if (file.size > MAX_AVATAR_BYTES) {
        setMessage(avatarError, "The image must be 5 MB or smaller.", "error");
        updateContinueState();
        return;
      }

      selectedAvatar = file;
      avatarPreviewUrl = URL.createObjectURL(file);
      if (avatarImage) {
        avatarImage.src = avatarPreviewUrl;
        avatarImage.hidden = false;
      }
      if (avatarPlaceholder) avatarPlaceholder.hidden = true;
      if (avatarRemoveButton) avatarRemoveButton.hidden = false;
      updateContinueState();
    });

    avatarRemoveButton?.addEventListener("click", resetAvatar);

    continueButton?.addEventListener("click", () => {
      const handleIsValid = validateHandle(true);
      if (!handleIsValid || !termsInput?.checked || !form.reportValidity()) {
        updateContinueState();
        return;
      }

      saveDraft();
      showPlansStep();
    });

    backButton?.addEventListener("click", showDetailsStep);
    billingButtons.forEach((button) => {
      button.addEventListener("click", () => updateBillingPeriod(button.dataset.billingPeriod));
    });

    betaButton?.addEventListener("click", async () => {
      if (submitting) return;
      setMessage(submitStatus, "");

      const { data: currentSessionData, error: currentSessionError } = await client.auth.getSession();
      const currentUser = currentSessionData.session?.user;
      if (currentSessionError || !currentUser || currentUser.id !== user?.id) {
        setMessage(submitStatus, "Your session has expired. Sign in again before continuing.", "error");
        return;
      }

      if (!termsInput?.checked || !validateHandle(true)) {
        showDetailsStep();
        updateContinueState();
        return;
      }

      if (!creationToken) creationToken = window.crypto.randomUUID();
      saveDraft();
      setSubmitting(true);
      setMessage(submitStatus, "Creating your beta creator profile...");

      let profile = null;
      let avatarPath = "";

      try {
        const { data, error } = await client.rpc("create_creator_profile", {
          p_creation_token: creationToken,
          p_description: descriptionInput?.value || "",
          p_handle: handleInput.value,
          p_terms_accepted: true
        });

        if (error) throw error;
        profile = Array.isArray(data) ? data[0] : data;
        if (!profile?.id) throw new Error("Creator profile creation returned no profile.");

        if (selectedAvatar && !profile.avatar_path) {
          const extension = ALLOWED_AVATAR_TYPES.get(selectedAvatar.type);
          avatarPath = `${currentUser.id}/${profile.id}/avatar.${extension}`;

          const { error: uploadError } = await client.storage
            .from(BUCKET_NAME)
            .upload(avatarPath, selectedAvatar, {
              cacheControl: "3600",
              contentType: selectedAvatar.type,
              upsert: true
            });
          if (uploadError) throw uploadError;

          const { data: updatedProfile, error: updateError } = await client
            .from(TABLE_NAME)
            .update({ avatar_path: avatarPath })
            .eq("id", profile.id)
            .eq("ownerid", currentUser.id)
            .select("id, avatar_path")
            .single();
          if (updateError || !updatedProfile) throw updateError || new Error("Avatar was not linked.");
        }

        clearDraft();
        setMessage(submitStatus, "Your profile is ready. Opening it now...", "success");
        window.location.assign(profileUrl(profile.id));
      } catch (error) {
        if (avatarPath) {
          await client.storage.from(BUCKET_NAME).remove([avatarPath]);
        }

        if (profile?.created === true) {
          await client.from(TABLE_NAME).delete().eq("id", profile.id).eq("ownerid", currentUser.id);
        }

        if (error?.code === "23505") {
          showDetailsStep();
          setHandleError("That username is already taken. Choose another username.");
          setMessage(formStatus, "That username is already taken. Choose another username.", "error");
          handleInput?.focus();
        } else {
          setMessage(submitStatus, safeProfileError(error), "error");
        }
        setSubmitting(false);
      }
    });
  });
})();
