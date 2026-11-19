// KEmisora  plans.js  版 0.1.9  基づく仕様書：KEmisora_仕様書_v0.1.9.md
// 役割：編成（プレイリスト）の追加・直す・削除・並べ替えと、再生できるかの確認（要確認）。

const Plans = {
  list: [],

  async refresh() { Plans.list = await Store.getPlans(); return Plans.list; },
  getList() { return Plans.list; },
  find(id) { return Plans.list.find((p) => p.planId === id) || null; },

  blank() {
    return { planId: null, name: '', method: KEM.METHOD.ALL, mainTagIds: [], mainMatch: 'ANY', count: 10, durationMin: 30, endClock: '',
      endKind: KEM.END.NONE, endTagIds: [], endMatch: 'ANY', endSongId: null };
  },

  // 保存前の確認。問題のある項目の名前の配列を返す（空なら良い）
  checkForm(p) {
    const bad = [];
    const len = Util.charLen(String(p.name || '').trim());
    if (len < 1 || len > KEM.NAME_MAX) bad.push('NAME');
    if (p.method === KEM.METHOD.PICK && !(p.count >= KEM.COUNT_MIN && p.count <= KEM.COUNT_MAX && Number.isInteger(p.count))) bad.push('RANGE');
    if (p.method === KEM.METHOD.TIMER) { if (Util.secondsUntilClock(p.endClock, 0) === null) bad.push('RANGE'); }   // 目覚まし：終了時刻が必須
    else if ((p.method === KEM.METHOD.TIME || p.method === KEM.METHOD.TIMER) &&
        !(p.durationMin >= KEM.PLAN_MIN_MIN && p.durationMin <= KEM.PLAN_MAX_MIN && Number.isInteger(p.durationMin))) bad.push('RANGE');
    return bad;
  },

  async save(form) {
    const n = String(form.name || '').trim();
    if (Plans.checkForm(form).length) throw new KemError(Plans.checkForm(form)[0] === 'NAME' ? 'NAME' : 'BAD_RANGE');
    const norm = (x) => String(x).normalize('NFKC').toLowerCase();
    if (Plans.list.some((p) => p.planId !== form.planId && norm(p.name) === norm(n))) throw new KemError('NAME_DUP');
    const now = Date.now();
    let rec;
    if (form.planId) {
      rec = Plans.find(form.planId); if (!rec) return null;
      Object.assign(rec, Plans.pick_(form), { name: n, updatedAt: now });
    } else {
      if (Plans.list.length >= KEM.PLAN_MAX) throw new KemError('PLAN_FULL');
      rec = Object.assign({ planId: Util.newId('p'), order: Plans.list.reduce((m, p) => Math.max(m, p.order), 0) + 1, createdAt: now },
        Plans.pick_(form), { name: n, updatedAt: now });
      Plans.list.push(rec);
    }
    await Store.put('plans', rec);
    if (typeof Sync !== 'undefined') Sync.markDirty();
    return rec;
  },
  pick_(f) {
    return { method: f.method, mainTagIds: f.mainTagIds.slice(), mainMatch: f.mainMatch === 'ALL' ? 'ALL' : 'ANY',
      count: f.count, durationMin: f.durationMin, endClock: (f.method === KEM.METHOD.TIMER && f.endClock) ? String(f.endClock) : '', endKind: f.endKind, endTagIds: f.endTagIds.slice(),
      endMatch: f.endMatch === 'ALL' ? 'ALL' : 'ANY', endSongId: f.endSongId || null };
  },

  async remove(id) {
    await Store.removeEntity('plan', id, Date.now());
    Plans.list = Plans.list.filter((p) => p.planId !== id);
    if (Util.lsGet(KEM.LS.LAST_PLAN) === id) Util.lsRemove(KEM.LS.LAST_PLAN);
    if (typeof Sync !== 'undefined') Sync.markDirty();
  },

  async move(id, dir) {
    const i = Plans.list.findIndex((p) => p.planId === id), j = i + dir;
    if (i < 0 || j < 0 || j >= Plans.list.length) return;
    const a = Plans.list[i], b = Plans.list[j], now = Date.now();
    const t = a.order; a.order = b.order; b.order = t;
    if (a.order === b.order) { a.order = j + 1; b.order = i + 1; }
    a.updatedAt = now; b.updatedAt = now;
    Plans.list[i] = b; Plans.list[j] = a;
    await Store.putMany('plans', [a, b]);
    if (typeof Sync !== 'undefined') Sync.markDirty();
  },

  // 再生できるかの確認：問題の名前の配列（TAG_GONE, NO_SONG, LAST_MISSING, ALARM_NONE, RANGE）
  validate(p, songs, tags) {
    const bad = [];
    const hasTag = (id) => tags.some((t) => t.tagId === id);
    if (Plans.checkForm(p).length) bad.push('RANGE');
    if ((p.mainTagIds || []).some((id) => !hasTag(id)) || (p.endKind === KEM.END.TAGS && (p.endTagIds || []).some((id) => !hasTag(id)))) bad.push('TAG_GONE');
    if (!bad.includes('TAG_GONE')) {
      const pool = KeCore.Pool.select(songs, p.mainTagIds, p.mainMatch).filter((s) => s.hasFile);
      if (pool.length === 0) bad.push('NO_SONG');
      if (p.method === KEM.METHOD.TIME && p.endKind !== KEM.END.NONE) {
        if (p.endKind === KEM.END.TAGS) {
          if (KeCore.Pool.select(songs, p.endTagIds, p.endMatch).filter((s) => s.hasFile).length === 0) bad.push('LAST_MISSING');
        } else if (!songs.some((s) => s.songId === p.endSongId && s.hasFile)) bad.push('LAST_MISSING');
      }
      if (p.method === KEM.METHOD.TIMER && p.endKind !== KEM.END.NONE) {
        if (p.endKind === KEM.END.TAGS) {
          if (KeCore.Pool.select(songs, p.endTagIds, p.endMatch).filter((s) => s.hasFile).length === 0) bad.push('ALARM_NONE');
        } else if (!songs.some((s) => s.songId === p.endSongId && s.hasFile)) bad.push('ALARM_NONE');
      }
    }
    return bad;
  },
  badText(code) {
    return { TAG_GONE: TEXT.BAD_TAG_GONE, NO_SONG: TEXT.BAD_NO_SONG, LAST_MISSING: TEXT.BAD_LAST_MISSING, ALARM_NONE: TEXT.BAD_ALARM_NONE, RANGE: TEXT.BAD_RANGE }[code] || code;
  },
  condText(p, tags) {
    if (!p.mainTagIds || p.mainTagIds.length === 0) return TEXT.PLAN_COND_ALL;
    const names = p.mainTagIds.map((id) => { const t = tags.find((x) => x.tagId === id); return t ? t.name : '？'; });
    return names.join(p.mainMatch === 'ALL' ? '＋' : '／');
  },
  summary(p, tags) {
    let s = TEXT.METHOD_NAME[p.method];
    if (p.method === KEM.METHOD.PICK) s += ' ' + p.count + '曲';
    if (p.method === KEM.METHOD.TIMER) s += ' ' + (p.endClock || '--:--') + 'に終了';
    else if (p.method === KEM.METHOD.TIME) s += ' ' + p.durationMin + '分';
    return Util.fill(TEXT.PLAN_SUMMARY, { method: s, cond: Plans.condText(p, tags) });
  }
};
