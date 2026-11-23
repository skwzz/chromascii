import { ColorAsciiEngine } from './ascii-engine.mjs';
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
  sourceType: 'demo', // 'demo' | 'video' | 'image' | 'webcam'
  demoMode: 'plasma',
  sourceName: 'Neon Plasma',
  imageEl: null,
  webcamStream: null,
  videoObjectUrl: null,
  playing: true,
  playbackRate: 1,
  muted: false,
  fullRenderActive: false,
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
const elRecBadge = document.getElementById('rec-badge');
const elRecLabel = document.getElementById('rec-label');
const elDropOverlay = document.getElementById('drop-overlay');
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

function updateSourceBadge() {
  const t = tr();
  const map = {
    demo: t.modeDemo,
    video: t.modeVideo,
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
  document.getElementById('btn-webcam').classList.remove('active');
  const webBtnSpan = document.querySelector('#btn-webcam span:last-child');
  if (webBtnSpan) webBtnSpan.textContent = tr().btnWebcam;
}

function switchToDemo(mode = state.demoMode, announce = false) {
  stopWebcam();
  cancelFullRenderIfNeeded();
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

function handleFile(file) {
  if (!file) return;
  stopWebcam();
  cancelFullRenderIfNeeded();

  if (file.type.startsWith('video/')) {
    if (state.videoObjectUrl) URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl = URL.createObjectURL(file);
    video.srcObject = null;
    video.src = state.videoObjectUrl;
    video.loop = true;
    video.muted = state.muted;
    video.playbackRate = state.playbackRate;

    video.onloadedmetadata = () => {
      state.sourceType = 'video';
      state.sourceName = file.name;
      elFileLabel.textContent = file.name;
      elTimeline.disabled = false;
      elTimeTot.textContent = formatTime(video.duration);
      state.playing = true;
      elBtnPlay.textContent = '❚❚';
      video.play().catch(() => {});
      updateSourceBadge();
      showToast(tr().toastLoadedVideo(file.name));
    };
    return;
  }

  if (file.type.startsWith('image/')) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      video.pause();
      state.sourceType = 'image';
      state.imageEl = img;
      state.sourceName = file.name;
      elFileLabel.textContent = file.name;
      elTimeline.disabled = true;
      elTimeCur.textContent = 'IMG';
      elTimeTot.textContent = 'STATIC';
      updateSourceBadge();
      showToast(tr().toastLoadedImage(file.name));
    };
    img.src = url;
    return;
  }

  showToast(tr().toastUnsupported);
}

async function toggleWebcam() {
  if (state.sourceType === 'webcam') {
    switchToDemo(state.demoMode, true);
    return;
  }
  cancelFullRenderIfNeeded();
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
    document.getElementById('btn-webcam').classList.add('active');
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
  const rect = elStageFrame.getBoundingClientRect();
  const ratio = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
  state.settings.splitRatio = ratio;
  elSplitHandle.style.left = `${(ratio * 100).toFixed(2)}%`;
});

window.addEventListener('pointerup', () => {
  draggingSplit = false;
});

// --- Recording & Full Video Export ---
function setRecordingVisuals(active, isFull = false) {
  elRecBadge.classList.toggle('hidden', !active);
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
    cancelFullRenderIfNeeded();
    return;
  }
  if (recorder.isRecording) {
    recorder.stop();
    setRecordingVisuals(false, false);
    return;
  }

  const started = recorder.start({
    includeVideoAudio: state.sourceType === 'video' && !state.muted,
    fps: 30,
    filenamePrefix: 'chromascii-clip',
    onStop: () => {
      setRecordingVisuals(false, false);
      showToast(tr().toastRecSaved);
    },
  });
  if (started) {
    setRecordingVisuals(true, false);
    showToast(tr().toastRecStart);
  }
}

function cancelFullRenderIfNeeded() {
  if (!state.fullRenderActive) return;
  state.fullRenderActive = false;
  video.loop = true;
  video.onended = null;
  if (recorder.isRecording) recorder.stop();
  setRecordingVisuals(false, false);
}

function toggleFullVideoExport() {
  if (state.fullRenderActive) {
    cancelFullRenderIfNeeded();
    return;
  }
  if (state.sourceType !== 'video' || !Number.isFinite(video.duration)) {
    showToast(tr().toastFullNeedVideo);
    return;
  }
  if (!recorder.isSupported()) {
    showToast(tr().toastRecUnsupported);
    return;
  }
  if (recorder.isRecording) recorder.stop();

  state.fullRenderActive = true;
  video.loop = false;
  video.currentTime = 0;
  video.playbackRate = 1;
  state.playbackRate = 1;
  elBtnSpeed.textContent = '1×';

  const baseName = state.sourceName.replace(/\.[^/.]+$/, '').slice(0, 32) || 'video';

  const started = recorder.start({
    includeVideoAudio: !state.muted,
    fps: 30,
    filenamePrefix: `ascii-${baseName}`,
    onStop: () => {
      state.fullRenderActive = false;
      video.loop = true;
      video.onended = null;
      setRecordingVisuals(false, false);
      showToast(tr().toastRecSaved);
    },
  });

  if (!started) {
    state.fullRenderActive = false;
    video.loop = true;
    return;
  }

  setRecordingVisuals(true, true);
  showToast(tr().toastFullStart);

  video.onended = () => {
    if (state.fullRenderActive && recorder.isRecording) {
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

document.getElementById('btn-webcam').addEventListener('click', toggleWebcam);
document.getElementById('btn-back-demo').addEventListener('click', () => switchToDemo(state.demoMode, true));

elBtnSplit.addEventListener('click', () => {
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
  if (state.sourceType === 'video' && Number.isFinite(video.duration)) {
    video.currentTime = (Number(elTimeline.value) / 1000) * video.duration;
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
  } else if (state.sourceType === 'image') {
    activeSource = state.imageEl;
  }

  if (activeSource) {
    engine.renderFrame(activeSource, state.settings);
  }

  uiTimer += dtMs;
  if (uiTimer >= 160) {
    uiTimer = 0;
    elStatFps.textContent = String(Math.round(fpsSmooth));
    elStatGrid.textContent = `${engine.lastGrid.cols}×${engine.lastGrid.rows}`;

    if (state.sourceType === 'video' && Number.isFinite(video.duration) && video.duration > 0) {
      elTimeCur.textContent = formatTime(video.currentTime);
      if (document.activeElement !== elTimeline) {
        elTimeline.value = String(Math.round((video.currentTime / video.duration) * 1000));
      }
    }

    if (recorder.isRecording) {
      if (state.fullRenderActive && Number.isFinite(video.duration) && video.duration > 0) {
        const pct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
        elRecLabel.textContent = `RENDER ${pct}%`;
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
