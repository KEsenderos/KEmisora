// KEmisora  drive.js  版 0.1.5  基づく仕様書：KEmisora_仕様書_v0.1.5.md
// 役割：中継（GAS）との通信。GETは使わず、合言葉つきのPOSTだけ。

const Drive = {
  configured() { return !!(Util.lsGet(KEM.LS.GAS_URL) && Util.lsGet(KEM.LS.KEY)); },

  async call(action, params) {
    const url = Util.lsGet(KEM.LS.GAS_URL), key = Util.lsGet(KEM.LS.KEY);
    if (!url || !key) throw new KemError('NEED_CONN');
    let j;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ key: key, action: action }, params || {})) });
      const txt = await res.text();
      try { j = JSON.parse(txt); } catch (e2) { throw new KemError('BAD_RESPONSE'); }   // 通信は届いたが、JSONでない（GASの公開設定・URLの間違いが多い）
    } catch (e) { if (e instanceof KemError) throw e; throw new KemError('NETWORK'); }
    if (!j || !j.ok) throw new KemError((j && j.code) || 'UNKNOWN', j || {});
    return j;
  },

  status() { return Drive.call('status'); },
  setParent(folderId) { return Drive.call('setParent', { folderId }); },
  children() { return Drive.call('children'); },
  list(folderId) { return Drive.call('list', { folderId }); },

  // 曲を4MBずつ受け取ってつなぐ。onPart(進んだ数, 全部の数)
  async audio(fileId, type, onPart) {
    const chunks = []; let parts = 1;
    for (let p = 0; p < parts; p++) {
      const r = await Drive.call('audio', { fileId, part: p });
      parts = r.parts;
      chunks.push(Util.b64ToBytes(r.data));
      if (onPart) onPart(p + 1, parts);
    }
    return new Blob(chunks, { type: type });
  },

  // 同期ファイルの置き場所（設定で指定。空なら親フォルダ）
  syncFolderId_() { return Util.lsGet(KEM.LS.SYNC_FOLDER) || ''; },
  getSync() { return Drive.call('sync', { syncFolderId: Drive.syncFolderId_() }); },
  putSync(data, baseSavedAt) { return Drive.call('putSync', { data: data, baseSavedAt: baseSavedAt, syncFolderId: Drive.syncFolderId_() }); }
};
