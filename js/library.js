// KEmisora  library.js  版 0.1.6  基づく仕様書：KEmisora_仕様書_v0.1.6.md
// 役割：曲の一覧（手元の写し）。取り込み、属性のON/OFF、曲ごとの音程・速度の保存、削除。
//       all＝記録すべて（ファイルを消した曲の設定も残す。FR-03）、songs＝この端末にファイルがある曲（画面に出す曲）。

const Library = {
  all: [],
  songs: [],

  rebuild_() {
    // 取り込んだ（追加した）順に、新しい曲を上に。同時刻なら名前順
    Library.songs = Library.all.filter((s) => s.hasFile).sort((a, b) => (b.addedAt - a.addedAt) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  },
  async refresh() {
    Library.all = await Store.getSongs();
    Library.rebuild_();
    return Library.songs;
  },
  getList() { return Library.songs; },
  find(songId) { return Library.songs.find((s) => s.songId === songId) || null; },
  has(songId) { return !!Library.find(songId); },
  rec_(songId) { return Library.all.find((s) => s.songId === songId) || null; },

  // 取り込む1曲を保存する。呼ぶ側が拡張子・大きさ・長さ・数の上限を確かめておく。
  // 以前削除した曲（記録が残っている）なら、属性・音程・速度をそのまま生かす（FR-03）
  async addSong(name, size, type, blob, durationSec, durationSrc) {
    const songId = Util.makeSongId(name, size);
    const now = Date.now();
    let rec = Library.rec_(songId);
    if (rec) {
      Object.assign(rec, { type: type || rec.type, durationSec, durationSrc: durationSrc || 'meta', hasFile: true, addedAt: now });
    } else {
      rec = {
        songId, name, size, type: type || '', durationSec, durationSrc: durationSrc || 'meta',
        pitch: KEM.PITCH_DEFAULT, speed: KEM.SPEED_DEFAULT, tagIds: [], hasFile: true,
        addedAt: now, lastPlayedAt: null, updatedAt: 0       // 0＝属性も音程・速度も、まだ一度も変えていない（同期の対象にしない）
      };
      Library.all.push(rec);
    }
    try { await Store.putSongWithFile(rec, blob); } catch (e) { Library.rebuild_(); throw Store.toKemError(e); }
    Library.rebuild_();
    return rec;
  },

  // ファイルから追加（FR-01）。戻り値 { added, errors[] }
  async addFiles(fileList, progress) {
    const res = { added: 0, errors: [] };
    const files = Array.from(fileList || []);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (progress) progress('(' + (i + 1) + '/' + files.length + ') ' + f.name);
      try {
        if (KEM.ALLOWED_EXT.indexOf(Util.getExt(f.name)) < 0) throw new KemError('FORMAT', { name: f.name });
        if (f.size > KEM.MAX_FILE_BYTES) throw new KemError('TOO_BIG', { mb: (f.size / 1048576).toFixed(1), name: f.name });
        if (Library.has(Util.makeSongId(f.name, f.size))) throw new KemError('DUP', { name: f.name });
        if (Library.songs.length >= KEM.LIBRARY_MAX) { res.errors.push(UI.errorText(new KemError('LIB_FULL'))); break; }
        let sec = await Engine.probeDuration(f), src = 'meta';
        if (sec == null) { const d = await Engine.decode(f); sec = d.durationSec; src = 'decoded'; }
        if (sec > KEM.MAX_DURATION_SEC) throw new KemError('TOO_LONG', { sec: sec, name: f.name });
        await Library.addSong(f.name, f.size, f.type, f, sec, src);
        res.added++;
      } catch (e) {
        const err = e instanceof KemError ? e : new KemError('DECODE', { name: f.name });
        if (err.code === 'QUOTA' || err.code === 'DB') { res.errors.push(UI.errorText(err)); break; }
        res.errors.push(UI.errorText(err, f.name));
      }
    }
    return res;
  },

  async update(songId, fields) {
    const s = Library.rec_(songId); if (!s) return null;
    Object.assign(s, fields, { updatedAt: Date.now() });
    await Store.put('songs', s);
    if (typeof Sync !== 'undefined') Sync.markDirty();
    return s;
  },
  // 再生の記録だけ（同期の対象にしない：updatedAt は変えない）
  async touchPlayed(songId, durationSec, durationSrc) {
    const s = Library.rec_(songId); if (!s) return;
    s.lastPlayedAt = Date.now();
    if (durationSec != null) { s.durationSec = durationSec; s.durationSrc = durationSrc || 'decoded'; }
    try { await Store.put('songs', s); } catch (e) { /* 続行 */ }
  },

  async setTag(songId, tagId, on) {
    const s = Library.rec_(songId); if (!s) return;
    const has = s.tagIds.indexOf(tagId) >= 0;
    if (on === has) return;
    await Library.update(songId, { tagIds: on ? s.tagIds.concat([tagId]) : s.tagIds.filter((x) => x !== tagId) });
  },
  async toggleTag(songId, tagId) {
    const s = Library.rec_(songId); if (!s) return false;
    const on = s.tagIds.indexOf(tagId) < 0;
    await Library.setTag(songId, tagId, on);
    return on;
  },

  async saveSettings(songId, pitch, speed) {
    const s = Library.rec_(songId); if (!s) return;
    if (s.pitch === pitch && s.speed === speed) return;
    await Library.update(songId, { pitch, speed });
  },

  // この端末から削除：ファイルだけ消す。属性・音程・速度の記録は残す（同じ曲をもう一度追加すると戻る）。他の端末には伝えない
  async remove(songId) {
    const s = Library.rec_(songId); if (!s) return;
    s.hasFile = false;
    await Store.removeFile(s);
    Library.rebuild_();
  },

  // 属性を消したとき、手元の写しからも外す
  dropTagLocal(tagId) { Library.all.forEach((s) => { s.tagIds = (s.tagIds || []).filter((x) => x !== tagId); }); }
};
