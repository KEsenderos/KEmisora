// KEmisora  driveimport.js  版 0.1.2  基づく仕様書：KEmisora_仕様書_v0.1.2.md
// 役割：選んだ子フォルダの曲を、ドライブから取り込む。すでにある曲は飛ばす。

const DriveImport = {
  async children() { return (await Drive.children()).folders; },

  // 戻り値 { added, skipped, failed, errors[] }。progress(文字)で進み具合を知らせる
  async run(folderId, progress) {
    const res = { added: 0, skipped: 0, failed: 0, errors: [] };
    const files = (await Drive.list(folderId)).files;
    let n = 0;
    for (const f of files) {
      n++;
      const label = '(' + n + '/' + files.length + ') ' + f.name;
      if (KEM.ALLOWED_EXT.indexOf(Util.getExt(f.name)) < 0) { res.failed++; res.errors.push(Util.fill(TEXT.ERR_FORMAT, { name: f.name })); continue; }
      if (Library.has(Util.makeSongId(f.name, f.size))) { res.skipped++; continue; }
      if (Library.getList().length >= KEM.LIBRARY_MAX) { res.errors.push(Util.fill(TEXT.ERR_LIB_FULL, { max: KEM.LIBRARY_MAX })); res.failed += files.length - n + 1; break; }
      if (f.size > KEM.MAX_FILE_BYTES) { res.failed++; res.errors.push(Util.fill(TEXT.ERR_TOO_BIG, { mb: (f.size / 1048576).toFixed(1), max: KEM.MAX_FILE_BYTES / 1048576, name: f.name })); continue; }
      try {
        const type = Util.getExt(f.name) === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
        const blob = await Drive.audio(f.fileId, type, (p, all) => { if (progress) progress(label + (all > 1 ? ' ' + p + '/' + all : '')); });
        let sec = await Engine.probeDuration(blob), src = 'meta';
        if (sec == null) { const d = await Engine.decode(blob); sec = d.durationSec; src = 'decoded'; }
        if (sec > KEM.MAX_DURATION_SEC) throw new KemError('TOO_LONG', { sec: sec });
        await Library.addSong(f.name, blob.size, type, blob, sec, src);
        res.added++;
      } catch (e) {
        const err = e instanceof KemError ? e : new KemError('UNKNOWN', { code: 'UNKNOWN' });
        if (err.code === 'NETWORK' || err.code === 'BAD_KEY' || err.code === 'QUOTA') throw err;
        res.failed++; res.errors.push(UI.errorText(err, f.name));
      }
    }
    return res;
  }
};
