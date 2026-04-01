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
  const refreshBtn = document.getElementById("refreshBtn");

  let currentAudio = null;  // HTMLAudioElement currently playing
  let currentBtn   = null;  // the play button that is active
  let currentProg  = null;  // { wrap, bar, durEl } for active row
  let audios       = [];
  let activeTabId  = null;
  let isPlaying    = false; // true while audio is playing
  let lastCount    = -1;    // to detect new clips without full re-render

  // Cache: clipId → dataUrl (so we only fetch the blob once)
  const blobCache = {};

  /* ── SVG icon factory (DOM API – no innerHTML) ── */

  const SVG_NS = "http://www.w3.org/2000/svg";

  const SVG_DEFS = {
    play:     { size: 14, paths: ["M8 5v14l11-7z"] },
    pause:    { size: 14, paths: ["M6 19h4V5H6v14zm8-14v14h4V5h-4z"] },
    loading:  { size: 14, paths: ["M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6 6 6 0 0 1-.34 2h2.07A8 8 0 0 0 12 4zm-6 8a6 6 0 0 0 .34 2H4.27A8 8 0 0 0 12 20v3l4-4-4-4v3a6 6 0 0 1-6-6z"] },
    download: { size: 14, paths: ["M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"] },
    check:    { size: 14, paths: ["M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"] },
    mute: {
      size: 40, opacity: "0.4",
      paths: [
        "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z",
        "M19 11h-1.7A5.3 5.3 0 0 1 12 16.3 5.3 5.3 0 0 1 6.7 11H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11z",
      ],
      line: { x1: "4", y1: "2", x2: "20", y2: "22" },
    },
    refresh: {
      size: 40, opacity: "0.4",
      paths: ["M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"],
    },
    chat: {
      size: 40, opacity: "0.4",
      paths: ["M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"],
    },
  };

  function makeSVG(name) {
    const def = SVG_DEFS[name];
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width",   String(def.size));
    svg.setAttribute("height",  String(def.size));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill",    "currentColor");
    if (def.opacity) svg.setAttribute("opacity", def.opacity);
    def.paths.forEach((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    if (def.line) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", def.line.x1);
      line.setAttribute("y1", def.line.y1);
      line.setAttribute("x2", def.line.x2);
      line.setAttribute("y2", def.line.y2);
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
    }
    return svg;
  }

  // Set an element's content to an SVG icon plus optional label text
  function setIcon(el, name, text) {
    const nodes = [makeSVG(name)];
    if (text) nodes.push(document.createTextNode("\u00a0" + text));
    el.replaceChildren(...nodes);
  }

  // Build an empty-state block using DOM APIs
  function makeEmpty(iconName, ...lines) {
    const wrap = document.createElement("div");
    wrap.className = "empty";
    const iconDiv = document.createElement("div");
    iconDiv.className = "icon";
    iconDiv.appendChild(makeSVG(iconName));
    wrap.appendChild(iconDiv);
    lines.forEach((txt, i) => {
      if (i > 0) wrap.appendChild(document.createElement("br"));
      wrap.appendChild(document.createTextNode(txt));
    });
    return wrap;
  }

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
      setIcon(currentBtn, "play");
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

    listEl.replaceChildren();
    countEl.textContent = audios.length;

    if (audios.length === 0) {
      listEl.appendChild(makeEmpty(
        "mute",
        "No voice messages captured yet.",
        "Open an Instagram DM chat with",
        "voice messages and wait a moment."
      ));
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
      setIcon(playBtn, "play");
      playBtn.title = "Play";

      playBtn.addEventListener("click", async () => {
        // Toggle off if already playing this clip
        if (currentBtn === playBtn) {
          stopCurrent();
          currentTimeEl.style.display = "none";
          return;
        }

        stopCurrent();

        setIcon(playBtn, "loading");
        playBtn.disabled = true;

        // Fetch blob through background to avoid CORS
        const dataUrl = await getBlob(clip);
        if (!dataUrl) {
          setIcon(playBtn, "play");
          playBtn.disabled = false;
          titleRow.textContent = "Could not load audio";
          setTimeout(() => (titleRow.textContent = "Voice Message " + (i + 1)), 2000);
          return;
        }

        const audio = new Audio(dataUrl);
        currentAudio = audio;
        currentBtn = playBtn;
        currentProg = { wrap: progressWrap, bar: progressBar, durEl: currentTimeEl };
        isPlaying = true;

        setIcon(playBtn, "pause");
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
          titleRow.textContent = "Playback error";
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
      setIcon(dlBtn, "download");
      dlBtn.title = "Download";

      dlBtn.addEventListener("click", () => {
        const name = "voice_" + (i + 1) + "_" + clip.id + ".mp4";
        send({ action: "download", url: clip.url, name });
        setIcon(dlBtn, "check");
        dlBtn.classList.add("done");
        setTimeout(() => {
          setIcon(dlBtn, "download");
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
    setIcon(dlAllBtn, "loading", "Downloading…");
    audios.forEach((clip, i) => {
      const name = "voice_" + (i + 1) + "_" + clip.id + ".mp4";
      send({ action: "download", url: clip.url, name });
    });
    setTimeout(() => {
      setIcon(dlAllBtn, "check", "All Downloaded");
      setTimeout(() => {
        dlAllBtn.disabled = false;
        setIcon(dlAllBtn, "download", "Download All");
      }, 2500);
    }, 800);
  });

  /* ── Refresh: reload DM tab and recapture audio ── */

  refreshBtn.addEventListener("click", async () => {
    if (refreshBtn.disabled) return;
    refreshBtn.disabled = true;
    refreshBtn.classList.add("spinning");

    // Stop any playing audio
    stopCurrent();

    // Clear blob cache
    Object.keys(blobCache).forEach((k) => delete blobCache[k]);

    // Reset state
    audios = [];
    lastCount = -1;

    // Tell background to clear captured audio for this tab
    if (activeTabId) {
      await send({ action: "resetChat", tabId: activeTabId });
    }

    // Show loading state
    statusEl.textContent = "Refreshing — reloading DM page…";
    listEl.replaceChildren(makeEmpty(
      "refresh",
      "Reloading Instagram DM…",
      "Voice messages will appear shortly."
    ));
    footerEl.style.display = "none";
    countEl.textContent = "0";

    // Reload the Instagram tab
    if (activeTabId) {
      chrome.tabs.reload(activeTabId);
    }

    // Wait for the page to reload and audio to be recaptured
    await new Promise((r) => setTimeout(r, 5000));

    // Fetch new audio
    await load();

    refreshBtn.disabled = false;
    refreshBtn.classList.remove("spinning");
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
      listEl.replaceChildren(makeEmpty(
        "chat",
        "Navigate to Instagram Direct Messages",
        "to capture voice messages."
      ));
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
