// KEmisora  store.js  版 0.1.6  基づく仕様書：KEmisora_仕様書_v0.1.6.md
// 役割：IndexedDB（songs・files・tags・plans・removed）の読み書き。

const Store = {
  db: null,

  open() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(KEM.DB_NAME, KEM.DB_VERSION); } catch (e) { resolve(false); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('songs', { keyPath: 'songId' });
        db.createObjectStore('files', { keyPath: 'songId' });
        db.createObjectStore('tags', { keyPath: 'tagId' });
        db.createObjectStore('plans', { keyPath: 'planId' });
        db.createObjectStore('removed', { keyPath: 'key' });
      };
      req.onsuccess = () => { Store.db = req.result; resolve(true); };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
  },

  toKemError(err) {
    if (err instanceof KemError) return err;
    const n = err && err.name;
    return new KemError(n === 'QuotaExceededError' ? 'QUOTA' : 'DB');
  },

  // 複数ストアを1回の書き込みで。fn(stores) の中で put/delete を呼ぶ
  tx_(names, mode, fn) {
    return new Promise((resolve, reject) => {
      if (!Store.db) { reject(new KemError('DB')); return; }
      let t, result;
      try {
        t = Store.db.transaction(names, mode);
        const stores = {};
        names.forEach((n) => { stores[n] = t.objectStore(n); });
        result = fn(stores);
      } catch (e) { reject(Store.toKemError(e)); return; }
      t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
      t.onerror = () => reject(Store.toKemError(t.error));
      t.onabort = () => reject(Store.toKemError(t.error));
    });
  },

  reqValue_(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(Store.toKemError(req.error));
    });
  },

  async getAll(name) {
    if (!Store.db) throw new KemError('DB');
    const t = Store.db.transaction([name], 'readonly');
    return Store.reqValue_(t.objectStore(name).getAll());
  },
  async get(name, key) {
    if (!Store.db) throw new KemError('DB');
    const t = Store.db.transaction([name], 'readonly');
    const v = await Store.reqValue_(t.objectStore(name).get(key));
    return v === undefined ? null : v;
  },
  put(name, rec) { return Store.tx_([name], 'readwrite', (s) => { s[name].put(rec); }); },
  putMany(name, recs) { return Store.tx_([name], 'readwrite', (s) => { recs.forEach((r) => s[name].put(r)); }); },
  del(name, key) { return Store.tx_([name], 'readwrite', (s) => { s[name].delete(key); }); },

  async getSongs() { return (await Store.getAll('songs')).map(Store.normalizeSong_); },
  async getTags() { return (await Store.getAll('tags')).sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt)); },
  async getPlans() { return (await Store.getAll('plans')).sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt)); },
  async getRemoved() { return Store.getAll('removed'); },
  async getFileBlob(songId) { const r = await Store.get('files', songId); return r ? r.blob : null; },

  normalizeSong_(r) {
    return Object.assign({
      name: '', size: 0, type: '', durationSec: null, durationSrc: 'meta', pitch: 0, speed: 1,
      tagIds: [], hasFile: false, addedAt: 0, lastPlayedAt: null, updatedAt: 0
    }, r);
  },

  putSongWithFile(song, blob) {
    return Store.tx_(['songs', 'files'], 'readwrite', (s) => {
      s.songs.put(song);
      s.files.put({ songId: song.songId, blob: blob });
    });
  },

  // この端末から削除：ファイルを消し、記録は hasFile=false にして残す（設定を覚えておく）。同期では伝えない
  removeFile(rec) {
    return Store.tx_(['songs', 'files'], 'readwrite', (s) => { s.files.delete(rec.songId); s.songs.put(rec); });
  },

  // 属性・編成を消して、削除の印を残す
  removeEntity(kind, id, now) {
    const store = kind === 'tag' ? 'tags' : 'plans';
    return Store.tx_([store, 'removed'], 'readwrite', (s) => {
      s[store].delete(id);
      s.removed.put({ key: kind + '\u0001' + id, kind: kind, id: id, deletedAt: now });
    });
  },

  // 属性を消すとき：曲からその属性も外す（曲の updatedAt を更新）
  removeTagFromSongs(tagId, now) {
    return Store.tx_(['songs'], 'readwrite', (s) => {
      const req = s.songs.openCursor();
      req.onsuccess = () => {
        const c = req.result; if (!c) return;
        const v = c.value;
        if ((v.tagIds || []).indexOf(tagId) >= 0) {
          v.tagIds = v.tagIds.filter((x) => x !== tagId); v.updatedAt = now; c.update(v);
        }
        c.continue();
      };
    });
  },

  // 同期・バックアップの読み込みで、属性・編成・曲の属性などをまとめて入れ替える
  applyDoc(tags, plans, removed, songPatches) {
    return Store.tx_(['tags', 'plans', 'removed', 'songs'], 'readwrite', (s) => {
      s.tags.clear(); s.plans.clear(); s.removed.clear();
      tags.forEach((r) => s.tags.put(r));
      plans.forEach((r) => s.plans.put(r));
      removed.forEach((r) => s.removed.put(r));
      (songPatches || []).forEach((p) => {
        const g = s.songs.get(p.songId);
        g.onsuccess = () => { if (g.result) s.songs.put(Object.assign(g.result, p.fields)); };
      });
    });
  },

  async estimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
    } catch (e) { /* 何もしない */ }
    return null;
  }
};
