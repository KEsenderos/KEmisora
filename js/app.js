// KEmisora  app.js  版 0.1.8  基づく仕様書：KEmisora_仕様書_v0.1.8.md
// 役割：起動の順番、更新のお知らせ（ルールブック3-12）、前面に戻ったときの処理。

const App = {
  swReg: null, lastUpdateCheck: 0, updateRequested: false,

  async start() {
    UI.init();
    const ok = await Store.open();
    if (!ok) { UI.showError(new KemError('DB')); UI.setAddEnabled(false); }
    if (ok) {
      await Promise.all([Library.refresh(), Tags.refresh(), Plans.refresh()]);
      App.checkLoadingFlag_();
    }
    Player.init();
    MediaCtl.init();
    UI.render();
    UI.showTab('play');
    const w = ok ? Backup.warning() : '';
    if (w && !document.getElementById('msgArea').textContent) UI.showMessage(w, 'info');
    App.initUpdateNotice();
    document.addEventListener('visibilitychange', () => App.onVisibility_());
    window.addEventListener('pagehide', () => Player.flushSave());
    if (ok) Sync.auto('launch');
  },

  // 前回、曲の読み込み中に落ちたかの確認
  checkLoadingFlag_() {
    const id = Util.lsGet(KEM.LS.LOADING);
    if (!id) return;
    Util.lsRemove(KEM.LS.LOADING);
    const s = Library.find(id);
    UI.showMessage(Util.fill(TEXT.INFO_CRASHED, { name: s ? Util.stripExt(s.name) : id }), 'error');
  },

  onVisibility_() {
    if (document.visibilityState === 'hidden') { Player.flushSave(); return; }
    App.checkForUpdate();
    Sync.auto('foreground');
    if (Player.state === KEM.STATE.PLAYING) MediaCtl.acquireWake();
  },

  // ---------- 更新のお知らせ（ルールブック3-12のサンプルどおり） ----------
  async initUpdateNotice() {
    if (!('serviceWorker' in navigator)) return;
    try { App.swReg = await navigator.serviceWorker.register('./sw.js'); } catch (e) { return; }
    App.lastUpdateCheck = Date.now();
    const reg = App.swReg;
    if (reg.waiting && navigator.serviceWorker.controller) UI.showUpdateBanner();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) UI.showUpdateBanner(); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!App.updateRequested) return; App.updateRequested = false; location.reload(); });
    document.getElementById('update-btn').addEventListener('click', () => App.applyUpdate());
  },
  checkForUpdate() {
    if (!App.swReg || Date.now() - App.lastUpdateCheck < KEM.UPDATE_CHECK_INTERVAL_MS) return;
    App.lastUpdateCheck = Date.now();
    App.swReg.update().catch(() => {});
  },
  applyUpdate() {
    document.getElementById('update-btn').hidden = true;
    const w = App.swReg && App.swReg.waiting;
    if (w) { App.updateRequested = true; w.postMessage({ type: 'SKIP_WAITING' }); } else location.reload();
  }
};

document.addEventListener('DOMContentLoaded', () => App.start());
