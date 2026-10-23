/*!
 * Oi Levels — حزمة «نسخ TradingView» (ملف مستقل)
 * ---------------------------------------------------------------
 * يضيف للصفحة: أيقونة تبويب (كشعار تطبيق TradingView) ← نافذة شرح مختصر
 * ← زر «نسخ الكود» (كود المؤشر v17) + زر «نسخ TradingView» (نافذة اختيار الرموز والمستويات).
 *
 * الاستعمال:
 *   <script src="oi-tradingview.js"></script>        ← يعمل تلقائيًا بعد تحميل الصفحة
 * إعدادات اختيارية قبل التحميل أو عبر OITV.init({...}):
 *   window.OITV_CONFIG = {
 *     dataBase : "/data",          // مجلد ملفات البيانات (SPY.json ...) وإلا يُجرَّب المعتاد
 *     ticker   : "SPY",            // الرمز المختار افتراضيًا في النافذة
 *     mount    : "#toolbar",       // عنصر لوضع الأيقونة داخله (وإلا زاوية الشاشة السفلية اليسرى)
 *     maxExps  : 10,               // عدد الانتهاءات القادمة المحسوبة افتراضيًا
 *     params   : { days: "2", strikes: "30", n: 5, g: 2, exps: null }   // exps: مصفوفة تواريخ ISO أو دالة (data) => مصفوفة
 *   };
 * واجهة: OITV.open() · OITV.openCopy() · OITV.copyCode() · OITV.init(cfg)
 *
 * الحساب والنسخ والنافذة منقولة بلا تغيير من الويب الأصلي، وتعمل معزولة داخل هذا الملف.
 * يحتاج فقط ملفات بيانات بنفس الصيغة (by_expiration / pull_dates).
 */
(function () {
  "use strict";
  var CONFIG = Object.assign({ dataBase: null, ticker: "SPY", mount: null, hideIcon: false, maxExps: 10, params: {} }, window.OITV_CONFIG || {});
  var state = { ticker: CONFIG.ticker || "SPY", days: "2", strikes: "30", cache: {}, dark: true };
  var $ = function (sel) { return document.querySelector(sel); };

  /* ================= الواجهة الصغيرة: رسالة قصيرة ================= */
  var __toastT = null;
  function toast(msg, cls) {
    var el = document.getElementById("oitvToast");
    if (!el) { el = document.createElement("div"); el.id = "oitvToast"; document.body.appendChild(el); }
    el.className = "oitv-toast " + (cls === "err" ? "err" : "");
    el.textContent = msg; el.style.display = "";
    clearTimeout(__toastT); __toastT = setTimeout(function () { el.style.display = "none"; }, 2200);
  }
  function setStatus(msg, cls) { toast(msg, cls); }

  /* ================= البيانات والحساب (من الويب الأصلي) ================= */
var AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

var POS_FACTOR = { "new": 1, grow: 1.3, hold: 1.3, build: 1, drop: 0.7, fade: 0.4, norm: 1 };
/** المجموع الذكي ΣΔ: لكل سترايك — توزيع التزايد على الأيام (مرتّب بالنسبة) + حالة المركز على كل يوم بذاته + درجة موزونة */

var SPX_AM_PULL_CUTOFF = "17-8";

var SUM_TXT = "≡";

var __sref = {};

const INDEX_TICKERS = [
  { symbol: "SPY", name: "SPDR S&P 500", color: "#0D9488" },
  { symbol: "QQQ", name: "Invesco QQQ", color: "#2563EB" },
  { symbol: "IWM", name: "iShares Russell", color: "#0F172A" },
  { symbol: "GLD", name: "SPDR Gold", color: "#D97706" },
  { symbol: "SPX", name: "S&P 500 Index", color: "#7C3AED" },
  { symbol: "NDX", name: "Nasdaq 100", color: "#0EA5E9" },
];

const STOCKS_TICKERS = [
  { symbol: "AAPL", name: "Apple", color: "#A2AAAD" },
  { symbol: "MSFT", name: "Microsoft", color: "#00A4EF" },
  { symbol: "NVDA", name: "NVIDIA", color: "#76B900" },
  { symbol: "TSLA", name: "Tesla", color: "#E31937" },
  { symbol: "AMZN", name: "Amazon", color: "#FF9900" },
  { symbol: "META", name: "Meta", color: "#0668E1" },
  { symbol: "GOOGL", name: "Alphabet", color: "#4285F4" },
  { symbol: "AVGO", name: "Broadcom", color: "#E31937" },
  { symbol: "MSTR", name: "MicroStrategy", color: "#F7931A" },
  { symbol: "AMD", name: "AMD", color: "#ED1C24" },
  { symbol: "MU", name: "Micron", color: "#111827" },
  { symbol: "COHR", name: "Coherent", color: "#00A3E0" },
  { symbol: "SNDK", name: "Sandisk", color: "#E31C23" },
  { symbol: "CRWD", name: "CrowdStrike", color: "#FF5A36" },
  { symbol: "CRCL", name: "Circle", color: "#3B82F6" },
];

/** كل الرموز للبحث/العرض */

function buildConfluence(c, minFactors) {
  var map = {};
  function slot(strike) { var k = String(strike); return map[k] || (map[k] = { strike: Number(strike), td: [], wall: [], gr: [], sg: [], dual: [], sides: {} }); }
  ["call", "put"].forEach(function (sd) {
    (c.topPer[sd] || []).forEach(function (x) { var m = slot(x.strike); m.td.push({ side: sd, exp: x.exp, oi: x.oi, value: x.value }); m.sides[sd] = 1; });
  });
  (c.peaks || []).forEach(function (p) { var m = slot(p.strike); m.wall.push({ side: "call", exp: p.exp, oi: p.oi, delta: p.delta, move: p.move, diff: p.diff }); m.sides.call = 1; });
  (c.troughs || []).forEach(function (t) { var m = slot(t.strike); m.wall.push({ side: "put", exp: t.exp, oi: t.oi, delta: t.delta, move: t.move, diff: t.diff }); m.sides.put = 1; });
  [["call", c.growthCall], ["put", c.growthPut]].forEach(function (pr) {
    (pr[1] || []).forEach(function (x, i) { var m = slot(x.strike); m.gr.push({ side: pr[0], exp: x.exp, value: x.value, rank: x._rank || i + 1 }); m.sides[pr[0]] = 1; });
  });
  ["call", "put"].forEach(function (sd) {
    ((c.sigmaSmart && c.sigmaSmart[sd]) || []).forEach(function (x, i) {
      var m = slot(x.strike); m.sg.push({ side: sd, tot: x.tot, state: x.state, days: x.stateDays, exp: x.topExp, rank: x._rank || i + 1 }); m.sides[sd] = 1;
    });
  });
  (c.dual || []).forEach(function (d) { var m = slot(d.strike); m.dual.push({ exp: d.exp, call: d.call, put: d.put }); m.sides.call = 1; m.sides.put = 1; });
  var out = [];
  Object.keys(map).forEach(function (k) {
    var m = map[k];
    m.factors = (m.td.length ? 1 : 0) + (m.wall.length ? 1 : 0) + (m.gr.length ? 1 : 0) + (m.sg.length ? 1 : 0) + (m.dual.length ? 1 : 0);
    m.weight = m.td.length + m.wall.length + m.gr.length + m.sg.length * 2 + m.dual.length * 2;
    if (m.factors >= (minFactors || 2)) out.push(m);
  });
  out.sort(function (a, b) { return b.factors - a.factors || b.weight - a.weight; });
  return out.slice(0, 10);
}

/** عدسة السترايك: نفس التقرير مصفّى على سترايك واحد بنفس التنسيق والترتيب */

function buildSigmaLookup(data, expList) {
  var map = Object.create(null); // strike -> { call, put }
  if (!data || !expList || !expList.length) return map;
  for (var i = 0; i < expList.length; i++) {
    var exp = expList[i];
    var view = null;
    try {
      view = getViewRowsFor(data, exp, "ALL", "ALL");
    } catch (e) {
      continue;
    }
    if (!view || !view.pullDates || view.pullDates.length < 2 || !view.rows) continue;
    var lastI = view.pullDates.length - 1;
    var prevI = lastI - 1;
    for (var r = 0; r < view.rows.length; r++) {
      var row = view.rows[r];
      var k = String(row.strike);
      if (!map[k]) map[k] = { call: 0, put: 0, anyC: false, anyP: false };
      var dc = positiveDelta(row.calls[lastI] || 0, row.calls[prevI] || 0);
      var dp = positiveDelta(row.puts[lastI] || 0, row.puts[prevI] || 0);
      if (dc != null) {
        map[k].call += dc;
        map[k].anyC = true;
      }
      if (dp != null) {
        map[k].put += dp;
        map[k].anyP = true;
      }
    }
  }
  return map;
}

function buildSigmaSmart(data, exps, strikesLimit, topN) {
  var acc = { call: {}, put: {} }, positions = { call: [], put: [] };
  exps.forEach(function (exp) {
    var v = null;
    try { v = getViewRowsFor(data, exp, "ALL", "ALL"); } catch (e) {}
    if (!v || !v.pullDates || v.pullDates.length < 2) return;
    var li = v.pullDates.length - 1, pi = li - 1;
    v.rows.forEach(function (r) {
      ["call", "put"].forEach(function (side) {
        var arr = side === "call" ? r.calls : r.puts;
        var d = (arr[li] || 0) - (arr[pi] || 0);
        var sr = v.pullDates.map(function (pd, i) { return [pd, arr[i] || 0]; });
        var pf = posState(sr);
        if (pf.open >= 0 && pf.state !== "new" && sr[pf.open][1] >= 500) {
          positions[side].push({ strike: r.strike, exp: exp, openV: sr[pf.open][1], now: sr[sr.length - 1][1], since: pf.days, state: pf.state, ratio: pf.ratio, note: pf.note });
        }
        if (d <= 0) return;
        var a = acc[side][r.strike] || (acc[side][r.strike] = []);
        a.push({ exp: exp, delta: d, series: sr });
      });
    });
  });
  var out = { call: [], put: [] };
  ["call", "put"].forEach(function (side) {
    var ks = Object.keys(acc[side]).map(function (k) { return { strike: Number(k) }; });
    filterStrikes(ks, data.close, strikesLimit).forEach(function (o) {
      var list = acc[side][o.strike] || [];
      var tot = 0, wsum = 0;
      list.forEach(function (it) {
        var ps = posState(it.series);
        it.state = ps.state; it.stateDays = ps.days; it.note = ps.note; it.open = ps.open;
        tot += it.delta; wsum += it.delta * expWeight(it.exp) * (POS_FACTOR[ps.state] || 1);
      });
      if (tot <= 0) return;
      list.forEach(function (it) { it.share = Math.round(it.delta / tot * 100); });
      list.sort(function (x, y) { return y.share - x.share || (x.exp < y.exp ? -1 : 1); });
      var top = list[0];
      out[side].push({ strike: o.strike, tot: tot, dist: list, conc: top.share >= 60, state: top.state, stateDays: top.stateDays,
        topExp: top.exp, score: Math.round(wsum), series: top.series, note: top.note });
    });
    out[side].sort(function (x, y) { return y.tot - x.tot; });
    out[side] = out[side].slice(0, topN);
  });
  out.positions = { call: [], put: [] };
  ["call", "put"].forEach(function (side) {
    var okK = {};
    filterStrikes(positions[side].map(function (f) { return { strike: Number(f.strike) }; }), data.close, strikesLimit).forEach(function (o) { okK[o.strike] = 1; });
    out.positions[side] = positions[side].filter(function (f) { return okK[Number(f.strike)]; })
      .sort(function (x, y) { return y.now - x.now; }).slice(0, Math.max(6, topN))
      .sort(function (x, y) { return x.exp < y.exp ? -1 : x.exp > y.exp ? 1 : y.now - x.now; });
  });
  return out;
}
/** المراكز المفتوحة (Call + Put) بترتيب الأيام: اليوم ثم يوم بعد وهكذا، وداخل اليوم الأكبر OI أولًا */

function buildStrikeScores(deltaCall, deltaPut, growthCall, growthPut, troughs, peaks, close, sigmaCall, sigmaPut) {
  function makeSide(deltaList, growthList, levelList, levelTag, sigmaList) {
    var map = {};
    function bump(strike, pts, reason, src, exp) {
      if (strike == null) return;
      var k = String(strike);
      if (!map[k]) map[k] = { strike: Number(strike), score: 0, reasons: [], src: {}, exps: {}, rexp: {} };
      if (reason && exp) map[k].rexp[reason] = exp;
      map[k].score += pts;
      if (src) map[k].src[src] = 1;
      if (exp) map[k].exps[exp] = 1;
      if (reason) map[k].reasons.push(reason);
    }
    (deltaList || []).forEach(function (x, i) {
      bump(x.strike, Math.max(1, 6 - i), "Δ" + (i + 1), "Δ", x.exp);
    });
    (growthList || []).forEach(function (x, i) {
      bump(x.strike, Math.max(1, 5 - i), "G" + (i + 1), "G", x.exp);
    });
    (levelList || []).forEach(function (t) {
      if (t && t.oi) {
        var mv = t.move === "↑" ? " ▲ " + Math.abs(t.diff) : t.move === "↓" ? " ▼ " + Math.abs(t.diff) : t.move === "ثابت" ? " ▬ ثابت" : "";
        bump(t.strike, 4, levelTag + " " + reportDayLabel(t.exp) + mv, "OI", t.exp);
      }
    });
    (sigmaList || []).forEach(function (x, i) {
      bump(x.strike, Math.max(1, 5 - i), SUM_TXT + (i + 1), "Σ");
    });
    var list = Object.keys(map).map(function (k) {
      map[k].srcCount = Object.keys(map[k].src).length;
      return map[k];
    });
    list.sort(function (a, b) { return b.score - a.score; });
    return list.slice(0, 12);
  }

  var scoresCall = makeSide(deltaCall, growthCall, peaks, "قمة", sigmaCall);
  var scoresPut = makeSide(deltaPut, growthPut, troughs, "قاع", sigmaPut);

  var map = {};
  function merge(list, prefix) {
    (list || []).forEach(function (s) {
      var k = String(s.strike);
      if (!map[k]) map[k] = { strike: s.strike, score: 0, reasons: [], sideHint: {}, exps: {}, src: {} };
      map[k].score += s.score;
      (s.reasons || []).forEach(function (r) {
        map[k].reasons.push(prefix + " " + r);
      });
      map[k].sideHint[prefix] = (map[k].sideHint[prefix] || 0) + s.score;
      Object.keys(s.exps || {}).forEach(function (e) { map[k].exps[e] = 1; });
      Object.keys(s.src || {}).forEach(function (e) { map[k].src[e] = 1; });
    });
  }
  merge(scoresCall, "Call");
  merge(scoresPut, "Put");
  var combined = Object.keys(map).map(function (k) {
    var o = map[k];
    var c = o.sideHint.Call || 0;
    var p = o.sideHint.Put || 0;
    o.side = c > p + 2 ? "Call" : p > c + 2 ? "Put" : "مشترك";
    o.srcCount = Object.keys(o.src || {}).length;
    return o;
  });
  combined.sort(function (a, b) { return b.score - a.score; });
  return {
    call: scoresCall,
    put: scoresPut,
    combined: combined.slice(0, 12),
  };
}

function computeOpxLevels(data, daysLimit, strikesLimit, topN, gDays) {
  var res = { peaks: [], troughs: [], deltaCall: [], deltaPut: [] };
  try {
    var exps = Object.keys((data && data.by_expiration) || {}).sort();
    exps = filterTickerExpirations(state.ticker, exps);
    var today = dataSessionYmd(data);
    exps.filter(function (e) { return isThirdFridayExp(e) && expIsoDay(e) >= today; }).slice(0, 8).forEach(function (exp) {
      var view = getViewForExp(data, exp, daysLimit, strikesLimit);
      if (!view || !view.rows.length) return;
      topNMetric(view.rows, "call", "delta", gDays, topN).forEach(function (x) { x.exp = exp; res.deltaCall.push(x); });
      topNMetric(view.rows, "put", "delta", gDays, topN).forEach(function (x) { x.exp = exp; res.deltaPut.push(x); });
      var pt = peakTroughOfView(view);
      if (pt.trough.strike != null) res.troughs.push(pt.trough);
      if (pt.peak.strike != null) res.peaks.push(pt.peak);
    });
    res.repPeak = repeatedStrikes(res.peaks.map(function (p) { return { strike: p.strike, exp: p.exp }; }));
    res.repTrough = repeatedStrikes(res.troughs.map(function (t) { return { strike: t.strike, exp: t.exp }; }));
  } catch (e) {}
  return res;
}

function computeReports(data, selectedExps, daysLimit, strikesLimit, topN, gDays) {
  var deltaCall = [], deltaPut = [], growthCall = [], growthPut = [];
  var troughs = [], peaks = [], skipped = [], dual = [], topPer = { call: [], put: [] };
  selectedExps.forEach(function (exp) {
    var view = getViewForExp(data, exp, daysLimit, strikesLimit);
    if (!view || !view.rows.length) return;
    topNMetric(view.rows, "call", "delta", gDays, topN).forEach(function (x) {
      x.exp = exp; deltaCall.push(x);
    });
    topNMetric(view.rows, "put", "delta", gDays, topN).forEach(function (x) {
      x.exp = exp; deltaPut.push(x);
    });
    var tc1 = topNMetric(view.rows, "call", "delta", gDays, 1)[0];
    var tp1 = topNMetric(view.rows, "put", "delta", gDays, 1)[0];
    if (tc1 && tp1 && Number(tc1.strike) === Number(tp1.strike)) dual.push({ strike: tc1.strike, exp: exp, call: tc1.value, put: tp1.value });
    function oiAtLast(side, strike) {
      var li = view.pullDates.length - 1, val = 0;
      view.rows.forEach(function (r) { if (Number(r.strike) === Number(strike)) val = ((side === "call" ? r.calls : r.puts)[li]) || 0; });
      return val;
    }
    if (tc1) topPer.call.push({ exp: exp, strike: tc1.strike, value: tc1.value, oi: oiAtLast("call", tc1.strike) });
    if (tp1) topPer.put.push({ exp: exp, strike: tp1.strike, value: tp1.value, oi: oiAtLast("put", tp1.strike) });
    var growthKind = ""; try { growthKind = tawafuqColKind(exp); } catch (eK) {}
    if (growthKind) {   // النمو: جمعات + أوبكس + شهري فقط
      topNMetric(view.rows, "call", "growth", gDays, topN).forEach(function (x) {
        x.exp = exp; growthCall.push(x);
      });
      topNMetric(view.rows, "put", "growth", gDays, topN).forEach(function (x) {
        x.exp = exp; growthPut.push(x);
      });
    }
    var pt = peakTroughOfView(view);
    if (pt.trough.strike != null) troughs.push(pt.trough);
    if (pt.peak.strike != null) peaks.push(pt.peak);
    if (pt.trough.strike == null && pt.peak.strike == null) skipped.push(exp);
  });
  selectedExps.forEach(function (e0) {
    var v0 = getViewForExp(data, e0, daysLimit, strikesLimit);
    if (!v0 || !v0.rows.length) skipped.push(e0);
  });
  skipped = skipped.filter(function (e, i) { return skipped.indexOf(e) === i; }).sort();
  troughs.sort(function (a, b) { return a.exp < b.exp ? -1 : 1; });
  peaks.sort(function (a, b) { return a.exp < b.exp ? -1 : 1; });
  // توافق الأعلى تزايدًا: نفس السترايك هو الأعلى تزايدًا في أكثر من يوم
  var agree = { call: [], put: [] };
  ["call", "put"].forEach(function (sd) {
    var m = {};
    topPer[sd].forEach(function (x) { var k = String(x.strike); (m[k] = m[k] || { strike: x.strike, items: [] }).items.push(x); });
    Object.keys(m).forEach(function (k) {
      if (m[k].items.length >= 2) {
        m[k].items.sort(function (a, b) { return a.exp < b.exp ? -1 : 1; });
        agree[sd].push(m[k]);
      }
    });
    agree[sd].sort(function (a, b) { return b.items.length - a.items.length; });
  });
  // قمة وقاع على نفس السترايك (في أي أيام): نجمع كل أيام القمة وكل أيام القاع لكل سترايك
  var ptSame = [], ptMap = {};
  peaks.forEach(function (p) { (ptMap[p.strike] = ptMap[p.strike] || { strike: p.strike, peaks: [], troughs: [] }).peaks.push({ exp: p.exp, oi: p.oi }); });
  troughs.forEach(function (t) { (ptMap[t.strike] = ptMap[t.strike] || { strike: t.strike, peaks: [], troughs: [] }).troughs.push({ exp: t.exp, oi: t.oi }); });
  Object.keys(ptMap).forEach(function (k) { if (ptMap[k].peaks.length && ptMap[k].troughs.length) ptSame.push(ptMap[k]); });
  ptSame.sort(function (x, y) { return (y.peaks.length + y.troughs.length) - (x.peaks.length + x.troughs.length); });
  var sigCustom = (state.sigmaExps || []).filter(function (e) { return data.by_expiration && data.by_expiration[e]; });
  var sigmaSmartPre = buildSigmaSmart(data, sigCustom.length ? sigCustom : selectedExps, strikesLimit, topN);
  // المجموع ΣΔ: مجموع التزايد لكل سترايك عبر الانتهاءات المحددة (داخل نافذة السترايكات)
  var sigmaCall = [], sigmaPut = [];
  try {
    var sl = buildSigmaLookup(data, selectedExps);
    var sk = Object.keys(sl).map(function (k) { return { strike: Number(k) }; });
    filterStrikes(sk, data.close, strikesLimit).forEach(function (o) {
      var e = sl[String(o.strike)];
      if (!e) return;
      if (e.anyC && e.call > 0) sigmaCall.push({ strike: o.strike, value: e.call, exp: null });
      if (e.anyP && e.put > 0) sigmaPut.push({ strike: o.strike, value: e.put, exp: null });
    });
    sigmaCall.sort(function (a, b) { return b.value - a.value; });
    sigmaPut.sort(function (a, b) { return b.value - a.value; });
    sigmaCall = sigmaCall.slice(0, topN);
    sigmaPut = sigmaPut.slice(0, topN);
  } catch (eSig) {}
  // merge top across exps by value
  function mergeTop(arr, limit) {
    var copy = arr.slice();
    copy.sort(function (a, b) { return b.value - a.value; });
    return copy.slice(0, limit);
  }
  deltaCall = mergeTop(deltaCall, topN);
  deltaPut = mergeTop(deltaPut, topN);
  growthCall = mergeTop(growthCall, topN);
  growthPut = mergeTop(growthPut, topN);

  var scoresPack = buildStrikeScores(
    deltaCall, deltaPut, growthCall, growthPut, troughs, peaks, data.close, sigmaCall, sigmaPut
  );
  var scoresCall = scoresPack.call || [];
  var scoresPut = scoresPack.put || [];
  var scores = scoresPack.combined || [];
  var top = scores[0] || null;
  var topCall = scoresCall[0] || null;
  var topPut = scoresPut[0] || null;
  var conf = confidenceOf(top);
  return {
    deltaCall: deltaCall,
    deltaPut: deltaPut,
    growthCall: growthCall,
    growthPut: growthPut,
    dual: dual.sort(function (a, b) { return a.exp < b.exp ? -1 : 1; }),
    agree: agree,
    ptSame: ptSame,
    sigmaSmart: sigmaSmartPre,
    sigmaCustomExps: sigCustom,
    opxLv: computeOpxLevels(data, daysLimit, strikesLimit, topN, gDays),
    topPer: topPer,
    topDelta: { call: topPer.call.map(function (x) { return { exp: x.exp, strike: x.strike }; }), put: topPer.put.map(function (x) { return { exp: x.exp, strike: x.strike }; }) },
    confluence: buildConfluence({ topPer: topPer, peaks: peaks, troughs: troughs, growthCall: growthCall, growthPut: growthPut, dual: dual, sigmaSmart: sigmaSmartPre }),
    sigmaCall: sigmaCall,
    sigmaPut: sigmaPut,
    skipped: skipped,
    troughs: troughs,
    peaks: peaks,
    repTrough: repeatedStrikes(troughs.map(function (t) { return { strike: t.strike, exp: t.exp }; })),
    repPeak: repeatedStrikes(peaks.map(function (p) { return { strike: p.strike, exp: p.exp }; })),
    scores: scores,
    scoresCall: scoresCall,
    scoresPut: scoresPut,
    top: top,
    topCall: topCall,
    topPut: topPut,
    conf: conf,
    close: data.close,
    gDays: gDays,
    topN: topN,
    selectedExps: selectedExps.slice(),
    far: farLevelsOf(data, selectedExps, daysLimit, strikesLimit),
  };
}

function confidenceOf(top) {
  if (!top) return { level: "low", label: "منخفضة" };
  if (top.score >= 12) return { level: "high", label: "عالية" };
  if (top.score >= 7) return { level: "mid", label: "متوسطة" };
  return { level: "low", label: "منخفضة" };
}

function dataBases() {
  var preferred = CONFIG.dataBase || (document.body && document.body.dataset && document.body.dataset.dataBase) || "/data";
  preferred = String(preferred).replace(/\/$/, "");
  // جذر Worker + web/data + نسبي — توافق نشر Git والرفع اليدوي
  var list = [
    preferred,
    "/data",
    "data",
    "./data",
    "../data",
    "/web/data",
    "web/data",
    "."
  ];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && out.indexOf(list[i]) === -1) out.push(list[i]);
  }
  return out;
}

function dataSessionCutoffDate(data) {
  var s = dataSessionFromPull(data);
  if (s) {
    var d = new Date(s.year, s.month - 1, s.day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return expirationCutoffDate();
}

function dataSessionFromPull(data) {
  try {
    var pulls = (data && data.pull_dates) || [];
    if (!pulls.length && state.cache[state.ticker]) {
      pulls = state.cache[state.ticker].pull_dates || [];
    }
    if (!pulls.length) return null;
    var last = String(pulls[pulls.length - 1]);
    var parts = last.split("-").map(Number);
    var day = parts[0], month = parts[1];
    if (!day || !month) return null;
    var year = new Date().getFullYear();
    var nowM = new Date().getMonth() + 1;
    if (month > nowM + 6) year -= 1;
    return { year: year, month: month, day: day, label: last };
  } catch (e) {
    return null;
  }
}

function dataSessionYmd(data) {
  var s = dataSessionFromPull(data);
  if (!s) return (typeof riyadhYmd === "function" ? riyadhYmd() : new Date().toISOString().slice(0, 10));
  return s.year + "-" + String(s.month).padStart(2, "0") + "-" + String(s.day).padStart(2, "0");
}

function expIsoDay(iso) {
  return String(iso).slice(0, 10);
}

function expWeight(exp) {
  try {
    var d = new Date(String(exp) + "T12:00:00"), n = new Date();
    var R = sessionRefs();
    if (R && R.today) n = new Date(R.today + "T12:00:00");
    var diff = Math.round((d.getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12).getTime()) / 86400000);
    if (diff <= 1 || (R && exp === R.tomorrow)) return 3;
    var k = tawafuqColKind(exp);
    if (k === "opx" || k === "eom") return 1.5;
    return diff <= 7 ? 2 : 0.5;
  } catch (e) { return 1; }
}
/** تجميع الصفوف المتكررة لنفس السترايك في صف واحد */

function expirationCutoffDate() {
  try {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Riyadh",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hour12: false,
    }).formatToParts(new Date());
    var get = function (t) {
      for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value;
      return "0";
    };
    var y = parseInt(get("year"), 10);
    var m = parseInt(get("month"), 10);
    var d = parseInt(get("day"), 10);
    var h = parseInt(get("hour"), 10);
    var cutoff = new Date(y, m - 1, d);
    cutoff.setHours(0, 0, 0, 0);
    if (h < 7) cutoff.setDate(cutoff.getDate() - 1);
    return cutoff;
  } catch (e) {
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }
}

function farLevelsOf(data, exps, daysLimit, strikesLimit) {
  if (/^range:/.test(String(strikesLimit))) return [];
  var far = [];
  exps.forEach(function (exp) {
    var win = getViewForExp(data, exp, daysLimit, strikesLimit);
    var all = getViewForExp(data, exp, daysLimit, "ALL");
    if (!win || !all || !win.rows.length || !all.rows.length) return;
    var inWin = {};
    win.rows.forEach(function (r) { inWin[r.strike] = 1; });
    var li = all.pullDates.length - 1;
    [["put", "قاع"], ["call", "قمة"]].forEach(function (p) {
      var best = -1, bs = null;
      all.rows.forEach(function (r) {
        var v = ((p[0] === "put" ? r.puts : r.calls)[li]) || 0;
        if (v > best) { best = v; bs = r.strike; }
      });
      if (bs != null && best > 0 && !inWin[bs]) {
        far.push({
          strike: bs, oi: best, kind: p[1], exp: exp,
          dist: data.close ? ((bs - data.close) / data.close) * 100 : null,
        });
      }
    });
  });
  far.sort(function (a, b) { return a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : b.strike - a.strike; });
  return far;
}

function filterSpxMonthlyPullDates(pullDates) {
  var all = (pullDates || []).slice();
  var cut = pullDateSortKey(SPX_AM_PULL_CUTOFF);
  var filtered = all.filter(function (pd) {
    return pullDateSortKey(pd) >= cut;
  });
  // إن لم يبقَ شيء (بيانات قديمة فقط) أظهر آخر يوم فقط كاحتياط
  if (!filtered.length && all.length) return [all[all.length - 1]];
  return filtered;
}

function filterStrikes(rows, close, strikesLimit) {
  var rgm = /^range:([\d.]+):([\d.]+)$/.exec(String(strikesLimit || ""));
  if (rgm) {
    var lo = Math.min(+rgm[1], +rgm[2]), hi = Math.max(+rgm[1], +rgm[2]);
    return rows.filter(function (r) { return r.strike >= lo && r.strike <= hi; });
  }
  if (!strikesLimit || strikesLimit === "ALL" || close == null) return rows.slice();
  const n = parseInt(strikesLimit, 10);
  return rows
    .map(function (r) { return { r: r, dist: Math.abs(r.strike - close) }; })
    .sort(function (a, b) { return a.dist - b.dist; })
    .slice(0, n * 2)
    .map(function (x) { return x.r; })
    .sort(function (a, b) { return a.strike - b.strike; });
}

function filterTickerExpirations(ticker, list) {
  var data = state.cache[ticker] || state.cache[state.ticker] || null;
  var cutoff = dataSessionCutoffDate(data);
  return (list || []).filter(function (exp) {
    var d = new Date(String(exp) + "T00:00:00");
    return !isNaN(d.getTime()) && d >= cutoff;
  });
}



/** ضع القائمة بـ position:fixed تحت الزر — تخرج من overflow شريط التحكم */

/** قائمة منسدلة خارج الشريط: تُنقل لـ body + position:fixed بأولوية !important */

function fmtK(n) {
  return (Number(n) || 0).toLocaleString();
}
/** وزن زمني: اليوم/يوم بعد ×3 · الأسبوع ×2 · OPX والإغلاق الشهري ×1.5 · البعيد ×0.5 */

function formatExpAr(iso) {
  if (!iso) return "";
  var p = String(iso).split("-");
  if (p.length < 3) return iso;
  var months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  var m = parseInt(p[1], 10);
  var d = parseInt(p[2], 10);
  if (!m || !d) return iso;
  return d + " " + months[m - 1];
}

function getViewForExp(data, expiration, daysLimit, strikesLimit) {
  // نفس مسار الجداول الفعلية: تواريخ سحب كل انتهاء + محاذاة الأعمدة (إصلاح قراءة الأيام الأولى من الأسبوع)
  try { return getViewRowsFor(data, expiration, daysLimit, strikesLimit); } catch (e) { return null; }
}

function getViewRowsFor(data, expiration, daysLimit, strikesLimit) {
  if (!data || !expiration) return null;
  const block = data.by_expiration[expiration];
  if (!block) return null;
  var basePullFor = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates.slice()
    : (data.pull_dates || []).slice();

  if (
    String(state.ticker).toUpperCase() === "SPX" &&
    expiration &&
    typeof isThirdFridayExp === "function" &&
    isThirdFridayExp(expiration)
  ) {
    basePullFor = filterSpxMonthlyPullDates(basePullFor);
  }
  var fullDates = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates
    : (data.pull_dates || []);
  var idxFull = basePullFor.map(function (d) { return fullDates.indexOf(d); });
  var rowsAligned = (block.rows || []).map(function (r) {
    return {
      strike: r.strike,
      calls: idxFull.map(function (i) { return i >= 0 ? (r.calls[i] || 0) : 0; }),
      puts: idxFull.map(function (i) { return i >= 0 ? (r.puts[i] || 0) : 0; }),
    };
  });
  var trimmed = trimLeadingZeroColumns(basePullFor, rowsAligned);
  basePullFor = trimmed.pullDates;
  rowsAligned = trimmed.rows;
  var pullDates = lastN(basePullFor, daysLimit);
  var __hp = hiddenPullSet();   // الأعمدة المحذوفة تُزال من النافذة المعروضة بدون إحلال عمود أقدم مكانها
  if (Object.keys(__hp).length) {
    var __kept = pullDates.filter(function (d) { return !__hp[d]; });
    if (__kept.length >= 1) pullDates = __kept;
  }
  if (!pullDates.length) return null;
  const idx = pullDates.map(function (d) { return basePullFor.indexOf(d); });
  let rows = rowsAligned.map(function (r) {
    return {
      strike: r.strike,
      calls: idx.map(function (i) { return i >= 0 ? r.calls[i] : 0; }),
      puts: idx.map(function (i) { return i >= 0 ? r.puts[i] : 0; }),
    };
  });
  rows = filterStrikes(rows, data.close, strikesLimit);
  if (!rows.length) return null;
  return { pullDates: pullDates, rows: rows, close: data.close, expiration: expiration };
}


/** يكتب جدول انتهاء من B2 بدون أعمدة pad إضافية */

/** تمييز قفزة OI — فقط في الأعمدة الأحدث
 * لا تُلوَّن قفزات منتصف التاريخ إذا ما لها صلة بآخر الأعمدة
 * نافذة البداية: آخر RECENT يوم سحب (حوالي 8 أو 35% من الأعمدة)
 * العتبة من gainFloor + استمرار محدود حتى آخر العمود
 */

function hiddenPullSet() { return (state.hiddenPulls && state.hiddenPulls[state.ticker]) || {}; }

function isFridayExp(exp) {
  try {
    return new Date(String(exp) + "T12:00:00").getDay() === 5;
  } catch (e) {
    return false;
  }
}

function isFridayIso(iso) {
  var d = new Date(String(iso) + "T12:00:00");
  return !isNaN(d.getTime()) && d.getDay() === 5;
}

/**
 * ثلاثة انتهاءات لوضع x3: اليوم · يوم بعد · الأسبوع
 * مع دمج التسميات عند التطابق (خميس/جمعة)
 */

function isMonthEndExp(exp) {
  // آخر يوم تداول في الشهر: لو وقع آخر الشهر سبتًا/أحدًا فالجمعة (أو الخميس…) هي إغلاق الشهر
  try {
    var d = new Date(String(exp) + "T12:00:00");
    if (isNaN(d.getTime())) return false;
    var dow = d.getDay();
    if (dow === 0 || dow === 6) return false;
    var n = new Date(d.getTime());
    do { n.setDate(n.getDate() + 1); } while (n.getDay() === 0 || n.getDay() === 6);
    return n.getMonth() !== d.getMonth();
  } catch (e) {
    return false;
  }
}

function isThirdFridayExp(exp) {
  try {
    var d = new Date(String(exp) + "T12:00:00");
    if (isNaN(d.getTime()) || d.getDay() !== 5) return false;
    var day = d.getDate();
    return day >= 15 && day <= 21;
  } catch (e) {
    return false;
  }
}

function lastN(arr, n) {
  if (!n || n === "ALL") return arr.slice();
  const k = parseInt(n, 10);
  return arr.slice(Math.max(0, arr.length - k));
}

async function loadTicker(ticker) {
  if (state.cache[ticker]) return state.cache[ticker];
  var bases = dataBases();
  var lastStatus = 0;
  for (var i = 0; i < bases.length; i++) {
    try {
      var res = await fetch(bases[i] + "/" + ticker + ".json?t=" + Date.now());
      lastStatus = res.status;
      if (res.ok) {
        var text = await res.text();
        // NaN غير صالح في JSON — حوّله قبل parse
        text = text.replace(/\bNaN\b/g, "null").replace(/\b-?Infinity\b/g, "null");
        var json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          throw new Error("بيانات تالفة لـ " + ticker);
        }
        if (json && (json.close == null || (typeof json.close === "number" && isNaN(json.close)))) {
          json.close = null;
        }
        state.cache[ticker] = json;
        return json;
      }
    } catch (e) {
      if (e && e.message && e.message.indexOf("بيانات تالفة") === 0) throw e;
    }
  }
  throw new Error("تعذر تحميل بيانات " + ticker);
}

/** قبل 7 ص الرياض يُبقى انتهاء أمس للمراجعة الليلية؛ بعد 7 ص يُحذف */

function peakTroughOfView(view) {
  var lastI = view.pullDates.length - 1;
  var prevI = lastI - 1;
  function topAt(i, side) {
    var best = 0, bs = null;
    view.rows.forEach(function (r) {
      var v = ((side === "put" ? r.puts : r.calls)[i]) || 0;
      if (v > best) { best = v; bs = r.strike; }
    });
    return { strike: bs, oi: best > 0 ? best : null };
  }
  function mk(side) {
    var cur = topAt(lastI, side);
    var prev = prevI >= 0 ? topAt(prevI, side) : { strike: null };
    var move = "—", diff = null;
    if (cur.strike != null && prev.strike != null) {
      diff = Number(cur.strike) - Number(prev.strike);
      move = diff === 0 ? "ثابت" : diff > 0 ? "↑" : "↓";
    }
    var oiPrev = null;
    if (cur.strike != null && prevI >= 0) {
      view.rows.forEach(function (r) { if (r.strike === cur.strike) oiPrev = ((side === "put" ? r.puts : r.calls)[prevI]) || 0; });
    }
    var delta = cur.oi != null && oiPrev != null ? cur.oi - oiPrev : null;
    return { strike: cur.strike, oi: cur.oi, delta: delta, move: move, diff: diff, path: wallPath(view, side), exp: view.expiration };
  }
  // قاع = أعلى Put OI | قمة = أعلى Call OI
  return { trough: mk("put"), peak: mk("call") };
}

function posState(ser) {
  var vals = ser.map(function (p) { return p[1]; }), n = vals.length, now = vals[n - 1] || 0;
  var k = -1, best = 0;
  for (var i = 1; i < n; i++) {
    var jump = vals[i] - vals[i - 1];
    // فتح مركز لافت: قفزة كبيرة (≥500 ونصف المستوى الجديد على الأقل) من قاعدة صغيرة
    if (jump > best && jump >= Math.max(500, vals[i] * 0.5) && vals[i - 1] <= vals[i] * 0.25) { best = jump; k = i; }
  }
  if (k < 0) {
    var c = 0;
    for (var j = n - 1; j >= 1; j--) { if (vals[j] >= vals[j - 1] * 0.95) c++; else break; }
    var base = n - 1 - c >= 0 ? vals[n - 1 - c] : 0;
    if (c >= 3 && now >= 1000 && now >= Math.max(1, base) * 2) {
      return { state: "build", days: c, open: -1, ratio: 1, note: "تراكم تدريجي منذ " + c + " أيام (" + fmtK(base) + " ← " + fmtK(now) + ") بلا فتح مفاجئ" };
    }
    return { state: "norm", days: 0, open: -1, ratio: 1, note: "لا فتح مركز لافت على هذا اليوم" };
  }
  var openV = vals[k];
  if (k === n - 1) return { state: "new", days: 0, open: k, ratio: 1, note: "فتح جديد: من " + fmtK(vals[k - 1]) + " إلى " + fmtK(openV) + " في آخر سحب" };
  var ratio = openV > 0 ? now / openV : 1, since = n - 1 - k;
  if (ratio < 0.4) return { state: "fade", days: since, open: k, ratio: ratio, note: "تبخّر: نزل إلى " + Math.round(ratio * 100) + "% مما فُتح (" + fmtK(openV) + " ← " + fmtK(now) + ") بعد " + since + " يوم" };
  if (ratio >= 0.95) return { state: ratio > 1.05 ? "grow" : "hold", days: since, open: k, ratio: ratio, note: (ratio > 1.05 ? "متزايد" : "ثابت") + " منذ الفتح بـ " + since + " يوم (" + fmtK(openV) + " ← " + fmtK(now) + ")" };
  return { state: "drop", days: since, open: k, ratio: ratio, note: "تناقص: " + Math.round(ratio * 100) + "% مما فُتح (" + fmtK(openV) + " ← " + fmtK(now) + ")" };
}
var POS_FACTOR = { "new": 1, grow: 1.3, hold: 1.3, build: 1, drop: 0.7, fade: 0.4, norm: 1 };
/** المجموع الذكي ΣΔ: لكل سترايك — توزيع التزايد على الأيام (مرتّب بالنسبة) + حالة المركز على كل يوم بذاته + درجة موزونة */

function positiveDelta(last, prev) {
  const d = (last || 0) - (prev || 0);
  return d > 0 ? d : null;
}

/** نمو السترايك: أحدث قيمة − قيمة قبل growthDays أعمدة (موجب فقط) */

function positiveGrowth(arr, daysBack) {
  if (!arr || !arr.length) return null;
  var n = Number(daysBack) || 0;
  if (n < 1) return null;
  var lastI = arr.length - 1;
  var prevI = lastI - n;
  if (prevI < 0) return null;
  return positiveDelta(arr[lastI], arr[prevI]);
}


/** مجموع التزايد الموجب على تواريخ مختارة: لكل يوم محدد نضيف max(0, يوم − أمس) */

/** تزايد انتهاء واحد لسترايك: آخر عمود سحب − الذي قبله (موجب فقط) */

function pullDateSortKey(pd) {
  try {
    var parts = String(pd).split("-").map(Number);
    var day = parts[0], month = parts[1];
    if (!day || !month) return 0;
    var now = new Date();
    var year = now.getFullYear();
    // لو الشهر أكبر بكثير من الحالي قد يكون من سنة سابقة في نهاية العام
    if (month > now.getMonth() + 1 + 6) year -= 1;
    return new Date(year, month - 1, day).getTime();
  } catch (e) {
    return 0;
  }
}

function repeatedStrikes(items) {
  // items: [{strike, exp}]
  var dict = {};
  items.forEach(function (it) {
    if (it.strike == null) return;
    var k = String(it.strike);
    if (!dict[k]) dict[k] = [];
    if (dict[k].indexOf(it.exp) < 0) dict[k].push(it.exp);
  });
  var out = [];
  Object.keys(dict).forEach(function (k) {
    if (dict[k].length > 1) {
      out.push({ strike: Number(k), days: dict[k].slice().sort() });
    }
  });
  out.sort(function (a, b) { return b.strike - a.strike; });
  return out;
}

function reportDayLabel(exp) {
  try {
    var d = new Date(String(exp) + "T12:00:00");
    var R = sessionRefs();
    var kd = ""; try { kd = tawafuqColKind(exp); } catch (e0) {}
    var isToday = false, isTom = false, isWeekFri = false;
    if (R) {
      isToday = exp === R.today;
      isTom = !isToday && exp === R.tomorrow;
      isWeekFri = exp === R.week;
    } else {
      var now = new Date();
      var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
      var diff = Math.round((d.getTime() - t0.getTime()) / 86400000);
      isToday = diff === 0; isTom = diff === 1;
      isWeekFri = d.getDay() === 5 && diff >= 0 && diff <= 6;
    }
    var parts = [];
    if (isToday) parts.push("اليوم"); else if (isTom) parts.push("يوم بعد");
    if (isWeekFri) parts.push("الأسبوع");
    if (kd === "opx" && (isWeekFri || !parts.length)) parts.push("OPX " + d.toLocaleString("en", { month: "short" }));
    if (kd === "eom" && (isWeekFri || !parts.length)) parts.push(d.getDate() + " " + AR_MONTHS[d.getMonth()]);
    if (parts.length) return parts.join(" - ");
    var names = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
    return names[d.getDay()] + " " + d.getDate();
  } catch (e) { return formatExpAr(exp); }
}

/** حذف أسطر من التقرير (زر ×): المفتاح = القسم|الجهة|السترايك|اليوم */

function riyadhYmd() {
  try {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    var get = function (t) {
      for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value;
      return "01";
    };
    return get("year") + "-" + get("month") + "-" + get("day");
  } catch (e) {
    var n = new Date();
    return n.toISOString().slice(0, 10);
  }
}

function sessionRefs() {
  try {
    var t = state.ticker, data = state.cache && state.cache[t];
    if (!data || !data.by_expiration) return null;
    var pulls = data.pull_dates || [];
    var key = t + "|" + (pulls[pulls.length - 1] || "") + "|" + Object.keys(data.by_expiration).length;
    if (__sref.key === key) return __sref.val;
    var list = filterTickerExpirations(t, Object.keys(data.by_expiration).sort());
    var val = null;
    if (list.length) {
      var todayStr = dataSessionYmd(data), i0 = 0;
      for (var i = 0; i < list.length; i++) {
        i0 = i;
        if (expIsoDay(list[i]) >= todayStr) break;
      }
      var wk = null;
      for (var j = i0; j < list.length; j++) { if (isFridayIso(list[j])) { wk = list[j]; break; } }
      val = { today: list[i0], tomorrow: list[i0 + 1] || null, week: wk };
    }
    __sref = { key: key, val: val };
    return val;
  } catch (e) { return null; }
}

/** اسم اليوم في جداول التقرير: اليوم / يوم بعد / opx oct / جمعة 9 / ثلاثاء 13 */

function tawafuqColKind(exp) {
  if (typeof isThirdFridayExp === "function" && isThirdFridayExp(exp)) return "opx";
  if (isMonthEndExp(exp)) return "eom";
  if (isFridayExp(exp)) return "fri";
  return "";
}

function topNMetric(rows, side, metric, gDays, limit) {
  var items = [];
  rows.forEach(function (r) {
    var arr = side === "call" ? r.calls : r.puts;
    if (!arr || arr.length < 2) return;
    var val = metric === "delta"
      ? positiveDelta(arr[arr.length - 1], arr[arr.length - 2])
      : positiveGrowth(arr, Math.min(Number(gDays) || 0, arr.length - 1));
    if (val != null && val > 0) {
      items.push({ strike: r.strike, value: val, side: side });
    }
  });
  items.sort(function (a, b) { return b.value - a.value; });
  return items.slice(0, limit);
}

function trimLeadingZeroColumns(pullDates, rows) {
  if (!pullDates || !pullDates.length || !rows || !rows.length) {
    return { pullDates: pullDates || [], rows: rows || [] };
  }
  var n = pullDates.length;
  var first = 0;
  var found = false;
  for (var i = 0; i < n; i++) {
    for (var r = 0; r < rows.length; r++) {
      var c = rows[r].calls && rows[r].calls[i] != null ? rows[r].calls[i] : 0;
      var p = rows[r].puts && rows[r].puts[i] != null ? rows[r].puts[i] : 0;
      if (Number(c) > 0 || Number(p) > 0) {
        first = i;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (!found) first = Math.max(0, n - 1);
  if (first === 0) return { pullDates: pullDates, rows: rows };
  return {
    pullDates: pullDates.slice(first),
    rows: rows.map(function (row) {
      return {
        strike: row.strike,
        calls: (row.calls || []).slice(first),
        puts: (row.puts || []).slice(first),
      };
    }),
  };
}

function wallPath(view, side) {
  var out = [];
  for (var i = 0; i < view.pullDates.length; i++) {
    var best = -1, bs = null;
    view.rows.forEach(function (r) {
      var v = (side === "put" ? r.puts[i] : r.calls[i]) || 0;
      if (v > best) { best = v; bs = r.strike; }
    });
    if (bs != null && best > 0) out.push(bs);
  }
  return out.slice(-6);
}

/** أقوى جدار (Put/Call) خارج نافذة السترايكات الحالية = مدى طويل */

function repCopyText(txt, okMsg) {
  function fallback() {
    try {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setStatus(ok ? okMsg : "تعذّر النسخ", ok ? "ok" : "err");
    } catch (e) { setStatus("تعذّر النسخ", "err"); }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { setStatus(okMsg, "ok"); }).catch(fallback);
    else fallback();
  } catch (e) { fallback(); }
}

/** نص مستويات TradingView: سطر لكل مستوى → الرمز,النوع,السعر,الاسم,YYYYMMDD[,الحركة,الأوبن,التزايد]
 *  الحركة: عدد نقاط حركة القمة/القاع عن السحب السابق (موجب ↑ سالب ↓)، والأوبن والتزايد للمستوى */

async function tvReportFor(tk, params, stOver) {
  var keep = state.ticker;
  try {
    var d = await loadTicker(tk);
    if (!d) return null;
    state.ticker = tk;
    var ex = (typeof params.exps === "function" ? params.exps(d) : (params.exps || [])).filter(function (e) { return d.by_expiration && d.by_expiration[e]; });
    if (!ex.length) return null;
    var st0 = stOver || params.strikes;   // عدد سترايكات خاص بهذا الرمز (إن وُجد) وإلا إعداد التقرير
    var st = /^range:/.test(String(st0)) ? "ALL" : st0;
    return computeReports(d, ex, params.days, st, params.n, params.g);
  } catch (e) { return null; } finally { state.ticker = keep; }
}

/** نافذة «نسخ TradingView» — رموز متعددة في نص واحد، مستويات مقسّمة بين الرموز وقابلة للحذف بـ × */



  /* ================= نسخ المستويات (الصيغة: الرمز,النوع,السعر,الاسم,التاريخ,الحركة,الأوبن,التزايد) ================= */
function tvBuildLines(rep, tk, types) {
  var out = [], seen = {};
  function ymd(e) { return String(e).replace(/-/g, "").slice(0, 8); }
  function nm(e) {
    var d = new Date(String(e) + "T12:00:00"), m = d.toLocaleString("en", { month: "short" });
    return (typeof isThirdFridayExp === "function" && isThirdFridayExp(e)) ? "OPX " + m : d.getDate() + m;
  }
  function num(v) { return v == null || !isFinite(Number(v)) ? "" : String(Math.round(Number(v))); }
  function add(t, price, exp, extra) {
    if (price == null || !isFinite(Number(price))) return;
    var p = Math.round(Number(price) * 100) / 100, key = t + "|" + p + "|" + exp;
    if (seen[key]) return; seen[key] = 1;
    var ex = extra || {};
    var mv = (t === "P" || t === "T") && ex.diff ? num(ex.diff) : "";                 // حركة القمة/القاع (نقاط)
    var dl = ex.delta != null && Number(ex.delta) > 0 ? num(ex.delta) : "";           // التزايد
    var oi = num(ex.oi);                                                              // الأوبن
    var tail = (mv || oi || dl) ? "," + mv + "," + oi + "," + dl : "";
    var line = tk + "," + t + "," + p + "," + nm(exp) + "," + ymd(exp) + tail;
    out.push(line);
  }
  if (types.P) (rep.peaks || []).forEach(function (x) { add("P", x.strike, x.exp, x); });
  if (types.T) (rep.troughs || []).forEach(function (x) { add("T", x.strike, x.exp, x); });
  function ranked(list) {   // { تاريخ: [عناصر مرتبة بالتزايد تنازليًا] } — نأخذ الأعلى تزايدًا فقط
    var m = {};
    (list || []).forEach(function (x) { (m[x.exp] = m[x.exp] || []).push(x); });
    Object.keys(m).forEach(function (e) { m[e].sort(function (a, b) { return b.value - a.value; }); });
    return m;
  }
  function addRanked(lc, lp, ranks, cc, cp) {
    [[cc, lc], [cp, lp]].forEach(function (q) {
      var m = ranked(q[1]);
      Object.keys(m).forEach(function (e) {
        ranks.forEach(function (r) { var x = m[e][r]; if (x) add(q[0], x.strike, e, { oi: x.oi, delta: x.value }); });
      });
    });
  }
  if (types.O && rep.opxLv) {
    (rep.opxLv.peaks || []).forEach(function (x) { add("P", x.strike, x.exp, x); });
    (rep.opxLv.troughs || []).forEach(function (x) { add("T", x.strike, x.exp, x); });
    if (types.D) addRanked(rep.opxLv.deltaCall, rep.opxLv.deltaPut, [0], "DC", "DP");
  }
  if (types.D && rep.topPer) {
    (rep.topPer.call || []).forEach(function (x) { add("DC", x.strike, x.exp, { oi: x.oi, delta: x.value }); });
    (rep.topPer.put || []).forEach(function (x) { add("DP", x.strike, x.exp, { oi: x.oi, delta: x.value }); });
  }
  return out;
}

/** تقرير رمز آخر بنفس تواريخ/أيام/سترايكات التقرير الحالي (لنسخ عدة رموز دفعة واحدة) */

function openTvDialog(params) {
  var old = document.getElementById("repTvPop"); if (old) old.remove();
  var TICKS = INDEX_TICKERS.map(function (t) { return t.symbol; });      // المؤشرات الستة: SPY QQQ IWM GLD SPX NDX
  var COMPS = STOCKS_TICKERS.map(function (t) { return t.symbol; });     // الشركات (قائمة منسدلة)
  var ALLT = TICKS.concat(COMPS), compOpen = COMPS.indexOf(state.ticker) >= 0;
  var TYPES = [["P", "القمم"], ["T", "القيعان"], ["D", "الأعلى تزايدًا"]];
  var SECS = [["القمم والقيعان", ["P", "T"]], ["الأعلى تزايدًا", ["DC", "DP"]]];
  var TN = { P: "قمة", T: "قاع", DC: "Call", DP: "Put" };
  var selT = {}; selT[state.ticker] = true; selT.SPY = true; selT.QQQ = true;
  var selK = { P: true, T: true };
  var cache = {}, deleted = {}, lastLevels = [], selS = {};   // selS: عدد السترايكات لكل رمز
  var pop = document.createElement("div");
  pop.id = "repTvPop"; pop.className = "tv-pop";
  pop.innerHTML = '<div class="tv-box" dir="rtl">' +
    '<button type="button" class="tv-x" id="tvClose" aria-label="إغلاق">×</button>' +
    '<div class="tv-head"><div class="tv-title"><bdi dir="ltr">TradingView</bdi></div></div>' +
    '<div class="tv-body">' +
    '<div class="tv-sec"><div class="tv-lab">الرموز والسترايكات</div><div class="tv-strips" id="tvSyms"></div><div class="tv-more" id="tvMore"></div></div>' +
    '<div class="tv-sec"><div class="tv-lab">نوع المستويات</div><div class="tv-strips"><div class="tv-strip"><div class="tv-strip-in" id="tvTypes"></div></div></div></div>' +
    '<div class="tv-sec"><div class="tv-lab">المستويات <span id="tvCount"></span><button type="button" class="tv-restore" id="tvRestore" style="display:none"></button></div><div class="tv-cards" id="tvLevels"></div></div>' +
    "</div>" +
    '<div class="tv-foot"><button type="button" class="tv-copy" id="tvCopy"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg><span>نسخ المستويات</span><em id="tvCopyN"></em></button></div></div>';
  document.body.appendChild(pop);
  if (typeof params.onBack === "function") {
    var bk = document.createElement("button");
    bk.type = "button"; bk.className = "tv-back"; bk.textContent = "→ التواريخ";
    bk.onclick = function () { pop.remove(); params.onBack(); };
    pop.querySelector(".tv-box").appendChild(bk);
  }
  function chip(label, on, attr) { return '<button type="button" class="tv-chip' + (on ? " on" : "") + '" ' + attr + ">" + label + "</button>"; }
  var defSt = /^range:/.test(String(params.strikes)) ? "ALL" : String(params.strikes || "ALL");
  function applySk(inp) {
    var k = inp.getAttribute("data-sk"), v = String(inp.value || "").trim().toUpperCase();
    if (v === "الكل") v = "ALL";
    if (!(/^\d+$/.test(v) && Number(v) > 0) && v !== "ALL") v = "";
    if ((selS[k] || "") === v) return;
    selS[k] = v; build();
  }
  function symStrip(t) {   // شريحة رمز: الاسم (تفعيل/إلغاء) + السترايكات الخاصة به
    var on = !!selT[t], cur = selS[t] || "";
    return '<div class="tv-strip tv-sym' + (on ? " on" : "") + '">' +
      '<button type="button" class="tv-sym-name" data-tk="' + t + '">' + t + '</button>' +
      '<div class="tv-strip-in tv-sym-ctl"><span class="tv-pre">' +
      ["30", "50", "100", "ALL"].map(function (p) { return '<button type="button" class="tv-mini' + (cur === p ? " on" : "") + '" data-skp="' + t + "|" + p + '">' + p + "</button>"; }).join("") +
      '</span><input type="text" inputmode="numeric" class="tv-sk-in" data-sk="' + t + '" placeholder="' + defSt + '" value="' + cur + '" autocomplete="off" title="أي رقم، أو ALL"></div></div>';
  }
  function bindSyms(host) {
    host.querySelectorAll("[data-tk]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-tk"); selT[k] = !selT[k]; drawStrikes(); build(); }; });
    host.querySelectorAll("[data-sk]").forEach(function (inp) {
      var tm = null;
      inp.oninput = function () { clearTimeout(tm); tm = setTimeout(function () { applySk(inp); }, 600); };   // أي رقم حر يُطبَّق مباشرة
      inp.onchange = function () { clearTimeout(tm); applySk(inp); inp.value = selS[inp.getAttribute("data-sk")] || ""; };
    });
    host.querySelectorAll("[data-skp]").forEach(function (b) {
      b.onclick = function () { var q = b.getAttribute("data-skp").split("|"); selS[q[0]] = q[1]; selT[q[0]] = true; drawStrikes(); build(); };
    });
  }
  function drawStrikes() {
    var host = document.getElementById("tvSyms");
    host.innerHTML = TICKS.map(symStrip).join("");
    bindSyms(host);
    var more = document.getElementById("tvMore"), selC = COMPS.filter(function (c) { return selT[c]; });
    more.innerHTML = '<button type="button" class="tv-more-btn' + (compOpen ? " open" : "") + '" id="tvMoreBtn"><span class="tv-more-t">الشركات</span>' +
      (selC.length ? '<span class="tv-badge">' + selC.length + '</span><span class="tv-more-sel">' + selC.join(" · ") + "</span>" : "") +
      '<i class="tv-caret">⌄</i></button>' +
      (compOpen ? '<div class="tv-more-body"><div class="tv-chips tv-comp-chips">' + COMPS.map(function (c) { return chip(c, !!selT[c], 'data-ct="' + c + '"'); }).join("") +
        '</div><div class="tv-strips" id="tvCompSyms">' + selC.map(symStrip).join("") + "</div></div>" : "");
    document.getElementById("tvMoreBtn").onclick = function () { compOpen = !compOpen; drawStrikes(); };
    more.querySelectorAll("[data-ct]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-ct"); selT[k] = !selT[k]; drawStrikes(); build(); }; });
    var cs = document.getElementById("tvCompSyms"); if (cs) bindSyms(cs);
  }
  function drawChips() {
    document.getElementById("tvTypes").innerHTML = TYPES.map(function (q) { return chip(q[1], !!selK[q[0]], 'data-ty="' + q[0] + '"'); }).join("");
    pop.querySelectorAll("[data-ty]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-ty"); selK[k] = !selK[k]; drawChips(); build(); }; });
  }
  var seq = 0;
  async function build() {
    var my = ++seq, host = document.getElementById("tvLevels");
    host.innerHTML = '<div class="tv-empty">جارٍ التحضير…</div>';
    var tks = ALLT.filter(function (t) { return selT[t]; }), all = [];
    for (var i = 0; i < tks.length; i++) {
      var tk = tks[i], ck = tk + "|" + (selS[tk] || "def");
      if (!(ck in cache)) cache[ck] = await tvReportFor(tk, params, selS[tk] || "");
      if (my !== seq) return;
      var rows = cache[ck] ? tvBuildLines(cache[ck], tk, selK) : [];
      rows.forEach(function (line) {
        var p = line.split(",");
        all.push({ line: line, tk: p[0], t: p[1], price: p[2], label: p[3], mv: p[5] || "" });
      });
    }
    lastLevels = all;
    drawLevels();
  }
  function drawLevels() {
    var host = document.getElementById("tvLevels"), shown = lastLevels.filter(function (l) { return !deleted[l.line]; });
    var nDel = lastLevels.length - shown.length;
    document.getElementById("tvCount").textContent = "· " + shown.length;
    document.getElementById("tvCopyN").textContent = shown.length ? "(" + shown.length + ")" : "";
    var rs = document.getElementById("tvRestore");
    rs.style.display = nDel ? "" : "none"; rs.textContent = "استعادة المحذوف (" + nDel + ")";
    if (!shown.length) { host.innerHTML = '<div class="tv-empty">لا مستويات — يُختار رمز ونوع</div>'; return; }
    var tks = []; shown.forEach(function (l) { if (tks.indexOf(l.tk) < 0) tks.push(l.tk); });
    host.innerHTML = tks.map(function (tk) {
      var mine = shown.filter(function (l) { return l.tk === tk; });
      var secs = SECS.map(function (sc) {
        var items = mine.filter(function (l) { return sc[1].indexOf(l.t) >= 0; });
        if (!items.length) return "";
        return '<div class="tv-secbox"><div class="tv-sec-h">' + sc[0] + " <span>" + items.length + '</span></div><div class="tv-chips tv-lvgrid">' + items.map(function (l) {
          var mv = l.mv && Number(l.mv) ? '<i class="tv-mv ' + (Number(l.mv) > 0 ? "up" : "dn") + '">' + (Number(l.mv) > 0 ? "▲" : "▼") + Math.abs(Number(l.mv)) + "</i>" : "";
          var tag = l.t.charAt(0) === "D" ? '<i class="tv-star" title="الأعلى تزايدًا">★</i>' : "";
          return '<div class="tv-lv tv-t-' + l.t.charAt(0) + '"><span class="tv-lv-tag">' + tag + '</span><span class="tv-lv-main"><b>' + l.price + "</b><small>" + (TN[l.t] || l.t) + " · " + l.label + "</small>" + mv + '</span><button type="button" class="tv-lx" data-l="' + l.line.replace(/"/g, "&quot;") + '" title="حذف هذا المستوى">×</button></div>';
        }).join("") + "</div></div>";
      }).join("");
      return '<div class="tv-card"><div class="tv-card-h">' + tk + " <span>" + mine.length + "</span></div>" + secs + "</div>";
    }).join("");
    host.querySelectorAll(".tv-lx").forEach(function (b) { b.onclick = function () { deleted[b.getAttribute("data-l")] = 1; drawLevels(); }; });
  }
  document.getElementById("tvRestore").onclick = function () { deleted = {}; drawLevels(); };
  function textOut() {
    var shown = lastLevels.filter(function (l) { return !deleted[l.line]; });
    var tks = []; shown.forEach(function (l) { if (tks.indexOf(l.tk) < 0) tks.push(l.tk); });
    return { n: shown.length, text: ["# OI-LEVELS " + tks.join(" ")].concat(shown.map(function (l) { return l.line; })).join("\n") };
  }
  document.getElementById("tvCopy").onclick = function () {
    var o = textOut();
    if (!o.n) { setStatus("لا مستويات للنسخ", "err"); return; }
    repCopyText(o.text, "تم نسخ " + o.n + " مستوى — تُلصق في خانة المستويات داخل إعدادات المؤشر");
  };
  function close() { pop.remove(); }
  document.getElementById("tvClose").onclick = close;
  pop.addEventListener("click", function (ev) { if (ev.target === pop) close(); });
  drawChips();
  drawStrikes();
  build();
}

/** الصندوقين: SPY و QQQ متقابلان */


  /* ================= كود المؤشر (النسخة v17) ================= */
  var TV_PINE_CODE = "//@version=5\nindicator(\"Oi Levels\", shorttitle=\"Oi Levels\", overlay=true, max_lines_count=500, max_labels_count=500)\n\n// ════════════════════════════════════════════════════════════\n//  Oi Levels\n//  صيغة كل سطر:  الرمز,النوع,السعر,الاسم,تاريخ الانتهاء(YYYYMMDD)\n//  الأنواع:  P قمة (كول) | T قاع (بوت) | DC / DP / D أعلى تزايد\n//  السطر الذي يبدأ بـ # يُتجاهل (طريقة لإخفاء مستوى بعينه)\n//  ملاحظة: المحارف غير المرئية (RLE / PDF / RLM) داخل الكود تضبط اتجاه النص العربي، ولا تُحذف\n// ════════════════════════════════════════════════════════════\n\nVER = \"v18\"   // رقم النسخة (يظهر في لوحة المعلومات أسفل يسار الشارت للتأكد من النسخة المفعّلة)\nNC = 8     // عدد فئات الصفوف لكل مستوى\nAXN = 30   // عدد مستويات المسطرة (الحد الأعلى لعدد الصناديق على محور السعر)\n\n// ===== المستويات =====\nGRP1 = \"المستويات\"\nlevelsTxt  = input.text_area(\"\", \"المستويات\", group=GRP1, tooltip=\"يُلصق هنا الناتج من زر «نسخ لـ TradingView» في الويب. كل سطر: الرمز,النوع,السعر,الاسم,تاريخ الانتهاء. الرمز * أو ALL يطابق أي رمز.\")\nlevelsTxt2 = input.text_area(\"\", \"المستويات (2) — لصق إضافي\", group=GRP1, tooltip=\"خانة إضافية للصق دفعة ثانية (مثلًا رمز آخر). تُدمج مع الخانتين الأخرى.\")\nlevelsTxt3 = input.text_area(\"\", \"المستويات (3) — لصق إضافي\", group=GRP1)\nsrcTicker  = input.string(\"\", \"رمز المستويات (فارغ = تعرّف تلقائي)\", group=GRP1, tooltip=\"يُترك فارغًا: يُتعرّف تلقائيًا على رمز الرسم، ومنه SPX500 / US500 / ES ← SPX، و NAS100 / US100 / NQ ← NDX، وبقية الرموز (SPY / QQQ / IWM ...) كما هي.\", display=display.none)\nratio      = input.float(1.0, \"نسبة التحويل (السعر × النسبة)\", minval=0.0001, step=0.0001, group=GRP1, display=display.none)\nautoDelete = input.bool(true, \"حذف المنتهي تلقائيًا\", group=GRP1, display=display.none)\ntz         = input.string(\"GMT+3\", \"المنطقة الزمنية للتواريخ\", group=GRP1, tooltip=\"تُحدَّد بها «اليوم» و«يوم بعد» و«الأسبوع»، ويُعدّ المستوى منتهيًا بنهاية يوم تاريخه بهذه المنطقة. في عطلة نهاية الأسبوع يُعامل أول يوم تداول (الإثنين) معاملة «اليوم».\", display=display.none)\nhidTxt     = input.string(\"\", \"أسعار مخفية (مفصولة بفاصلة)\", group=GRP1, tooltip=\"مثال: 7800,7650 — يُخفي كل المستويات بهذه الأسعار دون حذفها من النص.\", display=display.none)\n\n// ===== النص =====\nGRP2 = \"النص\"\nshowText     = input.bool(true, \"إظهار النص\", group=GRP2, display=display.none)\nlabelMode    = input.string(\"على الخط\", \"موضع النص\", options=[\"على الخط\", \"فوق الخط\"], group=GRP2, tooltip=\"كل مستوى له نص واحد متعدد الأسطر يُثبَّت عند سعر خطه تمامًا، فأسطره متلاصقة بمسافة ثابتة مهما كان الفريم أو توسيع المسطرة.\", display=display.none)\nalignEnd     = input.bool(true, \"النص ينتهي عند أقصى اليمين (ملاصق للمسطرة)\", group=GRP2, display=display.none)\ntxtOffset    = input.int(80, \"مسافة النص عن آخر شمعة (شموع)\", minval=1, maxval=500, group=GRP2, tooltip=\"يحدد مدى ابتعاد النص لليمين. تُضبط مرة واحدة حسب التقريب (zoom).\", display=display.none)\nlang         = input.string(\"عربي\", \"لغة النص\", options=[\"عربي\", \"English\"], group=GRP2, display=display.none)\nshowName     = input.bool(false, \"إظهار الاسم (العمود الرابع) على الخط\", group=GRP2, display=display.none)\nshowPxInText = input.bool(false, \"كتابة الرقم داخل النص (يظهر أصلًا على المسطرة)\", group=GRP2, display=display.none)\nshowDist     = input.bool(false, \"إظهار المسافة عن السعر الحالي %\", group=GRP2, display=display.none)\nshowMove     = input.bool(true, \"إظهار حركة القمة/القاع بالأسهم ▲ ▼ (عدد النقاط)\", group=GRP2, tooltip=\"يظهر عندما تحمل البيانات عمود الحركة (السادس). موجب = ارتفعت ▲، سالب = انخفضت ▼.\", display=display.none)\nstarMode     = input.string(\"تلقائي\", \"شكل نجمة الأعلى تزايدًا\", options=[\"تلقائي\", \"⭐ إيموجي\", \"★ بلون الصف\", \"بدون نجمة\"], group=GRP2, tooltip=\"تلقائي: ⭐ العادية، وتصبح ★ بلون الصف في نمط «حسب التاريخ». ⭐ الإيموجي لا يتغير لونها أبدًا. ★ تأخذ لون الصف. بدون نجمة: يُكتب (1) مثل بقية الترتيب.\", display=display.none)\nshowCP       = input.bool(true, \"كتابة C / P أمام تواريخ التزايد\", group=GRP2, tooltip=\"C للكول وP للبوت، لكل تاريخ حسب نوعه.\", display=display.none)\nshowNums     = input.bool(true, \"إظهار الأوبن والتزايد عند وجود تزايد\", group=GRP2, tooltip=\"يظهر عندما تحمل البيانات عمودي الأوبن (السابع) والتزايد (الثامن)، بصيغة: الأوبن (+التزايد).\", display=display.none)\ncompactMode  = input.bool(false, \"عرض مختصر: الحرف C/P مع الأوبن والتزايد فقط\", group=GRP2, tooltip=\"بلا كلمة قمة/قاع ولا التاريخ: يظهر الحرف (C للقمة وتزايد الكول، P للقاع وتزايد البوت) ثم الأوبن (+التزايد).\", display=display.none)\ntxtSize      = input.string(\"normal\", \"حجم النص\", options=[\"tiny\", \"small\", \"normal\", \"large\"], group=GRP2, display=display.none)\ntextTransp   = input.int(0, \"شفافية لون النص\", minval=0, maxval=100, group=GRP2, display=display.none)\nbgOn         = input.bool(true, \"خلفية للنص\", group=GRP2, display=display.none)\nbgTransp     = input.int(40, \"شفافية الخلفية\", minval=0, maxval=100, group=GRP2, tooltip=\"تخص الخلفية فقط، ولون النص مستقل عنها.\", display=display.none)\n\n// ===== الخط =====\nGRP3 = \"الخط\"\nlineW      = input.int(2, \"سُمك الخط\", minval=1, maxval=5, group=GRP3, display=display.none)\nlineTransp = input.int(55, \"شفافية الخط\", minval=0, maxval=95, group=GRP3, display=display.none)\nlineSty    = input.string(\"متصل\", \"نمط الخط\", options=[\"متصل\", \"متقطع\", \"منقط\"], group=GRP3, display=display.none)\nlenBack    = input.int(40, \"طول الخط للخلف (شموع)\", minval=0, maxval=400, group=GRP3, display=display.none)\nlenFwd     = input.int(30, \"طول الخط للأمام (شموع)\", minval=1, maxval=500, group=GRP3, display=display.none)\nextendR    = input.bool(false, \"تمديد الخط لليمين\", group=GRP3, display=display.none)\n\n// ===== المسطرة =====\nGRP6 = \"المسطرة (محور السعر)\"\nshowAxis = input.bool(true, \"إظهار رقم المستوى في صندوق على محور السعر\", group=GRP6, tooltip=\"يظهر الصندوق بلون المستوى. يلزم تفعيل عرض قيم المؤشرات على محور السعر من إعدادات الرسم (المقياس).\", display=display.none)\n\n// ===== عام =====\nGRP4 = \"عام\"\nmergeSame = input.bool(true, \"دمج المستويات المتطابقة في السعر (تجمع التواريخ)\", group=GRP4, display=display.none)\nshowInfo  = input.bool(true, \"إظهار لوحة المعلومات\", group=GRP4, display=display.none)\n\n// ===== نمط التلوين =====\nGRP8 = \"نمط التلوين\"\ncolorMode = input.string(\"موحّد\", \"نمط التلوين\", options=[\"موحّد\", \"كول/بوت\", \"حسب التاريخ\"], group=GRP8, tooltip=\"موحّد: لون واحد لكل الخطوط (الأساسي). كول/بوت: لون للكول ولون للبوت، والخط حيادي عند اجتماع قمة وقاع. حسب التاريخ: لكل يوم لون مستقل لقمته وقاعه وتزايده (اليوم ويوم بعد والأسبوع وOPX والشهر)، ويُلوَّن الخط بأقرب تاريخ فيه.\", display=display.none)\noneColor    = input.color(color.gray, \"اللون الموحّد\", group=GRP8, display=display.none)\n\n// ===== الألوان =====\nGRP5 = \"ألوان الأنواع\"\ncCall = input.color(#F77C80, \"لون الكول (قمة / تزايد كول)\", group=GRP5, display=display.none)\ncPut  = input.color(#22AB94, \"لون البوت (قاع / تزايد بوت)\", group=GRP5, display=display.none)\ncD  = input.color(#e5b84b, \"تزايد عام\", group=GRP5, display=display.none)\ncN  = input.color(#9598A1, \"حيادي (قمة وقاع على نفس الخط)\", group=GRP5, display=display.none)\n\n// ===== ألوان التواريخ (لنمط «حسب التاريخ») =====\nGRP7 = \"ألوان التواريخ\"\ncDay    = input.color(#F77C80, \"اليوم\", group=GRP7, display=display.none)\ncNextD  = input.color(#FFA726, \"يوم بعد\", group=GRP7, display=display.none)\ncWeekD  = input.color(#22AB94, \"الأسبوع\", group=GRP7, display=display.none)\ncOpxD   = input.color(#5B9CF6, \"OPX\", group=GRP7, display=display.none)\ncMonthD = input.color(#A78BFA, \"الشهر\", group=GRP7, display=display.none)\ncOtherD = input.color(#9598A1, \"تواريخ أخرى\", group=GRP7, display=display.none)\n\n// ===== ثوابت =====\nisAr    = lang == \"عربي\"\nemb     = isAr ? \"‫\" : \"\"   // بداية سياق يمين ← يسار\npdf     = isAr ? \"‬\" : \"\"   // نهايته\nblank   = \" ​\"   // سطر فارغ لتثبيت موضع الصفوف الملوّنة\nrlm     = isAr ? \"‏\" : \"\"   // يُبقي الرقم بعد الحرف في ترتيب القراءة\nstarTxt = starMode == \"بدون نجمة\" ? \"\" : starMode == \"⭐ إيموجي\" ? \"⭐\" : starMode == \"★ بلون الصف\" ? \"★\" : (colorMode == \"حسب التاريخ\" ? \"★\" : \"⭐\")\nuni     = colorMode == \"موحّد\"\nbyType  = colorMode == \"كول/بوت\"\nbyDate  = colorMode == \"حسب التاريخ\"\nwToday  = isAr ? \"اليوم\" : \"Today\"\nwNext   = isAr ? \"يوم بعد\" : \"Next day\"\nwWeek   = isAr ? \"الأسبوع\" : \"Week\"\nwMonth  = isAr ? \"الشهر الحالي\" : \"This month\"\nwPeak   = isAr ? \"قمة\" : \"Peak\"\nwTrough = isAr ? \"قاع\" : \"Trough\"\nvar monAr = array.from(\"يناير\", \"فبراير\", \"مارس\", \"أبريل\", \"مايو\", \"يونيو\", \"يوليو\", \"أغسطس\", \"سبتمبر\", \"أكتوبر\", \"نوفمبر\", \"ديسمبر\")\nvar monEn = array.from(\"Jan\", \"Feb\", \"Mar\", \"Apr\", \"May\", \"Jun\", \"Jul\", \"Aug\", \"Sep\", \"Oct\", \"Nov\", \"Dec\")\n\n// الأسماء البديلة للمؤشرات (تعرّف تلقائي)\nvar spxAl = array.from(\"SPX\", \"SPX500\", \"SPXUSD\", \"SPX500USD\", \"US500\", \"SP500\", \"GSPC\", \"ES\", \"ES1\", \"MES\", \"MES1\")\nvar ndxAl = array.from(\"NDX\", \"NAS100\", \"NAS100USD\", \"US100\", \"USTEC\", \"NQ\", \"NQ1\", \"MNQ\", \"MNQ1\", \"NDX100\", \"NASDAQ100\")\n\nvar array<line>  lns = array.new<line>()\nvar array<label> lbs = array.new<label>()\nvar table infoTbl = table.new(position.bottom_left, 1, 1)\nvar array<float> axisPx  = array.new_float(AXN, na)\nvar array<color> axisCol = array.new_color(AXN, color.gray)\n\n// ===== دوال =====\nf_tk(s) =>\n    u = str.upper(str.trim(s))\n    p = str.pos(u, \":\")\n    na(p) ? u : str.substring(u, p + 1)\n\nf_canon(s) =>\n    u = str.replace_all(f_tk(s), \"!\", \"\")\n    array.includes(spxAl, u) ? \"SPX\" : array.includes(ndxAl, u) ? \"NDX\" : u\n\nf_key(ts) =>\n    year(ts, tz) * 10000 + month(ts, tz) * 100 + dayofmonth(ts, tz)\n\nf_expiry(s) =>\n    y = str.tonumber(str.substring(s, 0, 4))\n    m = str.tonumber(str.substring(s, 4, 6))\n    d = str.tonumber(str.substring(s, 6, 8))\n    (na(y) or na(m) or na(d)) ? na : timestamp(tz, int(y), int(m), int(d), 23, 59, 59)\n\nf_has(cur, add) =>\n    str.contains(\" + \" + cur + \" + \", \" + \" + add + \" + \")\n\n// فئة الصف: 0 قمة، 1 قاع، 2 أعلى تزايد، 7 أخرى\nf_cat(t) =>\n    t == \"P\" ? 0 : t == \"T\" ? 1 : str.startswith(t, \"D\") ? 2 : 7\n\n// أسطر فارغة قبل النص أو بعده (لتوزيع صفوف ملوّنة بمسافة ثابتة بالبكسل)\nf_padB(n) =>\n    string s = \"\"\n    if n > 0\n        for i = 1 to n\n            s += blank + \"\\n\"\n    s\n\nf_padA(n) =>\n    string s = \"\"\n    if n > 0\n        for i = 1 to n\n            s += \"\\n\" + blank\n    s\n\n// نص صف واحد: قمة/قاع/أعلى تزايد\nf_row(q, dd, ot, nmv) =>\n    string txt = \"\"\n    if q == 2 and starTxt != \"\"\n        txt := starTxt\n        if dd != \"\"\n            txt += \" \" + dd\n    else\n        word = q == 0 ? wPeak : q == 1 ? wTrough : q == 2 ? \"(1)\" : (ot == \"\" ? \"-\" : ot)\n        if compactMode\n            txt := q < 2 ? dd : (dd == \"\" ? word : word + \" \" + dd)\n        else\n            txt := word\n            if dd != \"\"\n                txt += \" | \" + dd\n    if showName and nmv != \"\"\n        txt += \" · \" + nmv\n    txt\n\n// لون التاريخ حسب رتبته: 0 اليوم، 1 يوم بعد، 2 الشهر، 3 OPX، 4 الأسبوع، غير ذلك أخرى\nf_rkCol(r) =>\n    r == 0 ? cDay : r == 1 ? cNextD : r == 2 ? cMonthD : r == 3 ? cOpxD : r == 4 ? cWeekD : cOtherD\n\n// تنسيق رقم صحيح بفواصل الآلاف (19711 ← 19,711)\nf_num(x) =>\n    s = str.tostring(math.round(math.abs(x)))\n    string r = \"\"\n    L = str.length(s)\n    for i = 0 to L - 1\n        r += str.substring(s, i, i + 1)\n        rm = L - 1 - i\n        if rm > 0 and rm % 3 == 0\n            r += \",\"\n    r\n\n// وصف واحد لكل تاريخ بالأولوية:\n// اليوم > آخر يوم عمل بالشهر (الشهر الحالي / اسم الشهر) > OPX{الشهر} (ثالث جمعة) > الأسبوع (أقرب جمعة) > يوم بعد > يوم + شهر\n// عطلة نهاية الأسبوع: أول يوم تداول (الإثنين) = «اليوم»\nf_date(ex) =>\n    string res = \"\"\n    int rk = 6\n    kn = str.length(ex) == 8 ? str.tonumber(ex) : na\n    if not na(kn)\n        y = int(math.floor(kn / 10000))\n        m = int(math.floor((kn % 10000) / 100))\n        d = int(math.floor(kn % 100))\n        mName = (m >= 1 and m <= 12) ? array.get(isAr ? monAr : monEn, m - 1) : str.tostring(m)\n\n        nowNoon = timestamp(tz, year(timenow, tz), month(timenow, tz), dayofmonth(timenow, tz), 12, 0, 0)\n        dowNow = dayofweek(nowNoon, tz)\n        addD = dowNow == dayofweek.saturday ? 2 : dowNow == dayofweek.sunday ? 1 : 0\n        tdNoon = nowNoon + addD * 86400000\n        dowT = dayofweek(tdNoon, tz)\n        todayK = f_key(tdNoon)\n        nextK = f_key(tdNoon + (dowT == dayofweek.friday ? 3 : 1) * 86400000)\n        friK = f_key(tdNoon + ((dayofweek.friday - dowT + 7) % 7) * 86400000)\n        isCurMonth = m == month(tdNoon, tz) and y == year(tdNoon, tz)\n\n        dow = dayofweek(timestamp(tz, y, m, d, 12, 0, 0), tz)\n        nextM = m == 12 ? 1 : m + 1\n        nextY = m == 12 ? y + 1 : y\n        lastTs = timestamp(tz, nextY, nextM, 1, 12, 0, 0) - 86400000\n        lastD = dayofmonth(lastTs, tz)\n        lastDow = dayofweek(lastTs, tz)\n        lastBiz = lastD - (lastDow == dayofweek.sunday ? 2 : lastDow == dayofweek.saturday ? 1 : 0)\n        isOpx = dow == dayofweek.friday and d >= 15 and d <= 21\n\n        res := kn == todayK ? wToday : d == lastBiz ? (isCurMonth ? wMonth : mName) : isOpx ? \"OPX\" + str.tostring(m) + rlm : kn == friK ? wWeek : kn == nextK ? wNext : str.tostring(d) + \" \" + mName\n        rk := kn == todayK ? 0 : d == lastBiz ? 2 : isOpx ? 3 : kn == friK ? 4 : kn == nextK ? 1 : 5\n    [res, rk]\n\n// ===== الرسم =====\nif barstate.islast\n    while array.size(lns) > 0\n        line.delete(array.pop(lns))\n    while array.size(lbs) > 0\n        label.delete(array.pop(lbs))\n    for i = 0 to AXN - 1\n        array.set(axisPx, i, na)\n\n    myTk = f_canon(str.length(srcTicker) > 0 ? srcTicker : syminfo.ticker)\n    rows = str.split(levelsTxt + \"\\n\" + levelsTxt2 + \"\\n\" + levelsTxt3, \"\\n\")\n    sz = txtSize == \"tiny\" ? size.tiny : txtSize == \"normal\" ? size.normal : txtSize == \"large\" ? size.large : size.small\n    lst = lineSty == \"متقطع\" ? line.style_dashed : lineSty == \"منقط\" ? line.style_dotted : line.style_solid\n    stl = labelMode == \"فوق الخط\" ? (alignEnd ? label.style_label_lower_right : label.style_label_lower_left) : (alignEnd ? label.style_label_right : label.style_label_left)\n    hal = alignEnd ? text.align_right : text.align_left\n\n    // --- الأسعار المخفية ---\n    hid = array.new_float()\n    hp = str.split(hidTxt, \",\")\n    for i = 0 to array.size(hp) - 1\n        hv = str.tonumber(str.trim(array.get(hp, i)))\n        if not na(hv)\n            array.push(hid, hv)\n\n    // --- 1) القراءة ---\n    pxA  = array.new_float()\n    tA   = array.new_string()\n    exA  = array.new_string()\n    nmA  = array.new_string()\n    ordA = array.new_float()\n    mvA  = array.new_float()\n    oiA  = array.new_float()\n    dlA  = array.new_float()\n    totalRows = 0\n    for i = 0 to array.size(rows) - 1\n        ln = str.trim(array.get(rows, i))\n        if str.length(ln) > 0 and str.substring(ln, 0, 1) != \"#\"\n            p = str.split(ln, \",\")\n            if array.size(p) >= 3\n                totalRows += 1\n                tkr = f_canon(array.get(p, 0))\n                t = str.upper(str.trim(array.get(p, 1)))\n                px = str.tonumber(str.trim(array.get(p, 2)))\n                nm = array.size(p) >= 4 ? str.trim(array.get(p, 3)) : \"\"\n                ex = array.size(p) >= 5 ? str.trim(array.get(p, 4)) : \"\"\n                ok = not na(px) and (tkr == myTk or tkr == \"*\" or tkr == \"ALL\")\n                if ok and array.includes(hid, px)\n                    ok := false\n                if ok and autoDelete and str.length(ex) == 8\n                    exTs = f_expiry(ex)\n                    if not na(exTs)\n                        ok := timenow <= exTs\n                if ok\n                    kn = str.length(ex) == 8 ? str.tonumber(ex) : na\n                    array.push(pxA, px)\n                    array.push(tA, t)\n                    array.push(exA, ex)\n                    array.push(nmA, nm)\n                    array.push(mvA, array.size(p) >= 6 ? str.tonumber(str.trim(array.get(p, 5))) : na)\n                    array.push(oiA, array.size(p) >= 7 ? str.tonumber(str.trim(array.get(p, 6))) : na)\n                    array.push(dlA, array.size(p) >= 8 ? str.tonumber(str.trim(array.get(p, 7))) : na)\n                    array.push(ordA, math.round(px * 100) * 100000000 + nz(kn))\n\n    n = array.size(pxA)\n\n\n    // --- 2) الترتيب (سعر ثم تاريخ) والتجميع: لكل سعر 5 فئات 0 قمة 1 قاع 2 تزايد 3 ترتيب 4 أخرى ---\n    gPx   = array.new_float()\n    gHas  = array.new_bool()\n    gDt   = array.new_string()\n    gNm   = array.new_string()\n    gDC   = array.new_bool()\n    gDP   = array.new_bool()\n    gOT   = array.new_string()\n    rwG   = array.new_int()      // صفوف لكل تاريخ (لنمط التاريخ)\n    rwQ   = array.new_int()\n    rwTok = array.new_string()\n    rwRk  = array.new_int()\n    gRk   = array.new_int()   // أقرب رتبة تاريخ لكل مستوى\n    wallKeys = array.new_string()   // قمة/قاع لها تزايد ظاهر: لا يتكرر رقمها مع الأعلى تزايدًا\n    gSide = array.new_int()   // جهة الخط: 1 كول، 2 بوت، 0 حيادي/بلا جهة\n\n    if n > 0\n        idx = array.sort_indices(ordA, order.ascending)\n        rowG = array.new_int()\n        float lastKey = na\n        // المرور الأول: تكوين المجموعات\n        for k = 0 to n - 1\n            j = array.get(idx, k)\n            px = array.get(pxA, j)\n            t = array.get(tA, j)\n            key = math.round(px * 100)\n            if not mergeSame or na(lastKey) or key != lastKey\n                array.push(gPx, px)\n                array.push(gDC, false)\n                array.push(gDP, false)\n                array.push(gOT, \"\")\n                array.push(gRk, 9)\n                for q = 0 to NC - 1\n                    array.push(gHas, false)\n                    array.push(gDt, \"\")\n                    array.push(gNm, \"\")\n            lastKey := key\n            gi = array.size(gPx) - 1\n            array.push(rowG, gi)\n            cat = f_cat(t)\n            ci = gi * NC + cat\n            array.set(gHas, ci, true)\n            dl0 = array.get(dlA, j)\n            if cat < 2 and not na(dl0) and dl0 > 0\n                array.push(wallKeys, str.tostring(gi) + \"|\" + (cat == 0 ? \"1\" : \"2\") + \"|\" + array.get(exA, j))\n            nmv = array.get(nmA, j)\n            if nmv != \"\"\n                array.set(gNm, ci, nmv)\n            if t == \"DC\"\n                array.set(gDC, gi, true)\n            if t == \"DP\"\n                array.set(gDP, gi, true)\n            if cat == 4 and array.get(gOT, gi) == \"\"\n                array.set(gOT, gi, t)\n\n        // جهة كل خط: القمة/القاع أولًا، ثم التزايد إن لم توجد قمة أو قاع\n        mm = array.size(gPx)\n        for g = 0 to mm - 1\n            hP = array.get(gHas, g * NC)\n            hT = array.get(gHas, g * NC + 1)\n            dc = array.get(gDC, g)\n            dp = array.get(gDP, g)\n            int sd = 0\n            if hP and hT\n                sd := 0\n            else if hP\n                sd := 1\n            else if hT\n                sd := 2\n            else if dc and dp\n                sd := 0\n            else if dc\n                sd := 1\n            else if dp\n                sd := 2\n            array.push(gSide, sd)\n\n        // المرور الثاني: التواريخ (أمام تاريخ التزايد حرف C أو P عند الحاجة)\n        for k = 0 to n - 1\n            j = array.get(idx, k)\n            gi = array.get(rowG, k)\n            t = array.get(tA, j)\n            cat = f_cat(t)\n            ci = gi * NC + cat\n            [dtxt, drk] = f_date(array.get(exA, j))\n            array.set(gRk, gi, math.min(array.get(gRk, gi), drk))\n            string tok = compactMode ? \"\" : dtxt\n            if cat == 2 and (t == \"DC\" or t == \"DP\") and (showCP or compactMode)\n                L = t == \"DC\" ? \"C\" : \"P\"\n                tok := tok == \"\" ? L + rlm : L + rlm + \" \" + tok\n            else if compactMode and cat < 2\n                tok := (cat == 0 ? \"C\" : \"P\") + rlm\n            // حركة القمة/القاع (▲ ▼ وعدد النقاط) ثم الأوبن (+التزايد) عند وجود تزايد\n            mvv = array.get(mvA, j)\n            oiv = array.get(oiA, j)\n            dlv = array.get(dlA, j)\n            string extra = \"\"\n            if showMove and (cat == 0 or cat == 1) and not na(mvv) and mvv != 0\n                extra := (mvv > 0 ? \"▲\" : \"▼\") + f_num(mvv)\n            wk = str.tostring(gi) + \"|\" + (t == \"DC\" ? \"1\" : \"2\") + \"|\" + array.get(exA, j)\n            dupNums = cat == 2 and array.includes(wallKeys, wk)\n            bool hasDl = not na(dlv) and dlv > 0\n            bool hasOi = not na(oiv) and oiv > 0\n            if showNums and not dupNums and (hasDl or hasOi)\n                string nums = hasOi ? f_num(oiv) : \"\"\n                if hasDl\n                    nums := (nums == \"\" ? \"\" : nums + \" \") + \"(+\" + f_num(dlv) + \")\"\n                extra := extra == \"\" ? nums : extra + \"  \" + nums\n            if extra != \"\"\n                tok := tok == \"\" ? extra : tok + \"  \" + extra\n            cur = array.get(gDt, ci)\n            if tok != \"\" and not f_has(cur, tok)\n                array.set(gDt, ci, cur == \"\" ? tok : cur + \" + \" + tok)\n            // صف مستقل لكل (فئة، تاريخ) لنمط التلوين حسب التاريخ\n            bool dupR = false\n            rn0 = array.size(rwG)\n            if rn0 > 0\n                for r = 0 to rn0 - 1\n                    if array.get(rwG, r) == gi and array.get(rwQ, r) == cat and array.get(rwTok, r) == tok\n                        dupR := true\n            if not dupR\n                array.push(rwG, gi)\n                array.push(rwQ, cat)\n                array.push(rwTok, tok)\n                array.push(rwRk, drk)\n\n    m = array.size(gPx)\n\n    // --- 3) الصفوف والرسم: كل نص يُثبَّت عند سعر خطه تمامًا (بلا إزاحة) ---\n    xLine = bar_index + (extendR ? lenFwd : math.max(lenFwd, txtOffset))\n    xLbl  = bar_index + txtOffset\n\n    if m > 0\n        for g = 0 to m - 1\n            px = array.get(gPx, g)\n            price = px * ratio\n            hasP = array.get(gHas, g * NC)\n            hasT = array.get(gHas, g * NC + 1)\n            hasD = array.get(gHas, g * NC + 2)\n            dcf = array.get(gDC, g)\n            dpf = array.get(gDP, g)\n            sd = array.get(gSide, g)\n            conflict = (hasP and hasT) or (not hasP and not hasT and dcf and dpf)\n\n            // لون الخط\n            color lc = oneColor\n            if byDate\n                lc := f_rkCol(array.get(gRk, g))\n            else if byType\n                if conflict\n                    lc := cN\n                else if sd == 1\n                    lc := cCall\n                else if sd == 2\n                    lc := cPut\n                else if hasD\n                    lc := cD\n\n            // الصفوف (من الأعلى للأسفل): قمة، قاع، أعلى تزايد، أخرى\n            rt = array.new_string()\n            rc = array.new_color()\n            for q = 0 to NC - 1\n                if array.get(gHas, g * NC + q)\n                    ot = array.get(gOT, g)\n                    nmv = array.get(gNm, g * NC + q)\n                    if byDate\n                        int cntR = 0\n                        rn = array.size(rwG)\n                        if rn > 0\n                            for r = 0 to rn - 1\n                                if array.get(rwG, r) == g and array.get(rwQ, r) == q\n                                    array.push(rt, f_row(q, array.get(rwTok, r), ot, nmv))\n                                    array.push(rc, f_rkCol(array.get(rwRk, r)))\n                                    cntR += 1\n                        if cntR == 0\n                            array.push(rt, f_row(q, \"\", ot, nmv))\n                            array.push(rc, cOtherD)\n                    else\n                        color rowC = oneColor\n                        if byType\n                            rowC := q == 0 ? cCall : q == 1 ? cPut : q == 2 ? (dcf and dpf ? cN : dcf ? cCall : dpf ? cPut : cD) : oneColor\n                        array.push(rt, f_row(q, array.get(gDt, g * NC + q), ot, nmv))\n                        array.push(rc, rowC)\n\n            K = array.size(rt)\n            string allT = \"\"\n            if K > 0\n                string first = array.get(rt, 0)\n                if showDist and close != 0\n                    pct = (price - close) / close * 100\n                    first += \"  (\" + (pct >= 0 ? \"+\" : \"\") + str.tostring(pct, \"#.##\") + \"%)\"\n                if showPxInText or g >= AXN or not showAxis\n                    first := str.tostring(px) + \" \" + first\n                array.set(rt, 0, first)\n                for i = 0 to K - 1\n                    t2 = emb + array.get(rt, i) + pdf\n                    array.set(rt, i, t2)\n                    allT := i == 0 ? t2 : allT + \"\\n\" + t2\n\n            array.push(lns, line.new(math.max(0, bar_index - lenBack), price, xLine, price, color=color.new(lc, lineTransp), width=lineW, style=lst, extend=extendR ? extend.right : extend.none))\n            if g < AXN\n                array.set(axisPx, g, price)\n                array.set(axisCol, g, lc)\n\n            if showText and K > 0\n                bgc = bgOn ? color.new(chart.bg_color, bgTransp) : color.new(lc, 100)\n                if uni or K == 1\n                    c1 = uni ? lc : array.get(rc, 0)\n                    array.push(lbs, label.new(xLbl, price, allT, style=stl, color=bgc, textcolor=color.new(c1, textTransp), size=sz, textalign=hal))\n                else\n                    // خلفية واحدة للكتلة، ثم كل صف بلونه في موضعه\n                    if bgOn\n                        array.push(lbs, label.new(xLbl, price, allT, style=stl, color=bgc, textcolor=color.new(color.white, 100), size=sz, textalign=hal))\n                    for i = 0 to K - 1\n                        ci3 = array.get(rc, i)\n                        array.push(lbs, label.new(xLbl, price, f_padB(i) + array.get(rt, i) + f_padA(K - 1 - i), style=stl, color=color.new(ci3, 100), textcolor=color.new(ci3, textTransp), size=sz, textalign=hal))\n\n    // --- 4) لوحة المعلومات ---\n    table.clear(infoTbl, 0, 0)\n    if showInfo\n        if n == 0\n            table.cell(infoTbl, 0, 0, \"Oi Levels \" + VER + \": لا توجد مستويات مطابقة للرمز \" + myTk + \" (الأسطر المقروءة: \" + str.tostring(totalRows) + \")\", text_color=color.orange, text_size=size.small, bgcolor=color.new(chart.bg_color, 30))\n        else\n            table.cell(infoTbl, 0, 0, \"Oi Levels \" + VER + \": \" + str.tostring(m) + \" مستوى | \" + myTk, text_color=color.gray, text_size=size.small, bgcolor=color.new(chart.bg_color, 50))\n\n// ===== صناديق الأرقام على محور السعر (تظهر بلا رسم داخل الشارت) =====\nplot(showAxis and barstate.islast ? array.get(axisPx, 0) : na, \"L1\", color=array.get(axisCol, 0), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 1) : na, \"L2\", color=array.get(axisCol, 1), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 2) : na, \"L3\", color=array.get(axisCol, 2), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 3) : na, \"L4\", color=array.get(axisCol, 3), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 4) : na, \"L5\", color=array.get(axisCol, 4), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 5) : na, \"L6\", color=array.get(axisCol, 5), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 6) : na, \"L7\", color=array.get(axisCol, 6), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 7) : na, \"L8\", color=array.get(axisCol, 7), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 8) : na, \"L9\", color=array.get(axisCol, 8), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 9) : na, \"L10\", color=array.get(axisCol, 9), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 10) : na, \"L11\", color=array.get(axisCol, 10), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 11) : na, \"L12\", color=array.get(axisCol, 11), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 12) : na, \"L13\", color=array.get(axisCol, 12), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 13) : na, \"L14\", color=array.get(axisCol, 13), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 14) : na, \"L15\", color=array.get(axisCol, 14), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 15) : na, \"L16\", color=array.get(axisCol, 15), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 16) : na, \"L17\", color=array.get(axisCol, 16), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 17) : na, \"L18\", color=array.get(axisCol, 17), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 18) : na, \"L19\", color=array.get(axisCol, 18), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 19) : na, \"L20\", color=array.get(axisCol, 19), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 20) : na, \"L21\", color=array.get(axisCol, 20), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 21) : na, \"L22\", color=array.get(axisCol, 21), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 22) : na, \"L23\", color=array.get(axisCol, 22), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 23) : na, \"L24\", color=array.get(axisCol, 23), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 24) : na, \"L25\", color=array.get(axisCol, 24), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 25) : na, \"L26\", color=array.get(axisCol, 25), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 26) : na, \"L27\", color=array.get(axisCol, 26), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 27) : na, \"L28\", color=array.get(axisCol, 27), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 28) : na, \"L29\", color=array.get(axisCol, 28), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 29) : na, \"L30\", color=array.get(axisCol, 29), display=display.price_scale)\n";

  /* ================= التنسيق ================= */
  var STYLE = ".rep-tv-pop { position: fixed; inset: 0; z-index: 99999; background: rgba(2,6,23,.62); display: flex; align-items: center; justify-content: center; }\n.tv-pop { position: fixed; inset: 0; z-index: 99999; background: rgba(2,6,23,.66); display: flex; align-items: center; justify-content: center; }\n.tv-box { width: min(780px, 94vw); max-height: 90vh; display: flex; flex-direction: column; background: #0f172a; border: 1px solid rgba(148,163,184,.22); border-radius: 18px; color: #e2e8f0; box-shadow: 0 24px 60px rgba(0,0,0,.5); }\n.tv-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 22px 12px; border-bottom: 1px solid rgba(148,163,184,.14); }\n.tv-title { font-size: 17px; font-weight: 800; }\n.tv-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }\n.tv-x { border: 0; background: none; color: #94a3b8; font-size: 22px; line-height: 1; cursor: pointer; }\n.tv-x:hover { color: #f1f5f9; }\n.tv-body { padding: 14px 22px; overflow: auto; display: flex; flex-direction: column; gap: 14px; }\n.tv-lab { font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 8px; }\n.tv-lab small { font-weight: 500; }\n.tv-chips { display: flex; flex-wrap: wrap; gap: 8px; }\n.tv-chip { border: 1px solid rgba(148,163,184,.25); background: rgba(148,163,184,.08); color: #cbd5e1; padding: 6px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }\n.tv-chip:hover { background: rgba(148,163,184,.16); }\n.tv-chip.on { background: rgba(99,102,241,.22); border-color: rgba(129,140,248,.6); color: #e0e7ff; }\n.tv-chip-ro { cursor: default; font-size: 12px; padding: 4px 10px; }\n.tv-levels { display: flex; flex-direction: column; gap: 12px; max-height: 300px; overflow: auto; padding: 10px; border: 1px solid rgba(148,163,184,.14); border-radius: 12px; background: rgba(2,6,23,.35); }\n.tv-grp-h { font-size: 12px; font-weight: 800; color: #cbd5e1; margin-bottom: 6px; }\n.tv-lv { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border: 1px solid rgba(148,163,184,.22); border-radius: 9px; background: rgba(148,163,184,.07); font-size: 12px; }\n.tv-lv i { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; }\n.tv-lv.tv-t-P i { background: #7aa7d9; }\n.tv-lv.tv-t-T i { background: #d98f9f; }\n.tv-lv.tv-t-D i { background: #e5b84b; }\n.tv-lv.tv-t-S i { background: #a78bfa; }\n.tv-lv b { font-size: 13px; }\n.tv-lv em { font-style: normal; color: #94a3b8; }\n.tv-lx { border: 0; background: none; color: #94a3b8; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 3px; }\n.tv-lx:hover { color: #fb7185; }\n.tv-restore { margin-inline-start: 10px; border: 0; background: none; color: #93c5fd; font-size: 12px; cursor: pointer; }\n.tv-empty { color: #94a3b8; font-size: 13px; padding: 8px; text-align: center; }\n.tv-foot { display: flex; gap: 10px; justify-content: flex-start; padding: 12px 22px 18px; border-top: 1px solid rgba(148,163,184,.14); direction: rtl; }\n.tv-box { position: relative; width: min(1120px, 96vw) !important; max-height: 92vh !important; text-align: center; }\n.tv-box * { text-align: center; }\n.tv-head { display: block !important; padding: 22px 28px 10px !important; border-bottom: 0 !important; }\n.tv-title { font-size: 20px !important; }\n.tv-x { position: absolute; top: 12px; left: 16px; width: 34px; height: 34px; border-radius: 50%; background: rgba(148,163,184,.12); }\n.tv-body { padding: 8px 28px 14px !important; scrollbar-width: none; -ms-overflow-style: none; }\n.tv-body::-webkit-scrollbar, .tv-cards::-webkit-scrollbar { display: none; }\n.tv-sec { padding: 12px 0; border-top: 1px solid rgba(148,163,184,.12); }\n.tv-chips { justify-content: center; }\n.tv-chip { padding: 8px 18px !important; border-radius: 12px !important; }\n.tv-sk { display: inline-flex; align-items: center; gap: 8px; padding: 4px 6px 4px 10px; border: 1px solid rgba(148,163,184,.25); border-radius: 10px; background: rgba(148,163,184,.08); font-size: 13px; }\n.tv-sk b { font-size: 12px; color: #cbd5e1; }\n.tv-sk-in { width: 64px; background: #0b1220; color: #e2e8f0; border: 1px solid rgba(148,163,184,.3); border-radius: 7px; padding: 4px 6px; font-size: 13px; text-align: center; font-family: inherit; }\n.tv-sk-in:focus { outline: none; border-color: rgba(129,140,248,.7); }\n.tv-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; max-height: 340px; overflow: auto; scrollbar-width: none; padding: 4px; }\n.tv-card { border: 1px solid rgba(148,163,184,.18); border-radius: 14px; background: rgba(2,6,23,.35); padding: 12px 12px 8px; }\n.tv-card-h { font-size: 15px; font-weight: 800; color: #f1f5f9; margin-bottom: 8px; }\n.tv-card-h span, .tv-sec-h span { font-size: 11px; color: #94a3b8; font-weight: 600; margin-inline-start: 4px; }\n.tv-secbox { margin: 0 0 10px; padding-top: 8px; border-top: 1px dashed rgba(148,163,184,.18); }\n.tv-sec-h { font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px; }\n.tv-lv { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border: 1px solid rgba(148,163,184,.22); border-radius: 9px; background: rgba(148,163,184,.07); font-size: 12px; }\n.tv-lv::before { content: \"\"; width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; }\n.tv-lv.tv-t-P::before { background: #7aa7d9; }\n.tv-lv.tv-t-T::before { background: #d98f9f; }\n.tv-lv.tv-t-D::before { background: #e5b84b; }\n.tv-lv.tv-t-R::before { background: #c9a86a; }\n.tv-lv.tv-t-S::before { background: #a78bfa; }\n.tv-mv.up { color: #34d399; font-style: normal; font-weight: 700; }\n.tv-mv.dn { color: #fb7185; font-style: normal; font-weight: 700; }\n.tv-foot { display: flex !important; justify-content: center !important; padding: 14px 28px 22px !important; border-top: 0 !important; }\n.tv-copy { display: inline-flex; align-items: center; gap: 10px; padding: 13px 44px; border-radius: 16px; border: 1px solid rgba(165,180,252,.55); background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; font-size: 15px; font-weight: 800; font-family: inherit; cursor: pointer; box-shadow: 0 10px 26px rgba(99,102,241,.38); transition: transform .12s, box-shadow .12s; }\n.tv-copy:hover { transform: translateY(-1px); box-shadow: 0 14px 32px rgba(99,102,241,.5); }\n.tv-copy em { font-style: normal; font-weight: 600; opacity: .85; }\n.tv-star { color: #fbbf24; font-style: normal; font-size: 15px; line-height: 1; margin-inline-end: 2px; }\n.tv-lv.tv-t-D::before { display: none; }\n.tv-sk { gap: 10px !important; padding: 5px 10px !important; }\n.tv-pre { display: inline-flex; gap: 4px; }\n.tv-pre button { border: 1px solid rgba(148,163,184,.25); background: rgba(148,163,184,.08); color: #94a3b8; border-radius: 7px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; }\n.tv-pre button:hover { color: #e2e8f0; }\n.tv-pre button.on { background: rgba(99,102,241,.25); border-color: rgba(129,140,248,.6); color: #e0e7ff; }\n.tv-box { width: min(1320px, 97vw) !important; max-height: 94vh !important; border-radius: 22px !important; background: linear-gradient(180deg, #111a30 0%, #0c1426 100%) !important; box-shadow: 0 30px 80px rgba(0,0,0,.55) !important; }\n.tv-head { padding: 26px 32px 6px !important; }\n.tv-title { font-size: 24px !important; letter-spacing: .01em; }\n.tv-sub { font-size: 13px !important; margin-top: 6px !important; }\n.tv-body { padding: 10px 32px 18px !important; gap: 6px !important; }\n.tv-sec { padding: 16px 0 !important; }\n.tv-lab { font-size: 13px !important; margin-bottom: 12px !important; letter-spacing: .02em; }\n.tv-chip { padding: 10px 22px !important; font-size: 14px !important; border-radius: 14px !important; transition: background .12s, transform .1s; }\n.tv-chip:hover { transform: translateY(-1px); }\n.tv-chip.on { background: linear-gradient(135deg, rgba(99,102,241,.35), rgba(139,92,246,.3)) !important; border-color: rgba(165,180,252,.7) !important; color: #fff !important; box-shadow: 0 4px 14px rgba(99,102,241,.25); }\n.tv-ranks { margin-top: 12px; align-items: center; }\n.tv-rk-lab { font-size: 12px; color: #94a3b8; margin-inline-end: 6px; }\n.tv-sk { padding: 8px 14px !important; border-radius: 14px !important; }\n.tv-sk-in { width: 76px !important; font-size: 14px !important; padding: 6px 8px !important; }\n.tv-cards { grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)) !important; gap: 18px !important; max-height: 54vh !important; padding: 6px !important; }\n.tv-card { border-radius: 18px !important; padding: 16px 16px 8px !important; background: linear-gradient(180deg, rgba(30,41,70,.55), rgba(8,13,28,.55)) !important; border: 1px solid rgba(148,163,184,.2) !important; }\n.tv-card-h { font-size: 18px !important; padding-bottom: 10px; margin-bottom: 12px !important; border-bottom: 1px solid rgba(148,163,184,.16); }\n.tv-secbox { border-top: 0 !important; padding-top: 4px !important; margin-bottom: 14px !important; }\n.tv-sec-h { font-size: 13px !important; color: #cbd5e1 !important; margin-bottom: 10px !important; }\n.tv-lvgrid { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px !important; }\n.tv-lv { display: grid !important; grid-template-columns: 26px 1fr 26px; align-items: center; gap: 8px !important; padding: 9px 10px !important; border-radius: 14px !important; background: rgba(148,163,184,.08) !important; border: 1px solid rgba(148,163,184,.18) !important; border-inline-start: 4px solid #94a3b8 !important; transition: background .12s, border-color .12s; }\n.tv-lv:hover { background: rgba(148,163,184,.14) !important; }\n.tv-lv::before { display: none !important; }\n.tv-lv.tv-t-P { border-inline-start-color: #7aa7d9 !important; }\n.tv-lv.tv-t-T { border-inline-start-color: #d98f9f !important; }\n.tv-lv.tv-t-D { border-inline-start-color: #e5b84b !important; }\n.tv-lv.tv-t-R { border-inline-start-color: #c9a86a !important; }\n.tv-lv.tv-t-S { border-inline-start-color: #a78bfa !important; }\n.tv-lv-tag { display: flex; justify-content: center; align-items: center; min-height: 26px; }\n.tv-lv-main { display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1.2; }\n.tv-lv-main b { font-size: 17px !important; color: #f8fafc; }\n.tv-lv-main small { font-size: 11px; color: #94a3b8; }\n.tv-star { font-size: 20px !important; color: #fbbf24 !important; text-shadow: 0 0 8px rgba(251,191,36,.45); }\n.tv-rk { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-style: normal; font-weight: 800; font-size: 13px; color: #fde9b8; background: rgba(201,168,106,.2); border: 1px solid rgba(201,168,106,.55); }\n.tv-mv { font-style: normal; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; }\n.tv-mv.up { background: rgba(52,211,153,.14); color: #34d399; }\n.tv-mv.dn { background: rgba(251,113,133,.14); color: #fb7185; }\n.tv-lx { width: 26px !important; height: 26px; border-radius: 50%; background: rgba(148,163,184,.1) !important; display: flex; align-items: center; justify-content: center; font-size: 15px !important; padding: 0 !important; }\n.tv-lx:hover { background: rgba(251,113,133,.22) !important; color: #fb7185 !important; }\n.tv-copy { padding: 15px 56px !important; font-size: 16px !important; border-radius: 18px !important; }\nhtml body .tv-pop { --tv-bg:#0b1220; --tv-card:rgba(15,23,42,.5); --tv-bd:rgba(148,163,184,.16); --tv-tx:#e2e8f0; --tv-mu:#94a3b8; --tv-ac:#60a5fa; --tv-chip:rgba(148,163,184,.06); --tv-sel:rgba(148,163,184,.13); --tv-selbd:rgba(148,163,184,.36); --tv-field:#1a2332; --tv-fbd:#2a3548; background: rgba(2,6,23,.74) !important; }\nhtml[data-theme=\"light\"] body .tv-pop { --tv-bg:#f4f6fb; --tv-card:#ffffff; --tv-bd:#dbe2ef; --tv-tx:#1e293b; --tv-mu:#64748b; --tv-ac:#3b82f6; --tv-chip:rgba(15,23,42,.04); --tv-sel:rgba(15,23,42,.07); --tv-selbd:rgba(15,23,42,.22); --tv-field:#eef2f9; --tv-fbd:#d5deee; background: rgba(15,23,42,.45) !important; }\nhtml body .tv-pop .tv-box { width: min(980px, 94vw) !important; max-height: 90vh !important; background: var(--tv-bg) !important; border: 1px solid var(--tv-bd) !important; border-radius: 18px !important; box-shadow: 0 24px 60px rgba(0,0,0,.55) !important; color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-box * { text-align: right; }\nhtml body .tv-pop .tv-head, html body .tv-pop .tv-title, html body .tv-pop .tv-foot { text-align: center !important; }\nhtml body .tv-pop .tv-head { padding: 16px 24px 6px !important; }\nhtml body .tv-pop .tv-title { font-size: 17px !important; font-weight: 800 !important; letter-spacing: .02em !important; color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-x { top: 12px !important; left: 14px !important; width: 28px !important; height: 28px !important; font-size: 18px !important; background: var(--tv-chip) !important; border: 1px solid var(--tv-bd) !important; color: var(--tv-mu) !important; border-radius: 50% !important; }\nhtml body .tv-pop .tv-body { padding: 2px 24px 8px !important; gap: 0 !important; }\nhtml body .tv-pop .tv-sec { padding: 10px 0 !important; border-top: 0 !important; }\nhtml body .tv-pop .tv-lab { font-size: 12px !important; font-weight: 700 !important; color: var(--tv-mu) !important; margin: 0 4px 8px !important; letter-spacing: 0 !important; }\nhtml body .tv-pop .tv-lab small { font-size: 11px !important; font-weight: 500 !important; opacity: .85; }\nhtml body .tv-pop .tv-strips { display: flex !important; flex-direction: column; gap: 8px; }\nhtml body .tv-pop .tv-strip { display: flex !important; align-items: center; gap: 14px; padding: 8px 14px; min-height: 46px; border: 1px solid var(--tv-bd); border-radius: 14px; background: var(--tv-card); }\nhtml body .tv-pop .tv-strip-lab { flex: 0 0 auto; min-width: 104px; font-size: 12px; font-weight: 700; color: var(--tv-mu); }\nhtml body .tv-pop .tv-strip-in { display: flex !important; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 7px; flex: 1; }\nhtml body .tv-pop .tv-sym-name { flex: 0 0 76px; height: 32px; position: relative; background: transparent !important; border: 0 !important; color: var(--tv-mu) !important; font-size: 14px; font-weight: 800; letter-spacing: .03em; font-family: inherit; cursor: pointer; text-align: center !important; }\nhtml body .tv-pop .tv-sym.on { background: var(--tv-sel); border-color: var(--tv-selbd); }\nhtml body .tv-pop .tv-sym.on .tv-sym-name { color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-sym.on .tv-sym-name::after { content: \"\"; position: absolute; bottom: 0; left: 50%; width: 18px; height: 2px; margin-left: -9px; border-radius: 2px; background: var(--tv-ac); opacity: .75; }\nhtml body .tv-pop .tv-sym:not(.on) .tv-sym-ctl { opacity: .45; }\nhtml body .tv-pop .tv-pre { display: inline-flex; gap: 6px; }\nhtml body .tv-pop .tv-chips { gap: 7px !important; }\nhtml body .tv-pop .tv-chip, html body .tv-pop .tv-mini { position: relative; display: inline-flex !important; align-items: center; justify-content: center; height: 30px; padding: 0 14px !important; font-size: 12.5px !important; font-weight: 600 !important; border-radius: 10px !important; background: var(--tv-chip) !important; border: 1px solid var(--tv-bd) !important; color: var(--tv-mu) !important; box-shadow: none !important; transform: none !important; font-family: inherit; cursor: pointer; text-align: center !important; }\nhtml body .tv-pop .tv-mini { height: 26px; padding: 0 11px !important; font-size: 11.5px !important; border-radius: 8px !important; }\nhtml body .tv-pop .tv-chip:hover, html body .tv-pop .tv-mini:hover { background: var(--tv-sel) !important; color: var(--tv-tx) !important; transform: none !important; }\nhtml body .tv-pop .tv-chip.on, html body .tv-pop .tv-mini.on { background: var(--tv-sel) !important; border-color: var(--tv-selbd) !important; color: var(--tv-tx) !important; box-shadow: none !important; }\nhtml body .tv-pop .tv-chip.on::after, html body .tv-pop .tv-mini.on::after { content: \"\"; position: absolute; bottom: 2px; left: 50%; width: 14px; height: 2px; margin-left: -7px; border-radius: 2px; background: var(--tv-ac); opacity: .75; }\nhtml body .tv-pop .tv-sk-in { width: 58px !important; height: 26px; font-size: 12.5px !important; padding: 0 6px !important; border-radius: 8px !important; background: var(--tv-field) !important; border: 1px solid var(--tv-fbd) !important; color: var(--tv-tx) !important; text-align: center !important; }\nhtml body .tv-pop .tv-cards { display: flex !important; flex-direction: column; gap: 10px !important; max-height: 44vh !important; padding: 2px !important; }\nhtml body .tv-pop .tv-card { display: grid !important; grid-template-columns: 78px 1fr; column-gap: 12px; align-items: start; padding: 10px 14px !important; border-radius: 14px !important; background: var(--tv-card) !important; border: 1px solid var(--tv-bd) !important; }\nhtml body .tv-pop .tv-card-h { grid-column: 1; grid-row: 1 / span 12; font-size: 15px !important; font-weight: 800 !important; color: var(--tv-tx) !important; padding: 4px 0 0 !important; margin: 0 !important; border: 0 !important; }\nhtml body .tv-pop .tv-secbox { grid-column: 2; display: flex !important; align-items: flex-start; gap: 12px; padding: 7px 0 !important; margin: 0 !important; border-top: 1px dashed var(--tv-bd); }\nhtml body .tv-pop .tv-card-h + .tv-secbox { border-top: 0; }\nhtml body .tv-pop .tv-sec-h { flex: 0 0 108px; font-size: 11.5px !important; font-weight: 700 !important; color: var(--tv-mu) !important; margin: 0 !important; padding-top: 7px; }\nhtml body .tv-pop .tv-lvgrid { display: flex !important; flex-wrap: wrap; justify-content: flex-start; gap: 7px !important; flex: 1; }\nhtml body .tv-pop .tv-lv { display: inline-flex !important; align-items: center; gap: 8px !important; height: 34px; padding: 0 8px 0 6px !important; border-radius: 10px !important; background: var(--tv-chip) !important; border: 1px solid var(--tv-bd) !important; border-inline-start-width: 3px !important; }\nhtml body .tv-pop .tv-lv-tag { display: inline-flex !important; align-items: center; min-height: 0 !important; }\nhtml body .tv-pop .tv-lv-main { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 7px !important; }\nhtml body .tv-pop .tv-lv-main b { font-size: 14px !important; color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-lv-main small { font-size: 10.5px !important; color: var(--tv-mu) !important; }\nhtml body .tv-pop .tv-star { font-size: 15px !important; text-shadow: none !important; }\nhtml body .tv-pop .tv-rk { width: 20px !important; height: 20px !important; font-size: 11px !important; }\nhtml body .tv-pop .tv-mv { font-size: 10px !important; padding: 0 6px !important; }\nhtml body .tv-pop .tv-lx { width: 20px !important; height: 20px !important; font-size: 13px !important; color: var(--tv-mu) !important; }\nhtml body .tv-pop .tv-restore { font-size: 11px !important; color: var(--tv-mu) !important; background: transparent !important; border: 1px solid var(--tv-bd) !important; border-radius: 8px !important; padding: 1px 9px !important; margin-inline-start: 8px; cursor: pointer; font-family: inherit; }\nhtml body .tv-pop .tv-empty { font-size: 12px !important; color: var(--tv-mu) !important; padding: 16px 0 !important; }\nhtml body .tv-pop .tv-foot { padding: 10px 24px 16px !important; border-top: 1px solid var(--tv-bd) !important; }\nhtml body .tv-pop .tv-copy { padding: 9px 30px !important; font-size: 13.5px !important; border-radius: 12px !important; border: 0 !important; background: linear-gradient(135deg, #7c3aed, #8b5cf6 55%, #a78bfa) !important; box-shadow: 0 0 0 1px rgba(167,139,250,.3), 0 6px 18px rgba(124,58,237,.38) !important; }\nhtml body .tv-pop .tv-more { margin-top: 8px; }\nhtml body .tv-pop .tv-more-btn { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 8px 14px; border: 1px solid var(--tv-bd); border-radius: 14px; background: var(--tv-card); color: var(--tv-tx); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; text-align: right; }\nhtml body .tv-pop .tv-more-btn:hover { background: var(--tv-sel); }\nhtml body .tv-pop .tv-more-t { flex: 0 0 auto; }\nhtml body .tv-pop .tv-badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--tv-sel); border: 1px solid var(--tv-selbd); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }\nhtml body .tv-pop .tv-more-sel { flex: 1; font-size: 11.5px; font-weight: 500; color: var(--tv-mu); direction: ltr; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\nhtml body .tv-pop .tv-caret { margin-inline-start: auto; font-style: normal; font-size: 15px; color: var(--tv-mu); transition: transform .15s; }\nhtml body .tv-pop .tv-more-btn.open .tv-caret { transform: rotate(180deg); }\nhtml body .tv-pop .tv-more-body { margin-top: 8px; padding: 10px 12px; border: 1px solid var(--tv-bd); border-radius: 14px; background: var(--tv-card); }\nhtml body .tv-pop .tv-comp-chips { display: flex !important; flex-wrap: wrap; justify-content: flex-start; margin-bottom: 8px; }\nhtml body .tv-pop .tv-comp-chips .tv-chip { height: 28px; padding: 0 11px !important; font-size: 12px !important; direction: ltr; }\nhtml body .tv-pop .tv-strip[style*=\"none\"] { display: none !important; }\nhtml body .tv-pop .tv-mv { display: inline-flex !important; align-items: center; justify-content: center; height: 18px; min-width: 34px; padding: 0 7px !important; font-size: 11px !important; line-height: 1 !important; white-space: nowrap; border-radius: 99px !important; }\nhtml body .tv-pop .tv-lv .tv-mv.up { background: rgba(52,211,153,.14) !important; color: #34d399 !important; }\nhtml body .tv-pop .tv-lv .tv-mv.dn { background: rgba(251,113,133,.14) !important; color: #fb7185 !important; }\n\n/* شريحة الترتيبات تُخفى عند عدم تفعيل «ترتيب التزايد» */\nhtml body .tv-pop .tv-strip[style*=\"none\"] { display: none !important; }\n/* ===== أيقونة التبويب ونافذة الشرح ===== */\n.oitv-fab { position: fixed; bottom: 22px; left: 22px; z-index: 9990; width: 56px; height: 56px; padding: 0; border: 0; border-radius: 15px; background: transparent; cursor: pointer; box-shadow: 0 8px 22px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.08) inset; transition: transform .15s ease, box-shadow .15s ease; }\n.oitv-fab:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 12px 28px rgba(0,0,0,.45); }\n.oitv-fab:active { transform: scale(.97); }\n.oitv-fab svg { display: block; width: 100%; height: 100%; border-radius: 15px; }\n.oitv-fab.oitv-inline { position: static; width: 40px; height: 40px; border-radius: 11px; box-shadow: none; }\n.oitv-fab.oitv-inline svg { border-radius: 11px; }\nhtml body .tv-pop .oitv-box { width: min(620px, 94vw) !important; }\n.oitv-head { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 18px 24px 4px; }\n.oitv-head svg { width: 44px; height: 44px; border-radius: 12px; flex: 0 0 auto; }\n.oitv-ttl { text-align: right; }\n.oitv-ttl b { display: block; font-size: 17px; font-weight: 800; color: var(--tv-tx); }\n.oitv-ttl span { display: block; font-size: 12px; color: var(--tv-mu); margin-top: 2px; }\n.oitv-body { padding: 8px 26px 6px; overflow: auto; }\n.oitv-p { font-size: 13px; line-height: 1.8; color: var(--tv-tx); margin: 8px 0 12px; text-align: right; }\n.oitv-h { font-size: 12px; font-weight: 700; color: var(--tv-mu); margin: 14px 4px 6px; text-align: right; }\n.oitv-box-in { border: 1px solid var(--tv-bd); border-radius: 14px; background: var(--tv-card); padding: 10px 16px; }\n.oitv-box-in ul, .oitv-box-in ol { margin: 0; padding: 0 18px 0 0; text-align: right; }\n.oitv-box-in li { font-size: 12.5px; line-height: 1.9; color: var(--tv-tx); }\n.oitv-box-in li b { color: var(--tv-tx); }\n.oitv-note { font-size: 11.5px; color: var(--tv-mu); margin: 10px 6px 4px; text-align: right; }\n.oitv-btns { display: flex; justify-content: center; gap: 12px; padding: 14px 24px 20px; border-top: 1px solid var(--tv-bd); margin-top: 12px; }\n.oitv-btn { min-width: 150px; height: 40px; padding: 0 22px; border-radius: 12px; border: 1px solid var(--tv-bd); background: var(--tv-chip); color: var(--tv-tx); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: background .12s; }\n.oitv-btn:hover { background: var(--tv-sel); }\n.oitv-btn.primary { border: 0; color: #fff; background: linear-gradient(135deg, #7c3aed, #8b5cf6 55%, #a78bfa); box-shadow: 0 0 0 1px rgba(167,139,250,.3), 0 6px 18px rgba(124,58,237,.38); }\n.oitv-btn.primary:hover { filter: brightness(1.06); }\n.oitv-toast { position: fixed; left: 50%; bottom: 36px; transform: translateX(-50%); z-index: 100000; padding: 9px 18px; border-radius: 12px; background: #0b1220; color: #e2e8f0; border: 1px solid rgba(148,163,184,.25); font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.45); direction: rtl; }\n.oitv-toast.err { border-color: rgba(248,113,113,.5); }\n";
  function injectStyle() {
    if (document.getElementById("oitv-style")) return;
    var st = document.createElement("style"); st.id = "oitv-style"; st.textContent = STYLE + "\nhtml body .tv-pop .oitv-ttl-row { display: flex; align-items: center; justify-content: center; gap: 10px; }\nhtml body .tv-pop .oitv-ttl-row svg { width: 28px; height: 28px; border-radius: 8px; flex: 0 0 auto; }\nhtml body .tv-pop .oitv-sub { font-size: 12px; color: var(--tv-mu); margin-top: 5px; text-align: center !important; }\nhtml body .tv-pop .oitv-intro { font-size: 13px; line-height: 1.9; color: var(--tv-tx); margin: 6px 4px 2px; }\nhtml body .tv-pop .oitv-feat { display: grid !important; grid-template-columns: 1fr 1fr; gap: 4px 28px; padding: 12px 18px !important; align-items: start; }\nhtml body .tv-pop .oitv-feat div { font-size: 12.5px; line-height: 1.8; color: var(--tv-mu); }\nhtml body .tv-pop .oitv-feat small { font-size: 11px; font-weight: 500; color: var(--tv-mu); opacity: .85; }\nhtml body .tv-pop .oitv-feat b, html body .tv-pop .oitv-lines b { color: var(--tv-tx); font-weight: 700; }\nhtml body .tv-pop .oitv-hint { font-size: 12px; color: var(--tv-tx); margin: 10px 4px 0; }\nhtml body .tv-pop .oitv-step { align-items: flex-start; padding: 10px 16px; }\nhtml body .tv-pop .oitv-step .tv-strip-lab { min-width: 176px; font-size: 13px; font-weight: 800; color: var(--tv-tx); padding-top: 1px; }\nhtml body .tv-pop .oitv-lines { flex: 1; }\nhtml body .tv-pop .oitv-lines div { font-size: 12.5px; line-height: 1.95; color: var(--tv-mu); }\nhtml body .tv-pop .oitv-notes { padding: 6px 4px 0; }\nhtml body .tv-pop .oitv-notes div { font-size: 11.5px; line-height: 1.9; color: var(--tv-mu); }\nhtml body .tv-pop .oitv-ghost { display: inline-flex; align-items: center; gap: 10px; padding: 9px 30px; font-size: 13.5px; font-weight: 800; border-radius: 12px; border: 1px solid var(--tv-bd); background: var(--tv-chip); color: var(--tv-tx); font-family: inherit; cursor: pointer; transition: background .12s; }\nhtml body .tv-pop .oitv-ghost:hover { background: var(--tv-sel); }\nhtml body .tv-pop .tv-foot { gap: 10px; }\nhtml body .tv-pop .oitv-dchip { gap: 7px; padding: 0 13px !important; }\nhtml body .tv-pop .oitv-dchip b { font-size: 13px; font-weight: 800; color: var(--tv-tx); }\nhtml body .tv-pop .oitv-dchip small { font-size: 11px; font-weight: 500; color: var(--tv-mu); }\nhtml body .tv-pop .tv-copy em { font-style: normal; font-weight: 600; opacity: .85; }\nhtml body .tv-pop .tv-back { position: absolute; top: 12px; right: 14px; height: 28px; padding: 0 12px; border-radius: 14px; border: 1px solid var(--tv-bd); background: var(--tv-chip); color: var(--tv-mu); font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }\nhtml body .tv-pop .tv-back:hover { background: var(--tv-sel); color: var(--tv-tx); }\n.btn-tv { display: inline-flex !important; align-items: center; gap: 7px; height: 36px !important; padding: 0 14px !important; border: 1px solid rgba(255,255,255,.16) !important; border-radius: 10px !important; background: linear-gradient(135deg, #27272a, #000) !important; color: #fff !important; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.45); }\n.btn-tv:hover { filter: brightness(1.25); }\n.btn-tv svg { width: 18px; height: 18px; border-radius: 5px; display: block; }\n";
    (document.head || document.documentElement).appendChild(st);
  }

  /* ================= أيقونة التبويب + نافذة الشرح ================= */
  var ICON = "<svg viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"TradingView\"><defs><linearGradient id=\"oitvg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3f3f46\"/><stop offset=\"1\" stop-color=\"#09090b\"/></linearGradient></defs><rect width=\"64\" height=\"64\" rx=\"15\" fill=\"url(#oitvg)\"/><g fill=\"#fff\"><path d=\"M13 19h22v9h-6.5v17h-9V28H13z\"/><circle cx=\"40\" cy=\"23.5\" r=\"4.6\"/><path d=\"M36 45l9-17h10L45 45z\"/></g></svg>";
  function defaultExps(d) {   // الانتهاءات القادمة (من تاريخ آخر تحديث) بحد أقصى maxExps
    var from = dataSessionYmd(d), keys = Object.keys((d && d.by_expiration) || {}).sort();
    return keys.filter(function (e) { return e >= from; }).slice(0, CONFIG.maxExps || 10);
  }
  function currentParams() {
    var p = CONFIG.params || {};
    return { exps: p.exps || defaultExps, days: p.days || "2", strikes: p.strikes || "30", n: p.n || 5, g: p.g || 2 };
  }
  /* ================= شاشة اختيار التواريخ (قبل نافذة نسخ TradingView) ================= */
  var savedExps = null;
  var ARROW = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
  var COPY_ICO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  function closeDates() { var o = document.getElementById("oitvDates"); if (o) o.remove(); }
  function dateChip(e, on) {
    var lab = ""; try { lab = reportDayLabel(e); } catch (x) { lab = ""; }
    var num = parseInt(String(e).slice(8, 10), 10);
    var m = /^(أحد|اثنين|ثلاثاء|أربعاء|خميس|جمعة|سبت) \d+$/.exec(lab);
    var sub = m ? m[1] : String(lab).replace(/^\d+\s*/, "");
    return '<button type="button" class="tv-chip oitv-dchip' + (on ? " on" : "") + '" data-e="' + e + '"><b>' + num + "</b><small>" + sub + "</small></button>";
  }
  async function openDates(restore) {
    closeInfo(); closeDates(); injectStyle();
    var d = null;
    try { d = await loadTicker(state.ticker); } catch (e) { d = null; }
    var from = d ? dataSessionYmd(d) : "";
    var all = d ? Object.keys(d.by_expiration || {}).sort().filter(function (e) { return e >= from; }) : [];
    if (!all.length) { toast("تعذّر تحميل التواريخ — سيُفتح الاختيار الافتراضي", "err"); openTvDialog(currentParams()); return; }
    var sel = {};   // لا يوجد اختيار افتراضي — يختار المستخدم بنفسه (يُستعاد الاختيار فقط عند الرجوع من النافذة التالية)
    if (restore && savedExps) savedExps.forEach(function (e) { if (all.indexOf(e) >= 0) sel[e] = true; });

    var pop = document.createElement("div");
    pop.id = "oitvDates"; pop.className = "tv-pop";
    pop.innerHTML =
      '<div class="tv-box" dir="rtl">' +
      '<button type="button" class="tv-x" id="oitvDX" aria-label="إغلاق">×</button>' +
      '<div class="tv-head"><div class="tv-title">اختيار التواريخ</div></div>' +
      '<div class="tv-body" id="oitvDList"></div>' +
      '<div class="tv-foot"><button type="button" class="tv-copy" id="oitvDGo"><span>متابعة</span><em id="oitvDN"></em>' + ARROW + '</button></div>' +
      '</div>';
    document.body.appendChild(pop);

    function draw() {
      var html = "", cur = "";
      all.forEach(function (e) {
        var mk = String(e).slice(0, 7);
        if (mk !== cur) {
          if (cur) html += "</div></div></div>";
          cur = mk;
          html += '<div class="tv-sec"><div class="tv-lab">' + AR_MONTHS[parseInt(mk.slice(5, 7), 10) - 1] + " " + mk.slice(0, 4) + '</div><div class="tv-strips"><div class="tv-strip"><div class="tv-strip-in">';
        }
        html += dateChip(e, !!sel[e]);
      });
      if (cur) html += "</div></div></div>";
      var list = document.getElementById("oitvDList"), sc = list.scrollTop;
      list.innerHTML = html;
      list.scrollTop = sc;
      var n = Object.keys(sel).length;
      document.getElementById("oitvDN").textContent = n ? "(" + n + ")" : "";
    }
    draw();
    document.getElementById("oitvDList").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-e]"); if (!b) return;
      var e = b.getAttribute("data-e");
      if (sel[e]) delete sel[e]; else sel[e] = true;
      draw();
    });
    document.getElementById("oitvDGo").onclick = function () {
      var chosen = all.filter(function (e) { return sel[e]; });
      if (!chosen.length) { toast("اختر تاريخًا واحدًا على الأقل", "err"); return; }
      savedExps = chosen;
      closeDates();
      var p = currentParams(); p.exps = chosen; p.onBack = function () { openDates(true); };
      openTvDialog(p);
    };
    document.getElementById("oitvDX").onclick = closeDates;
    pop.addEventListener("mousedown", function (e) { if (e.target === pop) closeDates(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { closeDates(); document.removeEventListener("keydown", esc); } });
  }
  function openCopy() {
    injectStyle();
    openDates(false);
  }
  function copyCode() { repCopyText(TV_PINE_CODE, "تم نسخ كود المؤشر — افتح Pine Editor في TradingView والصقه ثم Add to chart"); }
  function closeInfo() { var o = document.getElementById("oitvInfo"); if (o) o.remove(); }
  function openInfo() {
    closeInfo(); injectStyle();
    var TVB = '<bdi dir="ltr">TradingView</bdi>';
    var pop = document.createElement("div");
    pop.id = "oitvInfo"; pop.className = "tv-pop";
    pop.innerHTML =
      '<div class="tv-box" dir="rtl">' +
      '<button type="button" class="tv-x" id="oitvX" aria-label="إغلاق">×</button>' +
      '<div class="tv-head"><div class="tv-title oitv-ttl-row"><bdi dir="ltr">Oi Levels</bdi></div><div class="oitv-sub">مؤشر رسم مستويات الأوبن إنترست على ' + TVB + '</div></div>' +
      '<div class="tv-body">' +
      '<div class="tv-sec"><div class="tv-lab">ماذا يقدّم؟</div>' +
      '<div class="tv-strip oitv-feat">' +
      '<div><b>المستويات:</b> القمم والقيعان وأعلى تزايد <small>(تختلف بين 30 و100 سترايك حسب اختيارك)</small></div>' +
      '<div><b>كل مستوى بتاريخه:</b> اليوم، يوم بعد، الأسبوع، OPX، الشهر</div>' +
      '<div><b>الأرقام على الخط:</b> الأوبن والتزايد وحركة القمة والقاع ▲▼</div>' +
      '<div><b>ألوان بثلاثة أنماط:</b> موحّد، كول/بوت، أو حسب التاريخ</div>' +
      '</div>' +
      '<div class="oitv-hint">🎨 الألوان والنصوص والعرض كلها قابلة للتخصيص من إعدادات المؤشر.</div></div>' +
      '<div class="tv-sec"><div class="tv-lab">طريقة الاستخدام</div><div class="tv-strips">' +
      '<div class="tv-strip oitv-step"><span class="tv-strip-lab">1) إضافة المؤشر (مرة واحدة)</span><div class="oitv-lines">' +
      '<div><b>من الويب:</b> نسخ كود المؤشر</div>' +
      '<div><b>في ' + TVB + ':</b> افتح <bdi dir="ltr">Pine Editor</bdi> ← الصق الكود ← <bdi dir="ltr">Add to chart</bdi></div></div></div>' +
      '<div class="tv-strip oitv-step"><span class="tv-strip-lab">2) تحديث المستويات (يوميًا)</span><div class="oitv-lines">' +
      '<div><b>من الويب:</b> نسخ ' + TVB + ' ← اختيار الرموز والأنواع ← حذف ما لا يلزم بـ × ← نسخ المستويات</div>' +
      '<div><b>في الشارت:</b> إعدادات المؤشر ⚙️ ← <bdi dir="ltr">Inputs</bdi> ← خانة المستويات ← لصق</div></div></div>' +
      '</div>' +
      '<div class="oitv-notes"><div>التحديث يدوي: تُلصق المستويات الجديدة كل يوم مكان القديمة.</div><div>💡 يمكن نسخ عدة رموز معًا، ويعرض كل شارت مستويات رمزه فقط.</div></div></div>' +
      '</div>' +
      '<div class="tv-foot"><button type="button" class="oitv-ghost" id="oitvCode">' + COPY_ICO + '<span>كود المؤشر</span></button>' +
      '<button type="button" class="tv-copy" id="oitvLv"><span>نسخ ' + TVB + '</span>' + ARROW + '</button></div>' +
      '</div>';
    document.body.appendChild(pop);
    pop.addEventListener("mousedown", function (e) { if (e.target === pop) closeInfo(); });
    document.getElementById("oitvX").onclick = closeInfo;
    document.getElementById("oitvCode").onclick = copyCode;
    document.getElementById("oitvLv").onclick = openCopy;
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { closeInfo(); document.removeEventListener("keydown", esc); } });
  }
  function mountIcon() {
    if (document.getElementById("oitvFab")) return;
    injectStyle();
    var b = document.createElement("button");
    b.type = "button"; b.id = "oitvFab"; b.className = "oitv-fab"; b.title = "TradingView"; b.setAttribute("aria-label", "TradingView");
    b.innerHTML = ICON; b.onclick = openInfo;
    var host = CONFIG.mount ? document.querySelector(CONFIG.mount) : null;
    if (host) { b.classList.add("oitv-inline"); host.appendChild(b); } else document.body.appendChild(b);
  }
  function init(cfg) {
    if (cfg) { Object.assign(CONFIG, cfg); if (cfg.ticker) state.ticker = cfg.ticker; }
    injectStyle();
    if (!CONFIG.hideIcon) mountIcon();
  }

  window.OITV = { icon: ICON, init: init, open: openInfo, openCopy: openCopy, copyCode: copyCode, config: CONFIG };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); });
  else init();
})();
