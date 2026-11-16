// KEmisora  kecore.js  版 0.1.2  基づく仕様書：KEmisora_仕様書_v0.1.2.md
// 役割：画面にも保存にも通信にも触れない「計算だけ」の部品。Node.jsでそのまま試験できる。
(function (root) {
  'use strict';

  // ---------- 属性による曲の絞り込み ----------
  // song.tagIds（文字の配列）が、条件 tagIds・match に合うかどうか。
  // tagIds が空 → 「すべての曲」（条件なし）。match 'ANY'＝どれか1つでも持つ／'ALL'＝すべて持つ
  var Pool = {
    matches: function (song, tagIds, match) {
      if (!tagIds || tagIds.length === 0) return true;
      var have = song.tagIds || [];
      if (match === 'ALL') {
        for (var i = 0; i < tagIds.length; i++) if (have.indexOf(tagIds[i]) < 0) return false;
        return true;
      }
      for (var j = 0; j < tagIds.length; j++) if (have.indexOf(tagIds[j]) >= 0) return true;
      return false;
    },
    select: function (songs, tagIds, match, excludeIds) {
      var ex = excludeIds || [];
      return songs.filter(function (s) { return ex.indexOf(s.songId) < 0 && Pool.matches(s, tagIds, match); });
    }
  };

  // ---------- 無作為の並べ替え・選び方 ----------
  // rng は 0以上1未満の数を返す関数（省略すると Math.random）。試験では種つきの関数に差し替える
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Fisher-Yates。元の配列は変えない
  function shuffle(arr, rng) {
    var r = rng || Math.random, a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // 全曲再生：条件に合う曲を1回ずつ、無作為な順に。{ ids, shortage:false }
  function planAll(songs, rng) {
    return { ids: shuffle(songs.map(function (s) { return s.songId; }), rng) };
  }
  // 指定数：条件に合う曲から n 曲を無作為に選ぶ。曲が足りなければ全部（shortage＝足りなかった曲数）
  function planPickN(songs, n, rng) {
    var ids = shuffle(songs.map(function (s) { return s.songId; }), rng);
    var take = Math.min(n, ids.length);
    return { ids: ids.slice(0, take), shortage: Math.max(0, n - ids.length) };
  }
  // リピート／タイマーの「次の1周ぶん」：無作為な順。直前の曲（prevId）が先頭に来ないようにする（曲が2曲以上のとき）
  function nextRound(songs, prevId, rng) {
    var ids = shuffle(songs.map(function (s) { return s.songId; }), rng);
    if (ids.length >= 2 && prevId != null && ids[0] === prevId) {
      var t = ids[0]; ids[0] = ids[1]; ids[1] = t;
    }
    return ids;
  }

  // ---------- タイマー：切る位置（出力フレーム）----------
  // 出力フレーム＝再生が進んだ分だけ数える（一時停止中は進まない）。速度・キーを変えても実時間と同じ
  function cutFrames(durationSec, sampleRate) { return Math.round(durationSec * sampleRate); }
  function fadeFrames(fadeSec, sampleRate) { return Math.max(1, Math.round(fadeSec * sampleRate)); }
  // 出力フレーム out のときの音量（切る位置 cut の fade フレーム前から、直線で 1 → 0）
  function fadeGain(out, cut, fade) {
    if (out >= cut) return 0;
    if (out <= cut - fade) return 1;
    return (cut - out) / fade;
  }

  // ---------- 端末どうしの同期：足し合わせ ----------
  // 同期の単位（エンティティ）：{ kind, id, updatedAt, ...中身 }。kind は 'song'（曲ごとの音程・速度・属性の付与）、'tag'（属性）、'plan'（編成）
  // 削除の印：{ kind, id, deletedAt }
  // 規則：同じ kind・id のものは updatedAt が新しい方が勝つ（同じ時刻なら内容の文字列が大きい方）。削除の印より新しい更新は残る（同じ時刻なら削除が勝つ）
  function key(kind, id) { return kind + '\u0001' + id; }
  // 更新の時刻が同じときは、内容の文字列が大きい方を残す（足す順番を変えても同じ結果にするため）
  function newer_(x, y) {
    if (x.updatedAt !== y.updatedAt) return x.updatedAt > y.updatedAt;
    return JSON.stringify(x) > JSON.stringify(y);
  }
  function mergeDocs(a, b, now, keepDays) {
    var ents = {}, dels = {}, out = { entities: [], removed: [] }, k;
    [a, b].forEach(function (d) {
      (d.entities || []).forEach(function (e) {
        k = key(e.kind, e.id);
        if (!ents[k] || newer_(e, ents[k])) ents[k] = e;
      });
      (d.removed || []).forEach(function (r) {
        k = key(r.kind, r.id);
        if (!dels[k] || r.deletedAt > dels[k].deletedAt) dels[k] = r;
      });
    });
    var limit = (typeof now === 'number' && keepDays) ? now - keepDays * 86400000 : -Infinity;
    Object.keys(ents).forEach(function (kk) {
      var e = ents[kk], r = dels[kk];
      if (r && r.deletedAt >= e.updatedAt) return;       // 削除が新しい（または同時）→ 消す
      out.entities.push(e);
    });
    Object.keys(dels).forEach(function (kk) {
      var r = dels[kk];
      if (r.deletedAt < limit) return;                   // 古い印は捨てる
      var e = ents[kk];
      if (e && e.updatedAt > r.deletedAt) return;        // 更新が勝ったので印は要らない
      out.removed.push(r);
    });
    out.entities.sort(function (x, y) { return key(x.kind, x.id) < key(y.kind, y.id) ? -1 : 1; });
    out.removed.sort(function (x, y) { return key(x.kind, x.id) < key(y.kind, y.id) ? -1 : 1; });
    return out;
  }

  var api = { Pool: Pool, mulberry32: mulberry32, shuffle: shuffle, planAll: planAll, planPickN: planPickN,
    nextRound: nextRound, cutFrames: cutFrames, fadeFrames: fadeFrames, fadeGain: fadeGain, mergeDocs: mergeDocs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KeCore = api;
})(typeof self !== 'undefined' ? self : this);
