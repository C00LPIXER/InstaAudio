/* background.js – InstaAudio service worker
 *
 * Intercepts audioclip network requests from Instagram CDN,
 * deduplicates (Instagram fetches each clip 2-3 times),
 * stores unique URLs per tab, serves them to popup & content script.
 */

const store = {}; // tabId → Map<clipId, { url, ts }>

function ensure(tabId) {
  if (!store[tabId]) store[tabId] = new Map();
  return store[tabId];
}

/* ─── Intercept audioclip network responses ─── */
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const m = details.url.match(/(audioclip-(\d+)-(\d+))/);
    if (!m) return;

    const clipId = m[1];
    const map = ensure(details.tabId);

    // Deduplicate
    if (map.has(clipId)) return;

    const ts = parseInt(m[2], 10) || 0;
    map.set(clipId, { url: details.url, ts });

    // Update badge with count
    chrome.action.setBadgeText({ text: String(map.size), tabId: details.tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#0095f6", tabId: details.tabId });

    // Notify content script (it tracks chat switches)
    chrome.tabs.sendMessage(details.tabId, {
      type: "audioCapture",
      count: map.size,
    }).catch(() => {});
  },
  { urls: ["*://*.fbcdn.net/*", "*://*.cdninstagram.com/*", "*://*.fbsbx.com/*", "*://*.facebook.com/*"] }
);

/* ─── Messages from popup & content script ─── */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {

  // Popup asks for audios — it sends { action: "getAudios", tabId }
  if (msg.action === "getAudios") {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (tabId === undefined) { reply({ audios: [] }); return true; }

    const map = ensure(tabId);
    const arr = [];
    map.forEach(({ url, ts }, id) => arr.push({ id, url, ts }));
    arr.sort((a, b) => a.ts - b.ts);
    reply({ audios: arr });
    return true;
  }

  // Content script or popup says reset — clear clips for that tab
  if (msg.action === "resetChat") {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (tabId !== undefined) {
      store[tabId] = new Map();
      chrome.action.setBadgeText({ text: "", tabId });
    }
    reply({ ok: true });
    return true;
  }

  // Fetch audio as base64 so popup can play it (avoids CORS issues)
  if (msg.action === "fetchBlob") {
    fetch(msg.url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        reply({ dataUrl: "data:video/mp4;base64," + b64 });
      })
      .catch(() => reply({ dataUrl: null }));
    return true;
  }

  // Popup requests a download via the downloads API
  if (msg.action === "download") {
    chrome.downloads.download({
      url: msg.url,
      filename: "InstaAudio/" + (msg.name || "voice.mp4"),
      conflictAction: "uniquify",
    });
    reply({ ok: true });
    return true;
  }

  return true;
});

/* ─── Cleanup on tab close ─── */
chrome.tabs.onRemoved.addListener((tabId) => delete store[tabId]);
