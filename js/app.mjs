import { ColorAsciiEngine } from './ascii-engine.mjs';
import {
  AnimatedImagePlayer,
  inferImageMimeType,
  isAnimatableMimeType,
} from './animated-image.mjs';
import { ProceduralDemoFeed } from './demo-feed.mjs';
import { AsciiVideoRecorder, triggerDownload } from './exporter.mjs';
import { TRANSLATIONS, detectInitialLanguage } from './i18n.mjs';

const canvas = document.getElementById('ascii-canvas');
const video = document.getElementById('source-video');
const fileInput = document.getElementById('file-input');

const engine = new ColorAsciiEngine(canvas);
const demoFeed = new ProceduralDemoFeed(640, 360);
const recorder = new AsciiVideoRecorder(canvas, video);

const SPEED_STEPS = [0.5, 1, 1.5, 2];

const state = {
  lang: detectInitialLanguage(),
  sourceType: 'demo', // 'demo' | 'video' | 'gif' | 'image' | 'webcam'
  demoMode: 'plasma',
  sourceName: 'Neon Plasma',
  imageEl: null,
  animPlayer: null,
  loadToken: 0,
  webcamStream: null,
  videoObjectUrl: null,
  playing: true,
  playbackRate: 1,
  muted: false,
  exportIncludeAudio: false,
  fullRenderActive: false,
  restoreSplitAfterRec: false,
  modalMode: null, // null | 'export' | 'load'
  loadAbortController: null,
  settings: {
    charset: 'classic',
    colorMode: 'truecolor',
    cols: 120,
    contrast: 1.15,
    brightness: 0,
    saturation: 1.25,
    invert: false,
    scanlines: false,
    glow: true,
    splitEnabled: false,
    splitRatio: 0.5,
  },
};

// DOM refs
const elStatFps = document.getElementById('stat-fps');
const elStatGrid = document.getElementById('stat-grid');
const elStatMode = document.getElementById('stat-mode');
const elFileLabel = document.getElementById('file-label');
const elBtnPlay = document.getElementById('btn-play');
const elTimeline = document.getElementById('timeline-slider');
const elTimeCur = document.getElementById('time-current');
const elTimeTot = document.getElementById('time-total');
const elBtnSpeed = document.getElementById('btn-speed');
const elBtnMute = document.getElementById('btn-mute');
const elBtnSplit = document.getElementById('btn-split');
const elSplitHandle = document.getElementById('split-handle');
const elSplitLeft = document.getElementById('split-tag-left');
const elSplitRight = document.getElementById('split-tag-right');
const elStageFrame = document.getElementById('stage-frame');
const elBtnRecord = document.getElementById('btn-record');
const elLblRecord = document.getElementById('lbl-record');
const elBtnFullExport = document.getElementById('btn-full-export');
const elLblFullExport = document.getElementById('lbl-full-export');
const elChkExportAudio = document.getElementById('chk-export-audio');
const elRecBadge = document.getElementById('rec-badge');
const elRecLabel = document.getElementById('rec-label');
const elDropOverlay = document.getElementById('drop-overlay');
const elExportOverlay = document.getElementById('export-overlay');
const elExportModalTitle = document.getElementById('export-modal-title');
const elExportModalSub = document.getElementById('export-modal-sub');
const elExportModalFile = document.getElementById('export-modal-file');
const elExportModalPct = document.getElementById('export-modal-pct');
const elExportProgressFill = document.getElementById('export-progress-fill');
const elExportModalTime = document.getElementById('export-modal-time');
const elBtnExportCancel = document.getElementById('btn-export-cancel');
const elToastStack = document.getElementById('toast-stack');

function tr() {
  return TRANSLATIONS[state.lang] || TRANSLATIONS.ko;
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  elToastStack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatGifTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0.0s';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return formatTime(sec);
}

function disposeAnimatedPlayer() {
  if (state.animPlayer) {
    state.animPlayer.dispose();
    state.animPlayer = null;
  }
}

function updateSourceBadge() {
  const t = tr();
  const map = {
    demo: t.modeDemo,
    video: t.modeVideo,
    gif: t.modeGif,
    image: t.modeImage,
    webcam: t.modeWebcam,
  };
  elStatMode.textContent = map[state.sourceType] || state.sourceType;
}

function applyLanguage(lang, announce = false) {
  state.lang = lang === 'en' ? 'en' : 'ko';
  try {
    localStorage.setItem('chromascii_lang', state.lang);
  } catch {
    // ignore
  }
  const t = tr();
  document.documentElement.lang = state.lang;
  document.title = t.pageTitle;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n;
    if (typeof t[k] === 'string') el.textContent = t[k];
  });

  document.getElementById('lang-ko').classList.toggle('active', state.lang === 'ko');
  document.getElementById('lang-en').classList.toggle('active', state.lang === 'en');

  const webBtnSpan = document.querySelector('#btn-webcam span:last-child');
  if (webBtnSpan) webBtnSpan.textContent = state.sourceType === 'webcam' ? t.btnWebcamStop : t.btnWebcam;
  elLblRecord.textContent = recorder.isRecording && !state.fullRenderActive ? t.btnRecordStop : t.btnRecord;
  elLblFullExport.textContent = state.fullRenderActive ? t.btnFullCancel : t.btnFullExport;
  updateSourceBadge();

  if (announce) showToast(t.toastLang);
}

// --- Media Source Management ---
function stopWebcam() {
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach((track) => track.stop());
    state.webcamStream = null;
  }
  document.getElementById('btn-webcam')?.classList.remove('active');
  const webBtnSpan = document.querySelector('#btn-webcam span:last-child');
  if (webBtnSpan) webBtnSpan.textContent = tr().btnWebcam;
}

function switchToDemo(mode = state.demoMode, announce = false) {
  cancelActiveLoad({ notify: false });
  state.loadToken += 1;
  stopWebcam();
  cancelFullRenderIfNeeded();
  disposeAnimatedPlayer();
  video.pause();
  state.sourceType = 'demo';
  state.demoMode = mode;
  demoFeed.setMode(mode);
  state.playing = true;
  elBtnPlay.textContent = '❚❚';
  elTimeline.disabled = true;
  elTimeline.value = 0;
  elTimeCur.textContent = '00:00';
  elTimeTot.textContent = 'LIVE';

  const names = { plasma: 'Neon Plasma', torus: '3D Torus Knot', tunnel: 'Cyber Tunnel' };
  state.sourceName = names[mode] || 'Demo';
  elFileLabel.textContent = state.sourceName;

  document.querySelectorAll('#demo-grid .opt-pill').forEach((p) => {
    p.classList.toggle('active', p.dataset.demo === mode);
  });
  updateSourceBadge();
  if (announce) showToast(tr().toastDemoOn);
}

function cancelActiveLoad({ notify = false } = {}) {
  const controller = state.loadAbortController;
  if (!controller) return;
  state.loadToken += 1;
  state.loadAbortController = null;
  controller.abort();
  hideLoadingModal('load');
  if (notify) showToast(tr().toastLoadCanceled);
}

function probeVideoBlobUrl(blobUrl, signal) {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video');
    probe.preload = 'auto';
    probe.muted = true;
    probe.playsInline = true;

    const cleanup = () => {
      probe.onloadeddata = null;
      probe.onloadedmetadata = null;
      probe.onerror = null;
      signal?.removeEventListener('abort', onAbort);
      probe.pause();
      probe.removeAttribute('src');
      probe.load();
    };

    const onReady = () => {
      const duration = probe.duration;
      cleanup();
      resolve({ duration });
    };

    const onError = () => {
      cleanup();
      reject(new Error('Unsupported video'));
    };

    const onAbort = () => {
      cleanup();
      const err = new Error('Video load aborted');
      err.name = 'AbortError';
      reject(err);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });
    probe.onloadeddata = onReady;
    probe.onloadedmetadata = onReady;
    probe.onerror = onError;
    probe.src = blobUrl;
  });
}

function loadStaticImageBlob(file, signal) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      signal?.removeEventListener('abort', onAbort);
      URL.revokeObjectURL(url);
    };

    const onAbort = () => {
      img.src = '';
      cleanup();
      const err = new Error('Image load aborted');
      err.name = 'AbortError';
      reject(err);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('Unsupported image'));
    };
    img.src = url;
  });
}

async function handleFile(file) {
  if (!file) return;
  cancelActiveLoad({ notify: false });
  cancelFullRenderIfNeeded({ discard: true, notify: false });

  const token = ++state.loadToken;
  const t = tr();

  if (file.type.startsWith('video/')) {
    const controller = new AbortController();
    state.loadAbortController = controller;
    showLoadingModal({
      mode: 'load',
      title: t.loadModalTitle,
      sub: t.loadModalSubVideo,
      filename: file.name,
      statusText: t.loadModalPreparing,
      indeterminate: true,
      cancelLabel: t.btnCancelLoad,
    });

    const blobUrl = URL.createObjectURL(file);
    try {
      const { duration } = await probeVideoBlobUrl(blobUrl, controller.signal);
      if (token !== state.loadToken || controller.signal.aborted) {
        URL.revokeObjectURL(blobUrl);
        return;
      }

      if (state.loadAbortController === controller) state.loadAbortController = null;
      hideLoadingModal('load');

      stopWebcam();
      disposeAnimatedPlayer();
      if (state.videoObjectUrl) URL.revokeObjectURL(state.videoObjectUrl);
      state.videoObjectUrl = blobUrl;
      video.srcObject = null;
      video.src = blobUrl;
      video.loop = true;
      video.muted = state.muted;
      video.playbackRate = state.playbackRate;

      state.sourceType = 'video';
      state.sourceName = file.name;
      elFileLabel.textContent = file.name;
      elTimeline.disabled = false;
      elTimeline.value = 0;
      elTimeCur.textContent = formatTime(0);
      elTimeTot.textContent = formatTime(duration);
      state.playing = true;
      elBtnPlay.textContent = '❚❚';
      video.play().catch(() => {});
      updateSourceBadge();
      showToast(tr().toastLoadedVideo(file.name));
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      if (state.loadAbortController === controller) state.loadAbortController = null;
      hideLoadingModal('load');
      if (err?.name !== 'AbortError' && token === state.loadToken) {
        showToast(tr().toastUnsupported);
      }
    }
    return;
  }

  const inferredMime = inferImageMimeType(file);
  if (file.type.startsWith('image/') || inferredMime) {
    const controller = new AbortController();
    state.loadAbortController = controller;
    const animCandidate = isAnimatableMimeType(inferredMime);

    showLoadingModal({
      mode: 'load',
      title: t.loadModalTitle,
      sub: animCandidate ? t.loadModalSubGif : t.loadModalSubImage,
      filename: file.name,
      statusText: t.loadModalPreparing,
      indeterminate: true,
      cancelLabel: t.btnCancelLoad,
    });

    let animUnsupportedGif = false;

    if (animCandidate) {
      try {
        const result = await AnimatedImagePlayer.fromFile(file, {
          signal: controller.signal,
          onProgress: ({ loaded, total }) => {
            if (token !== state.loadToken || controller.signal.aborted) return;
            const pct = total > 0 ? (loaded / total) * 100 : 0;
            updateLoadingModalProgress(pct, tr().loadModalFrames(loaded, total));
          },
        });
        if (token !== state.loadToken || controller.signal.aborted) {
          result.player?.dispose();
          return;
        }
        if (result.player) {
          if (state.loadAbortController === controller) state.loadAbortController = null;
          hideLoadingModal('load');
          stopWebcam();
          disposeAnimatedPlayer();
          video.pause();
          state.imageEl = null;
          state.animPlayer = result.player;
          state.sourceType = 'gif';
          state.sourceName = file.name;
          elFileLabel.textContent = file.name;
          elTimeline.disabled = false;
          elTimeline.value = 0;
          elTimeCur.textContent = formatGifTime(0);
          elTimeTot.textContent = formatGifTime(result.player.duration);
          state.playing = true;
          elBtnPlay.textContent = '❚❚';
          updateSourceBadge();
          showToast(tr().toastLoadedGif(file.name, result.player.frameCount));
          return;
        }
        if (!result.supported && inferredMime === 'image/gif') {
          animUnsupportedGif = true;
        }
      } catch (err) {
        if (err?.name === 'AbortError' || token !== state.loadToken || controller.signal.aborted) {
          if (state.loadAbortController === controller) state.loadAbortController = null;
          hideLoadingModal('load');
          return;
        }
        // Fall through to static image loader if animated decode fails
      }
    }

    try {
      const img = await loadStaticImageBlob(file, controller.signal);
      if (token !== state.loadToken || controller.signal.aborted) return;
      if (state.loadAbortController === controller) state.loadAbortController = null;
      hideLoadingModal('load');
      stopWebcam();
      disposeAnimatedPlayer();
      video.pause();
      state.sourceType = 'image';
      state.imageEl = img;
      state.sourceName = file.name;
      elFileLabel.textContent = file.name;
      elTimeline.disabled = true;
      elTimeCur.textContent = 'IMG';
      elTimeTot.textContent = 'STATIC';
      updateSourceBadge();
      showToast(
        animUnsupportedGif ? tr().toastGifStaticFallback(file.name) : tr().toastLoadedImage(file.name)
      );
    } catch (err) {
      if (state.loadAbortController === controller) state.loadAbortController = null;
      hideLoadingModal('load');
      if (err?.name !== 'AbortError' && token === state.loadToken) {
        showToast(tr().toastUnsupported);
      }
    }
    return;
  }

  showToast(tr().toastUnsupported);
}

async function toggleWebcam() {
  if (state.sourceType === 'webcam') {
    switchToDemo(state.demoMode, true);
    return;
  }
  state.loadToken += 1;
  cancelFullRenderIfNeeded();
  disposeAnimatedPlayer();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    state.webcamStream = stream;
    video.src = '';
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    state.sourceType = 'webcam';
    state.sourceName = 'Webcam Live';
    elFileLabel.textContent = 'Webcam Live';
    elTimeline.disabled = true;
    elTimeCur.textContent = 'LIVE';
    elTimeTot.textContent = 'CAM';
    state.playing = true;
    elBtnPlay.textContent = '❚❚';
    document.getElementById('btn-webcam')?.classList.add('active');
    const webBtnSpan = document.querySelector('#btn-webcam span:last-child');
    if (webBtnSpan) webBtnSpan.textContent = tr().btnWebcamStop;
    updateSourceBadge();
    showToast(tr().toastWebcamOn);
  } catch {
    showToast(tr().toastWebcamFail);
  }
}

// --- Split-Screen Comparison ---
function updateSplitUI() {
  const on = state.settings.splitEnabled;
  elBtnSplit.classList.toggle('active', on);
  elSplitHandle.classList.toggle('hidden', !on);
  elSplitLeft.classList.toggle('hidden', !on);
  elSplitRight.classList.toggle('hidden', !on);
  elSplitHandle.style.left = `${(state.settings.splitRatio * 100).toFixed(2)}%`;
}

let draggingSplit = false;
elSplitHandle.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  draggingSplit = true;
  elSplitHandle.setPointerCapture(e.pointerId);
});

window.addEventListener('pointermove', (e) => {
  if (!draggingSplit) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
  state.settings.splitRatio = ratio;
  elSplitHandle.style.left = `${(ratio * 100).toFixed(2)}%`;
});

window.addEventListener('pointerup', () => {
  draggingSplit = false;
});

// --- Recording & Full Video Export ---
function suspendSplitForRecording() {
  if (state.settings.splitEnabled) {
    state.restoreSplitAfterRec = true;
    state.settings.splitEnabled = false;
    updateSplitUI();
  }
}

function restoreSplitAfterRecording() {
  if (state.restoreSplitAfterRec) {
    state.restoreSplitAfterRec = false;
    state.settings.splitEnabled = true;
    updateSplitUI();
  }
}

function getActiveSourceSnapshot() {
  if (state.sourceType === 'demo') return demoFeed.render(0);
  if (state.sourceType === 'video' || state.sourceType === 'webcam') {
    return video.readyState >= 2 ? video : null;
  }
  if (state.sourceType === 'gif' && state.animPlayer) {
    return state.animPlayer.getCurrentFrame();
  }
  if (state.sourceType === 'image') return state.imageEl;
  return null;
}

function renderPureAsciiNow() {
  const src = getActiveSourceSnapshot();
  if (src) {
    engine.renderFrame(src, { ...state.settings, splitEnabled: false });
  }
}

function showLoadingModal({
  mode,
  title,
  sub,
  filename = '',
  statusText = '',
  pct = 0,
  indeterminate = false,
  cancelLabel,
}) {
  state.modalMode = mode;
  elExportModalTitle.textContent = title;
  elExportModalSub.textContent = sub;
  elExportModalFile.textContent = filename;
  elBtnExportCancel.textContent = cancelLabel;
  if (indeterminate) {
    elExportProgressFill.classList.add('indeterminate');
    elExportProgressFill.style.width = '';
    elExportModalPct.textContent = '...';
    elExportModalTime.textContent = statusText;
  } else {
    updateLoadingModalProgress(pct, statusText);
  }
  elExportOverlay.classList.remove('hidden');
}

function updateLoadingModalProgress(pct, statusText) {
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  elExportProgressFill.classList.remove('indeterminate');
  elExportModalPct.textContent = `${clamped}%`;
  elExportProgressFill.style.width = `${clamped}%`;
  elExportModalTime.textContent = statusText;
}

function hideLoadingModal(expectedMode = null) {
  if (expectedMode && state.modalMode !== expectedMode) return;
  state.modalMode = null;
  elExportProgressFill.classList.remove('indeterminate');
  elExportOverlay.classList.add('hidden');
}

function setExportModalVisible(visible, { filename = '', currentText = '00:00', totalText = '00:00', pct = 0 } = {}) {
  if (!visible) {
    hideLoadingModal('export');
    return;
  }
  const t = tr();
  showLoadingModal({
    mode: 'export',
    title: t.exportModalTitle,
    sub: t.exportModalSub,
    filename,
    statusText: `${currentText} / ${totalText}`,
    pct,
    indeterminate: false,
    cancelLabel: t.btnCancelExport,
  });
}

function updateExportModalProgress(pct, currentText, totalText) {
  if (state.modalMode !== 'export') return;
  updateLoadingModalProgress(pct, `${currentText} / ${totalText}`);
}

function setRecordingVisuals(active, isFull = false) {
  elRecBadge.classList.toggle('hidden', !active || isFull);
  elBtnRecord.classList.toggle('recording', active && !isFull);
  elLblRecord.textContent = active && !isFull ? tr().btnRecordStop : tr().btnRecord;
  elLblFullExport.textContent = isFull && active ? tr().btnFullCancel : tr().btnFullExport;
}

function toggleClipRecording() {
  if (!recorder.isSupported()) {
    showToast(tr().toastRecUnsupported);
    return;
  }
  if (state.fullRenderActive) {
    cancelFullRenderIfNeeded({ discard: true, notify: true });
    return;
  }
  if (recorder.isRecording) {
    recorder.stop();
    setRecordingVisuals(false, false);
    return;
  }

  suspendSplitForRecording();
  renderPureAsciiNow();

  const started = recorder.start({
    includeVideoAudio: state.exportIncludeAudio && state.sourceType === 'video' && !state.muted,
    fps: 30,
    filenamePrefix: 'chromascii-clip',
    onStop: (_blob, { discarded } = {}) => {
      setRecordingVisuals(false, false);
      restoreSplitAfterRecording();
      if (!discarded) showToast(tr().toastRecSaved);
    },
  });
  if (started) {
    setRecordingVisuals(true, false);
    showToast(tr().toastRecStart);
  } else {
    restoreSplitAfterRecording();
  }
}

function cancelFullRenderIfNeeded({ discard = true, notify = false } = {}) {
  if (!state.fullRenderActive) return;
  state.fullRenderActive = false;
  video.loop = true;
  video.onended = null;
  if (state.animPlayer) {
    state.animPlayer.loop = true;
    state.animPlayer.ended = false;
    state.animPlayer.onEnded = null;
  }
  setExportModalVisible(false);
  if (recorder.isRecording) recorder.stop({ discard });
  setRecordingVisuals(false, false);
  restoreSplitAfterRecording();
  if (notify) showToast(tr().toastFullCanceled);
}

function toggleFullVideoExport() {
  if (state.fullRenderActive) {
    cancelFullRenderIfNeeded({ discard: true, notify: true });
    return;
  }
  const isVideoSource =
    state.sourceType === 'video' && Number.isFinite(video.duration) && video.duration > 0;
  const isGifSource =
    state.sourceType === 'gif' &&
    Boolean(state.animPlayer) &&
    Number.isFinite(state.animPlayer.duration) &&
    state.animPlayer.duration > 0;

  if (!isVideoSource && !isGifSource) {
    showToast(tr().toastFullNeedVideo);
    return;
  }
  if (!recorder.isSupported()) {
    showToast(tr().toastRecUnsupported);
    return;
  }
  if (recorder.isRecording) recorder.stop({ discard: true });

  state.fullRenderActive = true;
  state.playbackRate = 1;
  elBtnSpeed.textContent = '1×';
  suspendSplitForRecording();

  const baseName = state.sourceName.replace(/\.[^/.]+$/, '').slice(0, 32) || 'video';

  if (isGifSource) {
    const player = state.animPlayer;
    player.loop = false;
    player.seek(0);
    renderPureAsciiNow();

    const started = recorder.start({
      includeVideoAudio: false,
      fps: 30,
      filenamePrefix: `ascii-${baseName}`,
      onStop: (_blob, { discarded } = {}) => {
        state.fullRenderActive = false;
        if (state.animPlayer === player) {
          player.loop = true;
          player.ended = false;
          player.seek(0);
        }
        setExportModalVisible(false);
        setRecordingVisuals(false, false);
        restoreSplitAfterRecording();
        if (!discarded) showToast(tr().toastRecSaved);
      },
    });

    if (!started) {
      state.fullRenderActive = false;
      player.loop = true;
      restoreSplitAfterRecording();
      return;
    }

    setRecordingVisuals(true, true);
    setExportModalVisible(true, {
      filename: state.sourceName,
      currentText: formatGifTime(0),
      totalText: formatGifTime(player.duration),
      pct: 0,
    });
    state.playing = true;
    elBtnPlay.textContent = '❚❚';
    return;
  }

  video.loop = false;
  video.currentTime = 0;
  video.playbackRate = 1;
  renderPureAsciiNow();

  const started = recorder.start({
    includeVideoAudio: state.exportIncludeAudio && !state.muted,
    fps: 30,
    filenamePrefix: `ascii-${baseName}`,
    onStop: (_blob, { discarded } = {}) => {
      state.fullRenderActive = false;
      video.loop = true;
      video.onended = null;
      setExportModalVisible(false);
      setRecordingVisuals(false, false);
      restoreSplitAfterRecording();
      if (!discarded) showToast(tr().toastRecSaved);
    },
  });

  if (!started) {
    state.fullRenderActive = false;
    video.loop = true;
    restoreSplitAfterRecording();
    return;
  }

  setRecordingVisuals(true, true);
  setExportModalVisible(true, {
    filename: state.sourceName,
    currentText: formatTime(0),
    totalText: formatTime(video.duration),
    pct: 0,
  });

  video.onended = () => {
    if (state.fullRenderActive && recorder.isRecording) {
      updateExportModalProgress(100, formatTime(video.duration), formatTime(video.duration));
      recorder.stop();
    }
  };

  state.playing = true;
  elBtnPlay.textContent = '❚❚';
  video.play().catch(() => {});
}

// --- UI Event Listeners ---
document.getElementById('btn-upload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  handleFile(e.target.files?.[0]);
  e.target.value = '';
});

document.getElementById('btn-webcam')?.addEventListener('click', toggleWebcam);
document.getElementById('btn-back-demo').addEventListener('click', () => switchToDemo(state.demoMode, true));
elBtnExportCancel.addEventListener('click', () => {
  if (state.modalMode === 'load') {
    cancelActiveLoad({ notify: true });
  } else {
    cancelFullRenderIfNeeded({ discard: true, notify: true });
  }
});

if (elChkExportAudio) {
  elChkExportAudio.checked = state.exportIncludeAudio;
  elChkExportAudio.addEventListener('change', (e) => {
    state.exportIncludeAudio = e.target.checked;
  });
}

elBtnSplit.addEventListener('click', () => {
  if (recorder.isRecording) return;
  state.settings.splitEnabled = !state.settings.splitEnabled;
  updateSplitUI();
});

document.getElementById('btn-lang').addEventListener('click', () => {
  applyLanguage(state.lang === 'ko' ? 'en' : 'ko', true);
});

document.querySelectorAll('#demo-grid .opt-pill').forEach((btn) => {
  btn.addEventListener('click', () => switchToDemo(btn.dataset.demo, false));
});

document.querySelectorAll('#charset-grid .opt-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.settings.charset = btn.dataset.charset;
    document.querySelectorAll('#charset-grid .opt-pill').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

document.querySelectorAll('#colormode-grid .opt-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.settings.colorMode = btn.dataset.color;
    document.querySelectorAll('#colormode-grid .opt-pill').forEach((b) => b.classList.toggle('active', b === btn));
  });
});

function bindSlider(id, outId, key, formatFn = (v) => String(v)) {
  const input = document.getElementById(id);
  const out = document.getElementById(outId);
  input.addEventListener('input', () => {
    const val = Number(input.value);
    state.settings[key] = val;
    out.textContent = formatFn(val);
  });
}

bindSlider('rng-cols', 'val-cols', 'cols', (v) => String(v));
bindSlider('rng-contrast', 'val-contrast', 'contrast', (v) => v.toFixed(2));
bindSlider('rng-brightness', 'val-brightness', 'brightness', (v) => String(v));
bindSlider('rng-saturation', 'val-saturation', 'saturation', (v) => v.toFixed(2));

document.getElementById('chk-invert').addEventListener('change', (e) => {
  state.settings.invert = e.target.checked;
});
document.getElementById('chk-scanlines').addEventListener('change', (e) => {
  state.settings.scanlines = e.target.checked;
});
document.getElementById('chk-glow').addEventListener('change', (e) => {
  state.settings.glow = e.target.checked;
});

document.getElementById('btn-reset-tune').addEventListener('click', () => {
  Object.assign(state.settings, {
    cols: 120,
    contrast: 1.15,
    brightness: 0,
    saturation: 1.25,
    invert: false,
    scanlines: false,
    glow: true,
  });
  document.getElementById('rng-cols').value = 120;
  document.getElementById('val-cols').textContent = '120';
  document.getElementById('rng-contrast').value = 1.15;
  document.getElementById('val-contrast').textContent = '1.15';
  document.getElementById('rng-brightness').value = 0;
  document.getElementById('val-brightness').textContent = '0';
  document.getElementById('rng-saturation').value = 1.25;
  document.getElementById('val-saturation').textContent = '1.25';
  document.getElementById('chk-invert').checked = false;
  document.getElementById('chk-scanlines').checked = false;
  document.getElementById('chk-glow').checked = true;
});

// Playback controls
elBtnPlay.addEventListener('click', () => {
  state.playing = !state.playing;
  elBtnPlay.textContent = state.playing ? '❚❚' : '▶';
  if (state.sourceType === 'video') {
    if (state.playing) video.play().catch(() => {});
    else video.pause();
  }
});

elTimeline.addEventListener('input', () => {
  const ratio = Number(elTimeline.value) / 1000;
  if (state.sourceType === 'video' && Number.isFinite(video.duration)) {
    video.currentTime = ratio * video.duration;
  } else if (state.sourceType === 'gif' && state.animPlayer) {
    state.animPlayer.seek(ratio * state.animPlayer.duration);
    elTimeCur.textContent = formatGifTime(state.animPlayer.currentTime);
  }
});

elBtnSpeed.addEventListener('click', () => {
  const idx = SPEED_STEPS.indexOf(state.playbackRate);
  state.playbackRate = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
  elBtnSpeed.textContent = `${state.playbackRate}×`;
  video.playbackRate = state.playbackRate;
});

elBtnMute.addEventListener('click', () => {
  state.muted = !state.muted;
  video.muted = state.muted;
  elBtnMute.textContent = state.muted ? '🔇' : '🔊';
});

// Exports
elBtnRecord.addEventListener('click', toggleClipRecording);
elBtnFullExport.addEventListener('click', toggleFullVideoExport);

document.getElementById('btn-png').addEventListener('click', () => {
  const url = canvas.toDataURL('image/png');
  triggerDownload(url, `chromascii-${Date.now()}.png`);
  showToast(tr().toastPngSaved);
});

document.getElementById('btn-copy-txt').addEventListener('click', async () => {
  const text = engine.extractPlainText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast(tr().toastTxtCopied);
  } catch {
    triggerDownload(new Blob([text], { type: 'text/plain;charset=utf-8' }), `chromascii-${Date.now()}.txt`);
    showToast(tr().toastTxtCopied);
  }
});

document.getElementById('btn-html').addEventListener('click', () => {
  const html = engine.extractColorHtml(`CHROMASCII — ${state.sourceName}`);
  if (!html) return;
  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `chromascii-${Date.now()}.html`);
  showToast(tr().toastHtmlSaved);
});

// Global Drag & Drop
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter += 1;
  elDropOverlay.classList.remove('hidden');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) elDropOverlay.classList.add('hidden');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  elDropOverlay.classList.add('hidden');
  handleFile(e.dataTransfer?.files?.[0]);
});

// Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.modalMode === 'load') {
      e.preventDefault();
      cancelActiveLoad({ notify: true });
      return;
    }
    if (state.fullRenderActive) {
      e.preventDefault();
      cancelFullRenderIfNeeded({ discard: true, notify: true });
      return;
    }
  }
  if (state.fullRenderActive || state.modalMode === 'load') return;
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    elBtnPlay.click();
  } else if (e.key === 's' || e.key === 'S') {
    elBtnSplit.click();
  } else if (e.key === 'l' || e.key === 'L') {
    applyLanguage(state.lang === 'ko' ? 'en' : 'ko', true);
  }
});

// --- Main 60FPS Render Loop ---
let lastMs = performance.now();
let fpsSmooth = 60;
let uiTimer = 0;

function tick(nowMs) {
  const dtMs = Math.min(50, Math.max(4, nowMs - lastMs));
  lastMs = nowMs;
  fpsSmooth = fpsSmooth * 0.9 + (1000 / dtMs) * 0.1;

  let activeSource = null;
  if (state.sourceType === 'demo') {
    const dtSec = state.playing ? (dtMs * 0.001) * state.playbackRate : 0;
    activeSource = demoFeed.render(dtSec);
  } else if (state.sourceType === 'video' || state.sourceType === 'webcam') {
    if (video.readyState >= 2) {
      activeSource = video;
    }
  } else if (state.sourceType === 'gif' && state.animPlayer) {
    const dtSec = state.playing ? (dtMs * 0.001) * state.playbackRate : 0;
    state.animPlayer.advance(dtSec);
    activeSource = state.animPlayer.getCurrentFrame();
  } else if (state.sourceType === 'image') {
    activeSource = state.imageEl;
  }

  if (activeSource) {
    const frameSettings = recorder.isRecording
      ? { ...state.settings, splitEnabled: false }
      : state.settings;
    engine.renderFrame(activeSource, frameSettings);
  }

  if (
    state.fullRenderActive &&
    state.sourceType === 'gif' &&
    state.animPlayer?.ended &&
    recorder.isRecording
  ) {
    updateExportModalProgress(
      100,
      formatGifTime(state.animPlayer.duration),
      formatGifTime(state.animPlayer.duration)
    );
    recorder.stop();
  }

  uiTimer += dtMs;
  if (uiTimer >= 160) {
    uiTimer = 0;
    elStatFps.textContent = String(Math.round(fpsSmooth));
    elStatGrid.textContent = `${engine.lastGrid.cols}×${engine.lastGrid.rows}`;

    let mediaCur = 0;
    let mediaDur = 0;
    let curLabel = '00:00';
    let totLabel = '00:00';
    if (state.sourceType === 'video' && Number.isFinite(video.duration) && video.duration > 0) {
      mediaCur = video.currentTime;
      mediaDur = video.duration;
      curLabel = formatTime(mediaCur);
      totLabel = formatTime(mediaDur);
      elTimeCur.textContent = curLabel;
      if (document.activeElement !== elTimeline) {
        elTimeline.value = String(Math.round((mediaCur / mediaDur) * 1000));
      }
    } else if (state.sourceType === 'gif' && state.animPlayer && state.animPlayer.duration > 0) {
      mediaCur = state.animPlayer.currentTime;
      mediaDur = state.animPlayer.duration;
      curLabel = formatGifTime(mediaCur);
      totLabel = formatGifTime(mediaDur);
      elTimeCur.textContent = curLabel;
      if (document.activeElement !== elTimeline) {
        elTimeline.value = String(Math.round((mediaCur / mediaDur) * 1000));
      }
    }

    if (recorder.isRecording) {
      if (state.fullRenderActive && mediaDur > 0) {
        const pct = Math.min(100, Math.round((mediaCur / mediaDur) * 100));
        elRecLabel.textContent = `RENDER ${pct}%`;
        updateExportModalProgress(pct, curLabel, totLabel);
      } else {
        elRecLabel.textContent = `REC ${formatTime(recorder.getElapsedSec())}`;
      }
    }
  }

  requestAnimationFrame(tick);
}

// --- Bootstrap ---
window.addEventListener('resize', () => engine.resizeToStage());
engine.resizeToStage();
applyLanguage(state.lang, false);
updateSplitUI();
switchToDemo('plasma', false);
requestAnimationFrame(tick);
