(() => {
  const BUCKET_NAME = "creator-avatars";
  const SEARCH_DELAY_MS = 250;

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = options.text;
    return element;
  }

  function profilePath(handle) {
    return "/profile/" + encodeURIComponent(handle);
  }

  window.addEventListener("DOMContentLoaded", () => {
    const client = window.novaxSupabase;
    const form = document.querySelector("[data-creator-search-form]");
    const input = document.querySelector("[data-creator-search-input]");
    const grid = document.querySelector("[data-creator-directory-grid]");
    const status = document.querySelector("[data-creator-directory-status]");
    const count = document.querySelector("[data-creator-result-count]");

    if (!client || !form || !input || !grid || !status || !count) {
      if (status) status.textContent = "The creator directory is temporarily unavailable.";
      return;
    }

    let searchTimer = 0;
    let requestNumber = 0;

    function setStatus(message, state = "") {
      status.textContent = message;
      if (state) {
        status.dataset.state = state;
      } else {
        delete status.dataset.state;
      }
    }

    function creatorAvatar(profile) {
      const avatar = createElement("div", { className: "creator-directory-avatar" });

      if (profile.avatar_path) {
        const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(profile.avatar_path);
        if (data?.publicUrl) {
          const image = createElement("img");
          image.src = data.publicUrl;
          image.alt = `${profile.handle}'s profile picture`;
          image.loading = "lazy";
          image.width = 80;
          image.height = 80;
          avatar.append(image);
          return avatar;
        }
      }

      avatar.append(
        createElement("span", {
          text: profile.handle.slice(0, 2).toUpperCase()
        })
      );
      return avatar;
    }

    function creatorCard(profile) {
      const card = createElement("article", { className: "creator-directory-card" });
      const top = createElement("div", { className: "creator-directory-card-top" });
      const identity = createElement("div", { className: "creator-directory-identity" });
      const nameRow = createElement("div", { className: "creator-directory-name-row" });
      const link = createElement("a", {
        className: "creator-directory-handle",
        text: `@${profile.handle}`
      });
      link.href = profilePath(profile.handle);
      nameRow.append(link);

      if (profile.verified === true) {
        const badge = createElement("img", { className: "creator-directory-verified" });
        badge.src = "/profile/verificationlogo.png";
        badge.alt = "Verified creator";
        badge.width = 24;
        badge.height = 24;
        nameRow.append(badge);
      }

      identity.append(nameRow);
      identity.append(
        createElement("span", {
          className: "creator-directory-tier",
          text: profile.verified ? "Verified creator" : "Beta creator"
        })
      );
      top.append(creatorAvatar(profile), identity);
      card.append(top);

      card.append(
        createElement("p", {
          className: "creator-directory-description",
          text: profile.description || "This creator has not added an About Me description yet."
        })
      );

      const viewLink = createElement("a", {
        className: "creator-directory-view",
        text: "View profile"
      });
      viewLink.href = profilePath(profile.handle);
      card.append(viewLink);
      return card;
    }

    function renderProfiles(profiles, query) {
      grid.replaceChildren();
      count.textContent = `${profiles.length} ${profiles.length === 1 ? "creator" : "creators"}`;

      if (!profiles.length) {
        setStatus(
          query
            ? `No public creators were found for “${query}”.`
            : "No public creator profiles are available yet."
        );
        return;
      }

      setStatus("");
      profiles.forEach((profile) => grid.append(creatorCard(profile)));
    }

    async function searchCreators() {
      const query = input.value.trim();
      const currentRequest = ++requestNumber;
      setStatus(query ? `Searching for “${query}”...` : "Loading creators...");

      const { data, error } = await client.rpc("search_public_creator_profiles", {
        p_handle_query: query,
        p_limit: 100,
        p_offset: 0
      });

      if (currentRequest !== requestNumber) return;

      if (error) {
        grid.replaceChildren();
        count.textContent = "";
        setStatus("The creator directory could not be loaded. Please try again.", "error");
        return;
      }

      const profiles = Array.isArray(data) ? data : [];
      profiles.sort((first, second) => {
        const verifiedDifference = Number(second.verified === true) - Number(first.verified === true);
        return verifiedDifference || first.handle.localeCompare(second.handle, "en-GB", { sensitivity: "base" });
      });
      renderProfiles(profiles, query);
    }

    function queueSearch() {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(searchCreators, SEARCH_DELAY_MS);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.clearTimeout(searchTimer);
      searchCreators();
    });
    input.addEventListener("input", queueSearch);

    const initialQuery = new URL(window.location.href).searchParams.get("handle");
    if (initialQuery) input.value = initialQuery.slice(0, 30);
    searchCreators();
  });
})();
