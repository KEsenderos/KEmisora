// KEmisora  ui.js  版 0.1.9  基づく仕様書：KEmisora_仕様書_v0.1.9.md
// 役割：画面の表示とボタンの受付（4つのタブ：再生・編成・曲・設定）。

const UI = {
  els: {}, tab: 'play', msgTimer_: 0, raf_: 0, form: null, delArm_: {}, gridRaf_: 0,

  $(id) { return document.getElementById(id); },
  h(tag, attrs, kids) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach((c) => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  },

  init() {
    const $ = UI.$;
    { const t = $('appTitle'); t.textContent = ''; const ke = document.createElement('span'); ke.className = 'ke-orange'; ke.textContent = TEXT.APP_TITLE.slice(0, 2); t.appendChild(ke); t.appendChild(document.createTextNode(TEXT.APP_TITLE.slice(2))); }   // 「KE」はいつもオレンジ
    $('appVersion').textContent = Util.fill(TEXT.VERSION, { v: KEM.APP_VERSION });
    $('update-btn').textContent = TEXT.UPDATE_BANNER;
    $('btnStop').textContent = TEXT.BTN_STOP; $('btnReset').textContent = TEXT.BTN_RESET;
    $('pitchLabel').textContent = TEXT.LABEL_PITCH; $('speedLabel').textContent = TEXT.LABEL_SPEED;
    $('planPickTitle').textContent = TEXT.PLAN_PICK;
    $('btnPlanNew').textContent = TEXT.PLAN_NEW; $('btnImport').textContent = TEXT.BTN_IMPORT;
    $('gridHint').textContent = TEXT.GRID_HINT; $('songEmpty').textContent = TEXT.SONGS_EMPTY;
    $('btnTagAdd').textContent = TEXT.TAG_ADD;
    $('driveTitle').textContent = TEXT.SET_DRIVE; $('lblGas').textContent = TEXT.SET_GAS_URL; $('lblKey').textContent = TEXT.SET_KEY; $('lblParent').textContent = TEXT.SET_PARENT;
    $('btnConn').textContent = TEXT.BTN_SAVE_CONN; $('btnParent').textContent = TEXT.BTN_REG_PARENT;
    $('syncTitle').textContent = TEXT.SET_SYNC; $('btnSync').textContent = TEXT.BTN_SYNC;
    $('backupTitle').textContent = TEXT.SET_BACKUP; $('btnExport').textContent = TEXT.BTN_EXPORT; $('btnImportFile').textContent = TEXT.BTN_IMPORT_FILE;
    $('storageTitle').textContent = TEXT.SET_STORAGE;
    $('gasUrl').value = Util.lsGet(KEM.LS.GAS_URL) || ''; $('accessKey').value = Util.lsGet(KEM.LS.KEY) || ''; $('parentUrl').value = Util.lsGet(KEM.LS.PARENT_URL) || ''; $('syncUrl').value = Util.lsGet(KEM.LS.SYNC_FOLDER_URL) || '';
    $('songLegend').textContent = TEXT.LEGEND_SONGS; $('lblSyncPlace').textContent = TEXT.SET_SYNC_PLACE; $('btnSyncPlace').textContent = TEXT.BTN_SYNC_PLACE;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.textContent = { play: TEXT.TAB_PLAY, plan: TEXT.TAB_PLAN, song: TEXT.TAB_SONG, set: TEXT.TAB_SET }[b.dataset.tab];
      b.addEventListener('click', () => UI.showTab(b.dataset.tab));
    });
    UI.bindPress_();
    UI.bindPlay_(); UI.bindPlan_(); UI.bindSong_(); UI.bindSet_();
    Player.onChange = () => { UI.updateStopPop_(); UI.onPlayerChange_(); };
    UI.$('spStop').addEventListener('click', () => { Player.stop(); UI.updateStopPop_(); });
    Player.onMessage = (t, k) => UI.showMessage(t, k);
  },

  // ---------- 共通 ----------
  bindPress_() {
    const rel = (el) => setTimeout(() => el.classList.remove('pressed'), KEM.PRESS_HOLD_MS);
    document.addEventListener('pointerdown', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && !b.disabled) { b.classList.add('pressed'); b.__pd = Date.now(); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => document.addEventListener(n, (e) => { const b = e.target.closest && e.target.closest('button'); if (b) rel(b); }, true));
  },

  showTab(t) {
    UI.tab = t;
    document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.dataset.tab !== t; });
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'plan') UI.renderPlans();
    if (t === 'song') UI.renderSongs();
    if (t === 'set') UI.renderSettings();
    if (t === 'play') UI.render();
    window.scrollTo(0, 0);
  },

  showMessage(text, kind) {
    const m = UI.$('msgArea'); clearTimeout(UI.msgTimer_);
    m.textContent = text; m.className = 'msg-area ' + (kind === 'error' ? 'error' : 'info'); m.hidden = false;
    if (kind !== 'error') UI.msgTimer_ = setTimeout(() => UI.hideMessage(), KEM.MESSAGE_HIDE_MS);
  },
  hideMessage() { UI.$('msgArea').hidden = true; },
  errorText(err, name) {
    const e = err instanceof KemError ? err : new KemError('UNKNOWN');
    const d = Object.assign({}, e.detail || {});
    if (name) d.name = name;
    if (d.sec != null) d.min = (d.sec / 60).toFixed(1);
    d.max = d.max != null ? d.max : (e.code === 'TOO_LONG' ? KEM.MAX_DURATION_SEC / 60 : (e.code === 'LIB_FULL' ? KEM.LIBRARY_MAX : e.code === 'TAG_FULL' ? KEM.TAG_MAX : e.code === 'PLAN_FULL' ? KEM.PLAN_MAX : KEM.MAX_FILE_BYTES / 1048576));
    d.n = KEM.NAME_MAX; d.code = e.code;
    const t = TEXT['ERR_' + e.code];
    return t ? Util.fill(t, d) : Util.fill(TEXT.ERR_UNKNOWN, d);
  },
  showError(err, name) { UI.showMessage(UI.errorText(err, name), 'error'); },
  showUpdateBanner() { UI.$('update-btn').hidden = false; },
  setAddEnabled(on) { ['btnImport', 'btnTagAdd', 'btnPlanNew'].forEach((id) => { UI.$(id).disabled = !on; }); },

  async guard_(fn) {
    try { await fn(); } catch (e) { UI.showError(e); }
  },

  // ---------- 再生タブ ----------
  bindPlay_() {
    const $ = UI.$;
    $('btnPlay').addEventListener('click', () => UI.guard_(() => Player.togglePlay()));
    $('btnStop').addEventListener('click', () => Player.stop());
    $('btnPrev').addEventListener('click', () => UI.guard_(() => Player.prev()));
    $('btnNext').addEventListener('click', () => UI.guard_(() => Player.next()));
    $('btnBack').addEventListener('click', () => Player.skip(-KEM.SKIP_SEC));
    $('btnFwd').addEventListener('click', () => Player.skip(KEM.SKIP_SEC));
    $('btnReset').addEventListener('click', () => Player.resetParams());
    $('btnPitchDown').addEventListener('click', () => Player.changePitch(-KEM.PITCH_STEP));
    $('btnPitchUp').addEventListener('click', () => Player.changePitch(KEM.PITCH_STEP));
    $('btnSpeedDown').addEventListener('click', () => Player.changeSpeed(-KEM.SPEED_STEP));
    $('btnSpeedUp').addEventListener('click', () => Player.changeSpeed(KEM.SPEED_STEP));
    $('pitchSlider').addEventListener('input', (e) => Player.setPitch(Number(e.target.value)));
    $('speedSlider').addEventListener('input', (e) => Player.setSpeed(Number(e.target.value)));
    const seek = $('seekBar');
    seek.addEventListener('input', () => { UI.seeking_ = true; $('timeCur').textContent = Util.formatTime(Number(seek.value) / 1000 * Player.duration); UI.setFill_(seek); });
    seek.addEventListener('change', () => { UI.seeking_ = false; Player.seekTo(Number(seek.value) / 1000 * Player.duration); });
  },

  // 終わりの時間が来たとき（目覚まし＝アラーム曲に切り替わったとき／タイマー＝ラストの曲に入ったとき）、大きな停止ボタンを出す
  updateStopPop_() {
    const P = Player, S = KEM.STATE, pop = UI.$('stopPop');
    let kind = null;
    if (P.plan && (P.state === S.PLAYING || P.state === S.PAUSED || P.state === S.LOADING)) {
      if (P.plan.method === KEM.METHOD.TIMER && P.alarmActive) kind = 'alarm';
      else if (P.plan.method === KEM.METHOD.TIME && P.plan.endKind !== KEM.END.NONE && P.ids.length > 1 && P.idx === P.ids.length - 1) kind = 'last';
    }
    if (!kind) { pop.hidden = true; return; }
    const s = P.song();
    UI.$('spTitle').textContent = kind === 'alarm' ? TEXT.STOP_POP_ALARM : TEXT.STOP_POP_LAST;
    UI.$('spSong').textContent = s ? Util.stripExt(s.name) : '';
    UI.$('spStop').textContent = TEXT.BTN_STOP_BIG;
    pop.hidden = false;
  },
  onPlayerChange_() {
    if (UI.tab !== 'play') { if (UI.tab === 'song') UI.renderGridNow_(); return; }
    if (UI.raf_) return;
    UI.raf_ = requestAnimationFrame(() => { UI.raf_ = 0; UI.render(); });
  },

  setFill_(el) {
    if (!el) return;
    const min = Number(el.min), max = Number(el.max), v = Number(el.value);
    el.style.setProperty('--fill', Util.clamp(max > min ? ((v - min) / (max - min)) * 100 : 0, 0, 100).toFixed(2) + '%');
  },

  render() {
    const P = Player, S = KEM.STATE, $ = UI.$;
    const song = P.song(), st = P.state;
    const busy = st === S.LOADING, has = !!P.songId && st !== S.EMPTY;
    $('nowTitle').textContent = st === S.LOADING ? TEXT.NOW_LOADING : (song ? (P.alarmActive ? Util.fill(TEXT.NOW_ALARM, { name: Util.stripExt(song.name) }) : Util.stripExt(song.name)) : TEXT.NOW_NONE);
    const left = P.timerLeft();
    const sub = $('nowSub');
    if (left != null) { sub.textContent = Util.fill(TEXT.TIMER_LEFT, { t: Util.formatTime(left) }); sub.className = 'now-sub timer'; }
    else { sub.textContent = P.plan ? P.plan.name : ''; sub.className = 'now-sub'; }
    $('iconPlay').style.display = st === S.PLAYING ? 'none' : ''; $('iconPause').style.display = st === S.PLAYING ? '' : 'none';
    $('btnPlay').setAttribute('aria-label', st === S.PLAYING ? TEXT.BTN_PAUSE : TEXT.BTN_PLAY);
    $('btnPlay').disabled = busy;
    $('btnStop').disabled = !has || busy; $('btnBack').disabled = !has || busy; $('btnFwd').disabled = !has || busy;
    $('btnPrev').disabled = !P.canPrev() || busy; $('btnNext').disabled = !P.canNext() || busy;
    $('seekBar').disabled = !has || busy;
    $('btnPitchDown').disabled = P.pitch <= KEM.PITCH_MIN; $('btnPitchUp').disabled = P.pitch >= KEM.PITCH_MAX;
    $('btnSpeedDown').disabled = P.speed <= KEM.SPEED_MIN + 1e-9; $('btnSpeedUp').disabled = P.speed >= KEM.SPEED_MAX - 1e-9;
    $('pitchValue').textContent = Util.formatPitch(P.pitch); $('speedValue').textContent = Util.formatSpeed(P.speed);
    const ps = $('pitchSlider'), ss = $('speedSlider');
    ps.min = KEM.PITCH_MIN; ps.max = KEM.PITCH_MAX; ps.value = P.pitch; ss.min = KEM.SPEED_MIN; ss.max = KEM.SPEED_MAX; ss.value = P.speed;
    UI.setFill_(ps); UI.setFill_(ss);
    $('timeTotal').textContent = has ? Util.formatTime(P.duration) : '--:--';
    if (!UI.seeking_) {
      $('timeCur').textContent = Util.formatTime(P.position);
      $('seekBar').value = P.duration > 0 ? Math.round(Util.clamp(P.position / P.duration, 0, 1) * 1000) : 0;
      UI.setFill_($('seekBar'));
    }
    UI.renderPlanPick_();
  },

  renderPlanPick_() {
    const box = UI.$('planPick'), plans = Plans.getList();
    const key = JSON.stringify([plans.map((p) => [p.planId, p.name, p.updatedAt]), Util.lsGet(KEM.LS.LAST_PLAN), Library.getList().length, Tags.getList().length]);
    if (UI.pickKey_ === key) return; UI.pickKey_ = key;
    box.textContent = '';
    if (!plans.length) { box.appendChild(UI.h('p', { class: 'hint', text: TEXT.PLAN_NONE })); return; }
    const last = Util.lsGet(KEM.LS.LAST_PLAN);
    plans.forEach((p) => {
      const bad = Plans.validate(p, Library.getList(), Tags.getList());
      const card = UI.h('div', { class: 'plan-card' + (p.planId === last ? ' last' : '') }, [
        UI.h('div', { class: 'pc-name' }, [p.name, bad.length ? UI.h('span', { class: 'badge-bad', text: TEXT.PLAN_BAD }) : null]),
        UI.h('div', { class: 'pc-sum', text: Plans.summary(p, Tags.getList()) })
      ]);
      card.addEventListener('click', () => { UI.hideMessage(); UI.guard_(() => Player.startPlan(p.planId, true)); });
      box.appendChild(card);
    });
  },

  // ---------- 編成タブ ----------
  bindPlan_() {
    UI.$('btnPlanNew').addEventListener('click', () => UI.openPlanForm_(Plans.blank()));
  },

  renderPlans() {
    const list = UI.$('planList'), plans = Plans.getList(), songs = Library.getList(), tags = Tags.getList();
    UI.$('planListTitle').textContent = Util.fill('編成（{n}/{max}）', { n: plans.length, max: KEM.PLAN_MAX });
    list.textContent = '';
    if (!plans.length) list.appendChild(UI.h('p', { class: 'hint', text: TEXT.PLAN_NONE }));
    plans.forEach((p, i) => {
      const bad = Plans.validate(p, songs, tags);
      const del = UI.h('button', { class: 'btn-del', type: 'button', text: TEXT.BTN_DELETE });
      del.addEventListener('click', () => UI.armDelete_(del, 'plan' + p.planId, () => UI.guard_(async () => { await Plans.remove(p.planId); UI.renderPlans(); UI.pickKey_ = null; })));
      const up = UI.h('button', { class: 'btn-ghost', type: 'button', 'aria-label': TEXT.BTN_UP, text: '▲' });
      const dn = UI.h('button', { class: 'btn-ghost', type: 'button', 'aria-label': TEXT.BTN_DOWN, text: '▼' });
      up.disabled = i === 0; dn.disabled = i === plans.length - 1;
      up.addEventListener('click', () => UI.guard_(async () => { await Plans.move(p.planId, -1); UI.pickKey_ = null; UI.renderPlans(); }));
      dn.addEventListener('click', () => UI.guard_(async () => { await Plans.move(p.planId, 1); UI.pickKey_ = null; UI.renderPlans(); }));
      const ed = UI.h('button', { class: 'btn-ghost', type: 'button', text: TEXT.BTN_EDIT });
      ed.addEventListener('click', () => UI.openPlanForm_(JSON.parse(JSON.stringify(p))));
      list.appendChild(UI.h('div', { class: 'plan-card' }, [
        UI.h('div', { class: 'pc-name' }, [p.name, bad.length ? UI.h('span', { class: 'badge-bad', text: TEXT.PLAN_BAD }) : null]),
        UI.h('div', { class: 'pc-sum', text: Plans.summary(p, tags) }),
        bad.length ? UI.h('div', { class: 'pc-bad', text: bad.map(Plans.badText).join('／') }) : null,
        UI.h('div', { class: 'pc-btns' }, [up, dn, ed, del])
      ]));
    });
  },

  // 2回押すと実行する（押し間違い防止）
  armDelete_(btn, key, fn) {
    if (UI.delArm_[key]) { clearTimeout(UI.delArm_[key]); delete UI.delArm_[key]; fn(); return; }
    btn.classList.add('armed'); btn.textContent = TEXT.BTN_DELETE_CONFIRM;
    UI.delArm_[key] = setTimeout(() => { delete UI.delArm_[key]; btn.classList.remove('armed'); btn.textContent = TEXT.BTN_DELETE; }, KEM.DELETE_CONFIRM_MS);
  },

  openPlanForm_(form) {
    UI.form = form; UI.renderPlanForm_();
    UI.$('planForm').hidden = false; UI.$('planForm').scrollIntoView({ block: 'start' });
  },
  closePlanForm_() { UI.$('planForm').hidden = true; UI.form = null; },

  chips_(tags, selected, onToggle) {
    const wrap = UI.h('div', { class: 'chips' });
    if (!tags.length) wrap.appendChild(UI.h('span', { class: 'hint', text: TEXT.TAGS_EMPTY }));
    tags.forEach((t) => {
      const c = UI.h('button', { type: 'button', class: 'chip' + (selected.indexOf(t.tagId) >= 0 ? ' on' : ''), text: t.name });
      c.addEventListener('click', () => { onToggle(t.tagId); });
      wrap.appendChild(c);
    });
    return wrap;
  },
  toggleIn_(arr, id) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); },

  renderPlanForm_() {
    const f = UI.form, box = UI.$('planForm'), tags = Tags.getList(), songs = Library.getList();
    if (!f) return;
    box.textContent = '';
    const num = (key, min, max) => { const i = UI.h('input', { type: 'number', inputmode: 'numeric', min: String(min), max: String(max), value: String(f[key]) }); i.addEventListener('input', () => { f[key] = Number(i.value); }); return i; };
    const sel = (opts, cur, on) => { const s = UI.h('select', {}, opts.map((o) => UI.h('option', { value: o[0], text: o[1] }))); s.value = cur; s.addEventListener('change', () => on(s.value)); return s; };
    const name = UI.h('input', { class: 'text', type: 'text', value: f.name, maxlength: '24' }); name.addEventListener('input', () => { f.name = name.value; });
    box.appendChild(UI.h('h2', { class: 'h2', text: f.planId ? TEXT.PLAN_EDIT : TEXT.PLAN_NEW }));
    box.appendChild(UI.h('label', { class: 'lbl', text: Util.fill(TEXT.FORM_NAME, { n: KEM.NAME_MAX }) })); box.appendChild(name);
    box.appendChild(UI.h('label', { class: 'lbl', text: TEXT.FORM_METHOD }));
    const ms = UI.h('div', { class: 'methods' });
    KEM.METHOD_ORDER.forEach((m) => { const c = UI.h('button', { type: 'button', class: 'chip' + (f.method === m ? ' on' : ''), text: TEXT.METHOD_NAME[m] }); c.addEventListener('click', () => { f.method = m; if (m === KEM.METHOD.TIMER && !f.endClock) f.endClock = '12:00'; UI.renderPlanForm_(); }); ms.appendChild(c); });
    box.appendChild(ms); box.appendChild(UI.h('p', { class: 'help', text: TEXT.METHOD_HELP[f.method] }));
    box.appendChild(UI.h('label', { class: 'lbl', text: TEXT.FORM_TAGS + '（' + TEXT.TAGS_ALL_SONGS + '：選ばない）' }));
    box.appendChild(UI.chips_(tags, f.mainTagIds, (id) => { UI.toggleIn_(f.mainTagIds, id); UI.renderPlanForm_(); }));
    box.appendChild(UI.h('label', { class: 'lbl', text: TEXT.FORM_MATCH }));
    box.appendChild(sel([['ANY', TEXT.MATCH_ANY], ['ALL', TEXT.MATCH_ALL]], f.mainMatch, (v) => { f.mainMatch = v; }));
    if (f.method === KEM.METHOD.PICK) { box.appendChild(UI.h('label', { class: 'lbl', text: TEXT.FORM_COUNT + '（' + KEM.COUNT_MIN + '〜' + KEM.COUNT_MAX + '）' })); box.appendChild(num('count', KEM.COUNT_MIN, KEM.COUNT_MAX)); }
    if (f.method === KEM.METHOD.TIME || f.method === KEM.METHOD.TIMER) {
      if (f.method === KEM.METHOD.TIMER) {
        box.appendChild(UI.h('label', { class: 'lbl', text: TEXT.FORM_CLOCK }));
        const ti = UI.h('input', { type: 'time', id: 'endClock', value: f.endClock }); ti.addEventListener('input', () => { f.endClock = ti.value; });
        box.appendChild(ti);
      } else {
        box.appendChild(UI.h('label', { class: 'lbl', text: TEXT.FORM_MIN + '（' + KEM.PLAN_MIN_MIN + '〜' + KEM.PLAN_MAX_MIN + '）' })); box.appendChild(num('durationMin', KEM.PLAN_MIN_MIN, KEM.PLAN_MAX_MIN));
      }
      box.appendChild(UI.h('label', { class: 'lbl', text: TEXT.FORM_END }));
      box.appendChild(sel([['NONE', TEXT.END_NONE], ['TAGS', TEXT.END_TAGS], ['SONG', TEXT.END_SONG]], f.endKind, (v) => { f.endKind = v; UI.renderPlanForm_(); }));
      if (f.endKind === KEM.END.TAGS) {
        box.appendChild(UI.chips_(tags, f.endTagIds, (id) => { UI.toggleIn_(f.endTagIds, id); UI.renderPlanForm_(); }));
        box.appendChild(sel([['ANY', TEXT.MATCH_ANY], ['ALL', TEXT.MATCH_ALL]], f.endMatch, (v) => { f.endMatch = v; }));
      } else if (f.endKind === KEM.END.SONG) {
        const opts = [['', '—']].concat(songs.map((s) => [s.songId, Util.stripExt(s.name)]));
        box.appendChild(sel(opts, f.endSongId || '', (v) => { f.endSongId = v || null; }));
      }
    }
    const save = UI.h('button', { class: 'btn-main', type: 'button', text: TEXT.BTN_SAVE });
    save.addEventListener('click', () => UI.guard_(async () => {
      await Plans.save(f); UI.pickKey_ = null; UI.closePlanForm_(); UI.renderPlans(); UI.showMessage(TEXT.INFO_PLAN_SAVED, 'info');
    }));
    const cancel = UI.h('button', { class: 'btn-ghost', type: 'button', text: TEXT.BTN_CANCEL, style: 'width:100%;margin-top:8px' });
    cancel.addEventListener('click', () => UI.closePlanForm_());
    box.appendChild(save); box.appendChild(cancel);
  },

  // ---------- 曲タブ ----------
  bindSong_() {
    UI.$('btnImport').addEventListener('click', () => UI.toggleImport_());
    UI.$('gridWrap').addEventListener('scroll', () => UI.scheduleGrid_());
    UI.songFilter_ = null;
    UI.songSort_ = Util.lsGet(KEM.LS.SONG_SORT) === 'name' ? 'name' : 'added';
    UI.$('repSwitch').checked = Util.lsGet(KEM.LS.REPEAT_ONE) === '1'; UI.paintRepeat_();
    UI.$('repSwitch').addEventListener('change', () => { Util.lsSet(KEM.LS.REPEAT_ONE, UI.$('repSwitch').checked ? '1' : '0'); UI.paintRepeat_(); });
    UI.$('gridInner').addEventListener('click', (e) => {
      const th = e.target.closest('[data-filter],[data-sort]');
      if (th) { if (th.dataset.sort) UI.setSort_(UI.songSort_ === 'name' ? 'added' : 'name'); else UI.setFilter_(UI.songFilter_ === th.dataset.filter ? null : th.dataset.filter); return; }
      const c = e.target.closest('[data-cell]'), n = e.target.closest('[data-play]'), d = e.target.closest('[data-del]');
      if (c) { const [sid, tid] = c.dataset.cell.split('\u0001'); UI.guard_(async () => { await Library.toggleTag(sid, tid); UI.renderGridRows_(); }); }
      else if (d) UI.deleteSong_(d);
      else if (n) { UI.hideMessage(); UI.guard_(() => Player.playOne(n.dataset.play, UI.$('repSwitch').checked).then(() => UI.showTab('play'))); }
    });
  },

  paintRepeat_() { UI.$('repLabel').textContent = TEXT.REPEAT_ONE; UI.$('repState').textContent = UI.$('repSwitch').checked ? TEXT.REPEAT_ONE_ON : TEXT.REPEAT_ONE_OFF; },

  // 表に出す曲（属性で絞り込み中なら、その属性が付いた曲だけ）
  gridSongs_() {
    const id = UI.songFilter_;
    let list = Library.getList();
    if (id && !Tags.find(id)) UI.songFilter_ = null;
    else if (id) list = list.filter((s) => s.tagIds.indexOf(id) >= 0);
    if (UI.songSort_ === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja') || (b.addedAt - a.addedAt));
    return list;   // 登録順は Library.getList() のまま（新しく取り込んだ曲が上）
  },
  setSort_(mode) {
    UI.songSort_ = mode === 'name' ? 'name' : 'added';
    Util.lsSet(KEM.LS.SONG_SORT, UI.songSort_);
    UI.$('gridWrap').scrollTop = 0;
    UI.renderSongs();
  },
  setFilter_(id) {
    UI.songFilter_ = id || null;
    UI.$('gridWrap').scrollTop = 0;
    UI.renderSongs();
  },

  // 曲を端末から削除（2回押し。ドライブのファイルは消えない。再生中は不可）
  deleteSong_(btn) {
    const st = Player.state;
    if (st === KEM.STATE.PLAYING || st === KEM.STATE.PAUSED || st === KEM.STATE.LOADING) { UI.showMessage(TEXT.BUSY_HINT, 'error'); return; }
    const id = btn.dataset.del, key = 'song' + id;
    if (UI.delArm_[key]) {
      clearTimeout(UI.delArm_[key]); delete UI.delArm_[key];
      UI.guard_(async () => { await Library.remove(id); UI.renderSongs(); UI.showMessage(TEXT.INFO_SONG_DELETED, 'info'); });
      return;
    }
    btn.classList.add('armed'); btn.textContent = TEXT.BTN_DELETE_CONFIRM_SHORT;
    UI.delArm_[key] = setTimeout(() => { delete UI.delArm_[key]; btn.classList.remove('armed'); btn.textContent = '🗑'; }, KEM.DELETE_CONFIRM_MS);
  },

  async toggleImport_() {
    const p = UI.$('importPanel');
    if (!p.hidden) { p.hidden = true; return; }
    p.hidden = false; p.textContent = '';
    p.appendChild(UI.h('p', { class: 'hint', text: '…' }));
    try {
      const folders = await DriveImport.children();
      p.textContent = '';
      if (!folders.length) p.appendChild(UI.h('p', { class: 'hint', text: '親フォルダの直下にフォルダがありません' }));
      const last = Util.lsGet(KEM.LS.LAST_CHILD);
      folders.forEach((f) => {
        const b = UI.h('button', { class: 'btn-ghost', type: 'button', style: 'width:100%;margin-top:8px;text-align:left' + (f.folderId === last ? ';border-color:var(--accent)' : ''), text: f.name });
        b.addEventListener('click', () => UI.runImport_(f.folderId));
        p.appendChild(b);
      });
      p.appendChild(UI.h('div', { id: 'importProg', class: 'hint' }));
    } catch (e) { p.hidden = true; UI.showError(e); }
  },

  async runImport_(folderId) {
    Util.lsSet(KEM.LS.LAST_CHILD, folderId);
    const prog = UI.$('importProg');
    UI.$('importPanel').querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const r = await DriveImport.run(folderId, (t) => { prog.textContent = t; });
      UI.showMessage(Util.fill(TEXT.INFO_IMPORTED, { n: r.added, s: r.skipped, f: r.failed }) + (r.errors.length ? '\n' + r.errors.slice(0, 5).join('\n') : ''), r.failed ? 'error' : 'info');
      if (!Util.lsGet(KEM.LS.PERSIST_ASKED)) { Util.lsSet(KEM.LS.PERSIST_ASKED, '1'); try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* 続行 */ } }
      UI.$('importPanel').hidden = true;
      UI.renderSongs();
    } catch (e) { UI.showError(e); UI.$('importPanel').querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  },

  renderSongs() {
    const songs = Library.getList();
    UI.$('songTitle').textContent = Util.fill(TEXT.SONGS_TITLE, { n: songs.length, max: KEM.LIBRARY_MAX });
    UI.$('songEmpty').hidden = songs.length > 0; UI.$('gridWrap').hidden = songs.length === 0; UI.$('gridHint').hidden = songs.length === 0;
    const shown = UI.gridSongs_(), fi = UI.$('filterInfo');
    fi.hidden = !UI.songFilter_;
    if (UI.songFilter_) fi.textContent = shown.length ? Util.fill(TEXT.FILTER_ON, { name: Tags.nameOf(UI.songFilter_), n: shown.length }) : TEXT.FILTER_EMPTY;
    UI.renderGrid_();
  },

  renderGrid_() {
    const tags = Tags.getList(), songs = UI.gridSongs_(), inner = UI.$('gridInner');
    const W = KEM.NAME_COL_W + tags.length * KEM.TAG_COL_W, H = 52 + songs.length * KEM.ROW_H;
    inner.style.width = Math.max(W, UI.$('gridWrap').clientWidth || 0) + 'px'; inner.style.height = H + 'px';
    UI.gridW_ = W;
    inner.textContent = '';
    const head = UI.h('div', { class: 'g-head', style: 'width:' + W + 'px' });
    head.appendChild(UI.h('div', { class: 'g-name tap sort-btn', 'data-sort': '1', role: 'button', style: 'width:' + KEM.NAME_COL_W + 'px' }, [UI.h('span', { text: '並び：' + (UI.songSort_ === 'name' ? TEXT.SORT_NAME : TEXT.SORT_ADDED) + ' ⇅' })]));
    tags.forEach((t) => head.appendChild(UI.h('div', { class: 'g-th tap' + (UI.songFilter_ === t.tagId ? ' active' : ''), 'data-filter': t.tagId, style: 'width:' + KEM.TAG_COL_W + 'px', text: t.name })));
    inner.appendChild(head);
    UI.gridRows_ = UI.h('div', { style: 'position:absolute;left:0;top:52px;width:' + W + 'px;height:' + (songs.length * KEM.ROW_H) + 'px' });
    inner.appendChild(UI.gridRows_);
    UI.renderGridRows_();
  },

  scheduleGrid_() { if (UI.gridRaf_) return; UI.gridRaf_ = requestAnimationFrame(() => { UI.gridRaf_ = 0; UI.renderGridRows_(); }); },

  // 見えている行だけを描く（300曲でも軽い）
  renderGridRows_() {
    const box = UI.gridRows_; if (!box) return;
    const wrap = UI.$('gridWrap'), songs = UI.gridSongs_(), tags = Tags.getList();
    const top = Math.max(0, wrap.scrollTop - 52), vh = wrap.clientHeight || 500;
    const a = Math.max(0, Math.floor(top / KEM.ROW_H) - 4), b = Math.min(songs.length, Math.ceil((top + vh) / KEM.ROW_H) + 4);
    box.textContent = '';
    const W = UI.gridW_;
    for (let i = a; i < b; i++) {
      const s = songs[i];
      const nTags = tags.filter((t) => s.tagIds.indexOf(t.tagId) >= 0).length;
      const row = UI.h('div', { class: 'g-row' + (nTags === 0 ? ' unset' : nTags === 2 ? ' two' : ''), style: 'top:' + (i * KEM.ROW_H) + 'px;width:' + W + 'px' });
      const armed = !!UI.delArm_['song' + s.songId];
      row.appendChild(UI.h('div', { class: 'g-name', style: 'width:' + KEM.NAME_COL_W + 'px' }, [
        UI.h('button', { class: 'g-play', type: 'button', 'data-play': s.songId }, [UI.h('span', { text: Util.stripExt(s.name) })]),
        UI.h('button', { class: 'g-del' + (armed ? ' armed' : ''), type: 'button', 'data-del': s.songId, 'aria-label': TEXT.BTN_DELETE_SONG, text: armed ? TEXT.BTN_DELETE_CONFIRM_SHORT : '🗑' })]));
      tags.forEach((t) => {
        const on = s.tagIds.indexOf(t.tagId) >= 0;
        row.appendChild(UI.h('button', { class: 'g-cell ' + (on ? 'on' : 'off'), type: 'button', style: 'width:' + KEM.TAG_COL_W + 'px', 'data-cell': s.songId + '\u0001' + t.tagId, 'aria-pressed': on ? 'true' : 'false', text: on ? '✓' : '' }));
      });
      box.appendChild(row);
    }
  },
  renderGridNow_() { /* 曲タブでは再生の状態表示は行わない */ },

  // ---------- 設定タブ ----------
  bindSet_() {
    const $ = UI.$;
    $('btnTagAdd').addEventListener('click', () => UI.guard_(async () => { await Tags.add($('tagNew').value); $('tagNew').value = ''; UI.renderSettings(); UI.pickKey_ = null; }));
    $('btnConn').addEventListener('click', () => UI.guard_(async () => {
      Util.lsSet(KEM.LS.GAS_URL, $('gasUrl').value.trim()); Util.lsSet(KEM.LS.KEY, $('accessKey').value.trim());
      const s = await Drive.status();
      UI.$('connState').textContent = s.hasParent ? Util.fill(TEXT.INFO_CONN_OK, { p: s.parentName }) : TEXT.INFO_CONN_NOPARENT;
    }));
    $('btnParent').addEventListener('click', () => UI.guard_(async () => {
      const id = Util.folderIdFromUrl($('parentUrl').value);
      if (!id) throw new KemError('BAD_URL');
      const r = await Drive.setParent(id);
      Util.lsSet(KEM.LS.PARENT_URL, $('parentUrl').value.trim());
      UI.$('connState').textContent = TEXT.INFO_PARENT_SET + '：' + (r.parentName || '');
    }));
    $('btnSyncPlace').addEventListener('click', () => UI.guard_(async () => {
      const raw = $('syncUrl').value.trim();
      if (!raw) { Util.lsRemove(KEM.LS.SYNC_FOLDER); Util.lsRemove(KEM.LS.SYNC_FOLDER_URL); UI.showMessage(TEXT.INFO_SYNC_PLACE_PARENT, 'info'); return; }
      const id = Util.folderIdFromUrl(raw);
      if (!id) throw new KemError('BAD_URL');
      Util.lsSet(KEM.LS.SYNC_FOLDER, id); Util.lsSet(KEM.LS.SYNC_FOLDER_URL, raw);
      try { await Drive.getSync(); } catch (e) { Util.lsRemove(KEM.LS.SYNC_FOLDER); Util.lsRemove(KEM.LS.SYNC_FOLDER_URL); throw e; }   // 使えない場所なら保存しない
      UI.showMessage(TEXT.INFO_SYNC_PLACE_SET + raw.slice(0, 40), 'info');
    }));
    $('btnSync').addEventListener('click', () => UI.guard_(async () => { await Sync.run(true); UI.showMessage(TEXT.INFO_SYNCED, 'info'); UI.renderSettings(); }));
    $('btnExport').addEventListener('click', () => UI.guard_(async () => { await Backup.download(); UI.showMessage(TEXT.INFO_BACKUP_OUT, 'info'); UI.renderSettings(); }));
    $('btnImportFile').addEventListener('click', () => $('backupFile').click());
    $('backupFile').addEventListener('change', (e) => UI.guard_(async () => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      await Backup.importText(await f.text()); UI.pickKey_ = null; UI.showMessage(TEXT.INFO_BACKUP_IN, 'info'); UI.renderSettings();
    }));
    Sync.onDone = () => { if (UI.tab === 'set') UI.renderSettings(); UI.pickKey_ = null; if (UI.tab === 'play') UI.render(); };
  },

  async renderSettings() {
    const tags = Tags.getList(), list = UI.$('tagList');
    UI.$('tagTitle').textContent = Util.fill(TEXT.TAGS_TITLE, { n: tags.length, max: KEM.TAG_MAX });
    list.textContent = '';
    if (!tags.length) list.appendChild(UI.h('p', { class: 'hint', text: TEXT.TAGS_EMPTY }));
    tags.forEach((t, i) => {
      const up = UI.h('button', { class: 'btn-ghost', type: 'button', 'aria-label': TEXT.BTN_UP, text: '▲' });
      const dn = UI.h('button', { class: 'btn-ghost', type: 'button', 'aria-label': TEXT.BTN_DOWN, text: '▼' });
      up.disabled = i === 0; dn.disabled = i === tags.length - 1;
      up.addEventListener('click', () => UI.guard_(async () => { await Tags.move(t.tagId, -1); UI.pickKey_ = null; UI.renderSettings(); }));
      dn.addEventListener('click', () => UI.guard_(async () => { await Tags.move(t.tagId, 1); UI.pickKey_ = null; UI.renderSettings(); }));
      const ren = UI.h('button', { class: 'btn-ghost', type: 'button', text: TEXT.TAG_RENAME });
      ren.addEventListener('click', () => { const n = window.prompt(TEXT.TAG_RENAME, t.name); if (n != null) UI.guard_(async () => { await Tags.rename(t.tagId, n); UI.renderSettings(); UI.pickKey_ = null; }); });
      const del = UI.h('button', { class: 'btn-del', type: 'button', text: TEXT.BTN_DELETE });
      del.addEventListener('click', () => UI.armDelete_(del, 'tag' + t.tagId, () => UI.guard_(async () => { await Tags.remove(t.tagId); UI.renderSettings(); UI.pickKey_ = null; })));
      list.appendChild(UI.h('div', { class: 'tag-row' }, [UI.h('span', { class: 'tn', text: t.name }), up, dn, ren, del]));
    });
    const last = Number(Util.lsGet(KEM.LS.LAST_SYNC) || 0);
    UI.$('syncState').textContent = last ? '最後の同期：' + new Date(last).toLocaleString('ja-JP') : '同期はまだしていません';
    const w = Backup.warning();
    const lb = Number(Util.lsGet(KEM.LS.LAST_BACKUP) || 0);
    UI.$('backupState').textContent = (lb ? '最後の書き出し：' + new Date(lb).toLocaleDateString('ja-JP') : '') + (w ? (lb ? '\n' : '') + w : '');
    const est = await Store.estimate();
    UI.$('storageState').textContent = '曲 ' + Library.getList().length + '/' + KEM.LIBRARY_MAX + '曲' + (est && est.usage != null ? '　使用 ' + Math.round(est.usage / 1048576) + 'MB' + (est.quota ? ' / 上限の目安 ' + Math.round(est.quota / 1048576) + 'MB' : '') : '');
  }
};
