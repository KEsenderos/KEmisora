// KEmisora  backup.js  版 0.1.8  基づく仕様書：KEmisora_仕様書_v0.1.8.md
// 役割：属性・編成・曲ごとの設定を、ファイルに書き出す／読み込む。曲のファイルは含めない（ドライブから取り込み直す）。

const Backup = {
  async exportJson() {
    const [songs, tags, plans] = await Promise.all([Store.getSongs(), Store.getTags(), Store.getPlans()]);
    return JSON.stringify({ app: 'KEmisora', schema: 1, version: KEM.APP_VERSION, exportedAt: Date.now(),
      songs: songs.map((s) => ({ songId: s.songId, tagIds: s.tagIds, pitch: s.pitch, speed: s.speed })), tags: tags, plans: plans });
  },

  async download() {
    const text = await Backup.exportJson();
    const d = new Date(), z = (n) => (n < 10 ? '0' : '') + n;
    const name = 'KEmisora_backup_' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '.json';
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    Util.lsSet(KEM.LS.LAST_BACKUP, String(Date.now()));
  },

  // ファイルの中身（文字）から読み込む。属性・編成は入れ替え、曲の設定は同じ曲だけ反映
  async importText(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new KemError('BAD_BACKUP'); }
    if (!d || d.app !== 'KEmisora' || d.schema !== 1 || !Array.isArray(d.tags) || !Array.isArray(d.plans) || !Array.isArray(d.songs)) throw new KemError('BAD_BACKUP');
    const now = Date.now();
    const tags = d.tags.slice(0, KEM.TAG_MAX).map((t) => Object.assign({}, t, { updatedAt: now }));
    const plans = d.plans.slice(0, KEM.PLAN_MAX).map((p) => Object.assign({}, p, { updatedAt: now }));
    const tagIds = new Set(tags.map((t) => t.tagId));
    const patches = d.songs.map((s) => ({ songId: s.songId, fields: { tagIds: (s.tagIds || []).filter((x) => tagIds.has(x)), pitch: s.pitch, speed: s.speed, updatedAt: now } }));
    await Store.applyDoc(tags, plans, await Store.getRemoved(), patches);
    await Promise.all([Library.refresh(), Tags.refresh(), Plans.refresh()]);
    if (typeof Sync !== 'undefined') Sync.markDirty();
  },

  // バックアップが古い・無いときの注意文（要らなければ ''）
  warning() {
    const last = Number(Util.lsGet(KEM.LS.LAST_BACKUP) || 0);
    if (Tags.getList().length + Plans.getList().length === 0) return '';
    if (!last) return TEXT.WARN_BACKUP_NEVER;
    const days = Math.floor((Date.now() - last) / 86400000);
    return days >= KEM.BACKUP_WARN_DAYS ? Util.fill(TEXT.WARN_BACKUP_OLD, { d: days }) : '';
  }
};
