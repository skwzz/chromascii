/**
 * CHROMASCII — In-Browser Video (WebM + Audio), PNG, and Color HTML Exporter
 */

function pickSupportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function triggerDownload(blobOrUrl, filename) {
  const isUrl = typeof blobOrUrl === 'string';
  const url = isUrl ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!isUrl) {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

export class AsciiVideoRecorder {
  constructor(canvas, videoElement) {
    this.canvas = canvas;
    this.video = videoElement;
    this.recorder = null;
    this.chunks = [];
    this.isRecording = false;
    this._discardOnStop = false;
    this.startedAt = 0;
    this.audioCtx = null;
    this.mediaSource = null;
    this.audioDest = null;
  }

  isSupported() {
    return typeof MediaRecorder !== 'undefined' && typeof this.canvas.captureStream === 'function';
  }

  getVideoAudioTrack() {
    if (!this.video || this.video.muted) return null;
    try {
      // Prefer AudioContext fan-out so audio stays audible AND recorded cleanly
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.audioCtx = new AudioCtx();
        this.mediaSource = this.audioCtx.createMediaElementSource(this.video);
        this.audioDest = this.audioCtx.createMediaStreamDestination();
        this.mediaSource.connect(this.audioCtx.destination);
        this.mediaSource.connect(this.audioDest);
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioDest.stream.getAudioTracks()[0] || null;
    } catch {
      return null;
    }
  }

  start({ includeVideoAudio = false, fps = 30, filenamePrefix = 'chromascii', onStop = null } = {}) {
    if (!this.isSupported() || this.isRecording) return false;

    const canvasStream = this.canvas.captureStream(fps);
    const tracks = [...canvasStream.getVideoTracks()];

    if (includeVideoAudio) {
      const audioTrack = this.getVideoAudioTrack();
      if (audioTrack) tracks.push(audioTrack);
    }

    const combinedStream = new MediaStream(tracks);
    const mimeType = pickSupportedMimeType();
    const options = mimeType
      ? { mimeType, videoBitsPerSecond: 6_000_000 }
      : { videoBitsPerSecond: 6_000_000 };

    this.chunks = [];
    this._discardOnStop = false;
    this.recorder = new MediaRecorder(combinedStream, options);
    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.recorder.onstop = () => {
      const discarded = this._discardOnStop;
      this._discardOnStop = false;
      canvasStream.getVideoTracks().forEach((track) => track.stop());

      let blob = null;
      if (!discarded) {
        blob = new Blob(this.chunks, { type: mimeType || 'video/webm' });
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        triggerDownload(blob, `${filenamePrefix}-${ts}.webm`);
      }
      this.chunks = [];
      this.isRecording = false;
      if (typeof onStop === 'function') onStop(blob, { discarded });
    };

    this.recorder.start(250);
    this.isRecording = true;
    this.startedAt = performance.now();
    return true;
  }

  stop({ discard = false } = {}) {
    if (!this.isRecording || !this.recorder) return;
    this._discardOnStop = Boolean(discard);
    if (this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  getElapsedSec() {
    if (!this.isRecording) return 0;
    return (performance.now() - this.startedAt) / 1000;
  }
}
