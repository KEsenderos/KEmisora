// KEmisora  player.js  版 0.1.5  基づく仕様書：KEmisora_仕様書_v0.1.5.md
// 役割：再生の状態と操作の中心。編成の再生、次の曲の先読み、タイマー（切る位置の指示）、曲ごとの音程・速度。

const Player = {
  state: KEM.STATE.EMPTY,
  plan: null,            // 再生中の編成（1曲だけ再生のときは null）
  ids: [],               // 再生する曲の順番
  idx: -1,               // 今の曲の位置
  songId: null,
  alarmId: null, alarmActive: false, alarmQueued: false, nextQueued: false, alarmBytes: 0,
  timerSec: 0, cutFrame: 0, out: 0,
  pitch: 0, speed: 1, position: 0, duration: 0,
  loadToken: 0, curBytes: 0, finishedMsg: '',
  saveTimer_: 0, onChange: null, onMessage: null,

  init() {
    Engine.onPosition((sec, out) => Player.onPosition_(sec, out));
    Engine.onEnded(() => Player.handleEnded_());
    Engine.onAdvanced((kind) => Player.handleAdvanced_(kind));
    Engine.onCutNoNext(() => Player.handleCutNoNext_());
  },

  notify_() { if (Player.onChange) Player.onChange(); },
  say_(text, kind) { if (Player.onMessage) Player.onMessage(text, kind); },
  setState_(s) { Player.state = s; MediaCtl.setPlaybackState(s); Player.notify_(); },
  song() { return Library.find(Player.songId); },
  hasSong_() { return !!Player.songId; },
  timerLeft() {
    if (!Player.timerSec || Player.alarmActive) return null;
    return Math.max(0, (Player.cutFrame - Player.out) / Engine.sampleRate);
  },

  // 時刻で終わるタイマー：読み込み・一時停止の間も時計は進むので、再生を始める（再開する）たびに、切る位置を「今から終了時刻まで」に合わせ直す
  rebaseClock_() {
    if (!Player.endAt || !Player.timerSec || Player.alarmActive) return;
    const left = Math.max(0.05, (Player.endAt - Date.now()) / 1000);
    Player.cutFrame = Player.out + KeCore.cutFrames(left, Engine.sampleRate);
    Engine.cutAt(Player.cutFrame, KeCore.fadeFrames(KEM.TIMER_FADE_SEC, Engine.sampleRate));
  },

  // ---------- 編成を始める ----------
  async startPlan(planId, autoplay) {
    const plan = Plans.find(planId);
    if (!plan) return;
    const bad = Plans.validate(plan, Library.getList(), Tags.getList());
    if (bad.length) { Player.say_(Util.fill(TEXT.ERR_PLAN_BAD, { why: bad.map(Plans.badText).join('、') }), 'error'); return; }
    Util.lsSet(KEM.LS.LAST_PLAN, planId);
    let built;
    try { built = Session.build(plan, Library.getList()); } catch (e) { Player.say_(UI.errorText(e), 'error'); return; }
    if (!built.ids.length) { Player.say_(Util.fill(TEXT.ERR_PLAN_BAD, { why: TEXT.BAD_NO_SONG }), 'error'); return; }
    await Player.begin_(plan, built, autoplay);
  },

  // この曲だけ再生（曲タブ）
  async playOne(songId, repeat) {
    await Player.begin_(null, { ids: [songId], alarmId: null, timerSec: 0, infinite: false, repeatOne: !!repeat }, true);
  },

  async begin_(plan, built, autoplay) {
    Player.plan = plan; Player.ids = built.ids.slice(); Player.idx = -1;
    Player.alarmId = built.alarmId; Player.alarmActive = false; Player.alarmQueued = false; Player.nextQueued = false; Player.alarmBytes = 0;
    Player.repeatOne = !!built.repeatOne; Player.timerSec = built.timerSec; Player.endAt = built.endAt || 0; Player.out = 0; Player.finishedMsg = '';
    try { await Engine.ensureContext_(); } catch (e) { Player.fail_(e); return; }
    Engine.resetOut(); Engine.dropNext();
    if (Player.timerSec) {
      Player.cutFrame = KeCore.cutFrames(Player.timerSec, Engine.sampleRate);
      Engine.cutAt(Player.cutFrame, KeCore.fadeFrames(KEM.TIMER_FADE_SEC, Engine.sampleRate));
    } else { Player.cutFrame = 0; Engine.cancelCut(); }
    await Player.loadIndex_(0, autoplay);
  },

  fail_(err) {
    const e = err instanceof KemError ? err : new KemError('UNKNOWN');
    Player.setState_(Player.songId ? KEM.STATE.STOPPED : KEM.STATE.EMPTY);
    Player.say_(UI.errorText(e), 'error');
  },

  // ---------- 曲を読み込む ----------
  async loadIndex_(i, autoplay) {
    const songId = Player.ids[i];
    const s = Library.find(songId);
    if (!s) { Player.fail_(new KemError('DECODE', { name: songId })); return; }
    const token = ++Player.loadToken;
    Player.flushSave();
    if (Player.state === KEM.STATE.PLAYING) { Engine.pause(); }
    Player.setState_(KEM.STATE.LOADING);
    Util.lsSet(KEM.LS.LOADING, songId);
    try {
      const blob = await Store.getFileBlob(songId);
      if (!blob) throw new KemError('DECODE', { name: s.name });
      const dec = await Engine.decode(blob);
      if (token !== Player.loadToken) return;
      Engine.setParams(s.pitch, s.speed);
      await Engine.load(dec.channels);
      Util.lsRemove(KEM.LS.LOADING);
      Player.idx = i; Player.songId = songId; Player.alarmActive = false;
      Player.pitch = s.pitch; Player.speed = s.speed; Player.position = 0; Player.duration = dec.durationSec;
      Player.curBytes = dec.channels.length * dec.channels[0].length * 4;
      Player.nextQueued = false;                       // アラームは処理が預かったまま（曲を読み込んでも消えない）
      Library.touchPlayed(songId, dec.durationSec, 'decoded');
      Player.setMeta_();
      Player.setState_(KEM.STATE.STOPPED);
      if (autoplay) await Player.play();
    } catch (e) {
      Util.lsRemove(KEM.LS.LOADING);
      if (token !== Player.loadToken) return;
      const err = e instanceof KemError ? e : new KemError('DECODE');
      if (!err.detail.name) err.detail.name = s.name;
      Player.songId = null; Player.idx = -1;
      Player.setState_(KEM.STATE.EMPTY);
      Player.say_(UI.errorText(err), 'error');
    }
  },

  setMeta_() {
    const s = Player.song();
    MediaCtl.setMetadata(s ? Util.stripExt(s.name) : '', Player.plan ? Player.plan.name : '');
  },

  // ---------- 再生・一時停止・停止 ----------
  async play() {
    if (Player.state === KEM.STATE.PLAYING || Player.state === KEM.STATE.LOADING) return;
    if (!Player.songId || Player.state === KEM.STATE.EMPTY) {                // 何も読み込んでいない：最後に使った編成を始める
      const id = Util.lsGet(KEM.LS.LAST_PLAN);
      const plan = (id && Plans.find(id)) || Plans.getList()[0];
      if (!plan) { Player.say_(TEXT.PLAN_NONE, 'info'); return; }
      await Player.startPlan(plan.planId, true);
      return;
    }
    if (Player.state === KEM.STATE.STOPPED && Player.finishedMsg) {          // 最後まで終わっていた：同じ編成をもう一度
      if (Player.plan) { await Player.startPlan(Player.plan.planId, true); return; }
      if (Player.songId) { await Player.playOne(Player.songId, Player.repeatOne); return; }
    }
    try { await Engine.ensureRunning_(); } catch (e) { Player.fail_(e); return; }
    MediaCtl.startSilence();
    Player.rebaseClock_();
    Engine.play();
    MediaCtl.acquireWake();
    Player.setState_(KEM.STATE.PLAYING);
  },
  pause() {
    if (Player.state !== KEM.STATE.PLAYING) return;
    Engine.pause(); MediaCtl.releaseWake();
    Player.setState_(KEM.STATE.PAUSED);
  },
  togglePlay() { return Player.state === KEM.STATE.PLAYING ? Player.pause() : Player.play(); },
  stop() {
    if (!Player.songId) return;
    Player.loadToken++;
    Engine.pause(); MediaCtl.releaseWake();
    Engine.seek(0); Player.position = 0;
    Engine.resetOut(); Player.out = 0; Engine.cancelCut(); Engine.dropNext();
    Player.finishedMsg = 'stopped';                                          // 次に再生を押すと、編成を最初から
    Player.setState_(KEM.STATE.STOPPED);
  },

  skip(delta) { Player.seekTo(Util.clamp(Player.position + delta, 0, Math.max(0, Player.duration - 0.1))); },
  seekTo(sec) {
    if (!Player.songId) return;
    Player.position = Util.clamp(sec, 0, Player.duration);
    Engine.seek(Player.position);
    Player.notify_();
  },

  // ---------- 前の曲・次の曲 ----------
  canNext() { return !!Player.plan && Player.songId && !Player.alarmActive && (Player.idx + 1 < Player.ids.length || Player.plan.method === KEM.METHOD.REPEAT || Player.timerSec > 0); },
  canPrev() { return !!Player.songId; },
  async next() {
    if (!Player.canNext()) return;
    const was = Player.state === KEM.STATE.PLAYING;
    await Player.ensureMore_(Player.idx + 1);
    if (Player.idx + 1 < Player.ids.length) await Player.loadIndex_(Player.idx + 1, was);
  },
  async prev() {
    if (!Player.songId) return;
    const was = Player.state === KEM.STATE.PLAYING;
    if (Player.position > KEM.PREV_RESTART_SEC || Player.idx <= 0 || Player.alarmActive) { Player.seekTo(0); return; }
    await Player.loadIndex_(Player.idx - 1, was);
  },

  // REPEAT・TIMER：i 番目の曲がまだ無ければ、次の1周を足す
  async ensureMore_(i) {
    if (Player.repeatOne && i >= Player.ids.length) { Player.ids = Player.ids.concat([Player.ids[Player.ids.length - 1]]); return; }   // 1曲リピート：同じ曲をもう1回
    const p = Player.plan;
    if (!p || i < Player.ids.length) return;
    if (p.method === KEM.METHOD.REPEAT || p.method === KEM.METHOD.TIMER) {
      const more = Session.more(p, Library.getList(), Player.ids[Player.ids.length - 1], null, Player.alarmId);
      if (more.length) Player.ids = Player.ids.concat(more);
    }
  },

  // ---------- 音程・速度（曲ごとに覚える） ----------
  changePitch(d) { Player.setPitch(Player.pitch + d); },
  changeSpeed(d) { Player.setSpeed(Util.roundStep(Player.speed + d, KEM.SPEED_STEP)); },
  setPitch(v) { Player.pitch = Util.clamp(Math.round(v), KEM.PITCH_MIN, KEM.PITCH_MAX); Player.applyParams_(); },
  setSpeed(v) { Player.speed = Util.clamp(Util.roundStep(v, KEM.SPEED_STEP), KEM.SPEED_MIN, KEM.SPEED_MAX); Player.applyParams_(); },
  resetParams() { Player.pitch = KEM.PITCH_DEFAULT; Player.speed = KEM.SPEED_DEFAULT; Player.applyParams_(); },
  applyParams_() {
    if (Player.songId) Engine.setParams(Player.pitch, Player.speed);
    Player.notify_();
    if (!Player.songId) return;
    clearTimeout(Player.saveTimer_);
    Player.saveTimer_ = setTimeout(() => Player.flushSave(), KEM.SAVE_DEBOUNCE_MS);
  },
  flushSave() {
    clearTimeout(Player.saveTimer_); Player.saveTimer_ = 0;
    if (Player.songId && Library.find(Player.songId)) Library.saveSettings(Player.songId, Player.pitch, Player.speed).catch(() => {});
  },

  // ---------- 位置の知らせ・先読み ----------
  onPosition_(sec, out) {
    if (Player.state !== KEM.STATE.PLAYING) return;        // 止めた後に遅れて届いた知らせは使わない
    Player.position = sec; Player.out = out;
    MediaCtl.updatePosition(sec, Player.duration, Player.speed);
    Player.preloadCheck_();
    Player.notify_();
  },

  preloadCheck_() {
    if (Player.state !== KEM.STATE.PLAYING || Player.alarmActive) return;
    // タイマーのアラーム：時間が来る PRELOAD_LEAD_SEC 秒前に預ける（次の曲の先読みとは別に預かる）
    if (Player.timerSec && Player.alarmId && !Player.alarmQueued) {
      const left = Player.timerLeft();
      if (left != null && left <= KEM.PRELOAD_LEAD_SEC) { Player.alarmQueued = true; Player.queueSong_(Player.alarmId, 'alarm'); }
    }
    if (Player.nextQueued) return;
    const remain = (Player.duration - Player.position) / (Player.speed || 1);
    if (remain > KEM.PRELOAD_LEAD_SEC) return;
    Player.nextQueued = true;
    Player.ensureMore_(Player.idx + 1).then(() => {
      const nid = Player.ids[Player.idx + 1];
      if (nid) Player.queueSong_(nid, 'main'); else Player.nextQueued = false;
    });
  },

  async queueSong_(songId, kind) {
    const s = Library.find(songId); if (!s) return;
    const token = Player.loadToken;
    try {
      const blob = await Store.getFileBlob(songId); if (!blob) return;
      const dec = await Engine.decode(blob);
      if (token !== Player.loadToken) return;
      const bytes = dec.channels.length * dec.channels[0].length * 4;
      if (Player.curBytes + (kind === 'main' ? Player.alarmBytes : 0) + bytes > KEM.PRELOAD_MAX_BYTES) { if (kind === 'main') Player.nextQueued = false; else Player.alarmQueued = false; return; }   // 重すぎる：先読みしない（曲の切れ目で読み込む）
      if (kind === 'alarm') Player.alarmBytes = bytes;
      Engine.queue(dec.channels, s.pitch, s.speed, kind);
    } catch (e) {
      if (kind === 'main') Player.nextQueued = false; else Player.alarmQueued = false;
    }
  },

  // ---------- 曲の切り替わり ----------
  handleAdvanced_(kind) {
    if (kind === 'alarm') {
      Player.alarmActive = true; Player.timerSec = 0; Player.songId = Player.alarmId;
      const s = Player.song();
      if (s) { Player.pitch = s.pitch; Player.speed = s.speed; Player.duration = s.durationSec || 0; }
      Player.position = 0; Player.setMeta_(); Player.notify_();
      return;
    }
    Player.idx++; Player.songId = Player.ids[Player.idx];
    const s = Player.song();
    if (s) { Player.pitch = s.pitch; Player.speed = s.speed; Player.duration = s.durationSec || 0; Library.touchPlayed(s.songId, null); }
    Player.position = 0; Player.nextQueued = false;
    Player.curBytes = Math.round((Player.duration || 0) * Engine.sampleRate * 2 * 4);
    Player.setMeta_(); Player.notify_();
  },

  // 曲が最後まで鳴った（先読みが間に合わなかった・最後の曲だった）
  async handleEnded_() {
    Engine.pause();
    if (Player.alarmActive || (!Player.plan && !Player.repeatOne)) { Player.finish_(Player.alarmActive ? TEXT.TIMER_DONE : TEXT.PLAN_END); return; }
    await Player.ensureMore_(Player.idx + 1);
    if (Player.idx + 1 < Player.ids.length) { await Player.loadIndex_(Player.idx + 1, true); return; }
    Player.finish_(TEXT.PLAN_END);
  },

  // タイマーの時間が来たが、預けたアラームが無かった
  handleCutNoNext_() {
    const missed = Player.plan && Player.plan.endKind !== KEM.END.NONE;
    Player.finish_(missed ? TEXT.WARN_CUT_LATE : TEXT.TIMER_DONE);
  },

  finish_(msg) {
    MediaCtl.releaseWake();
    Player.finishedMsg = msg;
    Player.setState_(KEM.STATE.STOPPED);
    Player.say_(msg, 'info');
  }
};
