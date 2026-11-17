// KEmisora  sync.js  版 0.1.4  基づく仕様書：KEmisora_仕様書_v0.1.4.md
// 役割：属性・編成・曲ごとの設定（属性のON/OFF・音程・速度）を、ドライブの同期ファイルを通して端末間でそろえる。
//       統合の計算は KeCore.mergeDocs（試験済み）。再生中は行わない。

const Sync = {
  timer_: 0, running_: false, dirty_: false, onDone: null,

  // 手元のデータ → 同期用の文書
  async buildLocal() {
    const [songs, tags, plans, removed] = await Promise.all([Store.getSongs(), Store.getTags(), Store.getPlans(), Store.getRemoved()]);
    const entities = [];     // 曲は、属性か音程・速度を一度でも変えたもの（updatedAt が 0 より大きい）だけ。取り込んだだけの曲は入れない（他の端末の設定を消さないため）
    songs.filter((s) => s.updatedAt > 0).forEach((s) => entities.push({ kind: 'song', id: s.songId, updatedAt: s.updatedAt, data: { tagIds: s.tagIds, pitch: s.pitch, speed: s.speed } }));
    tags.forEach((t) => entities.push({ kind: 'tag', id: t.tagId, updatedAt: t.updatedAt, data: t }));
    plans.forEach((p) => entities.push({ kind: 'plan', id: p.planId, updatedAt: p.updatedAt, data: p }));
    return { app: 'KEmisora', schema: 1, savedAt: 0, entities: entities,
      removed: removed.map((r) => ({ kind: r.kind, id: r.id, deletedAt: r.deletedAt })) };
  },

  markDirty() {
    Sync.dirty_ = true;
    if (!Drive.configured()) return;
    clearTimeout(Sync.timer_);
    Sync.timer_ = setTimeout(() => Sync.run(false), KEM.SYNC_AFTER_CHANGE_MS);
  },

  playing_() { return Player.state === KEM.STATE.PLAYING || Player.state === KEM.STATE.LOADING; },

  // 統合した結果を、手元に反映する。戻り値：消える見込みの属性・編成の数
  vanishCount(local, merged) {
    const keep = new Set(merged.entities.map((e) => e.kind + '\u0001' + e.id));
    return local.entities.filter((e) => e.kind !== 'song' && !keep.has(e.kind + '\u0001' + e.id)).length;
  },

  async apply_(merged) {
    const songs = await Store.getSongs();
    const tags = merged.entities.filter((e) => e.kind === 'tag').map((e) => e.data);
    const plans = merged.entities.filter((e) => e.kind === 'plan').map((e) => e.data);
    const tagIds = new Set(tags.map((t) => t.tagId));
    const patches = [];
    merged.entities.filter((e) => e.kind === 'song').forEach((e) => {
      const s = songs.find((x) => x.songId === e.id);
      if (!s || s.updatedAt >= e.updatedAt) return;
      patches.push({ songId: e.id, fields: { tagIds: (e.data.tagIds || []).filter((id) => tagIds.has(id)), pitch: e.data.pitch, speed: e.data.speed, updatedAt: e.updatedAt } });
    });
    const removed = merged.removed.map((r) => ({ key: r.kind + '\u0001' + r.id, kind: r.kind, id: r.id, deletedAt: r.deletedAt }));
    await Store.applyDoc(tags, plans, removed, patches);
    await Promise.all([Library.refresh(), Tags.refresh(), Plans.refresh()]);
  },

  // 同期する。manual=true のときは、できない理由も画面に出す
  async run(manual) {
    if (Sync.running_) return false;
    if (!Drive.configured()) { if (manual) throw new KemError('NEED_CONN'); return false; }
    if (Sync.playing_()) { if (manual) throw new KemError('SYNC_PLAYING'); Sync.markDirty(); return false; }
    Sync.running_ = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const local = await Sync.buildLocal();
        const r = await Drive.getSync();
        const remote = r.sync || { entities: [], removed: [], savedAt: 0 };
        const merged = KeCore.mergeDocs(local, remote, Date.now(), KEM.SYNC_KEEP_DAYS);
        const vanish = Sync.vanishCount(local, merged);
        if (vanish >= KEM.SYNC_VANISH_WARN && !(typeof confirm === 'function' && confirm(Util.fill(TEXT.CONFIRM_VANISH, { n: vanish })))) return false;
        await Sync.apply_(merged);
        const same = JSON.stringify([merged.entities, merged.removed]) === JSON.stringify([remote.entities || [], remote.removed || []]);
        if (same) { Util.lsSet(KEM.LS.LAST_SYNC, String(Date.now())); Sync.dirty_ = false; if (Sync.onDone) Sync.onDone(); return true; }
        const doc = { app: 'KEmisora', schema: 1, savedAt: 0, entities: merged.entities, removed: merged.removed };
        try {
          await Drive.putSync(doc, remote.savedAt || 0);
          Util.lsSet(KEM.LS.LAST_SYNC, String(Date.now())); Sync.dirty_ = false; if (Sync.onDone) Sync.onDone();
          return true;
        } catch (e) {
          if (e instanceof KemError && e.code === 'CONFLICT') continue;      // 他の端末が先に書いた：読み直して統合し直す
          throw e;
        }
      }
      throw new KemError('BUSY');
    } finally { Sync.running_ = false; }
  },

  // 起動したとき・前面に戻ったとき
  auto(reason) {
    if (!Drive.configured()) return;
    const last = Number(Util.lsGet(KEM.LS.LAST_SYNC) || 0);
    if (reason === 'launch' || Date.now() - last >= KEM.SYNC_FOREGROUND_MIN * 60000) Sync.run(false).catch(() => {});
  }
};
