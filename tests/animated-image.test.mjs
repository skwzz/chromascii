import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AnimatedImagePlayer,
  inferImageMimeType,
  isAnimatableMimeType,
  normalizeFrameDurationSec,
} from '../js/animated-image.mjs';

function makeMockFile(name, type = '') {
  return {
    name,
    type,
    async arrayBuffer() {
      return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer;
    },
  };
}

function makeMockDecoderCtor({ animated = true, durationsMicros = [100_000, 200_000, 150_000], width = 320, height = 180 } = {}) {
  const closedFrames = [];
  let decoderClosed = false;

  class MockImageDecoder {
    static async isTypeSupported(mime) {
      return mime === 'image/gif' || mime === 'image/webp';
    }

    constructor() {
      this.tracks = {
        ready: Promise.resolve(),
        selectedTrack: {
          animated,
          frameCount: durationsMicros.length,
        },
      };
    }

    async decode({ frameIndex }) {
      const idx = frameIndex;
      return {
        image: {
          id: `frame-${idx}`,
          displayWidth: width,
          displayHeight: height,
          duration: durationsMicros[idx],
          close() {
            closedFrames.push(idx);
          },
        },
      };
    }

    close() {
      decoderClosed = true;
    }
  }

  return {
    MockImageDecoder,
    getState: () => ({ closedFrames, decoderClosed }),
  };
}

test('inferImageMimeType and isAnimatableMimeType detect MIME and extension fallbacks', () => {
  assert.equal(inferImageMimeType({ name: 'clip.gif', type: 'image/gif' }), 'image/gif');
  assert.equal(inferImageMimeType({ name: 'CLIP.GIF', type: '' }), 'image/gif');
  assert.equal(inferImageMimeType({ name: 'anim.webp', type: '' }), 'image/webp');
  assert.equal(inferImageMimeType({ name: 'photo.jpg', type: 'image/jpeg' }), 'image/jpeg');
  assert.equal(isAnimatableMimeType('image/gif'), true);
  assert.equal(isAnimatableMimeType('image/jpeg'), false);
});

test('normalizeFrameDurationSec clamps legacy <=10ms delays to 100ms', () => {
  assert.equal(normalizeFrameDurationSec(0), 0.1);
  assert.equal(normalizeFrameDurationSec(10_000), 0.1);
  assert.equal(normalizeFrameDurationSec(50_000), 0.05);
  assert.equal(normalizeFrameDurationSec(250_000), 0.25);
});

test('AnimatedImagePlayer.fromFile reports unsupported when ImageDecoder is absent', async () => {
  const res = await AnimatedImagePlayer.fromFile(makeMockFile('test.gif', 'image/gif'), {
    ImageDecoderCtor: null,
  });
  assert.equal(res.supported, false);
  assert.equal(res.player, null);
});

test('AnimatedImagePlayer.fromFile returns null player for static single-frame image', async () => {
  const { MockImageDecoder, getState } = makeMockDecoderCtor({
    animated: false,
    durationsMicros: [0],
  });
  const res = await AnimatedImagePlayer.fromFile(makeMockFile('static.gif', 'image/gif'), {
    ImageDecoderCtor: MockImageDecoder,
  });
  assert.equal(res.supported, true);
  assert.equal(res.player, null);
  assert.equal(getState().decoderClosed, true);
});

test('AnimatedImagePlayer cached playback advances, loops, seeks, ends, and disposes cleanly', async () => {
  const { MockImageDecoder, getState } = makeMockDecoderCtor({
    animated: true,
    durationsMicros: [100_000, 200_000, 150_000], // total 0.45s
  });

  const closedBitmaps = [];
  const createBitmap = async (frame) => ({
    id: `bmp-${frame.id}`,
    width: frame.displayWidth,
    height: frame.displayHeight,
    close() {
      closedBitmaps.push(frame.id);
    },
  });

  const { supported, player } = await AnimatedImagePlayer.fromFile(
    makeMockFile('loop.gif', 'image/gif'),
    {
      ImageDecoderCtor: MockImageDecoder,
      createBitmap,
    }
  );

  assert.equal(supported, true);
  assert.ok(player);
  assert.equal(player.streaming, false);
  assert.equal(player.frameCount, 3);
  assert.ok(Math.abs(player.duration - 0.45) < 1e-6);
  assert.equal(getState().decoderClosed, true);
  assert.deepEqual(getState().closedFrames, [0, 1, 2]);

  // Initial frame
  assert.equal(player.getCurrentFrame().id, 'bmp-frame-0');

  // Advance into frame 1 (0.15s)
  player.advance(0.15);
  assert.equal(player.currentIndex, 1);
  assert.equal(player.getCurrentFrame().id, 'bmp-frame-1');

  // Advance into frame 2 (0.35s)
  player.advance(0.2);
  assert.equal(player.currentIndex, 2);
  assert.equal(player.getCurrentFrame().id, 'bmp-frame-2');

  // Loop wrap-around (0.35 + 0.15 = 0.50 -> 0.05s -> frame 0)
  player.advance(0.15);
  assert.equal(player.currentIndex, 0);
  assert.ok(Math.abs(player.currentTime - 0.05) < 1e-6);

  // Seek directly to frame 2
  player.seek(0.32);
  assert.equal(player.currentIndex, 2);

  // Non-looping playback triggers ended + onEnded
  let endedCalls = 0;
  player.loop = false;
  player.onEnded = () => {
    endedCalls += 1;
  };
  player.seek(0);
  player.advance(0.5);
  assert.equal(player.ended, true);
  assert.equal(player.currentIndex, 2);
  assert.equal(endedCalls, 1);

  // Dispose closes all cached bitmaps
  player.dispose();
  assert.deepEqual(closedBitmaps, ['frame-0', 'frame-1', 'frame-2']);
  assert.equal(player.getCurrentFrame(), null);
});

test('AnimatedImagePlayer switches to streaming mode when pixel budget is exceeded', async () => {
  const { MockImageDecoder, getState } = makeMockDecoderCtor({
    animated: true,
    durationsMicros: [100_000, 100_000, 100_000],
    width: 400,
    height: 300,
  });

  const drawnIds = [];
  const createCanvas = (w, h) => ({
    width: w,
    height: h,
    getContext() {
      return {
        clearRect() {},
        drawImage(frame) {
          drawnIds.push(frame.id);
        },
      };
    },
  });

  const { player } = await AnimatedImagePlayer.fromFile(makeMockFile('huge.gif', 'image/gif'), {
    ImageDecoderCtor: MockImageDecoder,
    maxCachePixels: 1000, // Force streaming mode
    createCanvas,
  });

  assert.equal(player.streaming, true);
  assert.equal(getState().decoderClosed, false);
  assert.deepEqual(drawnIds, ['frame-0']);

  player.seek(0.22);
  // Wait for async streaming decode microtasks
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(player.currentIndex, 2);
  assert.deepEqual(drawnIds, ['frame-0', 'frame-2']);

  player.dispose();
  assert.equal(getState().decoderClosed, true);
});

test('AnimatedImagePlayer.fromFile reports progress and cleans up on AbortSignal cancel', async () => {
  const { MockImageDecoder, getState } = makeMockDecoderCtor({
    animated: true,
    durationsMicros: [100_000, 100_000, 100_000, 100_000],
  });

  const controller = new AbortController();
  const progressEvents = [];
  const closedBitmaps = [];

  const createBitmap = async (frame) => ({
    id: `bmp-${frame.id}`,
    width: frame.displayWidth,
    height: frame.displayHeight,
    close() {
      closedBitmaps.push(frame.id);
    },
  });

  await assert.rejects(
    () =>
      AnimatedImagePlayer.fromFile(makeMockFile('cancel.gif', 'image/gif'), {
        ImageDecoderCtor: MockImageDecoder,
        createBitmap,
        signal: controller.signal,
        onProgress({ loaded, total }) {
          progressEvents.push({ loaded, total });
          if (loaded === 2) controller.abort();
        },
      }),
    (err) => err.name === 'AbortError'
  );

  assert.deepEqual(progressEvents, [
    { loaded: 0, total: 4 },
    { loaded: 1, total: 4 },
    { loaded: 2, total: 4 },
  ]);
  assert.deepEqual(closedBitmaps, ['frame-0', 'frame-1']);
  assert.equal(getState().decoderClosed, true);
});

