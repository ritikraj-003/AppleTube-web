/**
 * AppleTube - Dynamic Artwork Color Extractor
 * Extracts dominant accent colors from song cover artwork to dynamically style the player timeline.
 */

class ColorExtractorManager {
  constructor() {
    this.cache = new Map();
    this.canvas = null;
    this.ctx = null;
    // Sensible accessible default: Warm gold/amber matching AppleTube reference
    this.defaultColors = {
      primary: 'hsl(38, 92%, 56%)',
      glow: 'hsla(38, 92%, 56%, 0.42)',
      glowSoft: 'hsla(38, 92%, 56%, 0.16)',
      hex: '#f59e0b'
    };
    // Dark background reference luminance (~#121214)
    this.bgLuminance = this.calculateRelativeLuminance(18, 18, 20);
  }

  initCanvas() {
    if (!this.canvas && typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 32;
      this.canvas.height = 32;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
  }

  /**
   * Calculate WCAG 2.2 relative luminance of an sRGB color.
   * L = 0.2126 * R' + 0.7152 * G' + 0.0722 * B'
   */
  calculateRelativeLuminance(r, g, b) {
    const sRGB = [r / 255, g / 255, b / 255].map((v) => {
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  /**
   * Calculate contrast ratio between two relative luminances.
   * CR = (L1 + 0.05) / (L2 + 0.05)
   */
  calculateContrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Extract vibrant accent color from an artwork URL with in-memory caching.
   * @param {string} imageUrl 
   * @param {function} callback Called with { primary, glow, glowSoft, hex }
   */
  async extract(imageUrl, callback) {
    if (!imageUrl || imageUrl.includes('default-cover.svg')) {
      if (callback) callback(this.defaultColors);
      return;
    }

    if (this.cache.has(imageUrl)) {
      if (callback) callback(this.cache.get(imageUrl));
      return;
    }

    let resolved = false;
    const safeResolve = (colors) => {
      if (resolved) return;
      resolved = true;
      this.cache.set(imageUrl, colors);
      if (callback) callback(colors);
    };

    // 1. Try high-precision backend artwork color extraction API first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`/api/yt/artwork-color?url=${encodeURIComponent(imageUrl)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.primary) {
          safeResolve(data);
          return;
        }
      }
    } catch (e) {
      // Fall through to client canvas extraction
    }

    // 2. Client-side Canvas extraction with center crop & cache-busting CORS reload
    this.initCanvas();
    if (!this.ctx) {
      safeResolve(this.deriveFallbackFromUrl(imageUrl));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Timeout safety fallback
    const timeoutId = setTimeout(() => {
      safeResolve(this.deriveFallbackFromUrl(imageUrl));
    }, 1500);

    img.onload = () => {
      clearTimeout(timeoutId);
      try {
        this.ctx.clearRect(0, 0, 32, 32);
        // Crop center 70% of source image to eliminate YouTube letterboxing
        const sw = img.naturalWidth || img.width || 32;
        const sh = img.naturalHeight || img.height || 32;
        const sx = sw * 0.15;
        const sy = sh * 0.15;
        const sCropW = sw * 0.70;
        const sCropH = sh * 0.70;

        this.ctx.drawImage(img, sx, sy, sCropW, sCropH, 0, 0, 32, 32);

        const imgData = this.ctx.getImageData(0, 0, 32, 32).data;
        const color = this.analyzePixels(imgData);

        if (color) {
          safeResolve(color);
        } else {
          safeResolve(this.deriveFallbackFromUrl(imageUrl));
        }
      } catch (err) {
        safeResolve(this.deriveFallbackFromUrl(imageUrl));
      }
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      safeResolve(this.deriveFallbackFromUrl(imageUrl));
    };

    // Cache-busting parameter prevents HTTP cache from returning non-CORS cached asset
    const separator = imageUrl.includes('?') ? '&' : '?';
    img.src = `${imageUrl}${separator}cors_ref=1`;
  }

  /**
   * Analyzes 32x32 pixels using color population bucketing to select the true dominant accent.
   * Validates WCAG 2.2 AA contrast (>= 3:1) and separation from white track.
   */
  analyzePixels(data) {
    const buckets = {};

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 128) continue; // Skip transparent

      // Filter extreme blacks and whites
      const sum = r + g + b;
      if (sum < 40 || sum > 710) continue;

      // Filter low-saturation gray tones
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      if (delta < 15) continue;

      const [h, s, l] = this.rgbToHsl(r, g, b);

      const hueBucket = Math.floor(h / 25) * 25;
      if (!buckets[hueBucket]) {
        buckets[hueBucket] = { count: 0, h, s, l };
      }
      buckets[hueBucket].count++;
      buckets[hueBucket].s = Math.max(buckets[hueBucket].s, s);
      buckets[hueBucket].l = (buckets[hueBucket].l + l) / 2;
    }

    const bucketList = Object.values(buckets);
    if (bucketList.length === 0) {
      return null;
    }

    // Score by population and saturation
    bucketList.sort((a, b) => (b.count * Math.pow(b.s, 1.3)) - (a.count * Math.pow(a.s, 1.3)));
    const top = bucketList[0];

    return this.buildAccessibleTheme(top.h, top.s, top.l);
  }

  /**
   * Ensures the color satisfies WCAG 2.2 AA contrast (>= 3.0:1) against dark background
   * while remaining distinct from the solid white remaining track.
   */
  buildAccessibleTheme(hue, saturation, lightness) {
    let finalH = Math.round(hue);
    // Ensure saturation is rich (not dull gray), clamped between 65% and 95%
    let finalS = Math.max(0.65, Math.min(0.95, saturation));
    // Clamp lightness initially between 52% and 68%
    let finalL = Math.max(0.52, Math.min(0.68, lightness));

    // Verify contrast ratio against dark background
    let [r, g, b] = this.hslToRgb(finalH, finalS, finalL);
    let colorLum = this.calculateRelativeLuminance(r, g, b);
    let contrast = this.calculateContrastRatio(colorLum, this.bgLuminance);

    // If contrast is below 3.0:1, increase lightness until >= 3.0:1
    while (contrast < 3.0 && finalL < 0.72) {
      finalL += 0.02;
      [r, g, b] = this.hslToRgb(finalH, finalS, finalL);
      colorLum = this.calculateRelativeLuminance(r, g, b);
      contrast = this.calculateContrastRatio(colorLum, this.bgLuminance);
    }

    // Ensure it doesn't get too close to white (must maintain visual distinction against white track)
    if (finalL > 0.70) {
      finalL = 0.68;
    }

    const sPercent = Math.round(finalS * 100);
    const lPercent = Math.round(finalL * 100);

    return {
      primary: `hsl(${finalH}, ${sPercent}%, ${lPercent}%)`,
      // Soft, diffused, low-intensity glow (never harsh neon)
      glow: `hsla(${finalH}, ${sPercent}%, ${lPercent}%, 0.42)`,
      glowSoft: `hsla(${finalH}, ${sPercent}%, ${lPercent}%, 0.16)`,
      hex: this.hslToHex(finalH, finalS, finalL)
    };
  }

  /**
   * Deterministic vibrant fallback based on image URL hash if CORS blocks canvas read.
   */
  deriveFallbackFromUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = (hash << 5) - hash + url.charCodeAt(i);
      hash |= 0;
    }
    // High-contrast, beautiful palette of hues
    const hues = [38, 48, 15, 195, 215, 260, 280, 335, 350, 160];
    const h = hues[Math.abs(hash) % hues.length];
    return this.buildAccessibleTheme(h, 0.88, 0.58);
  }

  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        case b: h = ((r - g) / d + 4); break;
      }
      h /= 6;
    }
    return [h * 360, s, l];
  }

  hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  hslToHex(h, s, l) {
    const [r, g, b] = this.hslToRgb(h, s, l);
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}

export const ColorExtractor = new ColorExtractorManager();
