(() => {
  const profilePath = window.location.pathname.match(/^\/profile\/([A-Za-z0-9_]{3,30})\/?$/);

  if (!profilePath) {
    window.location.replace("/");
    return;
  }

  const destination = new URL("/profile/", window.location.origin);
  destination.searchParams.set("profile", profilePath[1]);
  window.location.replace(destination.href);
})();
