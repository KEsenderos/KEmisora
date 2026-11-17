// KEmisora  session.js  版 0.1.8  基づく仕様書：KEmisora_仕様書_v0.1.8.md
// 役割：編成から「再生する曲の順番」を決める（計算だけ。画面にも保存にも触れない）。

const Session = {
  // 曲が実際に聞こえる時間（速度で変わる）＋曲のつなぎ
  effSec(song) { return (song.durationSec || 0) / (song.speed || 1) + KEM.GAP_SEC; },

  pool_(songs, tagIds, match) { return KeCore.Pool.select(songs, tagIds, match).filter((s) => s.hasFile); },

  // 最後の曲・アラームの候補
  endPool_(plan, songs) {
    if (plan.endKind === KEM.END.SONG) return songs.filter((s) => s.songId === plan.endSongId && s.hasFile);
    if (plan.endKind === KEM.END.TAGS) return Session.pool_(songs, plan.endTagIds, plan.endMatch);
    return [];
  },

  // 戻り値 { ids, alarmId, timerSec, infinite, note }
  //   infinite：曲が尽きたら Session.more で続きをもらう（REPEAT・TIMER）
  build(plan, songs, rng) {
    const r = rng || Math.random;
    const pool = Session.pool_(songs, plan.mainTagIds, plan.mainMatch);
    const out = { ids: [], alarmId: null, timerSec: 0, infinite: false, note: '' };
    if (plan.method === KEM.METHOD.ALL) out.ids = KeCore.planAll(pool, r).ids;
    else if (plan.method === KEM.METHOD.PICK) out.ids = KeCore.planPickN(pool, plan.count, r).ids;
    else if (plan.method === KEM.METHOD.REPEAT) { out.ids = KeCore.nextRound(pool, null, r); out.infinite = true; }
    else if (plan.method === KEM.METHOD.TIME) {
      const last = Session.endPool_(plan, songs);
      const res = Planner.plan({
        mainPool: pool.map((s) => ({ id: s.songId, effSec: Session.effSec(s) })),
        lastPool: last.map((s) => ({ id: s.songId, effSec: Session.effSec(s) })),
        targetSec: plan.durationMin * 60 + KEM.MARGIN_LOW,
        toleranceSec: KEM.TOLERANCE_SEC - KEM.MARGIN_LOW - KEM.MARGIN_HIGH,
        rng: r
      });
      out.ids = res.ids;
      if (!res.inRange) out.note = 'OUT_OF_RANGE';
    } else if (plan.method === KEM.METHOD.TIMER) {
      out.timerSec = plan.durationMin * 60;
      if (plan.endClock) {                       // 時刻で終わる：今から、その時刻までの秒数
        const sec = Util.secondsUntilClock(plan.endClock);
        if (sec === null) throw new KemError('BAD_RANGE');
        if (sec < KEM.CLOCK_MIN_SEC) throw new KemError('CLOCK_PASSED', { t: plan.endClock });
        if (sec > KEM.PLAN_MAX_MIN * 60) throw new KemError('CLOCK_FAR', { t: plan.endClock, min: Math.ceil(sec / 60), max: KEM.PLAN_MAX_MIN });
        out.timerSec = sec; out.endAt = Date.now() + sec * 1000;
      }
      out.infinite = true;
      const alarms = Session.endPool_(plan, songs);
      if (alarms.length) out.alarmId = alarms[Math.floor(r() * alarms.length)].songId;      // アラーム曲は始めに決める（途中で変わらない）
      const main = pool.filter((s) => s.songId !== out.alarmId);                              // アラーム曲はメインの曲の候補から除く
      out.ids = KeCore.nextRound(main.length ? main : pool, null, r);
    }
    return out;
  },

  // 続き（REPEAT・TIMER）：次の1周ぶん。直前の曲が先頭に来ない
  more(plan, songs, prevId, rng, alarmId) {
    let pool = Session.pool_(songs, plan.mainTagIds, plan.mainMatch);
    const main = pool.filter((s) => s.songId !== alarmId);
    if (main.length) pool = main;
    return KeCore.nextRound(pool, prevId, rng || Math.random);
  }
};
