(() => {
  const params = new URLSearchParams(location.search);
  const candidates = [params.get("url"), params.get("text"), params.get("title")].filter(Boolean);
  let shared = "";

  for (const value of candidates) {
    const match = value.match(/https?:\/\/[^\s]+/i);
    if (match) {
      shared = match[0].replace(/[),.;]+$/, "");
      break;
    }
  }

  if (!shared) return;

  // Preserve the shared URL while the inline authentication dialog validates
  // or creates the browser session. Do not redirect away from library.html:
  // keeping the original query string lets library.js open and fill the form
  // immediately after authentication completes and the page reloads.
  sessionStorage.setItem("musicDiscoveryPendingShare", shared);
})();