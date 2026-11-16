// KEmisora  util.js  版 0.1.2  基づく仕様書：KEmisora_仕様書_v0.1.2.md
// 役割：小さな共通処理。

const Util = {
  fill(text, obj) { return String(text).replace(/\{(\w+)\}/g, (m, k) => (obj && obj[k] !== undefined ? obj[k] : m)); },
  formatTime(sec) {
    if (sec == null || !isFinite(sec)) return '--:--';
    const s = Math.max(0, Math.round(sec)), m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  },
  formatPitch(n) { return n === 0 ? '±0' : (n > 0 ? '+' + n : '−' + Math.abs(n)); },
  formatSpeed(x) { return x.toFixed(2) + '倍'; },
  clamp(x, a, b) { return Math.min(b, Math.max(a, x)); },
  roundStep(x, step) { return Number((Math.round(x / step) * step).toFixed(2)); },
  makeSongId(name, size) { return name + '|' + size; },
  getExt(name) { const i = String(name).lastIndexOf('.'); return i < 0 ? '' : String(name).slice(i + 1).toLowerCase(); },
  stripExt(name) { const i = String(name).lastIndexOf('.'); return i <= 0 ? String(name) : String(name).slice(0, i); },
  newId(prefix) { return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); },
  lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  lsRemove(k) { try { localStorage.removeItem(k); } catch (e) { /* 何もしない */ } },
  charLen(s) { return Array.from(String(s)).length; },
  // 親フォルダのURL（またはID）からフォルダIDを取り出す。取り出せなければ ''
  folderIdFromUrl(s) {
    s = String(s || '').trim();
    let m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    m = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{15,}$/.test(s) ? s : '';
  },
  makeSilentWavUrl() {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  },
  b64ToBytes(b64) {
    const bin = atob(b64), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
};
