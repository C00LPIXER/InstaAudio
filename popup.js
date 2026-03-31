/* popup.js – InstaAudio popup logic
 *
 * Fetches captured audio clips from the background worker,
 * renders a list with play/pause and download controls.
 * Audio is fetched as a data-URL blob through the background
 * to bypass CORS restrictions.
 */

(function () {
  "use strict";

  const listEl   = document.getElementById("list");
  const countEl  = document.getElementById("count");
  const statusEl = document.getElementById("status");
  const footerEl = document.getElementById("footer");
  const dlAllBtn = document.getElementById("dlAll");

  let currentAudio = null;  // HTMLAudioElement currently playing
  let currentBtn   = null;  // the ▶ button that is active
  let currentProg  = null;  // { wrap, bar, durEl } for active row
  let audios       = [];
  let activeTabId  = null;
  let isPlaying    = false; // true while audio is playing
  let lastCount    = -1;    // to detect new clips without full re-render

  // Cache: clipId → dataUrl (so we only fetch the blob once)
  const blobCache = {};

  /* ── helpers ── */

  function send(data) {
    return new Promise((resolve) =>
      chrome.runtime.sendMessage(data, (res) => resolve(res || {}))
    );
  }

  function fmtDur(sec) {
    if (!sec || !isFinite(sec)) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  /* ── fetch audio blob through background (bypasses CORS) ── */

  async function getBlob(clip) {
    if (blobCache[clip.id]) return blobCache[clip.id];
    const { dataUrl } = await send({ action: "fetchBlob", url: clip.url });
    if (dataUrl) blobCache[clip.id] = dataUrl;
    return dataUrl;
  }

  /* ── stop any playing audio ── */

  function stopCurrent() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    if (currentBtn) {
      currentBtn.textContent = "▶";
      currentBtn.classList.remove("playing");
      currentBtn = null;
    }
    if (currentProg) {
      currentProg.wrap.classList.remove("active");
      currentProg.bar.style.width = "0%";
      currentProg = null;
    }
    isPlaying = false;
  }

  /* ── render the audio list ── */

  function render() {
    // Don't re-render while audio is playing (it would kill the player)
    if (isPlaying) {
      countEl.textContent = audios.length;
      return;
    }

    listEl.innerHTML = "";
    countEl.textContent = audios.length;

    if (audios.length === 0) {
      listEl.innerHTML =
        '<div class="empty">' +
        '<div class="icon">🔇</div>' +
        "No voice messages captured yet.<br>" +
        "Open an Instagram DM chat with<br>voice messages and wait a moment." +
        "</div>";
      footerEl.style.display = "none";
      statusEl.textContent = "Waiting for voice messages…";
      return;
    }

    statusEl.textContent = `${audios.length} voice message${audios.length > 1 ? "s" : ""} captured`;
    footerEl.style.display = "block";

    audios.forEach((clip, i) => {
      const row = document.createElement("div");
      row.className = "row";

      // Number
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = i + 1;

      // Info column
      const wave = document.createElement("div");
      wave.className = "wave";

      const titleRow = document.createElement("div");
      titleRow.className = "title";
      titleRow.textContent = "Voice Message " + (i + 1);

      const timeRow = document.createElement("div");
      timeRow.className = "time";
      timeRow.textContent = "Loading duration…";

      // Load real duration from audio metadata
      (async () => {
        const dataUrl = await getBlob(clip);
        if (!dataUrl) { timeRow.textContent = "Duration unknown"; return; }
        const tmpAudio = new Audio();
        tmpAudio.preload = "metadata";
        tmpAudio.src = dataUrl;
        tmpAudio.addEventListener("loadedmetadata", () => {
          timeRow.textContent = "Duration: " + fmtDur(tmpAudio.duration);
        });
        tmpAudio.addEventListener("error", () => {
          timeRow.textContent = "Duration unknown";
        });
      })();

      const progressWrap = document.createElement("div");
      progressWrap.className = "progress-wrap";
      const progressBar = document.createElement("div");
      progressBar.className = "progress-bar";
      progressWrap.appendChild(progressBar);

      const currentTimeEl = document.createElement("div");
      currentTimeEl.className = "time";
      currentTimeEl.textContent = "";
      currentTimeEl.style.display = "none";

      wave.appendChild(titleRow);
      wave.appendChild(timeRow);
      wave.appendChild(progressWrap);
      wave.appendChild(currentTimeEl);

      // Play button
      const playBtn = document.createElement("button");
      playBtn.className = "btn btn-play";
      playBtn.textContent = "▶";
      playBtn.title = "Play";

      playBtn.addEventListener("click", async () => {
        // Toggle off if already playing this clip
        if (currentBtn === playBtn) {
          stopCurrent();
          currentTimeEl.style.display = "none";
          return;
        }

        stopCurrent();

        playBtn.textContent = "⏳";
        playBtn.disabled = true;

        // Fetch blob through background to avoid CORS
        const dataUrl = await getBlob(clip);
        if (!dataUrl) {
          playBtn.textContent = "▶";
          playBtn.disabled = false;
          titleRow.textContent = "⚠ Could not load audio";
          setTimeout(() => (titleRow.textContent = "Voice Message " + (i + 1)), 2000);
          return;
        }

        const audio = new Audio(dataUrl);
        currentAudio = audio;
        currentBtn = playBtn;
        currentProg = { wrap: progressWrap, bar: progressBar, durEl: currentTimeEl };
        isPlaying = true;

        playBtn.textContent = "⏸";
        playBtn.disabled = false;
        playBtn.classList.add("playing");
        progressWrap.classList.add("active");
        currentTimeEl.style.display = "block";

        audio.addEventListener("loadedmetadata", () => {
          timeRow.textContent = "Duration: " + fmtDur(audio.duration);
        });

        audio.addEventListener("timeupdate", () => {
          if (audio.duration) {
            const pct = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = pct + "%";
            currentTimeEl.textContent = fmtDur(audio.currentTime) + " / " + fmtDur(audio.duration);
          }
        });

        audio.addEventListener("ended", () => {
          stopCurrent();
          currentTimeEl.style.display = "none";
        });

        audio.addEventListener("error", () => {
          stopCurrent();
          currentTimeEl.style.display = "none";
          titleRow.textContent = "⚠ Playback error";
          setTimeout(() => (titleRow.textContent = "Voice Message " + (i + 1)), 2000);
        });

        audio.play().catch(() => {
          stopCurrent();
          currentTimeEl.style.display = "none";
        });
      });

      // Seek on progress bar click
      progressWrap.addEventListener("click", (e) => {
        if (currentAudio && currentBtn === playBtn && currentAudio.duration) {
          const rect = progressWrap.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          currentAudio.currentTime = pct * currentAudio.duration;
        }
      });

      // Download button
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn btn-dl";
      dlBtn.textContent = "⬇";
      dlBtn.title = "Download";

      dlBtn.addEventListener("click", () => {
        const name = "voice_" + (i + 1) + "_" + clip.id + ".mp4";
        send({ action: "download", url: clip.url, name });
        dlBtn.textContent = "✓";
        dlBtn.classList.add("done");
        setTimeout(() => {
          dlBtn.textContent = "⬇";
          dlBtn.classList.remove("done");
        }, 2000);
      });

      row.appendChild(num);
      row.appendChild(playBtn);
      row.appendChild(wave);
      row.appendChild(dlBtn);
      listEl.appendChild(row);
    });
  }

  /* ── Download All ── */

  dlAllBtn.addEventListener("click", () => {
    dlAllBtn.disabled = true;
    dlAllBtn.textContent = "Downloading…";
    audios.forEach((clip, i) => {
      const name = "voice_" + (i + 1) + "_" + clip.id + ".mp4";
      send({ action: "download", url: clip.url, name });
    });
    setTimeout(() => {
      dlAllBtn.textContent = "✓ All Downloaded";
      setTimeout(() => {
        dlAllBtn.disabled = false;
        dlAllBtn.textContent = "⬇ Download All";
      }, 2500);
    }, 800);
  });

  /* ── Fetch and display ── */

  async function load() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      statusEl.textContent = "No active tab found.";
      return;
    }

    activeTabId = tab.id;

    if (!tab.url || !tab.url.includes("instagram.com/direct")) {
      statusEl.textContent = "Open an Instagram DM chat first.";
      listEl.innerHTML =
        '<div class="empty">' +
        '<div class="icon">💬</div>' +
        "Navigate to Instagram Direct Messages<br>to capture voice messages." +
        "</div>";
      return;
    }

    const { audios: list } = await send({ action: "getAudios", tabId: activeTabId });
    const newAudios = list || [];

    // Only re-render if the count changed (avoids killing active player)
    if (newAudios.length !== lastCount) {
      audios = newAudios;
      lastCount = newAudios.length;
      render();
    }
  }

  // Initial load + auto-refresh
  load();
  setInterval(load, 2000);
})();
