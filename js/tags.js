// KEmisora  tags.js  版 0.1.7  基づく仕様書：KEmisora_仕様書_v0.1.7.md
// 役割：属性（タグ）の追加・名前の変更・削除・並び順。

const Tags = {
  list: [],

  async refresh() { Tags.list = await Store.getTags(); return Tags.list; },
  getList() { return Tags.list; },
  find(id) { return Tags.list.find((t) => t.tagId === id) || null; },
  nameOf(id) { const t = Tags.find(id); return t ? t.name : null; },

  norm_(s) { return String(s).normalize('NFKC').toLowerCase(); },
  checkName_(name, selfId) {
    const n = String(name || '').trim();
    const len = Util.charLen(n);
    if (len < 1 || len > KEM.NAME_MAX) throw new KemError('NAME');
    if (Tags.list.some((t) => t.tagId !== selfId && Tags.norm_(t.name) === Tags.norm_(n))) throw new KemError('NAME_DUP');   // 大文字小文字・全角半角を区別しない
    return n;
  },
  // 消すときの確認用：付いている曲の数と、使っている編成の名前
  impact(id) {
    return { songCount: Library.getList().filter((s) => s.tagIds.indexOf(id) >= 0).length,
      planNames: Plans.getList().filter((p) => p.mainTagIds.indexOf(id) >= 0 || (p.endTagIds || []).indexOf(id) >= 0).map((p) => p.name) };
  },
  async move(id, dir) {
    const i = Tags.list.findIndex((t) => t.tagId === id), j = i + dir;
    if (i < 0 || j < 0 || j >= Tags.list.length) return;
    const a = Tags.list[i], b = Tags.list[j], now = Date.now();
    const t = a.order; a.order = b.order; b.order = t;
    if (a.order === b.order) { a.order = j + 1; b.order = i + 1; }
    a.updatedAt = now; b.updatedAt = now;
    Tags.list[i] = b; Tags.list[j] = a;
    await Store.putMany('tags', [a, b]);
    if (typeof Sync !== 'undefined') Sync.markDirty();
  },

  async add(name) {
    const n = Tags.checkName_(name);
    if (Tags.list.length >= KEM.TAG_MAX) throw new KemError('TAG_FULL');
    const now = Date.now();
    const rec = { tagId: Util.newId('t'), name: n, order: Tags.list.reduce((m, t) => Math.max(m, t.order), 0) + 1, createdAt: now, updatedAt: now };
    await Store.put('tags', rec);
    Tags.list.push(rec);
    if (typeof Sync !== 'undefined') Sync.markDirty();
    return rec;
  },
  async rename(id, name) {
    const t = Tags.find(id); if (!t) return;
    t.name = Tags.checkName_(name, id); t.updatedAt = Date.now();
    await Store.put('tags', t);
    if (typeof Sync !== 'undefined') Sync.markDirty();
  },
  async remove(id) {
    const now = Date.now();
    await Store.removeEntity('tag', id, now);
    await Store.removeTagFromSongs(id, now);
    Tags.list = Tags.list.filter((t) => t.tagId !== id);
    Library.dropTagLocal(id);
    if (typeof Sync !== 'undefined') Sync.markDirty();
  }
};
