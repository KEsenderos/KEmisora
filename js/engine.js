// KEmisora  engine.js  版 0.1.5  基づく仕様書：KEmisora_仕様書_v0.1.5.md
// 役割：AudioContext と AudioWorklet（kem-processor）の管理。曲のデコード、再生、タイマーの切る位置の指示。

const Engine = {
  ctx: null, node: null, ready_: null,
  cbPos: null, cbEnded: null, cbAdvanced: null, cbCutNoNext: null,

  onPosition(f) { Engine.cbPos = f; }, onEnded(f) { Engine.cbEnded = f; },
  onAdvanced(f) { Engine.cbAdvanced = f; }, onCutNoNext(f) { Engine.cbCutNoNext = f; },

  get sampleRate() { return Engine.ctx ? Engine.ctx.sampleRate : 48000; },

  ensureContext_() {
    if (Engine.ready_) return Engine.ready_;
    Engine.ready_ = (async () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        Engine.ctx = new Ctx({ latencyHint: 'playback' });
        await Engine.ctx.audioWorklet.addModule('js/worklet/kem-processor.js');
        Engine.node = new AudioWorkletNode(Engine.ctx, 'kem-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        Engine.node.port.onmessage = (e) => Engine.onMessage_(e.data);
        Engine.node.connect(Engine.ctx.destination);
      } catch (e) {
        Engine.ready_ = null; Engine.ctx = null; Engine.node = null;
        throw new KemError('AUDIO');
      }
    })();
    return Engine.ready_;
  },

  async ensureRunning_() {
    await Engine.ensureContext_();
    if (Engine.ctx.state !== 'running') { try { await Engine.ctx.resume(); } catch (e) { /* 続行 */ } }
  },

  onMessage_(m) {
    if (m.type === 'pos') { if (Engine.cbPos) Engine.cbPos(m.sec, m.out); }
    else if (m.type === 'ended') { if (Engine.cbEnded) Engine.cbEnded(); }
    else if (m.type === 'advanced') { if (Engine.cbAdvanced) Engine.cbAdvanced(m.kind); }
    else if (m.type === 'cutNoNext') { if (Engine.cbCutNoNext) Engine.cbCutNoNext(); }
  },

  post_(msg, transfer) { if (Engine.node) Engine.node.port.postMessage(msg, transfer || []); },

  // 曲のデコード。戻り値 { channels, durationSec }（長すぎれば TOO_LONG）
  async decode(blob) {
    await Engine.ensureContext_();
    let ab;
    try { ab = await Engine.ctx.decodeAudioData(await blob.arrayBuffer()); } catch (e) { throw new KemError('DECODE'); }
    const durationSec = ab.duration;
    if (durationSec > KEM.MAX_DURATION_SEC) throw new KemError('TOO_LONG', { sec: durationSec });
    const channels = [];
    for (let c = 0; c < Math.min(2, ab.numberOfChannels); c++) {
      const arr = new Float32Array(ab.length); ab.copyFromChannel(arr, c); channels.push(arr);
    }
    ab = null;
    return { channels, durationSec };
  },

  // 長さだけ調べる（取り込みのとき）。まず audio 要素、だめならデコード
  probeDuration(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const a = new Audio();
      const done = (v) => { URL.revokeObjectURL(url); a.removeAttribute('src'); resolve(v); };
      const timer = setTimeout(() => done(null), 8000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { clearTimeout(timer); done(isFinite(a.duration) && a.duration > 0 ? a.duration : null); };
      a.onerror = () => { clearTimeout(timer); done(null); };
      a.src = url;
    });
  },

  async load(channels) {
    await Engine.ensureContext_();
    Engine.post_({ type: 'load', channels }, channels.map((a) => a.buffer));
  },
  queue(channels, pitch, speed, kind) { Engine.post_({ type: 'queue', channels, pitch, speed, kind }, channels.map((a) => a.buffer)); },
  switchNext() { Engine.post_({ type: 'switchNext' }); },
  dropNext() { Engine.post_({ type: 'dropNext' }); },
  resetOut() { Engine.post_({ type: 'resetOut' }); },
  cutAt(frame, fade) { Engine.post_({ type: 'cutAt', frame, fade }); },
  cancelCut() { Engine.post_({ type: 'cancelCut' }); },
  play() { Engine.post_({ type: 'play' }); },
  pause() { Engine.post_({ type: 'pause' }); },
  seek(sec) { Engine.post_({ type: 'seek', sec }); },
  setParams(pitch, speed) { Engine.post_({ type: 'params', pitch, speed }); },
  unload() { Engine.post_({ type: 'unload' }); }
};
