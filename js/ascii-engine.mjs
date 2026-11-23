/**
 * CHROMASCII — High-Performance 60FPS True-Color Video-to-ASCII Engine
 */

export const CHARSETS = {
  classic: ' .:-=+*#%@',
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  dots: ' ·•●◉',
  matrix: ' 01アイウエオカキクケコサシスセソタチツ',
  minimal: ' .,-~:;!*=#$@',
};

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

export class ColorAsciiEngine {
  constructor(outputCanvas) {
    this.canvas = outputCanvas;
    this.ctx = outputCanvas.getContext('2d', { alpha: false });
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    this.lastGrid = { cols: 120, rows: 48 };
    this.lastFrameData = null; // stored for instant text/HTML export
  }

  resizeToStage() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(160, Math.floor(parent.clientWidth));
    const h = Math.max(140, Math.floor(parent.clientHeight));
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    this.cssWidth = w;
    this.cssHeight = h;
  }

  getSourceDimensions(source) {
    if (!source) return { w: 640, h: 360 };
    if (source instanceof HTMLVideoElement) {
      return { w: source.videoWidth || 640, h: source.videoHeight || 360 };
    }
    if (source instanceof HTMLImageElement) {
      return { w: source.naturalWidth || 640, h: source.naturalHeight || 360 };
    }
    return {
      w: source.displayWidth || source.width || 640,
      h: source.displayHeight || source.height || 360,
    };
  }

  computeColor(r, g, b, luma, colorMode) {
    switch (colorMode) {
      case 'matrix': {
        const gVal = clampByte(luma * 1.25 + 22);
        const rVal = luma > 210 ? clampByte((luma - 180) * 3) : 12;
        const bVal = luma > 210 ? clampByte((luma - 180) * 2.5) : 32;
        return { fg: `rgb(${rVal},${gVal},${bVal})`, bg: null };
      }
      case 'amber': {
        const a = clampByte(luma * 1.2 + 18);
        return { fg: `rgb(${a},${(a * 0.66) | 0},${(a * 0.08) | 0})`, bg: null };
      }
      case 'cyber': {
        // Map luminance & red-blue balance onto cyan -> violet -> magenta neon ramp
        const t = luma / 255;
        const nr = clampByte(40 + t * 215 * (0.55 + (r / 255) * 0.6));
        const ng = clampByte(215 * (1 - Math.abs(t - 0.55) * 1.25) + (g / 255) * 45);
        const nb = clampByte(150 + t * 105);
        return { fg: `rgb(${nr},${ng},${nb})`, bg: null };
      }
      case 'mono': {
        const m = clampByte(luma * 1.12 + 10);
        return { fg: `rgb(${m},${m},${m})`, bg: null };
      }
      case 'bgfill': {
        const br = (r * 0.34) | 0;
        const bg = (g * 0.34) | 0;
        const bb = (b * 0.34) | 0;
        const fr = clampByte(r * 1.25 + 24);
        const fg = clampByte(g * 1.25 + 24);
        const fb = clampByte(b * 1.25 + 24);
        return { fg: `rgb(${fr},${fg},${fb})`, bg: `rgb(${br},${bg},${bb})` };
      }
      case 'truecolor':
      default: {
        // Slight brightness lift so characters glow cleanly on obsidian black
        const fr = clampByte(r * 1.12 + 10);
        const fg = clampByte(g * 1.12 + 10);
        const fb = clampByte(b * 1.12 + 10);
        return { fg: `rgb(${fr},${fg},${fb})`, bg: null };
      }
    }
  }

  renderFrame(source, settings) {
    if (!source) return;
    const { w: srcW, h: srcH } = this.getSourceDimensions(source);
    if (srcW === 0 || srcH === 0) return;

    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    const stageW = this.cssWidth || 960;
    const stageH = this.cssHeight || 540;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#020308';
    ctx.fillRect(0, 0, stageW, stageH);

    // Fit source aspect ratio neatly inside stage
    const srcAspect = srcW / srcH;
    const stageAspect = stageW / stageH;
    let drawW, drawH, offsetX, offsetY;
    if (srcAspect > stageAspect) {
      drawW = stageW;
      drawH = stageW / srcAspect;
      offsetX = 0;
      offsetY = (stageH - drawH) * 0.5;
    } else {
      drawH = stageH;
      drawW = stageH * srcAspect;
      offsetX = (stageW - drawW) * 0.5;
      offsetY = 0;
    }

    // Monospace character aspect ratio (~0.56 width/height)
    const cols = Math.max(32, Math.min(240, settings.cols | 0));
    const charAspect = 0.56;
    const cellW = drawW / cols;
    const cellH = cellW / charAspect;
    const rows = Math.max(16, Math.round(drawH / cellH));
    const exactCellH = drawH / rows;

    this.lastGrid = { cols, rows };

    if (this.sampleCanvas.width !== cols || this.sampleCanvas.height !== rows) {
      this.sampleCanvas.width = cols;
      this.sampleCanvas.height = rows;
    }

    // Clear sample buffer to obsidian black so transparent GIF/PNG frames do not ghost
    this.sampleCtx.fillStyle = '#020308';
    this.sampleCtx.fillRect(0, 0, cols, rows);

    // Downsample source video/canvas/image to exact ASCII grid
    this.sampleCtx.drawImage(source, 0, 0, cols, rows);
    const imgData = this.sampleCtx.getImageData(0, 0, cols, rows).data;

    const ramp = CHARSETS[settings.charset] || CHARSETS.classic;
    const rampMax = ramp.length - 1;
    const contrast = settings.contrast ?? 1.15;
    const brightness = settings.brightness ?? 0;
    const saturation = settings.saturation ?? 1.25;
    const invert = Boolean(settings.invert);
    const colorMode = settings.colorMode || 'truecolor';

    const splitActive = Boolean(settings.splitEnabled);
    const rawSplitX = stageW * (settings.splitRatio ?? 0.5);
    const splitX = Math.max(offsetX, Math.min(offsetX + drawW, rawSplitX));

    // 1. If Split-Screen active, draw original media on left side
    if (splitActive) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, offsetY, Math.max(0, splitX - offsetX), drawH);
      ctx.clip();
      ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
      ctx.restore();
    }

    // 2. Render Color ASCII (clipped to right side if Split-Screen active)
    ctx.save();
    if (splitActive) {
      ctx.beginPath();
      ctx.rect(splitX, offsetY, Math.max(0, offsetX + drawW - splitX), drawH);
      ctx.clip();
    }

    const fontPx = Math.max(5.5, exactCellH * 1.04);
    ctx.font = `600 ${fontPx.toFixed(2)}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    if (settings.glow && colorMode !== 'bgfill') {
      ctx.shadowBlur = Math.min(8, cellW * 0.85);
      ctx.shadowColor =
        colorMode === 'matrix'
          ? 'rgba(34, 197, 94, 0.55)'
          : colorMode === 'amber'
            ? 'rgba(245, 158, 11, 0.5)'
            : 'rgba(56, 189, 248, 0.35)';
    } else {
      ctx.shadowBlur = 0;
    }

    const startCol = splitActive
      ? Math.max(0, Math.floor((splitX - offsetX) / cellW) - 1)
      : 0;

    // Cache compact frame buffer for instant copy-text / export-HTML
    const textRows = new Array(rows);
    const colorRows = new Array(rows);

    for (let y = 0; y < rows; y++) {
      const py = offsetY + y * exactCellH;
      let rowChars = '';
      const rowColors = new Array(cols);

      for (let x = 0; x < cols; x++) {
        const idx = (y * cols + x) * 4;
        let r = imgData[idx];
        let g = imgData[idx + 1];
        let b = imgData[idx + 2];

        // Apply brightness & contrast
        r = (r - 128) * contrast + 128 + brightness;
        g = (g - 128) * contrast + 128 + brightness;
        b = (b - 128) * contrast + 128 + brightness;

        // Perceptual luma (Rec. 709)
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // Apply saturation
        r = clampByte(gray + (r - gray) * saturation);
        g = clampByte(gray + (g - gray) * saturation);
        b = clampByte(gray + (b - gray) * saturation);

        let luma = clampByte(0.2126 * r + 0.7152 * g + 0.0722 * b);
        if (invert) luma = 255 - luma;

        const charIdx = Math.round((luma / 255) * rampMax);
        const ch = ramp[charIdx];
        rowChars += ch;

        const { fg, bg } = this.computeColor(r, g, b, luma, colorMode);
        rowColors[x] = fg;

        if (x < startCol) continue;

        const px = offsetX + x * cellW;
        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(px, py, cellW + 0.6, exactCellH + 0.6);
        }

        if (ch !== ' ') {
          ctx.fillStyle = fg;
          ctx.fillText(ch, px, py);
        }
      }

      textRows[y] = rowChars;
      colorRows[y] = rowColors;
    }

    // 3. Optional CRT Scanlines
    if (settings.scanlines) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      for (let sy = offsetY; sy < offsetY + drawH; sy += 3) {
        ctx.fillRect(offsetX, sy, drawW, 1.2);
      }
    }

    ctx.restore();

    this.lastFrameData = { cols, rows, textRows, colorRows };
  }

  extractPlainText() {
    if (!this.lastFrameData) return '';
    return this.lastFrameData.textRows.join('\n');
  }

  extractColorHtml(title = 'CHROMASCII Frame') {
    if (!this.lastFrameData) return '';
    const { textRows, colorRows, cols } = this.lastFrameData;
    const esc = (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c;

    const lines = [];
    for (let y = 0; y < textRows.length; y++) {
      const chars = textRows[y];
      const colors = colorRows[y];
      let line = '';
      let runColor = null;
      let runText = '';

      const flush = () => {
        if (!runText) return;
        line += `<span style="color:${runColor}">${runText}</span>`;
        runText = '';
      };

      for (let x = 0; x < chars.length; x++) {
        const ch = chars[x];
        const col = colors[x];
        if (ch === ' ') {
          flush();
          runColor = null;
          line += ' ';
          continue;
        }
        if (col !== runColor) {
          flush();
          runColor = col;
        }
        runText += esc(ch);
      }
      flush();
      lines.push(line);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  body { margin: 0; background: #020308; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  pre { font-family: "JetBrains Mono", Consolas, monospace; font-size: ${Math.max(6, Math.round(920 / cols))}px; line-height: 1.05; letter-spacing: 0.04em; margin: 16px; }
</style>
</head>
<body>
<pre>${lines.join('\n')}</pre>
</body>
</html>`;
  }
}
