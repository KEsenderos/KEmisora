// KEmisora  media.js  版 0.1.9  基づく仕様書：KEmisora_仕様書_v0.1.9.md
// 役割：無音のaudio要素、ロック画面・イヤホンのボタン（Media Session）、画面を消さない設定（Wake Lock）。

const MediaCtl = {
  lastToggle_: 0, silenceStarted_: false, wake_: null, posTimer_: 0,

  init() {
    const a = document.getElementById('kemSilence');
    if (a) { a.src = Util.makeSilentWavUrl(); a.loop = true; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 続行 */ }
    if (!('mediaSession' in navigator)) return;
    const set = (n, f) => { try { navigator.mediaSession.setActionHandler(n, f); } catch (e) { /* 未対応 */ } };
    ['play', 'pause', 'stop'].forEach((n) => set(n, () => MediaCtl.handleToggle_()));
    set('previoustrack', () => Player.prev());
    set('nexttrack', () => Player.next());
    set('seekbackward', () => Player.skip(-KEM.SKIP_SEC));
    set('seekforward', () => Player.skip(KEM.SKIP_SEC));
    set('seekto', (d) => { if (d && typeof d.seekTime === 'number') Player.seekTo(d.seekTime); });
  },

  handleToggle_() {
    const now = Date.now();
    if (now - MediaCtl.lastToggle_ < KEM.HEADSET_DEBOUNCE_MS) return;
    MediaCtl.lastToggle_ = now;
    const s = Player.state;
    if (s === KEM.STATE.PLAYING) Player.pause();
    else if (s === KEM.STATE.PAUSED || s === KEM.STATE.STOPPED) Player.play();
  },

  startSilence() {
    const a = document.getElementById('kemSilence');
    if (!a || MediaCtl.silenceStarted_) return;
    MediaCtl.silenceStarted_ = true;
    const p = a.play(); if (p && p.catch) p.catch(() => { MediaCtl.silenceStarted_ = false; });
  },

  async acquireWake() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible' && !MediaCtl.wake_) {
        MediaCtl.wake_ = await navigator.wakeLock.request('screen');
        MediaCtl.wake_.addEventListener('release', () => { MediaCtl.wake_ = null; });
      }
    } catch (e) { MediaCtl.wake_ = null; }
  },
  releaseWake() { try { if (MediaCtl.wake_) MediaCtl.wake_.release(); } catch (e) { /* 続行 */ } MediaCtl.wake_ = null; },

  setMetadata(title, artist) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'KEmisora', artist: artist || '', album: 'KEmisora',
        artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
      });
    } catch (e) { /* 続行 */ }
  },
  setPlaybackState(state) {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = state === KEM.STATE.PLAYING ? 'playing' : 'paused'; } catch (e) { /* 続行 */ }
  },
  updatePosition(pos, dur, speed) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const now = Date.now();
    if (now - MediaCtl.posTimer_ < KEM.POSITION_STATE_MS) return;
    MediaCtl.posTimer_ = now;
    try {
      if (dur > 0) navigator.mediaSession.setPositionState({ duration: dur, position: Util.clamp(pos, 0, dur), playbackRate: speed || 1 });
    } catch (e) { /* 続行 */ }
  }
};
