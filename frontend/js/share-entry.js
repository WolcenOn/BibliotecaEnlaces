(() => {
  const params = new URLSearchParams(location.search);
  const candidates = [params.get("url"), params.get("text"), params.get("title")].filter(Boolean);
  let shared = "";
  for (const value of candidates) {
    const match = value.match(/https?:\/\/[^\s]+/i);
    if (match) { shared = match[0].replace(/[),.;]+$/, ""); break; }
  }
  if (!shared) return;
  sessionStorage.setItem("musicDiscoveryPendingShare", shared);
  if (!localStorage.getItem("musicDiscoveryToken")) location.replace("./login.html?shared=1");
})();