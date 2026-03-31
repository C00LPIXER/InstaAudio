/* content.js – InstaAudio (minimal)
 *
 * Only job: detect when the user switches to a different chat
 * and tell the background worker to clear old audio clips.
 * All UI lives in the popup.
 */

(function () {
  "use strict";

  const TAG = "[InstaAudio]";
  let activeThread = null;

  const send = (data) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(data, (res) => {
          if (chrome.runtime.lastError) resolve({});
          else resolve(res || {});
        });
      } catch (_) { resolve({}); }
    });

  function threadId() {
    return (location.pathname.match(/\/direct\/t\/(\d+)/) || [])[1] || null;
  }

  function check() {
    const tid = threadId();
    if (!tid) return;

    if (activeThread === null) {
      // First load – just record the thread, don't reset
      activeThread = tid;
      console.log(TAG, "Loaded on thread:", tid);
      return;
    }

    if (tid !== activeThread) {
      console.log(TAG, "Chat switched:", activeThread, "→", tid);
      activeThread = tid;
      send({ action: "resetChat" });
    }
  }

  // Watch for SPA navigation (Instagram doesn't do full page loads)
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      check();
    }
  }).observe(document.body, { childList: true, subtree: true });

  check();
  console.log(TAG, "Content script ready.");
})();

