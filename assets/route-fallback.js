(() => {
  const profilePath = window.location.pathname.match(/^\/profile\/([A-Za-z0-9_]{3,30})\/?$/);
  const status = document.querySelector("[data-route-status]");

  if (!profilePath) {
    window.location.replace("/");
    return;
  }

  fetch("/profile/index.html", { cache: "no-store", credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error("Profile shell could not be loaded.");
      return response.text();
    })
    .then((html) => {
      document.open();
      document.write(html);
      document.close();
    })
    .catch(() => {
      if (status) {
        status.textContent = "This creator profile could not be opened. Return to Creator Hub and try again.";
      }
    });
})();
