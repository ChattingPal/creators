(() => {
  const BUCKET_NAME = "creator-avatars";

  window.addEventListener("DOMContentLoaded", async () => {
    const client = window.novaxSupabase;
    const loading = document.querySelector("[data-public-profile-loading]");
    const profileShell = document.querySelector("[data-public-profile]");
    const errorShell = document.querySelector("[data-public-profile-error]");
    const errorMessage = document.querySelector("[data-public-profile-error-message]");
    const handleElement = document.querySelector("[data-public-handle]");
    const descriptionElement = document.querySelector("[data-public-description]");
    const statusElement = document.querySelector("[data-public-status]");
    const verifiedBadge = document.querySelector("[data-public-verified-badge]");
    const avatarImage = document.querySelector("[data-public-avatar-image]");
    const avatarPlaceholder = document.querySelector("[data-public-avatar-placeholder]");
    const profileKey = new URL(window.location.href).searchParams.get("profile");

    function showError(message) {
      if (loading) loading.hidden = true;
      if (profileShell) profileShell.hidden = true;
      if (errorMessage) errorMessage.textContent = message;
      if (errorShell) errorShell.hidden = false;
    }

    if (!client) {
      showError("Creator profiles are temporarily unavailable. Please try again later.");
      return;
    }

    if (!profileKey) {
      showError("Use a valid creator profile link to view this page.");
      return;
    }

    const { data, error } = await client.rpc("get_public_creator_profile", {
      p_profile_key: profileKey
    });
    const profile = Array.isArray(data) ? data[0] : data;

    if (error || !profile) {
      showError("This creator profile may not exist or may no longer be public.");
      return;
    }

    const handle = profile.handle || "Creator";
    if (handleElement) handleElement.textContent = `@${handle}`;
    if (descriptionElement) {
      descriptionElement.textContent =
        profile.description || "This creator has not added an About Me description yet.";
    }
    if (statusElement) {
      statusElement.textContent = profile.verified ? "Verified creator" : "Beta creator";
    }
    if (verifiedBadge) {
      verifiedBadge.hidden = profile.verified !== true;
    }

    if (profile.avatar_path && avatarImage) {
      const { data: publicUrlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(profile.avatar_path);
      if (publicUrlData?.publicUrl) {
        avatarImage.src = publicUrlData.publicUrl;
        avatarImage.alt = `${handle}'s profile picture`;
        avatarImage.hidden = false;
        if (avatarPlaceholder) avatarPlaceholder.hidden = true;
      }
    } else if (avatarPlaceholder) {
      avatarPlaceholder.textContent = handle.slice(0, 2).toUpperCase();
    }

    document.title = `@${handle} | NovaX Creator Hub`;
    if (loading) loading.hidden = true;
    if (profileShell) profileShell.hidden = false;
  });
})();
