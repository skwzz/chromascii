/**
 * CHROMASCII — Zero-Dependency Animated Image (GIF / WebP / APNG) Player
 * Uses the standard WebCodecs ImageDecoder API with automatic memory budgeting.
 */

const ANIMATABLE_MIMES = new Set(['image/gif', 'image/webp', 'image/png', 'image/apng']);

const EXT_TO_MIME = {
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.apng': 'image/apng',
};

// Default pixel budget (~60M pixels ≈ 240MB RGBA max) for pre-decoded ImageBitmap cache
const DEFAULT_MAX_CACHE_PIXELS = 60_000_000;
const DEFAULT_MAX_CACHE_FRAMES = 400;

export function inferImageMimeType(file) {
  if (!file) return '';
  const rawType = (file.type || '').toLowerCase().trim();
  if (rawType.startsWith('image/')) return rawType;
  const name = (file.name || '').toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
    if (name.endsWith(ext)) return mime;
  }
  return '';
}

export function isAnimatableMimeType(mimeType) {
  return ANIMATABLE_MIMES.has((mimeType || '').toLowerCase());
}

/**
 * Normalizes ImageDecoder frame duration (microseconds) to seconds.
 * Matches standard browser GIF timing where delays <= 10ms clamp to 100ms.
 */
export function normalizeFrameDurationSec(durationMicros) {
  const ms = Number.isFinite(durationMicros) && durationMicros > 0 ? durationMicros / 1000 : 0;
  return (ms <= 10 ? 100 : ms) / 1000;
}

function getFrameDims(frame) {
  return {
    width: frame.displayWidth || frame.codedWidth || frame.width || 640,
    height: frame.displayHeight || frame.codedHeight || frame.height || 360,
  };
}

function createAbortError() {
  const err = new Error('Animated image decode aborted');
  err.name = 'AbortError';
  return err;
}

export class AnimatedImagePlayer {
  constructor({
    width,
    height,
    mimeType,
    frames,
    duration,
    decoder = null,
    frameCanvas = null,
    streaming = false,
  }) {
    this.width = width;
    this.height = height;
    this.mimeType = mimeType;
    this.frames = frames; // Array<{ bitmap: ImageBitmap|null, startSec: number, durationSec: number }>
    this.frameCount = frames.length;
    this.duration = duration;
    this.currentTime = 0;
    this.currentIndex = 0;
    this.loop = true;
    this.ended = false;
    this.onEnded = null;

    this.streaming = streaming;
    this.decoder = decoder;
    this.frameCanvas = frameCanvas;
    this.frameCtx = frameCanvas ? frameCanvas.getContext('2d') : null;
    this._decodedIndex = streaming ? 0 : -1;
    this._pendingIndex = -1;
    this._decoding = false;
    this.disposed = false;
  }

  /**
   * Attempts to decode an animated image file (GIF, animated WebP, APNG).
   * Returns:
   *  - { supported: false, player: null } if ImageDecoder cannot decode this MIME type
   *  - { supported: true, player: null } if the image is static (frameCount <= 1)
   *  - { supported: true, player: AnimatedImagePlayer } for multi-frame animations
   */
  static async fromFile(file, options = {}) {
    const ImageDecoderCtor = options.ImageDecoderCtor ?? globalThis.ImageDecoder;
    const createBitmap =
      options.createBitmap !== undefined ? options.createBitmap : globalThis.createImageBitmap;
    const maxCachePixels = options.maxCachePixels ?? DEFAULT_MAX_CACHE_PIXELS;
    const maxCacheFrames = options.maxCacheFrames ?? DEFAULT_MAX_CACHE_FRAMES;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const signal = options.signal ?? null;

    if (signal?.aborted) throw createAbortError();

    const mimeType = inferImageMimeType(file);
    if (!isAnimatableMimeType(mimeType)) {
      return { supported: true, player: null };
    }

    if (typeof ImageDecoderCtor !== 'function') {
      return { supported: false, player: null };
    }

    let typeSupported = false;
    try {
      typeSupported = await ImageDecoderCtor.isTypeSupported(mimeType);
    } catch {
      typeSupported = false;
    }
    if (signal?.aborted) throw createAbortError();
    if (!typeSupported) {
      return { supported: false, player: null };
    }

    const buffer = await file.arrayBuffer();
    if (signal?.aborted) throw createAbortError();

    const decoder = new ImageDecoderCtor({ data: buffer, type: mimeType });

    try {
      await decoder.tracks.ready;
      if (signal?.aborted) throw createAbortError();

      const track = decoder.tracks.selectedTrack;
      const frameCount = track ? track.frameCount : 0;

      if (!track || !track.animated || frameCount <= 1) {
        try {
          decoder.close();
        } catch {
          // ignore
        }
        return { supported: true, player: null };
      }

      onProgress?.({ loaded: 0, total: frameCount });

      // Decode frame 0 to inspect dimensions and choose cached vs streaming mode
      const firstResult = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
      const firstFrame = firstResult.image;
      if (signal?.aborted) {
        if (typeof firstFrame.close === 'function') firstFrame.close();
        throw createAbortError();
      }

      const { width, height } = getFrameDims(firstFrame);
      const firstDur = normalizeFrameDurationSec(firstFrame.duration);

      const estimatedPixels = width * height * frameCount;
      const useCache = estimatedPixels <= maxCachePixels && frameCount <= maxCacheFrames;

      if (useCache) {
        const frames = new Array(frameCount);
        let cursor = 0;

        try {
          const bitmap0 =
            typeof createBitmap === 'function' ? await createBitmap(firstFrame) : firstFrame;
          if (typeof createBitmap === 'function' && typeof firstFrame.close === 'function') {
            firstFrame.close();
          }
          if (signal?.aborted) {
            if (typeof bitmap0?.close === 'function') bitmap0.close();
            throw createAbortError();
          }
          frames[0] = { bitmap: bitmap0, startSec: cursor, durationSec: firstDur };
          cursor += firstDur;
          onProgress?.({ loaded: 1, total: frameCount });

          for (let i = 1; i < frameCount; i++) {
            if (signal?.aborted) throw createAbortError();
            const { image: frame } = await decoder.decode({
              frameIndex: i,
              completeFramesOnly: true,
            });
            if (signal?.aborted) {
              if (typeof frame.close === 'function') frame.close();
              throw createAbortError();
            }
            const dur = normalizeFrameDurationSec(frame.duration);
            const bitmap =
              typeof createBitmap === 'function' ? await createBitmap(frame) : frame;
            if (typeof createBitmap === 'function' && typeof frame.close === 'function') {
              frame.close();
            }
            if (signal?.aborted) {
              if (typeof bitmap?.close === 'function') bitmap.close();
              throw createAbortError();
            }
            frames[i] = { bitmap, startSec: cursor, durationSec: dur };
            cursor += dur;
            onProgress?.({ loaded: i + 1, total: frameCount });
          }
        } catch (err) {
          // Clean up any already-decoded bitmaps before rethrowing
          for (const f of frames) {
            if (f?.bitmap && typeof f.bitmap.close === 'function') {
              try {
                f.bitmap.close();
              } catch {
                // ignore
              }
            }
          }
          throw err;
        } finally {
          try {
            decoder.close();
          } catch {
            // ignore
          }
        }

        return {
          supported: true,
          player: new AnimatedImagePlayer({
            width,
            height,
            mimeType,
            frames,
            duration: cursor,
            streaming: false,
          }),
        };
      }

      // Streaming mode for oversized animations: keep a single reusable frame canvas
      const frameCanvas =
        options.createCanvas
          ? options.createCanvas(width, height)
          : Object.assign(document.createElement('canvas'), { width, height });
      const frameCtx = frameCanvas.getContext('2d');
      if (frameCtx) {
        frameCtx.clearRect(0, 0, width, height);
        frameCtx.drawImage(firstFrame, 0, 0, width, height);
      }
      if (typeof firstFrame.close === 'function') {
        firstFrame.close();
      }

      const frames = new Array(frameCount);
      for (let i = 0; i < frameCount; i++) {
        frames[i] = {
          bitmap: null,
          startSec: i * firstDur,
          durationSec: firstDur,
        };
      }

      onProgress?.({ loaded: frameCount, total: frameCount });

      return {
        supported: true,
        player: new AnimatedImagePlayer({
          width,
          height,
          mimeType,
          frames,
          duration: frameCount * firstDur,
          decoder,
          frameCanvas,
          streaming: true,
        }),
      };
    } catch (err) {
      try {
        decoder.close();
      } catch {
        // ignore
      }
      throw err;
    }
  }

  _findFrameIndex(timeSec) {
    const frames = this.frames;
    const len = frames.length;
    if (len <= 1) return 0;
    if (timeSec <= 0) return 0;
    if (timeSec >= this.duration) return len - 1;

    let lo = 0;
    let hi = len - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const f = frames[mid];
      if (timeSec < f.startSec) {
        hi = mid - 1;
      } else if (timeSec >= f.startSec + f.durationSec) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }
    return Math.min(len - 1, Math.max(0, lo));
  }

  _requestStreamingFrame(index) {
    if (!this.streaming || this.disposed || !this.decoder) return;
    if (index === this._decodedIndex && !this._decoding) return;
    this._pendingIndex = index;
    if (this._decoding) return;

    const pump = async () => {
      this._decoding = true;
      try {
        while (!this.disposed && this._pendingIndex !== -1) {
          const targetIdx = this._pendingIndex;
          this._pendingIndex = -1;
          if (targetIdx === this._decodedIndex) continue;

          const { image: frame } = await this.decoder.decode({
            frameIndex: targetIdx,
            completeFramesOnly: true,
          });
          if (this.disposed) {
            if (typeof frame.close === 'function') frame.close();
            break;
          }
          if (this.frameCtx) {
            this.frameCtx.clearRect(0, 0, this.width, this.height);
            this.frameCtx.drawImage(frame, 0, 0, this.width, this.height);
          }
          if (typeof frame.close === 'function') frame.close();
          this._decodedIndex = targetIdx;
        }
      } catch {
        // Ignore transient decode cancellations on dispose/seek
      } finally {
        this._decoding = false;
      }
    };

    pump();
  }

  advance(dtSec) {
    if (this.disposed || !Number.isFinite(dtSec) || dtSec <= 0 || this.duration <= 0) return;
    if (this.ended) return;

    this.currentTime += dtSec;

    if (this.currentTime >= this.duration) {
      if (this.loop) {
        this.currentTime %= this.duration;
      } else {
        this.currentTime = this.duration;
        this.ended = true;
        this.currentIndex = this.frameCount - 1;
        this._requestStreamingFrame(this.currentIndex);
        if (typeof this.onEnded === 'function') this.onEnded();
        return;
      }
    }

    const nextIndex = this._findFrameIndex(this.currentTime);
    if (nextIndex !== this.currentIndex) {
      this.currentIndex = nextIndex;
      this._requestStreamingFrame(nextIndex);
    }
  }

  seek(timeSec) {
    if (this.disposed || !Number.isFinite(timeSec) || this.duration <= 0) return;
    const clamped = Math.min(this.duration, Math.max(0, timeSec));
    this.currentTime = clamped;
    this.ended = !this.loop && clamped >= this.duration;
    this.currentIndex = this._findFrameIndex(clamped);
    this._requestStreamingFrame(this.currentIndex);
  }

  getCurrentFrame() {
    if (this.disposed) return null;
    if (this.streaming) return this.frameCanvas;
    return this.frames[this.currentIndex]?.bitmap || null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.onEnded = null;

    for (const f of this.frames) {
      if (f?.bitmap && typeof f.bitmap.close === 'function') {
        try {
          f.bitmap.close();
        } catch {
          // ignore
        }
      }
    }
    this.frames = [];

    if (this.decoder) {
      try {
        this.decoder.close();
      } catch {
        // ignore
      }
      this.decoder = null;
    }

    this.frameCanvas = null;
    this.frameCtx = null;
  }
}
