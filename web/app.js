/* OI_PRIVATE_BUILD: match-public-Cplus-2026-09-04 */
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
const TICKERS = INDEX_TICKERS.concat(STOCKS_TICKERS);

const state = {
  ticker: "SPY", days: "2", strikes: "30",
  expiration: null, showDelta: false, seriesMode: false, tawafuqMode: false, tawafuqDays: null, showGrowth: false, growthDays: "auto", showSigma: false, sigmaExps: [], mapHeatMode: false, mapHeatExps: [], spx5k: false,
  dark: false, cache: {}, livePrice: null, sessionClose: null, mapRange: "ALL", x3Mode: false, archDays: "2", archStrikes: "30", archShowDelta: false, archExportMode: "multi", archSelected: [],
};

const $ = (sel) => document.querySelector(sel);

/** رمز «المجموع»: دائرة ناعمة بعلامة + (بدل ΣΔ). نص عادي للإكسل، وأيقونة للواجهة */
/** شارة ترتيب في جدول الأيام فقط: دائرة هادئة للمجموع (1-4) ومربع ناعم للتزايد (2-4) */
function rankBadge(n, kind) { return '<span class="twk twk-' + kind + n + '" title="' + (kind === "s" ? "ترتيب المجموع " : "ترتيب التزايد ") + n + '">' + n + "</span>"; }
var SUM_TXT = "≡";
var OI_HTML = '<span class="oi-ico" aria-hidden="true"></span>';   // رمز مجموع الأوبن (أعمدة) — مختلف عن مجموع التزايد
var SUM_HTML = '<span class="sum-ico" aria-hidden="true"></span>';

function formatUpdatedAt(s) {
  try {
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    // ميلادي دائمًا + أرقام لاتينية (وليس هجري)
    return d.toLocaleString("en-GB", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch (e) {
    return String(s);
  }
}


function dataBases() {
  var preferred = (document.body && document.body.dataset && document.body.dataset.dataBase) || "/data";
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

function dataUrl(ticker) {
  var base = dataBases()[0];
  return base + "/" + ticker + ".json?t=" + Date.now();
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

function futureExpirations(list) {
  const cutoff = expirationCutoffDate();
  return (list || []).filter(function (exp) {
    const d = new Date(String(exp) + "T00:00:00");
    return !isNaN(d.getTime()) && d >= cutoff;
  });
}


/** ثالث جمعة من الشهر الميلادي (انتهاء SPX الشهري التقليدي) */
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


function exportFileStamp() {
  // تاريخ آخر عمود في الجدول الحالي (أو السلسلة)، وإلا تاريخ اليوم
  var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  try {
    var data = state.cache && state.cache[state.ticker];
    var lastPd = null;
    if (data) {
      if (state.seriesMode && typeof getSeriesPrevDayView === "function") {
        var sv = getSeriesPrevDayView(data, state.days, state.strikes);
        if (sv && sv.pullDates && sv.pullDates.length) lastPd = sv.pullDates[sv.pullDates.length - 1];
      }
      if (!lastPd && state.expiration && data.by_expiration && data.by_expiration[state.expiration]) {
        var blk = data.by_expiration[state.expiration];
        var pds = (blk.pull_dates && blk.pull_dates.length) ? blk.pull_dates : (data.pull_dates || []);
        if (pds.length) lastPd = pds[pds.length - 1];
      }
      if (!lastPd && data.pull_dates && data.pull_dates.length) lastPd = data.pull_dates[data.pull_dates.length - 1];
    }
    if (lastPd) {
      // pull date forms: "4-9" or "2026-09-04" or "4 SEP"
      var s = String(lastPd).trim();
      var d = null;
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
        d = new Date(s + "T12:00:00");
      } else if (/^\d{1,2}-\d{1,2}$/.test(s)) {
        var parts = s.split("-").map(Number);
        var nowY = new Date().getFullYear();
        d = new Date(nowY, parts[1] - 1, parts[0], 12, 0, 0);
      } else {
        d = new Date(s);
      }
      if (d && !isNaN(d.getTime())) {
        return String(d.getDate()) + months[d.getMonth()];
      }
    }
  } catch (e) {}
  var now = new Date();
  return String(now.getDate()) + months[now.getMonth()];
}

/** اسم ورقة عند التصدير متعدد الصفحات: OPX9 أو Fri4 أو تاريخ مختصر */
function multiSheetNameForExp(exp) {
  try {
    var d = new Date(String(exp) + "T12:00:00");
    if (isNaN(d.getTime())) return String(exp).slice(0, 31);
    var day = d.getDate();
    var month = d.getMonth() + 1;
    var year = d.getFullYear();
    // فقط الجمعة العادية و OPX (ثالث جمعة) بالمنطق الخاص
    if (typeof isThirdFridayExp === "function" && isThirdFridayExp(exp)) {
      return ("OPX" + month).slice(0, 31);
    }
    if (d.getDay() === 5) {
      return ("Fri" + day).slice(0, 31);
    }
    // بقية التواريخ: 17-9-2026
    return (day + "-" + month + "-" + year).slice(0, 31);
  } catch (e) {
    return String(exp).slice(0, 31);
  }
}


/** قائمة الانتهاءات المستقبلية (SPX يبقي الشهري+اليومي حسب مصدر السحب) */

/** أدنى يوم سحب نظيف لـ SPX ثالث جمعة (AM) — ما قبله مخفي لأنه مخلوط */
var SPX_AM_PULL_CUTOFF = "17-8";

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
function dataSessionCutoffDate(data) {
  var s = dataSessionFromPull(data);
  if (s) {
    var d = new Date(s.year, s.month - 1, s.day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return expirationCutoffDate();
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
function placeFixedDropdown(btn, list) {
  if (!btn || !list) return;
  try {
    if (!list.getAttribute("data-dd-home")) {
      var home = list.parentElement;
      if (home) {
        list.setAttribute("data-dd-home", home.id || "");
        list._ddHome = home;
      }
    }
    if (list.parentElement !== document.body) {
      document.body.appendChild(list);
    }
    var r = btn.getBoundingClientRect();
    /* عرض القائمة = عرض الزر الذي انسدلت منه بالضبط */
    var w = Math.max(1, Math.round(r.width));
    var left = r.left;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (left < 8) left = 8;
    var top = r.bottom + 4;
    if (top + 120 > window.innerHeight) {
      top = Math.max(8, r.top - 4 - Math.min(320, window.innerHeight * 0.5));
    }
    list.classList.add("dd-fixed");
    list.hidden = false;
    list.removeAttribute("hidden");
    list.style.setProperty("display", "block", "important");
    list.style.setProperty("visibility", "visible", "important");
    list.style.setProperty("pointer-events", "auto", "important");
    list.style.setProperty("opacity", "1", "important");
    list.style.setProperty("position", "fixed", "important");
    list.style.setProperty("top", Math.round(top) + "px", "important");
    list.style.setProperty("left", Math.round(left) + "px", "important");
    list.style.setProperty("width", Math.round(w) + "px", "important");
    list.style.setProperty("right", "auto", "important");
    list.style.setProperty("bottom", "auto", "important");
    list.style.setProperty("z-index", "10050", "important");
    list.style.setProperty("max-height", "min(420px, 70vh)", "important");
    list.style.setProperty("overflow-y", "auto", "important");
  } catch (e) {}
}
function clearFixedDropdown(list) {
  if (!list) return;
  try {
    list.classList.remove("dd-fixed");
    ["display","visibility","pointer-events","opacity","position","top","left","width","right","bottom","z-index","max-height","overflow-y"].forEach(function (p) {
      try { list.style.removeProperty(p); } catch (e0) {}
    });
    list.hidden = true;
    list.setAttribute("hidden", "");
    var home = list._ddHome;
    if (home && list.parentElement === document.body) {
      home.appendChild(list);
    }
  } catch (e) {}
}

function ensureExpDropdownUI() {
  var sel = $("#expSelect");
  if (!sel) return null;
  var parent = sel.parentNode;
  if (!parent) return null;
  var dd = document.getElementById("expDropdown");
  if (dd) return dd;
  sel.classList.add("exp-select-hidden");
  sel.setAttribute("aria-hidden", "true");
  sel.tabIndex = -1;
  dd = document.createElement("div");
  dd.id = "expDropdown";
  dd.className = "exp-dd";
  dd.innerHTML =
    '<button type="button" class="exp-dd-btn" id="expDdBtn" aria-haspopup="listbox">' +
    '<span id="expDdLabel">—</span></button>' +
    '<div class="exp-dd-list" id="expDdList" role="listbox" hidden></div>';
  parent.appendChild(dd);

  document.addEventListener("click", function (e) {
    var list = $("#expDdList");
    var btn = $("#expDdBtn");
    var wrap = document.getElementById("expDropdown");
    if (!list || !btn) return;
    if (btn.contains(e.target) || list.contains(e.target)) return;
    if (wrap && wrap.contains(e.target)) return;
    list.hidden = true;
    list.setAttribute("hidden", "");
    btn.classList.remove("open");
    if (wrap) wrap.classList.remove("open");
    clearFixedDropdown(list);
  });
  return dd;
}

function isAmSettlementTicker(ticker) {
  var t = String(ticker || state.ticker || "").toUpperCase();
  // SPX و NDX: التسوية الصباحية للشهري (ثالث جمعة)
  return t === "SPX" || t === "NDX";
}

function formatExpDisplay(exp) {
  /* مثل OCC: Aug 21, 2026 */
  try {
    var s = String(exp || "");
    var p = s.split("-");
    if (p.length < 3) return s;
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    var d = parseInt(p[2], 10);
    if (!y || !m || !d) return s;
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[m - 1] + " " + d + ", " + y;
  } catch (e) {
    return String(exp || "");
  }
}

function expOptionLabelHtml(exp) {
  var label = formatExpDisplay(exp);
  var showAm =
    isAmSettlementTicker(state.ticker) &&
    typeof isThirdFridayExp === "function" &&
    isThirdFridayExp(exp);
  if (showAm) {
    return (
      '<span class="exp-date">' +
      label +
      '</span> <span class="exp-am">AM</span>'
    );
  }
  return '<span class="exp-date">' + label + "</span>";
}

function syncExpDropdownLabel() {
  var lab = $("#expDdLabel");
  if (!lab) return;
  var exp = state.expiration;
  if (!exp) {
    lab.innerHTML = "—";
    return;
  }
  lab.innerHTML = expOptionLabelHtml(exp);
}

function fillExpDropdown(exps) {
  ensureExpDropdownUI();
  var sel = $("#expSelect");
  var list = $("#expDdList");
  var btn = $("#expDdBtn");
  if (!sel || !list || !btn) return;

  // أبقِ نص الزر ظاهرًا أثناء إعادة البناء حتى لا ينهار الشريط
  var prevLabelHtml = "";
  try {
    var labKeep = document.getElementById("expDdLabel");
    if (labKeep) prevLabelHtml = labKeep.innerHTML;
  } catch (eL) {}

  sel.innerHTML = "";
  list.innerHTML = "";
  (exps || []).forEach(function (exp) {
    var o = document.createElement("option");
    o.value = exp;
    o.textContent = typeof formatExpDisplay === "function" ? formatExpDisplay(exp) : exp;
    sel.appendChild(o);

    var item = document.createElement("button");
    item.type = "button";
    item.className =
      "exp-dd-item" + (exp === state.expiration ? " active" : "");
    item.setAttribute("role", "option");
    item.dataset.value = exp;
    item.innerHTML = expOptionLabelHtml(exp);
    item.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      state.expiration = exp;
      sel.value = exp;
      list.hidden = true;
      list.setAttribute("hidden", "");
      btn.classList.remove("open");
      var wrap = document.getElementById("expDropdown");
      if (wrap) wrap.classList.remove("open");
      clearFixedDropdown(list);
      syncExpDropdownLabel();
      fillExpDropdown(exps);
      renderTable();
    };
    list.appendChild(item);
  });

  if (!state.expiration || exps.indexOf(state.expiration) < 0) {
    state.expiration = exps[0] || null;
  }
  sel.value = state.expiration || "";
  syncExpDropdownLabel();
  try {
    var lab2 = document.getElementById("expDdLabel");
    if (lab2 && (!lab2.innerHTML || lab2.innerHTML === "—") && prevLabelHtml && prevLabelHtml !== "—") {
      // لا تستبدل بلابل قديم إن صار لدينا انتهاء فعلي
      if (!state.expiration) lab2.innerHTML = prevLabelHtml;
    }
  } catch (eL2) {}

  btn.onclick = function (e) {
    e.preventDefault();
    e.stopPropagation();
    var wrap = document.getElementById("expDropdown") || (list && list.parentElement);
    var isOpen = wrap && wrap.classList.contains("open");
    // أغلق STOCKS
    try {
      var sWrap = document.getElementById("stocksDd");
      var sBtn = document.getElementById("stocksDdBtn");
      var sList = document.getElementById("stocksDdList");
      if (sWrap) sWrap.classList.remove("open");
      if (sBtn) sBtn.classList.remove("open");
      if (sList) { sList.hidden = true; sList.setAttribute("hidden", ""); clearFixedDropdown(sList); }
    } catch (eS) {}
    if (isOpen) {
      if (wrap) wrap.classList.remove("open");
      btn.classList.remove("open");
      list.hidden = true;
      list.setAttribute("hidden", "");
      clearFixedDropdown(list);
    } else {
      if (wrap) wrap.classList.add("open");
      btn.classList.add("open");
      list.hidden = false;
      list.removeAttribute("hidden");
      placeFixedDropdown(btn, list);
    }
  };
  // بعد إعادة البناء أبقِ مغلقة
  try {
    var w0 = document.getElementById("expDropdown");
    if (w0) w0.classList.remove("open");
    btn.classList.remove("open");
    list.hidden = true;
    list.setAttribute("hidden", "");
  } catch (e0) {}
}


/** تاريخ جلسة الرياض (ويكند → الاثنين القادم تقريبًا عبر أول انتهاء متاح) */
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

function expIsoDay(iso) {
  return String(iso).slice(0, 10);
}

function isFridayIso(iso) {
  var d = new Date(String(iso) + "T12:00:00");
  return !isNaN(d.getTime()) && d.getDay() === 5;
}

/**
 * ثلاثة انتهاءات لوضع x3: اليوم · يوم بعد · الأسبوع
 * مع دمج التسميات عند التطابق (خميس/جمعة)
 */
function pickX3Targets(exps, data) {
  var list = (exps || []).slice().sort();
  if (!list.length) return [];
  var todayStr = (typeof dataSessionYmd === "function" ? dataSessionYmd(data) : riyadhYmd());
  // أول انتهاء >= اليوم (أو الأول إن كنا بعد السوق/ويكند والبيانات للجلسة القادمة)
  var iToday = 0;
  for (var i = 0; i < list.length; i++) {
    if (expIsoDay(list[i]) >= todayStr) {
      iToday = i;
      break;
    }
    iToday = i;
  }
  var expToday = list[iToday];
  var expTomorrow = list[iToday + 1] || null;
  var expWeek = null;
  for (var j = iToday; j < list.length; j++) {
    if (isFridayIso(list[j])) {
      expWeek = list[j];
      break;
    }
  }
  if (!expWeek) expWeek = list[list.length - 1];

  var out = [];
  var todayIsWeek = expToday && expWeek && expIsoDay(expToday) === expIsoDay(expWeek);
  var tomIsWeek = expTomorrow && expWeek && expIsoDay(expTomorrow) === expIsoDay(expWeek);

  if (todayIsWeek) {
    out.push({ exp: expToday, label: "اليوم · الأسبوع" });
    if (expTomorrow && expIsoDay(expTomorrow) !== expIsoDay(expToday)) {
      out.push({ exp: expTomorrow, label: "يوم بعد" });
    }
  } else if (tomIsWeek) {
    out.push({ exp: expToday, label: "اليوم" });
    out.push({ exp: expWeek, label: "يوم بعد · الأسبوع" });
  } else {
    out.push({ exp: expToday, label: "اليوم" });
    if (expTomorrow) out.push({ exp: expTomorrow, label: "يوم بعد" });
    if (expWeek && expIsoDay(expWeek) !== expIsoDay(expToday) &&
        (!expTomorrow || expIsoDay(expWeek) !== expIsoDay(expTomorrow))) {
      out.push({ exp: expWeek, label: "الأسبوع" });
    }
  }
  return out;
}


function formatPullDate(s) {
  try {
    const parts = s.split("-").map(Number);
    const d = parts[0], m = parts[1];
    const dt = new Date(new Date().getFullYear(), m - 1, d);
    return {
      top: d + dt.toLocaleString("en", { month: "short" }),
      sub: dt.toLocaleString("en", { weekday: "short" }),
    };
  } catch (e) {
    return { top: s, sub: "" };
  }
}

function lastN(arr, n) {
  if (!n || n === "ALL") return arr.slice();
  const k = parseInt(n, 10);
  return arr.slice(Math.max(0, arr.length - k));
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


function effectiveGrowthDays(nCols, requested) {
  var maxBack = Math.max(1, (nCols | 0) - 1);
  if (requested === "auto" || requested == null || requested === "") {
    return maxBack;
  }
  var n = parseInt(requested, 10);
  if (!isFinite(n) || n < 1) return maxBack;
  return Math.min(n, maxBack);
}


function spxHi5kClass(ticker, colIndex, lastIndex, value) {
  if (!state.spx5k) return "";
  if (String(ticker || "").toUpperCase() !== "SPX") return "";
  if (colIndex !== lastIndex) return "";
  var v = Number(value);
  if (!isFinite(v) || v < 5000) return "";
  return " hi5k";
}
function syncSpx5kBtn() {
  var btn = document.querySelector("#spx5kBtn");
  if (!btn) return;
  var isSpx = String(state.ticker || "").toUpperCase() === "SPX";
  btn.style.display = isSpx ? "" : "none";
  btn.classList.toggle("active", !!state.spx5k);
}
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
function deltaForExpStrike(data, exp, strike, side) {
  if (!data || !exp) return null;
  var view = null;
  try {
    view = getViewRowsFor(data, exp, "ALL", "ALL");
  } catch (e) {
    return null;
  }
  if (!view || !view.pullDates || view.pullDates.length < 2) return null;
  var row = null;
  for (var i = 0; i < view.rows.length; i++) {
    if (Number(view.rows[i].strike) === Number(strike)) {
      row = view.rows[i];
      break;
    }
  }
  if (!row) return null;
  var lastI = view.pullDates.length - 1;
  var prevI = lastI - 1;
  var arr = side === "put" ? row.puts : row.calls;
  return positiveDelta(arr[lastI] || 0, arr[prevI] || 0);
}

/** بناء جدول ΣΔ مرة واحدة لكل الانتهاءات (بدل إعادة getViewRows لكل سترايك) */
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

function sigmaFromLookup(lookup, strike, side) {
  if (!lookup) return null;
  var e = lookup[String(strike)];
  if (!e) return null;
  if (side === "call") return e.anyC ? e.call : null;
  return e.anyP ? e.put : null;
}

/** مجموع تزايدات السترايك عبر الانتهاءات المحددة */
function sumSigmaAcrossExps(data, strike, side, expList) {
  if (!data || !expList || !expList.length) return null;
  // إن وُجدت كاش للرندر الحالي استخدمها
  if (data && data._sigmaLookup && data._sigmaLookupKey === (expList || []).join(",")) {
    return sigmaFromLookup(data._sigmaLookup, strike, side);
  }
  var sum = 0, any = false;
  for (var i = 0; i < expList.length; i++) {
    var d = deltaForExpStrike(data, expList[i], strike, side);
    if (d != null) {
      sum += d;
      any = true;
    }
  }
  return any ? sum : null;
}


/* ===== Map Heat ===== */



/* ===== Map Heat: لقطات ΣΔ يدوية + JSON مشترك ===== */







function currentPullDayLabel(data) {
  var pulls = (data && data.pull_dates) || [];
  if (!pulls.length) {
    var by = (data && data.by_expiration) || {};
    Object.keys(by).forEach(function (exp) {
      (by[exp].pull_dates || []).forEach(function (pd) {
        if (pulls.indexOf(pd) < 0) pulls.push(pd);
      });
    });
  }
  if (!pulls.length) return null;
  // آخر يوم سحب (صيغة d-m)
  if (typeof comparePullDateStr === "function") {
    pulls = pulls.slice().sort(comparePullDateStr);
  } else {
    pulls = pulls.slice().sort();
  }
  return pulls[pulls.length - 1];
}



function comparePullDateStr(a, b) {
  function key(s) {
    var p = String(s || "").split("-").map(Number);
    var d = p[0] || 0,
      m = p[1] || 0;
    var y = new Date().getFullYear();
    var nowM = new Date().getMonth() + 1;
    if (m > nowM + 2) y -= 1;
    return y * 10000 + m * 100 + d;
  }
  return key(a) - key(b);
}



/** الشهر التلقائي: شهر أول انتهاء لم يمض بعد (يتحوّل للشهر التالي تلقائيًا عند انتهاء الشهر) */
function heatMonthList(data) {
  var exps = Object.keys((data && data.by_expiration) || {}).sort();
  try { exps = filterTickerExpirations(state.ticker, exps); } catch (e) {}
  var by = {}, order = [];
  exps.forEach(function (e) { var k = String(e).slice(0, 7); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(e); });
  return { by: by, order: order, exps: exps };
}
function autoHeatMonth(data) {
  var L = heatMonthList(data);
  if (!L.exps.length) return null;
  var today = dataSessionYmd(data), pick = L.exps[L.exps.length - 1];
  for (var i = 0; i < L.exps.length; i++) { if (expIsoDay(L.exps[i]) >= today) { pick = L.exps[i]; break; } }
  return String(pick).slice(0, 7);
}
function heatMonthLabel(k) {
  var p = String(k).split("-");
  return AR_MONTHS[Number(p[1]) - 1] + " " + p[0];
}
/** لقطات تلقائية: لكل يوم سحب، مجموع التزايد الموجب عبر كل انتهاءات الشهر (بدون حفظ يدوي) */
function buildAutoMonthSnapshots(data, monthKey) {
  var L = heatMonthList(data), list = L.by[monthKey] || [];
  var perDay = {};
  list.forEach(function (exp) {
    var blk = data.by_expiration[exp];
    if (!blk || !blk.rows) return;
    var pds = (blk.pull_dates && blk.pull_dates.length) ? blk.pull_dates : (data.pull_dates || []);
    for (var i = 1; i < pds.length; i++) {
      var day = pds[i], m = perDay[day] || (perDay[day] = {});
      blk.rows.forEach(function (r) {
        var dc = positiveDelta((r.calls && r.calls[i]) || 0, (r.calls && r.calls[i - 1]) || 0);
        var dp = positiveDelta((r.puts && r.puts[i]) || 0, (r.puts && r.puts[i - 1]) || 0);
        var k = String(r.strike), e = m[k] || (m[k] = { strike: Number(r.strike), call: null, put: null });
        if (dc != null) e.call = (e.call || 0) + dc;
        if (dp != null) e.put = (e.put || 0) + dp;
      });
    }
  });
  var days = Object.keys(perDay).sort(comparePullDateStr);
  var snaps = days.map(function (day, idx) {
    var f = typeof formatPullDate === "function" ? formatPullDate(day) : { top: day };
    return {
      id: "AUTO_" + state.ticker + "_" + monthKey + "_" + day, ticker: state.ticker, pullDay: day,
      label: f.top || day, sigmaExps: list.slice(),
      close: idx === days.length - 1 ? (typeof effectiveClose === "function" ? effectiveClose(data) : data.close) : null,
      rows: Object.keys(perDay[day]).map(function (k) { return perDay[day][k]; }),
    };
  });
  return snaps;
}

/** OPXs: ثالث جمعة من كل شهر — قمة/قاع، الأوبن، التغيّر، وحركة السترايك عن السحب السابق (ضمن عدد السترايكات المحدد) */
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
function computeOpxTable(data, strikesLimit) {
  var out = [];
  try {
    var exps = Object.keys((data && data.by_expiration) || {}).sort();
    exps = filterTickerExpirations(state.ticker, exps);
    var today = dataSessionYmd(data);
    var list = exps.filter(function (e) { return isThirdFridayExp(e) && expIsoDay(e) >= today; }).slice(0, 6);
    list.forEach(function (exp) {
      var blk = data.by_expiration[exp];
      if (!blk || !blk.rows || !blk.rows.length) return;
      var pds = (blk.pull_dates && blk.pull_dates.length) ? blk.pull_dates : (data.pull_dates || []);
      var li = pds.length - 1, pi = pds.length - 2;
      if (li < 0) return;
      var rows = filterStrikes(blk.rows, data.close, strikesLimit);
      function at(arr, i) { return i >= 0 && arr && arr[i] != null ? Number(arr[i]) || 0 : 0; }
      function best(sideKey, idx) {
        var b = null, bv = 0;
        rows.forEach(function (r) { var v = at(r[sideKey], idx); if (v > bv) { bv = v; b = r; } });
        return b;
      }
      function side(sideKey) {
        var cur = best(sideKey, li);
        if (!cur) return null;
        var oi = at(cur[sideKey], li);
        var o = { strike: cur.strike, oi: oi, delta: null, mv: null };
        if (pi >= 0) {
          o.delta = oi - at(cur[sideKey], pi);
          var pv = best(sideKey, pi);
          if (pv && pv.strike !== cur.strike) o.mv = { dir: cur.strike > pv.strike ? "up" : "dn", diff: Math.abs(cur.strike - pv.strike) };
        }
        return o;
      }
      var d = new Date(String(exp) + "T12:00:00");
      out.push({ exp: exp, label: "OPX " + d.toLocaleString("en", { month: "short" }), date: d.getDate() + " " + AR_MONTHS[d.getMonth()], peak: side("calls"), trough: side("puts") });
    });
  } catch (e) {}
  return out;
}


function openMapHeatDialog() {
  var data = state.cache[state.ticker];
  if (!data) {
    setStatus("لا بيانات — اختر مؤشرًا أولًا", "err");
    return;
  }
  if (typeof ensureSigmaModal === "function") ensureSigmaModal();
  var modal = $("#sigmaModal");
  var body = $("#sigmaBody");
  if (!modal || !body) {
    var div = document.createElement("div");
    div.id = "sigmaModal";
    div.className = "map-modal hidden";
    div.innerHTML =
      '<div class="map-panel export-panel">' +
      '<div class="map-head"><div><h3>Map Heat</h3></div>' +
      '<button id="sigmaClose" class="btn" type="button">إغلاق</button></div>' +
      '<div id="sigmaBody" class="map-body export-body"></div></div>';
    document.body.appendChild(div);
    div.addEventListener("click", function (e) {
      if (e.target.id === "sigmaModal") closeSigmaDialog();
    });
    var cl = $("#sigmaClose");
    if (cl)
      cl.onclick = function () {
        closeSigmaDialog();
      };
    modal = $("#sigmaModal");
    body = $("#sigmaBody");
  }
  var head = modal.querySelector(".map-head h3");
  if (head) head.textContent = "Map Heat";

  var Lh = heatMonthList(data), autoKey = autoHeatMonth(data);
  var html = '<div class="exp-month-dates" style="justify-content:center">';
  Lh.order.forEach(function (mk) {
    html += '<button type="button" class="exp-date-chip' + (mk === autoKey ? " on" : "") + '" data-mh-month="' + mk + '"><span class="d">' + heatMonthLabel(mk) + '</span><span class="s">' + (mk === autoKey ? "الحالي" : Lh.by[mk].length + " انتهاء") + "</span></button>";
  });
  html += '</div><div class="exp-unified-bar" style="margin:10px 0 14px"><button type="button" class="btn btn-teal" id="mhAutoBtn">عرض الشهر الحالي</button></div>';
  body.innerHTML = html;
  modal.classList.remove("hidden");

  function showAutoHeat(mk) {
    state.mapHeatAuto = true;
    state.mapHeatAutoMonth = mk === autoKey ? null : mk;   // null = يتبع الشهر الحالي تلقائيًا
    state.mapHeatMode = true; state.seriesMode = false; state.tawafuqMode = false; state.x3Mode = false;
    ["#seriesBtn", "#x3Btn", "#tawafuqBtn"].forEach(function (q) { var b = $(q); if (b) b.classList.remove("active"); });
    var mb = $("#mapHeatBtn"); if (mb) mb.classList.add("active");
    if (typeof closeSigmaDialog === "function") closeSigmaDialog(); else modal.classList.add("hidden");
    renderTable();
  }
  body.querySelectorAll("[data-mh-month]").forEach(function (b) { b.onclick = function () { showAutoHeat(b.getAttribute("data-mh-month")); }; });
  var autoBtn = $("#mhAutoBtn");
  if (autoBtn) autoBtn.onclick = function () { showAutoHeat(autoKey); };
}

function getSelectedMapHeatSnapshots() {
  var dat = state.cache[state.ticker];
  var mk = state.mapHeatAutoMonth || autoHeatMonth(dat);
  state.mapHeatTitle = mk ? "مجموع شهر " + heatMonthLabel(mk) : "";
  var sn = dat && mk ? buildAutoMonthSnapshots(dat, mk) : [];
  var nd = parseInt(state.days, 10);
  if (isFinite(nd) && nd > 0 && sn.length > nd) sn = sn.slice(-nd);   // يحترم عدد الأيام المختار (ALL = كل أيام الشهر)
  return sn;
}

function renderMapHeatTable() {
  var data = state.cache[state.ticker];
  var host = $("#tableHost");
  if (!host) return;
  var snaps = getSelectedMapHeatSnapshots();
  if (!snaps.length) {
    host.innerHTML =
      '<p class="status">لا لقطات معروضة — يمكن فتح Map Heat وحفظ لقطات أو اختيارها</p>';
    return;
  }
  // اتحاد السترايكات
  var strikeSet = {};
  snaps.forEach(function (s) {
    (s.rows || []).forEach(function (r) {
      strikeSet[String(r.strike)] = true;
    });
  });
  var strikes = Object.keys(strikeSet)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });
  // تطبيق حدود السترايك إن أمكن حول الإغلاق
  var close = snaps[snaps.length - 1].close;
  if (close == null && data) {
    try {
      close = effectiveClose(data);
    } catch (e) {}
  }
  var rgS = String(state.strikes || "").match(/^range:([\d.]+):([\d.]+)$/);
  if (rgS) {
    var loS = Math.min(+rgS[1], +rgS[2]), hiS = Math.max(+rgS[1], +rgS[2]);
    strikes = strikes.filter(function (s0) { return s0 >= loS && s0 <= hiS; });
  } else if (state.strikes && state.strikes !== "ALL" && close != null) {
    var n = parseInt(state.strikes, 10);
    if (n > 0) {
      strikes = strikes
        .map(function (s) {
          return { s: s, d: Math.abs(s - close) };
        })
        .sort(function (a, b) {
          return a.d - b.d;
        })
        .slice(0, n * 2)
        .map(function (x) {
          return x.s;
        })
        .sort(function (a, b) {
          return a - b;
        });
    }
  }
  var n = snaps.length;
  var callMax = [];
  var putMax = [];
  for (var i = 0; i < n; i++) {
    var mc = 0,
      mp = 0;
    var map = {};
    (snaps[i].rows || []).forEach(function (r) {
      map[r.strike] = r;
    });
    strikes.forEach(function (st) {
      var r = map[st];
      if (!r) return;
      if (r.call != null && r.call > mc) mc = r.call;
      if (r.put != null && r.put > mp) mp = r.put;
    });
    callMax.push(mc);
    putMax.push(mp);
  }

  var html =
    '<div class="table-title"><div>' +
    state.ticker +
    " | Map Heat · " + (state.mapHeatTitle || "لقطات المجموع") + "</div>";
  if (close != null) {
    html +=
      '<div class="close-pill">الإغلاق: ' +
      Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
      "</div>";
  }
  html +=
    '</div><div class="table-scroll"><table class="oi map-heat-table" style="width:auto;max-width:none"><thead>';
  html += '<tr class="side-label-row">';
  html +=
    '<th class="side-label call-side" colspan="' + n + '">CALL · ' + SUM_HTML + '</th>';
  html += '<th class="strike side-mid"></th>';
  html +=
    '<th class="side-label put-side" colspan="' + n + '">PUT · ' + SUM_HTML + '</th>';
  html += "</tr><tr>";
  for (var ci = n - 1; ci >= 0; ci--) {
    html +=
      '<th class="sigma" style="background:rgba(45,212,191,0.12)!important">' +
      (snaps[ci].label || snaps[ci].pullDay) +
      "</th>";
  }
  html += '<th class="strike">STRIKE</th>';
  for (var pi = 0; pi < n; pi++) {
    html +=
      '<th class="sigma" style="background:rgba(45,212,191,0.12)!important">' +
      (snaps[pi].label || snaps[pi].pullDay) +
      "</th>";
  }
  html += "</tr></thead><tbody>";
  var barDone = false;
  strikes.forEach(function (st, ri) {
    if (close != null && !barDone && st > close) {
      html +=
        '<tr class="close-bar"><td colspan="' +
        (n * 2 + 1) +
        '">الإغلاق ≈ ' +
        Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
        "</td></tr>";
      barDone = true;
    }
    html += '<tr class="' + (ri % 2 === 1 ? " zebra" : "") + '">';
    for (var cj = n - 1; cj >= 0; cj--) {
      var mapC = {};
      (snaps[cj].rows || []).forEach(function (r) {
        mapC[r.strike] = r;
      });
      var cell = mapC[st];
      var cv = cell ? cell.call : null;
      var maxC =
        cv != null && callMax[cj] > 0 && cv === callMax[cj] ? " max-oi" : "";
      html +=
        (maxC
          ? '<td class="mh-cell sigma max-oi">'
          : '<td class="mh-cell sigma" style="background:rgba(45,212,191,0.12)!important">') +
        (cv != null ? Number(cv).toLocaleString() : "") +
        "</td>";
    }
    html += '<td class="strike">' + st + "</td>";
    for (var pj = 0; pj < n; pj++) {
      var mapP = {};
      (snaps[pj].rows || []).forEach(function (r) {
        mapP[r.strike] = r;
      });
      var cellP = mapP[st];
      var pv = cellP ? cellP.put : null;
      var maxP =
        pv != null && putMax[pj] > 0 && pv === putMax[pj] ? " max-oi" : "";
      html +=
        (maxP
          ? '<td class="mh-cell sigma max-oi">'
          : '<td class="mh-cell sigma" style="background:rgba(45,212,191,0.12)!important">') +
        (pv != null ? Number(pv).toLocaleString() : "") +
        "</td>";
    }
    html += "</tr>";
  });
  if (close != null && !barDone) {
    html +=
      '<tr class="close-bar"><td colspan="' +
      (n * 2 + 1) +
      '">الإغلاق ≈ ' +
      Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
      "</td></tr>";
  }
  html += "</tbody></table></div>";
  host.innerHTML = html;
}

/** تصدير اللقطات المحددة (أو كل لقطات الرمز) إلى ورقة Excel */
function writeMapHeatToSheet(ws, startRow, startCol, data, ticker, dayList, daysLimit, strikesLimit) {
  var snaps = getSelectedMapHeatSnapshots();
  if (!snaps.length) return startCol;
  var n = snaps.length;
  var strikeSet = {};
  snaps.forEach(function (s) {
    (s.rows || []).forEach(function (r) {
      strikeSet[String(r.strike)] = true;
    });
  });
  var strikes = Object.keys(strikeSet)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });
  var pad = 2;
  var fillTicker = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
  var fillPutCall = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  var fillRow3 = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEECE1" } };
  var fillSigma = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5F5F0" } };
  var fillMax = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC8C4D6" } };
  var fontB = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
  var fontN = { name: "Calibri", size: 11, color: { argb: "FF000000" } };
  var alignC = { horizontal: "center", vertical: "middle" };
  var border = {
    top: { style: "thin", color: { argb: "FFD9D9D9" } },
    bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
    left: { style: "thin", color: { argb: "FFD9D9D9" } },
    right: { style: "thin", color: { argb: "FFD9D9D9" } },
  };
  var rTitle = startRow,
    rSection = startRow + 1,
    rDates = startRow + 2,
    rExp = startRow + 3,
    dataStart = startRow + 4;
  var col = startCol + pad;
  var callCols = [];
  for (var k = 0; k < n; k++) {
    callCols.push({ c: col, idx: k });
    col += 1;
  }
  var strikeCol = col;
  col += 1;
  var putCols = [];
  for (var j = 0; j < n; j++) {
    putCols.push({ c: col, idx: j });
    col += 1;
  }
  var headerEnd = col - 1 + pad;
  for (var c = startCol; c <= headerEnd; c++) {
    [rTitle, rSection, rDates, rExp].forEach(function (r) {
      var cell = ws.getCell(r, c);
      cell.border = border;
      cell.alignment = alignC;
      cell.font = fontB;
    });
    ws.getCell(rTitle, c).fill = fillTicker;
    ws.getCell(rSection, c).fill = fillPutCall;
    ws.getCell(rDates, c).fill = fillRow3;
    ws.getCell(rExp, c).fill = fillRow3;
  }
  ws.getCell(rTitle, strikeCol).value = String(ticker) + " Map Heat";
  if (callCols.length) {
    try {
      ws.mergeCells(rSection, callCols[0].c, rSection, callCols[callCols.length - 1].c);
    } catch (e) {}
    ws.getCell(rSection, callCols[0].c).value = "Call " + SUM_TXT;
  }
  if (putCols.length) {
    try {
      ws.mergeCells(rSection, putCols[0].c, rSection, putCols[putCols.length - 1].c);
    } catch (e) {}
    ws.getCell(rSection, putCols[0].c).value = "Put " + SUM_TXT;
  }
  try {
    ws.mergeCells(rSection, strikeCol, rDates, strikeCol);
  } catch (e) {}
  ws.getCell(rSection, strikeCol).value = "Strike";
  callCols.forEach(function (x) {
    var cell = ws.getCell(rDates, x.c);
    cell.value = snaps[x.idx].label || snaps[x.idx].pullDay;
    cell.fill = fillSigma;
    cell.font = fontB;
  });
  putCols.forEach(function (x) {
    var cell = ws.getCell(rDates, x.c);
    cell.value = snaps[x.idx].label || snaps[x.idx].pullDay;
    cell.fill = fillSigma;
    cell.font = fontB;
  });
  var callMax = {},
    putMax = {};
  callCols.forEach(function (x) {
    var m = 0;
    (snaps[x.idx].rows || []).forEach(function (r) {
      if (r.call != null && r.call > m) m = r.call;
    });
    callMax[x.c] = m;
  });
  putCols.forEach(function (x) {
    var m = 0;
    (snaps[x.idx].rows || []).forEach(function (r) {
      if (r.put != null && r.put > m) m = r.put;
    });
    putMax[x.c] = m;
  });
  strikes.forEach(function (st, ri) {
    var rowIdx = dataStart + ri;
    callCols.forEach(function (x) {
      var map = {};
      (snaps[x.idx].rows || []).forEach(function (r) {
        map[r.strike] = r;
      });
      var val = map[st] ? map[st].call : null;
      var cell = ws.getCell(rowIdx, x.c);
      cell.value = val != null ? val : "";
      cell.numFmt = "#,##0";
      cell.font = fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (val != null && callMax[x.c] > 0 && val === callMax[x.c]) cell.fill = fillMax;
      else cell.fill = fillSigma;
    });
    var sc = ws.getCell(rowIdx, strikeCol);
    sc.value = st;
    sc.font = fontB;
    sc.alignment = alignC;
    sc.border = border;
    putCols.forEach(function (x) {
      var map = {};
      (snaps[x.idx].rows || []).forEach(function (r) {
        map[r.strike] = r;
      });
      var val = map[st] ? map[st].put : null;
      var cell = ws.getCell(rowIdx, x.c);
      cell.value = val != null ? val : "";
      cell.numFmt = "#,##0";
      cell.font = fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (val != null && putMax[x.c] > 0 && val === putMax[x.c]) cell.fill = fillMax;
      else cell.fill = fillSigma;
    });
  });
  for (var cc = startCol; cc <= headerEnd; cc++) {
    ws.getColumn(cc).width = cc === strikeCol ? 12 : 12;
  }
  return headerEnd;
}


function openSigmaDialog() {
  var data = state.cache[state.ticker];
  if (!data) {
    setStatus("لا بيانات — اختر مؤشرًا أولًا", "err");
    return;
  }
  var modal = $("#sigmaModal");
  var body = $("#sigmaBody");
  if (!modal || !body) {
    setStatus("نافذة المجموع غير متوفرة", "err");
    return;
  }
  var allExps = Object.keys(data.by_expiration || {}).sort();
  var exps = typeof futureExpirations === "function" ? futureExpirations(allExps) : allExps;
  if (!exps.length) {
    setStatus("لا تواريخ انتهاء من اليوم فصاعدًا", "err");
    return;
  }

  // تجميع حسب الشهر (نفس تصدير الإكسل)
  var groups = {};
  var order = [];
  exps.forEach(function (exp) {
    var meta = formatExpExportChip(exp);
    if (!groups[meta.monthKey]) {
      groups[meta.monthKey] = { label: meta.monthLabel, items: [] };
      order.push(meta.monthKey);
    }
    groups[meta.monthKey].items.push({ exp: exp, meta: meta });
  });

  var selected = {};
  (state.sigmaExps || []).forEach(function (e) { selected[e] = true; });
  // إن لم يكن هناك اختيار سابق: حدّد الانتهاء الحالي إن كان ضمن القائمة
  if (!(state.sigmaExps || []).length && state.expiration && exps.indexOf(state.expiration) >= 0) {
    selected[state.expiration] = true;
  }

  var html = "";
  html += '<p class="map-sub" style="text-align:center;margin:0 0 10px">اختر تاريخًا</p>';
  html += '<div class="exp-month-list">';
  order.forEach(function (key) {
    var g = groups[key];
    html += '<div class="exp-month">';
    html += '<div class="exp-month-title">' + (g.label || key) + "</div>";
    html += '<div class="exp-month-dates">';
    // زر تحديد كل أيام هذا الشهر
    html +=
      '<button type="button" class="exp-date-chip sigma-month-all" data-sigma-month-all="' +
      key +
      '"><span class="d">الكل</span><span class="s">' +
      g.items.length +
      " يوم</span></button>";
    g.items.forEach(function (it) {
      var on = selected[it.exp] ? " on" : "";
      html +=
        '<button type="button" class="exp-date-chip' +
        on +
        '" data-sigma-exp="' +
        it.exp +
        '">' +
        '<span class="d">' +
        it.meta.day +
        (it.meta.monShort ? " " + it.meta.monShort : "") +
        "</span>" +
        '<span class="s">' +
        it.meta.sub +
        "</span></button>";
    });
    html += "</div></div>";
  });
  html += "</div>";

  html += '<div class="exp-unified-bar">';
  html +=
    '<button type="button" class="chip" id="sigmaSelectAll">تحديد الكل</button>';
  html +=
    '<button type="button" class="btn btn-teal" id="sigmaApplyBtn">تطبيق</button>';
  html += "</div>";
  html += '<p id="sigmaStatus" class="exp-status"></p>';

  body.innerHTML = html;
  modal.classList.remove("hidden");

  function selectedExpsFromDom() {
    var out = [];
    body.querySelectorAll(".exp-date-chip.on[data-sigma-exp]").forEach(function (c) {
      out.push(c.getAttribute("data-sigma-exp"));
    });
    return out.sort();
  }

  body.querySelectorAll("[data-sigma-exp]").forEach(function (btn) {
    btn.onclick = function () {
      btn.classList.toggle("on");
    };
  });

  body.querySelectorAll("[data-sigma-month-all]").forEach(function (btn) {
    btn.onclick = function () {
      var key = btn.getAttribute("data-sigma-month-all");
      var monthBox = btn.closest(".exp-month");
      if (!monthBox) return;
      var chips = monthBox.querySelectorAll("[data-sigma-exp]");
      var allOn = Array.prototype.every.call(chips, function (c) {
        return c.classList.contains("on");
      });
      chips.forEach(function (c) {
        c.classList.toggle("on", !allOn);
      });
    };
  });

  var selAll = $("#sigmaSelectAll");
  if (selAll) {
    selAll.onclick = function () {
      var chips = body.querySelectorAll("[data-sigma-exp]");
      var allOn = Array.prototype.every.call(chips, function (c) {
        return c.classList.contains("on");
      });
      chips.forEach(function (c) {
        c.classList.toggle("on", !allOn);
      });
    };
  }
  var apply = $("#sigmaApplyBtn");
  if (apply) {
    apply.onclick = function () {
      var list = selectedExpsFromDom();
      if (!list.length) {
        var st = $("#sigmaStatus");
        if (st) st.textContent = "يلزم اختيار تاريخ انتهاء واحد على الأقل";
        return;
      }
      state.sigmaExps = list;
      state.showSigma = true;
      var sb = $("#sigmaBtn");
      if (sb) sb.classList.add("active");
      closeSigmaDialog();
      renderTable();
    };
  }
}

function closeSigmaDialog() {
  var modal = $("#sigmaModal");
  if (modal) modal.classList.add("hidden");
}

function setStatus(msg, cls) {
  const el = $("#status");
  el.textContent = msg;
  el.className = "status " + (cls || "");
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.dark ? "dark" : "light");
  const sw = $("#themeSwitch");
  if (sw) sw.classList.toggle("on", state.dark);
  try { localStorage.setItem("oi-theme", state.dark ? "dark" : "light"); } catch (e) {}
}

function isIndexTicker(sym) {
  return INDEX_TICKERS.some(function (t) { return t.symbol === sym; });
}

function renderTickers() {
  const box = $("#tickers");
  if (!box) return;
  box.innerHTML = "";

  // بطاقات المؤشرات الخمسة فقط
  INDEX_TICKERS.forEach(function (t) {
    const el = document.createElement("div");
    el.className = "tcard" + (t.symbol === state.ticker ? " active" : "");
    el.innerHTML =
      '<div class="dot" style="background:' + t.color + '">' + t.symbol.slice(0, 3) + "</div>" +
      "<div><b>" + t.symbol + "</b><span>" + t.name + "</span></div>";
    el.onclick = function () {
      state.ticker = t.symbol;
      state.expiration = null;
      state.livePrice = null;
      renderStocksDropdown();
      renderTickers();
      if (typeof syncSpx5kBtn === "function") syncSpx5kBtn();
      refresh();
      refreshLivePrice();
    };
    box.appendChild(el);
  });

  renderStocksDropdown();
}

function renderStocksDropdown() {
  const host = $("#stocksRow");
  if (!host) return;
  const cur = isIndexTicker(state.ticker) ? "" : state.ticker;

  var itemsHtml =
    '<button type="button" class="stocks-dd-item' +
    (!cur ? " active" : "") +
    '" data-value="" role="option">----</button>';
  STOCKS_TICKERS.forEach(function (t) {
    itemsHtml +=
      '<button type="button" class="stocks-dd-item' +
      (t.symbol === cur ? " active" : "") +
      '" data-value="' +
      t.symbol +
      '" role="option">' +
      t.symbol +
      "</button>";
  });

  host.innerHTML =
    '<label class="stocks-label">STOCKS</label>' +
    '<div class="stocks-dd" id="stocksDd">' +
    '<button type="button" class="stocks-dd-btn" id="stocksDdBtn" aria-haspopup="listbox">' +
    '<span id="stocksDdLabel">' +
    (cur || "----") +
    "</span></button>" +
    '<div class="stocks-dd-list" id="stocksDdList" role="listbox" hidden>' +
    itemsHtml +
    "</div></div>";

  var btn = $("#stocksDdBtn");
  var list = $("#stocksDdList");
  if (!btn || !list) return;

  btn.onclick = function (e) {
    e.preventDefault();
    e.stopPropagation();
    var wrap = document.getElementById("stocksDd");
    var isOpen = wrap && wrap.classList.contains("open");
    try {
      var eWrap = document.getElementById("expDropdown");
      var eBtn = document.getElementById("expDdBtn");
      var eList = document.getElementById("expDdList");
      if (eWrap) eWrap.classList.remove("open");
      if (eBtn) eBtn.classList.remove("open");
      if (eList) { eList.hidden = true; eList.setAttribute("hidden", ""); clearFixedDropdown(eList); }
    } catch (eE) {}
    if (isOpen) {
      if (wrap) wrap.classList.remove("open");
      btn.classList.remove("open");
      list.hidden = true;
      list.setAttribute("hidden", "");
      clearFixedDropdown(list);
    } else {
      if (wrap) wrap.classList.add("open");
      btn.classList.add("open");
      list.hidden = false;
      list.removeAttribute("hidden");
      placeFixedDropdown(btn, list);
    }
  };

  list.querySelectorAll(".stocks-dd-item").forEach(function (item) {
    item.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var v = item.getAttribute("data-value") || "";
      list.hidden = true;
      list.setAttribute("hidden", "");
      btn.classList.remove("open");
      var sWrap = document.getElementById("stocksDd");
      if (sWrap) sWrap.classList.remove("open");
      clearFixedDropdown(list);
      if (!v) return;
      state.ticker = v;
      state.expiration = null;
      state.livePrice = null;
      var lab = $("#stocksDdLabel");
      if (lab) lab.textContent = v;
      list.querySelectorAll(".stocks-dd-item").forEach(function (el) {
        el.classList.toggle(
          "active",
          (el.getAttribute("data-value") || "") === v
        );
      });
      renderTickers();
      refresh();
      refreshLivePrice();
    };
  });

  if (!window.__stocksDdOutsideBound) {
    window.__stocksDdOutsideBound = true;
    document.addEventListener("click", function (e) {
      var listEl = $("#stocksDdList");
      var btnEl = $("#stocksDdBtn");
      var wrap = $("#stocksDd");
      if (!listEl || !btnEl) return;
      if (wrap && wrap.contains(e.target)) return;
      listEl.hidden = true;
      listEl.setAttribute("hidden", "");
      btnEl.classList.remove("open");
      if (wrap) wrap.classList.remove("open");
      clearFixedDropdown(listEl);
    });
  }
}

function renderChips(rowId, options, key) {
  const row = $(rowId);
  row.innerHTML = "";
  options.forEach(function (opt) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (String(state[key]) === String(opt) ? " active" : "");
    b.textContent = opt;
    b.onclick = function () {
      state[key] = opt;
      renderChips(rowId, options, key);
      renderTable();
    };
    row.appendChild(b);
  });
  if (key === "days") {
    var free = document.createElement("input");
    free.type = "number";
    free.min = "1";
    free.className = "days-free-input";
    free.placeholder = "";
    free.title = "عدد مخصص";
    free.setAttribute("aria-label", "عدد مخصص");
    free.setAttribute(
      "style",
      "width:40px!important;min-width:40px!important;max-width:40px!important;" +
        "height:28px!important;min-height:28px!important;max-height:28px!important;" +
        "flex:0 0 40px!important;padding:0 13px 0 0!important;margin:0!important;align-self:center!important;" +
        "border-radius:9px!important;border:1px solid #2d3548!important;" +
        "background:#1f2535!important;color:#f1f5f9!important;color-scheme:dark;" +
        "font-size:12.5px!important;font-weight:700!important;text-align:center!important;" +
        "box-sizing:border-box!important;-moz-appearance:textfield!important;" +
        "outline:none!important;box-shadow:none!important;"
    );
    var known = options.map(String);
    var cur = String(state.days || "");
    free.value = known.indexOf(cur) >= 0 ? "" : cur && cur !== "ALL" ? cur : "";
    var _fTimer = null;
    free.addEventListener("input", function () {   // الأسهم/الكتابة تُطبَّق مباشرة بدون مسح الرقم
      clearTimeout(_fTimer);
      _fTimer = setTimeout(function () {
        var v2 = parseInt(free.value, 10);
        if (isFinite(v2) && v2 >= 1) {
          state.days = String(v2);
          row.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
          renderTable();
        }
      }, 450);
    });
    free.addEventListener("change", function () {
      var v = parseInt(free.value, 10);
      if (isFinite(v) && v >= 1 && String(state.days) !== String(v)) {
        state.days = String(v);
        renderChips(rowId, options, key);
        renderTable();
      }
    });
    free.addEventListener("keydown", function (e) {
      if (e.key === "Enter") free.blur();
    });
    var wrap = document.createElement("span");
    wrap.className = "days-free-wrap";
    var arrows = document.createElement("span");
    arrows.className = "dfw-arrows";
    function stepDays(dl) {
      var cur = parseInt(free.value, 10);
      if (!isFinite(cur) || cur < 1) { var sd = parseInt(String(state.days), 10); cur = isFinite(sd) && sd > 0 ? sd : 5; }
      var nv = Math.max(1, cur + dl);
      free.value = String(nv);
      state.days = String(nv);
      row.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
      renderTable();
    }
    [["▲", 1, "زيادة"], ["▼", -1, "إنقاص"]].forEach(function (q) {
      var bt = document.createElement("button");
      bt.type = "button"; bt.className = "dfw-btn"; bt.textContent = q[0]; bt.tabIndex = -1; bt.setAttribute("aria-label", q[2]);
      bt.addEventListener("click", function () { stepDays(q[1]); });
      arrows.appendChild(bt);
    });
    wrap.appendChild(free);
    wrap.appendChild(arrows);
    wrap.addEventListener("wheel", function (ev) {   // تحريك العجلة فوق المربع يزيد/ينقص الرقم بدون ضغط
      ev.preventDefault();
      stepDays(ev.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    row.appendChild(wrap);
  }
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

function getViewRows(data, noHide) {
  const block = data.by_expiration[state.expiration];
  if (!block) return null;
  var basePull = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates.slice()
    : (data.pull_dates || []).slice();
  if (
    String(state.ticker).toUpperCase() === "SPX" &&
    state.expiration &&
    typeof isThirdFridayExp === "function" &&
    isThirdFridayExp(state.expiration)
  ) {
    basePull = filterSpxMonthlyPullDates(basePull);
  }
  var fullDates = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates
    : (data.pull_dates || []);
  var idxFull = basePull.map(function (d) { return fullDates.indexOf(d); });
  var rowsAligned = (block.rows || []).map(function (r) {
    return {
      strike: r.strike,
      calls: idxFull.map(function (i) { return i >= 0 ? (r.calls[i] || 0) : 0; }),
      puts: idxFull.map(function (i) { return i >= 0 ? (r.puts[i] || 0) : 0; }),
    };
  });
  var trimmed = trimLeadingZeroColumns(basePull, rowsAligned);
  basePull = trimmed.pullDates;
  rowsAligned = trimmed.rows;
  var pullDates = lastN(basePull, state.days);
  var __hpM = noHide ? {} : hiddenPullSet();   // أعمدة محذوفة بزر × (لا تُستبدل بأقدم منها)
  if (Object.keys(__hpM).length) {
    var __keptM = pullDates.filter(function (d) { return !__hpM[d]; });
    if (__keptM.length >= 1) pullDates = __keptM;
  }
  if (!pullDates.length) return null;
  const idx = pullDates.map(function (d) { return basePull.indexOf(d); });
  let rows = rowsAligned.map(function (r) {
    return {
      strike: r.strike,
      calls: idx.map(function (i) { return i >= 0 ? r.calls[i] : 0; }),
      puts: idx.map(function (i) { return i >= 0 ? r.puts[i] : 0; }),
    };
  });
  rows = filterStrikes(rows, data.close, state.strikes);
  return { pullDates: pullDates, rows: rows, close: data.close };
}

async function refresh() {
  setStatus("جاري التحميل...");
  // ثبّت واجهة الانتهاء أثناء التحميل (لا تفرّغ القائمة فتحدث وميض/انهيار الشريط)
  try {
    if (typeof ensureExpDropdownUI === "function") ensureExpDropdownUI();
  } catch (e0) {}
  try {
    const data = await loadTicker(state.ticker);
    const exps = filterTickerExpirations(state.ticker, data.expirations || []);
    fillExpDropdown(exps);
    $("#updatedAt").textContent = data.updated_at
      ? "آخر تحديث: " + formatUpdatedAt(data.updated_at)
      : "لا يوجد تحديث بعد — شغّل Actions أولاً";
    renderTable();
    setStatus("جاهز", "ok");
    if (typeof fetchSessionClose === "function") {
      fetchSessionClose(state.ticker).then(function (px) {
        if (px != null) {
          state.sessionClose = px;
          if (state.cache[state.ticker]) state.cache[state.ticker].close = px;
          renderTable();
        }
      });
    }
  } catch (e) {
    setStatus(String(e.message || e), "err");
    $("#tableHost").innerHTML = '<p class="status err">' + (e.message || e) + "</p>";
  }
}

/** ترتيب أعلى 4 قيم (موجبة) → { فهرس: رتبة } */
function rankTop4(vals) {
  var o = {};
  vals.map(function (v, i) { return { v: v, i: i }; }).filter(function (q) { return q.v != null && q.v > 0; })
    .sort(function (a, b) { return b.v - a.v; }).slice(0, 4).forEach(function (q, k) { o[q.i] = k + 1; });
  return o;
}
function rkSuffix(n) { return n ? '<span class="rk-par">(' + n + ")</span>" : ""; }
function greenBarRow(canDelta, canGrowthOrN, nOrClose, closeMaybe, canSigmaMaybe) {
  /* يدعم (canDelta, n, close) أو (canDelta, canGrowth, n, close[, canSigma]) */
  var canGrowth = false;
  var canSigma = false;
  var n = 0;
  var close = null;
  if (arguments.length <= 3) {
    n = canGrowthOrN | 0;
    close = nOrClose;
  } else {
    canGrowth = !!canGrowthOrN;
    n = nOrClose | 0;
    close = closeMaybe;
    canSigma = !!canSigmaMaybe;
  }
  if (!n || n < 0) n = 0;
  const sideExtra = (canDelta ? 1 : 0) + (canGrowth ? 1 : 0) + (canSigma ? 1 : 0);
  const cols = sideExtra + n + 1 + n + sideExtra;
  const strikeAt = sideExtra + n;
  if (close != null) {
    return '<tr class="close-merged-row"><td class="green close-merged" colspan="' + cols + '">الإغلاق ≈ ' +
      Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "</td></tr>";
  }
  let html = "<tr>";
  for (let i = 0; i < cols; i++) {
    html +=
      '<td class="green">' +
      (i === strikeAt && close != null
        ? Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : "") +
      "</td>";
  }
  return html + "</tr>";
}


function arabicDayMonth(exp) {
  try {
    var parts = String(exp).split("-");
    if (parts.length < 3) return String(exp);
    var d = parseInt(parts[2], 10);
    var m = parseInt(parts[1], 10);
    var months = {
      1: "يناير", 2: "فبراير", 3: "مارس", 4: "أبريل", 5: "مايو", 6: "يونيو",
      7: "يوليو", 8: "أوغست", 9: "سبتمبر", 10: "أكتوبر", 11: "نوفمبر", 12: "ديسمبر",
    };
    return d + " " + (months[m] || parts[1]);
  } catch (e) {
    return String(exp);
  }
}

/** تسمية بطاقة ×3: «اليوم 17 أوغست» بدون تاريخ ISO كامل */
function x3PanelTitle(label, exp) {
  var dm = arabicDayMonth(exp);
  var lab = String(label || "");
  lab = lab.replace(/\d{4}-\d{2}-\d{2}/g, "").trim();
  var am = "";
  if (
    typeof isAmSettlementTicker === "function" &&
    isAmSettlementTicker(state.ticker) &&
    typeof isThirdFridayExp === "function" &&
    isThirdFridayExp(exp)
  ) {
    am = ' <span class="exp-am">AM</span>';
  }
  if (/اليوم|يوم بعد|الأسبوع|OPX/i.test(lab)) {
    return lab + " " + dm + am;
  }
  return lab + " " + dm + am;
}

function renderOneMiniTable(data, expiration, label, opts) {
  opts = opts || {};
  var saved = {
    expiration: state.expiration,
    days: state.days,
    showDelta: state.showDelta,
    showGrowth: state.showGrowth,
  };
  state.expiration = expiration;
  state.days = "2";
  var view = getViewRows(data, true);
  state.expiration = saved.expiration;
  state.days = saved.days;
  state.showDelta = saved.showDelta;
  state.showGrowth = saved.showGrowth;

  var title = x3PanelTitle(label, expiration);
  if (!view || !view.rows.length) {
    return (
      '<div class="x3-col' + (opts.active ? " active" : "") + '">' +
      '<div class="x3-col-h">' + title + "</div>" +
      '<p class="status" style="padding:12px">لا بيانات</p></div>'
    );
  }
  var pullDates = view.pullDates;
  var rows = view.rows;
  // محاذاة صفوف x3: نفس قائمة السترايك في الجداول الثلاثة
  if (opts.sharedStrikes && opts.sharedStrikes.length) {
    var byS = {};
    rows.forEach(function (r) {
      byS[String(Math.round(Number(r.strike) * 100) / 100)] = r;
    });
    rows = opts.sharedStrikes.map(function (s) {
      var k = String(Math.round(Number(s) * 100) / 100);
      if (byS[k]) return byS[k];
      var emptyC = [], emptyP = [];
      for (var ei = 0; ei < pullDates.length; ei++) {
        emptyC.push(0);
        emptyP.push(0);
      }
      return { strike: Number(s), calls: emptyC, puts: emptyP };
    });
  }
  var close = effectiveClose(data);
  var canDelta = state.showDelta && pullDates.length >= 2;
  var lastI = pullDates.length - 1;
  var prevI = pullDates.length - 2;

  var callMax = [], putMax = [];
  for (var i = 0; i < pullDates.length; i++) {
    var mc = 0, mp = 0;
    rows.forEach(function (r) {
      var cv = r.calls[i] || 0;
      var pv = r.puts[i] || 0;
      if (cv > mc) mc = cv;
      if (pv > mp) mp = pv;
    });
    callMax.push(mc);
    putMax.push(mp);
  }
  var deltaCallMax = 0, deltaPutMax = 0;
  if (canDelta) {
    rows.forEach(function (r) {
      var dc = positiveDelta(r.calls[lastI], r.calls[prevI]);
      var dp = positiveDelta(r.puts[lastI], r.puts[prevI]);
      if (dc != null && dc > deltaCallMax) deltaCallMax = dc;
      if (dp != null && dp > deltaPutMax) deltaPutMax = dp;
    });
  }

  // أقرب سترايك للإغلاق لصف الشريط الأخضر
  var closeStrike = null;
  if (close != null && !isNaN(Number(close)) && rows.length) {
    var best = rows[0].strike;
    var bestD = Math.abs(rows[0].strike - close);
    rows.forEach(function (r) {
      var d = Math.abs(r.strike - close);
      if (d < bestD) {
        bestD = d;
        best = r.strike;
      }
    });
    closeStrike = best;
  }

  var html =
    '<div class="x3-col' + (opts.active ? " active" : "") + '">' +
    '<div class="x3-col-h">' + title + "</div>" +
    '<div class="x3-table-wrap"><table class="oi x3-table"><thead>';
  var nColsX = pullDates.length;
  html += '<tr class="side-label-row">';
  if (canDelta) html += '<th class="delta side-pad"></th>';
  html += '<th class="side-label call-side" colspan="' + nColsX + '">CALL</th>';
  html += '<th class="strike side-mid"></th>';
  html += '<th class="side-label put-side" colspan="' + nColsX + '">PUT</th>';
  if (canDelta) html += '<th class="delta side-pad"></th>';
  html += "</tr><tr>";
  if (canDelta) html += '<th class="delta">Δ</th>';
  for (var hi = pullDates.length - 1; hi >= 0; hi--) {
    var f = formatPullDate(pullDates[hi]);
    html += "<th>" + f.top + '<br><span class="subh">' + f.sub + "</span></th>";
  }
  html += '<th class="strike">STRIKE</th>';
  for (var hj = 0; hj < pullDates.length; hj++) {
    var f2 = formatPullDate(pullDates[hj]);
    html += "<th>" + f2.top + '<br><span class="subh">' + f2.sub + "</span></th>";
  }
  if (canDelta) html += '<th class="delta">Δ</th>';
  html += "</tr></thead><tbody>";

  rows.forEach(function (r, ri) {
    var isCloseRow = closeStrike != null && Number(r.strike) === Number(closeStrike);
    /* ×3 نطاقات: بدون زيبرا وبدون itm/otm — التلوين بالنطاق فقط */
    var callCls = "";
    var putCls = "";
    var band = "";
    if (close != null && !isNaN(Number(close)) && !isCloseRow) {
      var dist = Math.abs(Number(r.strike) - Number(close));
      if (dist <= 3) band = " band-near";
      else if (dist <= 8) band = " band-mid";
      else band = " band-far";
    }
    html += '<tr class="' + (isCloseRow ? "close-bar" : "") + band + '">';
    if (canDelta) {
      var dc = positiveDelta(r.calls[lastI], r.calls[prevI]);
      var maxD = dc != null && deltaCallMax > 0 && dc === deltaCallMax ? " max-oi" : "";
      html +=
        '<td class="delta' + maxD + '">' +
        (dc != null ? dc.toLocaleString() : "") +
        "</td>";
    }
    for (var ci = pullDates.length - 1; ci >= 0; ci--) {
      var cv = r.calls[ci] || 0;
      var maxC = callMax[ci] > 0 && cv === callMax[ci] ? " max-oi" : "";
      html +=
        '<td class="' + callCls + maxC + '">' + cv.toLocaleString() + "</td>";
    }
    if (isCloseRow && close != null) {
      html +=
        '<td class="strike close-strike">' +
        Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
        "</td>";
    } else {
      html += '<td class="strike">' + r.strike + "</td>";
    }
    for (var pi = 0; pi < pullDates.length; pi++) {
      var pv = r.puts[pi] || 0;
      var maxP = putMax[pi] > 0 && pv === putMax[pi] ? " max-oi" : "";
      html +=
        '<td class="' + putCls + maxP + '">' + pv.toLocaleString() + "</td>";
    }
    if (canDelta) {
      var dp = positiveDelta(r.puts[lastI], r.puts[prevI]);
      var maxDp = dp != null && deltaPutMax > 0 && dp === deltaPutMax ? " max-oi" : "";
      html +=
        '<td class="delta' + maxDp + '">' +
        (dp != null ? dp.toLocaleString() : "") +
        "</td>";
    }
    html += "</tr>";
  });
  html += "</tbody></table></div></div>";
  return html;
}


function renderX3() {
  var data = state.cache[state.ticker];
  var host = $("#tableHost");
  if (!data) {
    host.innerHTML = '<p class="status">لا بيانات</p>';
    return;
  }
  var exps = filterTickerExpirations(state.ticker, data.expirations || []);
  var targets = pickX3Targets(exps, data);
  if (!targets.length) {
    host.innerHTML = '<p class="status">لا تواريخ لوضع ×3</p>';
    return;
  }

  var tl = '<div class="x3-timeline">';
  targets.forEach(function (t, i) {
    if (i > 0) tl += '<div class="x3-line"></div>';
    var nodeLab = String(t.label || "");
    // الخط الزمني: اليوم 17 أوغست
    var nodeTitle = x3PanelTitle(nodeLab, t.exp);
    tl +=
      '<div class="x3-node">' +
      '<div class="x3-dot' + (i === 0 ? " on" : "") + '"></div>' +
      '<div class="x3-lab">' + nodeTitle + "</div>" +
      "</div>";
  });
  tl += "</div>";

  // سترايكات موحّدة = قائمة جدول «اليوم» فقط حتى تتطابق الصفوف عموديًا
  var sharedStrikes = [];
  if (targets.length) {
    var saved0 = { expiration: state.expiration, days: state.days };
    state.expiration = targets[0].exp;
    state.days = "2";
    var view0 = getViewRows(data, true);
    state.expiration = saved0.expiration;
    state.days = saved0.days;
    if (view0 && view0.rows) {
      sharedStrikes = view0.rows.map(function (r) { return Number(r.strike); });
      sharedStrikes.sort(function (a, b) { return a - b; });
    }
  }

  var cols = '<div class="x3-cols">';
  targets.forEach(function (t, i) {
    cols += renderOneMiniTable(data, t.exp, t.label, {
      active: i === 0,
      sharedStrikes: sharedStrikes,
    });
  });
  cols += "</div>";

  host.innerHTML = '<div class="x3-board">' + tl + cols + "</div>";
}

/** جدول «اليوم بالسابق»: أعمدة = تواريخ انتهاء يومية متتالية (25 ثم 26 ثم…) وليس أيام سحب لنفس الانتهاء */
/** تحويل انتهاء ISO → مفتاح سحب d-m مثل 25-8 */
function expToPullDateLabel(exp) {
  try {
    var p = String(exp).split("-");
    if (p.length < 3) return null;
    return parseInt(p[2], 10) + "-" + parseInt(p[1], 10);
  } catch (e) {
    return null;
  }
}

function expSortKey(exp) {
  try {
    return new Date(String(exp) + "T12:00:00").getTime();
  } catch (e) {
    return 0;
  }
}

/** مفتاح سحب d-m + سنة → ISO انتهاء YYYY-MM-DD */
function pullLabelToExpIso(label, year) {
  try {
    var parts = String(label).split("-").map(Number);
    var day = parts[0], month = parts[1];
    if (!day || !month) return null;
    var y = year || new Date().getFullYear();
    return (
      y +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0")
    );
  } catch (e) {
    return null;
  }
}

function findExpBlockForPullDay(data, pullLabel, yearHint) {
  var y = yearHint || new Date().getFullYear();
  var tries = [y, y - 1, y + 1];
  for (var i = 0; i < tries.length; i++) {
    var exp = pullLabelToExpIso(pullLabel, tries[i]);
    if (exp && data.by_expiration && data.by_expiration[exp]) {
      return { exp: exp, block: data.by_expiration[exp] };
    }
  }
  return null;
}

/**
 * جدول «اليوم بالسابق»:
 * الأعمدة = أيام السحب الفعلية (10-8، 11-8، … 25-8).
 * كل عمود يأخذ أرقام عقد الانتهاء الذي ينتهي في نفس ذلك اليوم (0DTE لذلك اليوم).
 * مثال: عمود 25-8 ← انتهاء 2026-08-25 | عمود 26-8 ← انتهاء 2026-08-26
 * لا يُدرج يناير/يونيو البعيدة لأنها ليست أيام سحب في السلسلة.
 */
function getSeriesPrevDayView(data, daysLimit, strikesLimit) {
  if (!data || !data.by_expiration) return null;
  if (daysLimit == null) daysLimit = state.days;
  if (strikesLimit == null) strikesLimit = state.strikes;

  var pulls = (data.pull_dates || []).slice();
  if (!pulls.length) {
    // احتياط: اجمع أيام السحب من كل الانتهاءات
    var seen = {};
    Object.keys(data.by_expiration).forEach(function (exp) {
      var bp = data.by_expiration[exp].pull_dates || [];
      bp.forEach(function (pd) {
        seen[pd] = true;
      });
    });
    pulls = Object.keys(seen);
  }
  if (!pulls.length) return null;

  pulls.sort(function (a, b) {
    return pullDateSortKey(a) - pullDateSortKey(b);
  });

  var session = dataSessionFromPull(data);
  var yearHint = session ? session.year : new Date().getFullYear();

  var columns = [];
  pulls.forEach(function (pd) {
    var found = findExpBlockForPullDay(data, pd, yearHint);
    if (!found) return; // لا عقد ينتهي في هذا اليوم ضمن البيانات
    var block = found.block;
    var exp = found.exp;
    if (!block.rows || !block.rows.length) return;

    var bpulls =
      block.pull_dates && block.pull_dates.length
        ? block.pull_dates
        : data.pull_dates || [];
    var idx = bpulls.indexOf(pd);
    // نفس يوم السحب إن وُجد؛ وإلا آخر سحب لهذا الانتهاء
    if (idx < 0) idx = bpulls.length - 1;
    if (idx < 0) return;

    var strikeMap = {};
    (block.rows || []).forEach(function (r) {
      var c = (r.calls && r.calls[idx]) || 0;
      var p = (r.puts && r.puts[idx]) || 0;
      strikeMap[String(r.strike)] = { c: c, p: p, strike: r.strike };
    });
    columns.push({ exp: exp, label: pd, strikeMap: strikeMap });
  });

  if (!columns.length) return null;

  // Days: آخر N أيام سحب (آخرها = اليوم الحالي في البيانات، مثل 25-8)
  columns = lastN(columns, daysLimit);
  var __hpS = hiddenPullSet();   // أعمدة محذوفة بزر ×
  if (Object.keys(__hpS).length) {
    var __keptS = columns.filter(function (c) { return !__hpS[c.label]; });
    if (__keptS.length >= 1) columns = __keptS;
  }
  var pullDates = columns.map(function (c) {
    return c.label;
  });

  var strikeSet = {};
  columns.forEach(function (col) {
    Object.keys(col.strikeMap).forEach(function (k) {
      strikeSet[k] = col.strikeMap[k].strike;
    });
  });
  var strikes = Object.keys(strikeSet)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });

  var rows = strikes.map(function (s) {
    var key = String(s);
    return {
      strike: s,
      calls: columns.map(function (col) {
        var m = col.strikeMap[key];
        return m ? m.c : 0;
      }),
      puts: columns.map(function (col) {
        var m = col.strikeMap[key];
        return m ? m.p : 0;
      }),
    };
  });

  var closePx =
    data.close != null
      ? data.close
      : typeof effectiveClose === "function"
        ? effectiveClose(data)
        : null;
  rows = filterStrikes(rows, closePx, strikesLimit);
  return {
    pullDates: pullDates,
    rows: rows,
    close: closePx,
    expiration: "اليوم بالسابق",
    seriesExps: columns.map(function (c) {
      return c.exp;
    }),
  };
}

/** جدول «اليوم بالسابق»: أعمدة = تواريخ انتهاء يومية متتالية (25 ثم 26 ثم…) وليس أيام سحب لنفس الانتهاء */
/** ألوان أعمدة «اليوم بالسابق» — متسلسلة بدون تناظر كول/بوت */



function seriesColClass(pos, totalCols) {
  var tones = ["sc-a", "sc-b", "sc-c", "sc-d", "sc-e", "sc-f", "sc-g"];
  if (!totalCols || totalCols < 1) return tones[0];
  var p = Math.max(0, Math.min(totalCols - 1, pos | 0));
  return tones[p % tones.length];
}


/** —— تبويب التوافق: انتهاءات قادمة من سحب واحد —— */
function isFridayExp(exp) {
  try {
    return new Date(String(exp) + "T12:00:00").getDay() === 5;
  } catch (e) {
    return false;
  }
}

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

function tawafuqColKind(exp) {
  if (typeof isThirdFridayExp === "function" && isThirdFridayExp(exp)) return "opx";
  if (isMonthEndExp(exp)) return "eom";
  if (isFridayExp(exp)) return "fri";
  return "";
}

function formatTawafuqHeader(exp) {
  try {
    var d = new Date(String(exp) + "T12:00:00");
    var kind = tawafuqColKind(exp);
    var mon = d.toLocaleString("en", { month: "short" });
    var wd = d.toLocaleString("en", { weekday: "short" });
    // مثل باقي الجداول: 5Oct — وتحته opx أو اسم اليوم
    var sub = kind === "opx" ? "opx" : wd;
    return {
      top: d.getDate() + mon,
      sub: sub,
      kind: kind,
    };
  } catch (e) {
    return { top: String(exp), sub: "", kind: "" };
  }
}

/** أحدث يوم سحب عام في البيانات → ISO للمقارنة */
function latestPullIso(data) {
  var pulls = (data && data.pull_dates) || [];
  if (!pulls.length) {
    var seen = {};
    Object.keys((data && data.by_expiration) || {}).forEach(function (exp) {
      ((data.by_expiration[exp].pull_dates) || []).forEach(function (pd) {
        seen[pd] = true;
      });
    });
    pulls = Object.keys(seen);
  }
  if (!pulls.length) return null;
  pulls = pulls.slice().sort(function (a, b) {
    return pullDateSortKey(a) - pullDateSortKey(b);
  });
  var last = pulls[pulls.length - 1];
  var session = typeof dataSessionFromPull === "function" ? dataSessionFromPull(data) : null;
  var y = session && session.year ? session.year : new Date().getFullYear();
  return pullLabelToExpIso(last, y);
}

/**
 * التوافق: أعمدة = انتهاءات من تاريخ السحب الحالي فصاعداً.
 * القيمة = أوبن آخر سحب لكل انتهاء.
 * Δ = آخر سحب مقابل السحب السابق لنفس الانتهاء.
 */
function getTawafuqView(data, daysLimit, strikesLimit) {
  if (!data || !data.by_expiration) return null;
  if (strikesLimit == null) strikesLimit = state.strikes;

  var allExps = Object.keys(data.by_expiration).sort(function (a, b) {
    return expSortKey(a) - expSortKey(b);
  });
  if (!allExps.length) return null;

  var fromIso = latestPullIso(data);
  if (!fromIso) {
    // احتياط: اليوم المحلي
    var now = new Date();
    fromIso =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");
  }

  var forward = allExps.filter(function (exp) {
    return exp >= fromIso;
  });
  if (!forward.length) {
    // إن لم يبقَ انتهاء لاحق، اعرض من أقرب انتهاء موجود
    forward = allExps.slice();
  }

  var limit = daysLimit;
  if (limit == null || limit === "" || limit === "ALL") {
    // بلا حد — كل المتاح
  } else {
    var k = parseInt(limit, 10);
    if (isFinite(k) && k > 0) forward = forward.slice(0, k);
  }
  var __ht = (state.hiddenTwExps && state.hiddenTwExps[state.ticker]) || {};   // حذف بدون إحلال يوم آخر مكانه
  if (Object.keys(__ht).length) { var __f = forward.filter(function (e) { return !__ht[e]; }); if (__f.length) forward = __f; }

  var columns = [];
  forward.forEach(function (exp) {
    var block = data.by_expiration[exp];
    if (!block || !block.rows || !block.rows.length) return;
    var bpulls =
      block.pull_dates && block.pull_dates.length
        ? block.pull_dates
        : data.pull_dates || [];
    if (!bpulls.length) return;
    var lastIdx = bpulls.length - 1;
    var prevIdx = lastIdx - 1;
    var strikeMap = {};
    (block.rows || []).forEach(function (r) {
      var c = (r.calls && r.calls[lastIdx]) || 0;
      var p = (r.puts && r.puts[lastIdx]) || 0;
      var dc =
        prevIdx >= 0
          ? positiveDelta(
              (r.calls && r.calls[lastIdx]) || 0,
              (r.calls && r.calls[prevIdx]) || 0
            )
          : null;
      var dp =
        prevIdx >= 0
          ? positiveDelta(
              (r.puts && r.puts[lastIdx]) || 0,
              (r.puts && r.puts[prevIdx]) || 0
            )
          : null;
      // نحتفظ بالصف حتى لو 0/0 لأنه سترايك موجود في هذا الانتهاء
      strikeMap[String(r.strike)] = {
        c: c,
        p: p,
        dc: dc,
        dp: dp,
        pcv: prevIdx >= 0 ? (r.calls && r.calls[prevIdx]) || 0 : null,
        ppv: prevIdx >= 0 ? (r.puts && r.puts[prevIdx]) || 0 : null,
        strike: r.strike,
        present: true,
      };
    });
    columns.push({
      exp: exp,
      label: exp,
      kind: tawafuqColKind(exp),
      strikeMap: strikeMap,
    });
  });

  if (!columns.length) return null;

  var strikeSet = {};
  columns.forEach(function (col) {
    Object.keys(col.strikeMap).forEach(function (k) {
      strikeSet[k] = col.strikeMap[k].strike;
    });
  });
  var strikeNums = Object.keys(strikeSet)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });

  var close = effectiveClose(data);
  var rows = strikeNums.map(function (s) {
    var calls = [];
    var puts = [];
    var callDeltas = [];
    var putDeltas = [];
    var prevCalls = [];
    var prevPuts = [];
    var present = [];
    columns.forEach(function (col) {
      var cell = col.strikeMap[String(s)];
      if (cell && cell.present) {
        prevCalls.push(cell.pcv);
        prevPuts.push(cell.ppv);
        calls.push(cell.c);
        puts.push(cell.p);
        callDeltas.push(cell.dc);
        putDeltas.push(cell.dp);
        present.push(true);
      } else {
        prevCalls.push(null);
        prevPuts.push(null);
        calls.push(null);
        puts.push(null);
        callDeltas.push(null);
        putDeltas.push(null);
        present.push(false);
      }
    });
    return {
      strike: s,
      calls: calls,
      puts: puts,
      callDeltas: callDeltas,
      putDeltas: putDeltas,
      prevCalls: prevCalls,
      prevPuts: prevPuts,
      present: present,
    };
  });

  var rgT = /^range:([\d.]+):([\d.]+)$/.exec(String(strikesLimit || ""));
  if (rgT) {
    var loT = Math.min(+rgT[1], +rgT[2]), hiT = Math.max(+rgT[1], +rgT[2]);
    rows = rows.filter(function (r) { return r.strike >= loT && r.strike <= hiT; });
  } else if (strikesLimit && strikesLimit !== "ALL" && close != null) {
    var n = parseInt(strikesLimit, 10);
    if (isFinite(n) && n > 0) {
      rows = rows
        .map(function (r) {
          return { r: r, dist: Math.abs(r.strike - close) };
        })
        .sort(function (a, b) {
          return a.dist - b.dist;
        })
        .slice(0, n * 2)
        .map(function (x) {
          return x.r;
        })
        .sort(function (a, b) {
          return a.strike - b.strike;
        });
    }
  }

  return {
    columns: columns,
    pullDates: columns.map(function (c) {
      return c.exp;
    }),
    rows: rows,
    close: close,
    fromIso: fromIso,
  };
}

function renderTawafuqTable() {
  var showTot = state.showOiTot !== false;   // عمود مجموع الأوبن (يُظهر/يُخفى بزره)
  var data = state.cache[state.ticker];
  var host = $("#tableHost");
  if (!host) return;
  if (!data) {
    host.innerHTML = '<p class="status">لا بيانات</p>';
    return;
  }
  var view = getTawafuqView(data, state.days, state.strikes);
  if (!view || !view.columns.length) {
    host.innerHTML =
      '<p class="status">لا انتهاءات قادمة متاحة في البيانات</p>';
    return;
  }
  var cols = view.columns;
  var rows = view.rows;
  var close = view.close;
  var canDelta = !!state.showDelta;
  var nCols = cols.length;

  var html =
    '<div class="table-title"><div>' +
    state.ticker +
    " | جدول الأيام</div>";
  if (close != null) {
    var liveTag = state.livePrice != null ? " · مباشر" : "";
    html +=
      '<div class="close-pill">الإغلاق: ' +
      Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
      liveTag +
      "</div>";
  }
  html += '</div>';

  html +=
    colXReset() + '<div class="table-scroll tawafuq-wrap"><table class="oi tawafuq-oi" style="width:auto;max-width:none"><thead>';
  html += '<tr class="side-label-row">';
  html += '<th class="side-label call-side" colspan="' + (nCols + (showTot ? 1 : 0)) + '">CALL</th>';
  html += '<th class="strike side-mid"></th>';
  html += '<th class="side-label put-side" colspan="' + (nCols + (showTot ? 1 : 0)) + '">PUT</th>';
  html += "</tr><tr>";
  if (showTot) html += '<th class="tw-tot-th" title="مجموع أرقام الأوبن للأيام الظاهرة">' + OI_HTML + "</th>";

  for (var i = nCols - 1; i >= 0; i--) {
    var fh = formatTawafuqHeader(cols[i].exp);
    var kcls = (fh.kind ? " tw-" + fh.kind : "") + " has-colx";
    html +=
      '<th class="' +
      kcls +
      '" style="' +
      tawafuqColStyle(fh.kind) +
      '">' + colXBtn("twexp", cols[i].exp) + '<span class="d">' +
      fh.top +
      '</span><br><span class="subh">' +
      (fh.sub || "&nbsp;") +
      "</span></th>";
  }
  html += '<th class="strike">STRIKE</th>';
  for (var j = 0; j < nCols; j++) {
    var fh2 = formatTawafuqHeader(cols[j].exp);
    var kcls2 = (fh2.kind ? " tw-" + fh2.kind : "") + " has-colx";
    html +=
      '<th class="' +
      kcls2 +
      '" style="' +
      tawafuqColStyle(fh2.kind) +
      '">' + colXBtn("twexp", cols[j].exp) + '<span class="d">' +
      fh2.top +
      '</span><br><span class="subh">' +
      (fh2.sub || "&nbsp;") +
      "</span></th>";
  }
  if (showTot) html += '<th class="tw-tot-th" title="مجموع أرقام الأوبن للأيام الظاهرة">' + OI_HTML + "</th>";
  html += "</tr></thead><tbody>";

  // max per column + قمة (أعلى كول إجمالي) وقاع (أعلى بوت إجمالي)
  var callMax = [];
  var putMax = [];
  var callTopD = [];
  var putTopD = [];
  var peakCall = 0;
  var floorPut = 0;
  for (var ci = 0; ci < nCols; ci++) {
    var mc = 0,
      mp = 0;
    rows.forEach(function (r) {
      var cv = r.calls[ci];
      var pv = r.puts[ci];
      if (cv != null && cv > mc) mc = cv;
      if (pv != null && pv > mp) mp = pv;
      if (cv != null && cv > peakCall) peakCall = cv;
      if (pv != null && pv > floorPut) floorPut = pv;
    });
    callMax[ci] = mc;
    putMax[ci] = mp;
    var tdc = 0, tdp = 0;
    rows.forEach(function (r) {
      if (r.present[ci]) {
        if (r.callDeltas[ci] != null && r.callDeltas[ci] > tdc) tdc = r.callDeltas[ci];
        if (r.putDeltas[ci] != null && r.putDeltas[ci] > tdp) tdp = r.putDeltas[ci];
      }
    });
    callTopD[ci] = tdc;
    putTopD[ci] = tdp;
  }

  // حركة القمة/القاع + مجموع الأوبن + الترتيبات (مشتركة مع الإكسل)
  var TC = twCalc(rows, nCols);
  var peakIdx = TC.peakIdx, troughIdx = TC.troughIdx, peakMv = TC.peakMv, troughMv = TC.troughMv;
  var totC = TC.totC, totP = TC.totP, rkTotC = TC.rkTotC, rkTotP = TC.rkTotP, rkDC = TC.rkDC, rkDP = TC.rkDP;
  function totCell(v, rk) {
    return '<td class="tw-tot"><div class="tw-tot-v">' + (v > 0 ? Number(v).toLocaleString() : "") + "</div>" + (rk ? '<div class="rk-under">' + rankBadge(rk, "s") + "</div>" : "") + "</td>";
  }

  var barDone = false;
  rows.forEach(function (r, ri) {
    if (close != null && !barDone && r.strike > close) {
      if (typeof greenBarRow === "function") {
        html += greenBarRow(false, nCols + (showTot ? 1 : 0), close);
      } else {
        html +=
          '<tr class="close-bar-row"><td colspan="99"><div class="close-bar-line">' +
          Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
          "</div></td></tr>";
      }
      barDone = true;
    }
    var zebra = ri % 2 === 1 ? " zebra" : "";
    html += '<tr class="' + zebra + '">';
    if (showTot) html += totCell(totC[ri], rkTotC[ri]);

    function hlAt(side, rj, cj) {
      var rr = rows[rj];
      if (!rr || cj < 0 || cj >= nCols || !rr.present[cj]) return false;
      var v = side === "c" ? rr.calls[cj] : rr.puts[cj];
      if (!(v > 0)) return false;
      return side === "c" ? (v === callMax[cj] || v === peakCall) : (v === putMax[cj] || v === floorPut);
    }
    for (var ic = nCols - 1; ic >= 0; ic--) {
      html += tawafuqCellHtml(
        r.calls[ic],
        r.callDeltas[ic],
        r.present[ic],
        cols[ic].kind,
        callMax[ic],
        canDelta,
        peakCall,
        callTopD[ic],
        canDelta && peakIdx[ic] === ri ? peakMv[ic] : null,
        canDelta && rkDC[ic] ? rkDC[ic][ri] : 0,
        ic === 0 ? spxHi5kClass(state.ticker, 0, 0, r.calls[ic]) : "",
        { l: hlAt("c", ri, ic + 1), r: hlAt("c", ri, ic - 1), t: hlAt("c", ri - 1, ic), b: hlAt("c", ri + 1, ic) }
      );
    }
    html += '<td class="strike">' + r.strike + "</td>";
    for (var ip = 0; ip < nCols; ip++) {
      html += tawafuqCellHtml(
        r.puts[ip],
        r.putDeltas[ip],
        r.present[ip],
        cols[ip].kind,
        putMax[ip],
        canDelta,
        floorPut,
        putTopD[ip],
        canDelta && troughIdx[ip] === ri ? troughMv[ip] : null,
        canDelta && rkDP[ip] ? rkDP[ip][ri] : 0,
        ip === 0 ? spxHi5kClass(state.ticker, 0, 0, r.puts[ip]) : "",
        { l: hlAt("p", ri, ip - 1), r: hlAt("p", ri, ip + 1), t: hlAt("p", ri - 1, ip), b: hlAt("p", ri + 1, ip) }
      );
    }
    if (showTot) html += totCell(totP[ri], rkTotP[ri]);
    html += "</tr>";
  });
  if (close != null && !barDone && typeof greenBarRow === "function") {
    html += greenBarRow(false, nCols + (showTot ? 1 : 0), close);
  }
  html += "</tbody></table></div>";
  html += '<div class="tw-legend"><span class="tw-legend-star">★</span> = الأعلى تزايدًا في ذلك اليوم · الخلفية البنفسجية = الجدار (قمة/قاع) · ▲▼ = انتقال الجدار عن السحب السابق وبكم نقطة · الدائرة = ترتيب مجموع الأوبن 1-4 · (2)-(4) = ترتيب التزايد</div>';
  host.innerHTML = html;
}

function tawafuqColStyle(kind) {
  // شفافية خفيفة مثل اليوم بالسابق: بنفسجي / أخضر تركواز / أزرق
  if (kind === "opx") return "background-color:rgba(167,139,250,0.14)!important;";
  if (kind === "fri") return "background-color:rgba(59,130,246,0.13)!important;";
  if (kind === "eom") return "background-color:rgba(45,212,191,0.12)!important;";
  // باقي الأيام: أغمق بهدوء مثل الجدول الأساسي
  return "background-color:rgba(15,23,42,0.55)!important;";
}

/** حسابات جدول الأيام: حركة القمة/القاع (من القيم الخام للسحب السابق) + مجموع الأوبن + ترتيباتها */
function twCalc(rows, nCols) {
  var o = { peakIdx: [], troughIdx: [], peakMv: [], troughMv: [], totC: [], totP: [], rkTotC: {}, rkTotP: {}, rkDC: [], rkDP: [] };
  function rankTop(arr, out) {
    arr.map(function (v, i) { return { v: v, i: i }; }).filter(function (q) { return q.v > 0; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 4).forEach(function (q, k) { out[q.i] = k + 1; });
  }
  function mv(cur, prev) {
    if (cur < 0 || prev < 0) return null;
    var d = rows[cur].strike - rows[prev].strike;
    if (d === 0) return null;   // ثابت: لا يُكتب شيء
    return { dir: d > 0 ? "up" : "dn", diff: Math.abs(d) };
  }
  for (var wi = 0; wi < nCols; wi++) {
    var bc = -1, bcv = 0, pc = -1, pcv = 0, bp = -1, bpv = 0, pp = -1, ppv = 0;
    rows.forEach(function (r, ri) {
      if (!r.present[wi]) return;
      var cv = r.calls[wi] || 0, pv = r.puts[wi] || 0;
      if (cv > bcv) { bcv = cv; bc = ri; }
      if (pv > bpv) { bpv = pv; bp = ri; }
      var a = r.prevCalls ? r.prevCalls[wi] : null, b = r.prevPuts ? r.prevPuts[wi] : null;
      if (a != null && a > pcv) { pcv = a; pc = ri; }
      if (b != null && b > ppv) { ppv = b; pp = ri; }
    });
    o.peakIdx[wi] = bc; o.troughIdx[wi] = bp;
    o.peakMv[wi] = mv(bc, pc); o.troughMv[wi] = mv(bp, pp);
    var dcA = [], dpA = [];
    rows.forEach(function (r) {
      dcA.push(r.present[wi] && r.callDeltas[wi] > 0 ? r.callDeltas[wi] : 0);
      dpA.push(r.present[wi] && r.putDeltas[wi] > 0 ? r.putDeltas[wi] : 0);
    });
    o.rkDC[wi] = {}; o.rkDP[wi] = {};
    rankTop(dcA, o.rkDC[wi]); rankTop(dpA, o.rkDP[wi]);
  }
  rows.forEach(function (r, ri) {
    var tc = 0, tp = 0;
    for (var cj = 0; cj < nCols; cj++) { if (r.present[cj]) { tc += r.calls[cj] || 0; tp += r.puts[cj] || 0; } }
    o.totC[ri] = tc; o.totP[ri] = tp;
  });
  rankTop(o.totC, o.rkTotC); rankTop(o.totP, o.rkTotP);
  return o;
}

function tawafuqCellHtml(oi, dlt, present, kind, colMax, canDelta, wallMax, topD, mv, rk, hi5, mg) {
  var kcls = kind ? " tw-" + kind : "";
  var st = tawafuqColStyle(kind);
  if (!present || oi == null || oi === 0) {
    return '<td class="tw-empty' + kcls + '" style="' + st + '"></td>';
  }
  var isColMax = colMax > 0 && oi === colMax;
  var isWall = wallMax > 0 && oi === wallMax;
  var maxCls = isColMax ? " max-oi" : "";
  if (hi5) maxCls += hi5;   // SPX ≥5000 (زر 5K+) في عمود اليوم
  if (isWall) maxCls += " tw-wall";
  // خلفية التحديد inline حتى لا يغطيها تلوين العمود
  // لون هادئ مثل الشاشة الثلاثية — بدون إطار
  if (isWall || isColMax) {
    st =
      "background-color:#3a4256!important;color:#e6eaf5!important;font-weight:700!important;";
    if (mg) {   // خلايا مظللة متجاورة → تلوين مندمج بلا فواصل
      if (mg.l) st += "border-left-color:#3a4256!important;";
      if (mg.r) st += "border-right-color:#3a4256!important;";
      if (mg.t) st += "border-top-color:#3a4256!important;";
      if (mg.b) st += "border-bottom-color:#3a4256!important;";
    }
  }
  var isTopD = topD > 0 && dlt != null && dlt === topD;
  if (isTopD) maxCls += " tw-topd";
  var inner =
    '<div class="tw-stack"><div class="tw-oi">' +
    Number(oi).toLocaleString() +
    "</div>";
  if (isTopD) {
    var dTxt = "+" + Number(dlt).toLocaleString(), dLen = dTxt.length;
    var dFs = dLen >= 8 ? 8.5 : dLen >= 6 ? 9.5 : 10.5, dPad = dLen >= 6 ? 4 : 8;
    inner += '<div class="tw-delta tw-delta-top" style="display:inline-block;max-width:100%;box-sizing:border-box;white-space:nowrap;margin-top:3px;padding:1px ' + dPad + 'px;border-radius:99px;background:rgba(125,211,200,.13);color:#a7f3e8;font-size:' + dFs + 'px;font-weight:700;line-height:1.35;letter-spacing:0;"><span style="color:#fbbf24;font-size:13px;line-height:1;vertical-align:-1px;margin-inline-end:2px;">★</span>' + dTxt + "</div>";
  } else if (canDelta && dlt != null && dlt > 0) {
    // كل التزايدات بلون خفيف؛ الأصغر أخف بكثير
    var op = 0.18;
    if (dlt >= 800) op = 0.65;
    else if (dlt >= 300) op = 0.48;
    else if (dlt >= 100) op = 0.32;
    else if (dlt >= 40) op = 0.22;
    inner +=
      '<div class="tw-delta" style="display:block;max-width:100%;white-space:nowrap;font-size:10px;font-weight:600;color:#5eead4;margin-top:2px;line-height:1.1;opacity:' +
      (rk >= 2 ? 1 : op) +
      '">' + (rk >= 2 ? '<span class="tw-rkp">(' + rk + ")</span> " : "") + "+" +
      Number(dlt).toLocaleString() +
      "</div>";
  }
  if (mv) {
    inner += '<div class="tw-mv tw-mv-' + mv.dir + '" title="حركة الجدار عن السحب السابق">' + (mv.dir === "up" ? "▲ " + mv.diff : mv.dir === "dn" ? "▼ " + mv.diff : "ثابت") + "</div>";
  }
  inner += "</div>";
  return (
    '<td class="' + kcls + maxCls + '" style="' + st + '">' + inner + "</td>"
  );
}


function renderSeriesTable() {
  const data = state.cache[state.ticker];
  const host = $("#tableHost");
  if (!data) {
    host.innerHTML = '<p class="status">لا بيانات</p>';
    return;
  }
  const view = getSeriesPrevDayView(data);
  if (!view || !view.pullDates.length) {
    host.innerHTML =
      '<p class="status">لا تواريخ انتهاء يومية متاحة للمقارنة بعد</p>';
    return;
  }
  const pullDates = view.pullDates;
  const rows = view.rows;
  const close = view.close != null ? view.close : effectiveClose(data);
  const canDelta = state.showDelta && pullDates.length >= 2;
  const lastI = pullDates.length - 1;
  const prevI = pullDates.length - 2;

  let html =
    '<div class="table-title">' +
    "<div>" +
    state.ticker +
    " | اليوم بالسابق</div>";
  if (close != null) {
    const liveTag = state.livePrice != null ? " · مباشر" : "";
    html +=
      '<div class="close-pill">الإغلاق: ' +
      Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
      liveTag +
      "</div>";
  }
  html += '</div>' + colXReset() + '<div class="table-scroll series-wrap"><table class="oi series-oi" style="width:auto;max-width:none"><thead>';
  var nCols = pullDates.length;
  var totalSideCols = nCols * 2;
  // صف CALL | PUT
  html += '<tr class="side-label-row">';
  if (canDelta) html += '<th class="delta side-pad"></th>';
  html += '<th class="side-label call-side" colspan="' + nCols + '">CALL</th>';
  html += '<th class="strike side-mid"></th>';
  html += '<th class="side-label put-side" colspan="' + nCols + '">PUT</th>';
  if (canDelta) html += '<th class="delta side-pad"></th>';
  html += "</tr><tr>";
  var colPos = 0;
  if (canDelta) html += '<th class="delta">Δ</th>';
  for (let i = nCols - 1; i >= 0; i--) {
    const f = formatPullDate(pullDates[i]);
    const sc = seriesColClass(colPos++, totalSideCols);
    html += '<th class="' + sc + ' has-colx">' + colXBtn("pull", pullDates[i]) + f.top + '<br><span class="subh">' + f.sub + "</span></th>";
  }
  html += '<th class="strike">STRIKE</th>';
  for (let j = 0; j < nCols; j++) {
    const f = formatPullDate(pullDates[j]);
    const sc = seriesColClass(colPos++, totalSideCols);
    html += '<th class="' + sc + ' has-colx">' + colXBtn("pull", pullDates[j]) + f.top + '<br><span class="subh">' + f.sub + "</span></th>";
  }
  if (canDelta) html += '<th class="delta">Δ</th>';
  html += "</tr></thead><tbody>";

  const callMax = [];
  const putMax = [];
  for (let i = 0; i < pullDates.length; i++) {
    let mc = 0, mp = 0;
    rows.forEach(function (r) {
      const cv = r.calls[i] || 0;
      const pv = r.puts[i] || 0;
      if (cv > mc) mc = cv;
      if (pv > mp) mp = pv;
    });
    callMax.push(mc);
    putMax.push(mp);
  }
  let deltaCallMax = 0, deltaPutMax = 0;
  if (canDelta) {
    rows.forEach(function (r) {
      const dc = positiveDelta(r.calls[lastI], r.calls[prevI]);
      const dp = positiveDelta(r.puts[lastI], r.puts[prevI]);
      if (dc != null && dc > deltaCallMax) deltaCallMax = dc;
      if (dp != null && dp > deltaPutMax) deltaPutMax = dp;
    });
  }

  let barDone = false;
  rows.forEach(function (r, ri) {
    if (close != null && !barDone && r.strike > close) {
      if (typeof greenBarRow === "function") {
        html += greenBarRow(canDelta, pullDates.length, close);
      } else {
        html +=
          '<tr class="close-bar-row"><td colspan="99"><div class="close-bar-line">' +
          Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
          "</div></td></tr>";
      }
      barDone = true;
    }
    const zebra = ri % 2 === 1 ? " zebra" : "";
    const above = close != null && r.strike > close;
    const below = close != null && r.strike < close;
    const callCls =
      below || (close != null && r.strike === close) ? "itm" : "otm";
    const putCls =
      above || (close != null && r.strike === close) ? "itm" : "otm";

    html += '<tr class="' + zebra + '">';
    if (canDelta) {
      const d = positiveDelta(r.calls[lastI], r.calls[prevI]);
      const maxCls =
        d != null && deltaCallMax > 0 && d === deltaCallMax ? " max-oi" : "";
      html +=
        '<td class="delta' +
        maxCls +
        '">' +
        (d != null ? d.toLocaleString() : "") +
        "</td>";
    }
    var bodyPos = 0;
    for (let i = pullDates.length - 1; i >= 0; i--) {
      const cv = r.calls[i] || 0;
      const maxCls = callMax[i] > 0 && cv === callMax[i] ? " max-oi" : "";
      html +=
        '<td class="' +
        seriesColClass(bodyPos++, pullDates.length * 2) +
        maxCls +
        '">' +
        cv.toLocaleString() +
        "</td>";
    }
    html += '<td class="strike">' + r.strike + "</td>";
    for (let i = 0; i < pullDates.length; i++) {
      const pv = r.puts[i] || 0;
      const maxCls = putMax[i] > 0 && pv === putMax[i] ? " max-oi" : "";
      html +=
        '<td class="' +
        seriesColClass(bodyPos++, pullDates.length * 2) +
        maxCls +
        '">' +
        pv.toLocaleString() +
        "</td>";
    }
    if (canDelta) {
      const d = positiveDelta(r.puts[lastI], r.puts[prevI]);
      const maxCls =
        d != null && deltaPutMax > 0 && d === deltaPutMax ? " max-oi" : "";
      html +=
        '<td class="delta' +
        maxCls +
        '">' +
        (d != null ? d.toLocaleString() : "") +
        "</td>";
    }
    html += "</tr>";
  });
  if (close != null && !barDone && typeof greenBarRow === "function") {
    html += greenBarRow(canDelta, pullDates.length, close);
  }
  html += "</tbody></table></div>";
  host.innerHTML = html;
}


function syncModeButtons() {
  try {
    var tw = !!state.tawafuqMode, ba = !!state.baMode || !!state.agMode;
    function setShown(id, on) {
      var b = document.getElementById(id);
      if (!b) return;
      if (on) b.style.removeProperty("display"); else b.style.setProperty("display", "none", "important");
    }
    setShown("oiTotBtn", tw);       // مجموع الأوبن: داخل جدول الأيام فقط
    setShown("growthBtn", !tw && !ba);     // النمو والمجموع لا يلزمان في جدول الأيام ولا قبل وبعد
    setShown("sigmaBtn", !tw && !ba);
  } catch (e) {}
}
/** قبل وبعد: أرقام يوم انتهى بتحديث يوم الانتهاء، ثم بعد التحديث التالي */
function pullIsoOf(label, data) {
  var ss = dataSessionFromPull(data), p = String(label).split("-").map(Number);
  if (!ss || !p[0] || !p[1]) return null;
  var y = ss.year; if (p[1] > ss.month + 6) y -= 1;
  return y + "-" + String(p[1]).padStart(2, "0") + "-" + String(p[0]).padStart(2, "0");
}
function baCandidates(data, onlyExps) {
  var out = [], by = data.by_expiration || {};
  Object.keys(by).sort().reverse().forEach(function (exp) {
    if (onlyExps && onlyExps.indexOf(exp) < 0) return;
    var blk = by[exp], pds = (blk.pull_dates && blk.pull_dates.length) ? blk.pull_dates : (data.pull_dates || []);
    var iBefore = -1, iAfter = -1;
    for (var i = 0; i < pds.length; i++) {
      var iso = pullIsoOf(pds[i], data);
      if (!iso) continue;
      if (iso <= exp) iBefore = i;
      else if (iAfter < 0) iAfter = i;
    }
    if (iBefore >= 0 && iAfter >= 0) out.push({ exp: exp, pds: pds, iBefore: iBefore, iAfter: iAfter });
  });
  return onlyExps ? out : out.slice(0, 30);
}
function getBeforeAfterView(data, daysLimit, strikesLimit, onlyExps) {
  var cands = baCandidates(data, onlyExps), n = parseInt(daysLimit, 10);
  if (!onlyExps && String(daysLimit) !== "ALL" && isFinite(n) && n > 0) cands = cands.slice(0, n);
  if (!cands.length) return null;
  var close = effectiveClose(data), set = {};
  cands.forEach(function (c) { filterStrikes(data.by_expiration[c.exp].rows || [], close, strikesLimit).forEach(function (r) { set[r.strike] = 1; }); });
  var strikes = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });   // من الأدنى إلى الأعلى
  function at(arr, i) { return arr && arr[i] != null ? Number(arr[i]) || 0 : 0; }
  var maps = cands.map(function (c) { var m = {}; (data.by_expiration[c.exp].rows || []).forEach(function (r) { m[r.strike] = r; }); return m; });
  var rows = strikes.map(function (k) {
    return { strike: k, cells: cands.map(function (c, ci) { var r = maps[ci][k]; return { cb: r ? at(r.calls, c.iBefore) : 0, ca: r ? at(r.calls, c.iAfter) : 0, pb: r ? at(r.puts, c.iBefore) : 0, pa: r ? at(r.puts, c.iAfter) : 0 }; }) };
  });
  return { cols: cands.map(function (c) { return { exp: c.exp, before: c.pds[c.iBefore], after: c.pds[c.iAfter] }; }), rows: rows, close: close };
}
/** حسابات قبل وبعد: التزايد (موجب فقط) + الأعلى تزايدًا + ترتيب 2-4 + أعلى أرقام كل عمود */
function baCalc(v) {
  var o = { cols: [] };
  function rk(arr) { var r = {}; arr.map(function (x, i) { return { x: x, i: i }; }).filter(function (q) { return q.x > 0; }).sort(function (a, b) { return b.x - a.x; }).slice(0, 4).forEach(function (q, k) { r[q.i] = k + 1; }); return r; }
  v.cols.forEach(function (col, ci) {
    var dc = [], dp = [], m = { mxCb: 0, mxCa: 0, mxPb: 0, mxPa: 0 };
    v.rows.forEach(function (r, ri) {
      var c = r.cells[ci], a = c.ca - c.cb, b = c.pa - c.pb;
      dc[ri] = a > 0 ? a : 0; dp[ri] = b > 0 ? b : 0;
      if (c.cb > m.mxCb) m.mxCb = c.cb; if (c.ca > m.mxCa) m.mxCa = c.ca; if (c.pb > m.mxPb) m.mxPb = c.pb; if (c.pa > m.mxPa) m.mxPa = c.pa;
    });
    m.dc = dc; m.dp = dp; m.rc = rk(dc); m.rp = rk(dp);
    m.topC = Math.max.apply(null, dc.concat([0])); m.topP = Math.max.apply(null, dp.concat([0]));
    o.cols.push(m);
  });
  return o;
}function renderBeforeAfterTable() {
  var host = document.getElementById("tableHost"), data = state.cache[state.ticker];
  if (!host) return;
  if (!data) { host.innerHTML = '<p class="status">لا بيانات</p>'; return; }
  var v = getBeforeAfterView(data, "1", state.strikes);   // اليوم السابق فقط
  if (!v) { host.innerHTML = '<p class="status">لا يوجد يوم سابق له تحديث بعد الانتهاء</p>'; return; }
  var C = baCalc(v), canD = !!state.showDelta, gw = canD ? 3 : 2, ci = 0;
  var fh = formatTawafuqHeader(v.cols[0].exp), col = C.cols[0];
  var fb = formatPullDate(v.cols[0].before), fa = formatPullDate(v.cols[0].after);
  var close = v.close;
  var html = '<div class="table-title"><div>قبل وبعد | ' + state.ticker + '</div><div class="close-pill">الإغلاق: ' + (close != null ? Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—") + "</div></div>";
  html += '<div class="table-scroll tawafuq-wrap"><table class="oi tawafuq-oi ba-table" style="width:auto;max-width:none"><thead>';
  html += '<tr class="side-label-row"><th class="side-label call-side" colspan="' + gw + '">CALL</th><th class="strike" rowspan="3">STRIKE</th><th class="side-label put-side" colspan="' + gw + '">PUT</th></tr>';
  var dayTh = '<th colspan="' + gw + '" class="' + (fh.kind ? "tw-" + fh.kind : "") + '" style="' + tawafuqColStyle(fh.kind) + '"><span class="d">' + fh.top + '</span><br><span class="subh">' + fh.sub + "</span></th>";
  var thB = '<th>قبل<br><span class="subh">' + fb.top + "</span></th>", thA = '<th>بعد<br><span class="subh">' + fa.top + "</span></th>", thD = canD ? "<th>التزايد</th>" : "";
  var updCall = thD + thA + thB, updPut = thB + thA + thD;   // الكول مرآة للبوت: القبل بجانب السترايك في الجهتين
  html += "<tr>" + dayTh + dayTh + "</tr><tr>" + updCall + updPut + "</tr></thead><tbody>";
  function cellB(val, call) { return tawafuqCellHtml(val, null, val > 0, fh.kind, call ? col.mxCb : col.mxPb, false, 0, 0, null, 0, "", null); }
  function cellA(val, call) { return tawafuqCellHtml(val, null, val > 0, fh.kind, call ? col.mxCa : col.mxPa, false, 0, 0, null, 0, "", null); }
  function cellD(d, top, rkv) {
    if (!(d > 0)) return '<td class="delta ba-dcell"></td>';
    var t = "+" + Number(d).toLocaleString();
    if (d === top) return '<td class="delta ba-dcell"><span class="ba-star">★</span> ' + t + "</td>";
    return '<td class="delta ba-dcell">' + (rkv >= 2 ? '<span class="tw-rkp">(' + rkv + ")</span> " : "") + t + "</td>";
  }
  v.rows.forEach(function (r, ri) {
    var c = r.cells[ci];
    html += "<tr>" + (canD ? cellD(col.dc[ri], col.topC, col.rc[ri]) : "") + cellA(c.ca, true) + cellB(c.cb, true) +
      '<td class="strike">' + r.strike + "</td>" +
      cellB(c.pb, false) + cellA(c.pa, false) + (canD ? cellD(col.dp[ri], col.topP, col.rp[ri]) : "") + "</tr>";
  });
  html += "</tbody></table></div>";
  host.innerHTML = html;
}/** التزايد الفعلي: صافي تغيّر الأوبن لكل سترايك بين تحديثين متتاليين على كل الانتهاءات من تاريخ التحديث الأسبق فصاعدًا.
 *  الفعلي = (مجموع التحديث الأحدث من تاريخه + أوبن المنتهي بين التحديثين) − مجموع التحديث الأسبق */
function agBuild(data, nPairs, strikesLimit) {
  var by = data.by_expiration || {}, exps = Object.keys(by).sort(), seen = {}, pulls = [];
  function addP(l) { if (l == null || seen[l]) return; var iso = pullIsoOf(l, data); if (!iso) return; seen[l] = 1; pulls.push({ label: l, iso: iso }); }
  (data.pull_dates || []).forEach(addP);
  exps.forEach(function (e) { (by[e].pull_dates || []).forEach(addP); });
  pulls.sort(function (a, b) { return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0; });
  if (pulls.length < 2) return null;
  var blks = exps.map(function (e) {
    var b = by[e], pds = (b.pull_dates && b.pull_dates.length) ? b.pull_dates : (data.pull_dates || []), idx = {}, m = {};
    pds.forEach(function (l, i) { idx[l] = i; });
    (b.rows || []).forEach(function (r) { m[r.strike] = r; });
    return { exp: e, idx: idx, m: m };
  });
  var pairs = [];
  for (var i = pulls.length - 1; i >= 1 && pairs.length < nPairs; i--) pairs.push({ P: pulls[i - 1], U: pulls[i] });
  pairs.reverse();   // الأقدم أولًا
  var close = effectiveClose(data), set = {}, firstIso = pairs[0].P.iso;
  exps.forEach(function (e) { if (e < firstIso) return; filterStrikes(by[e].rows || [], close, strikesLimit).forEach(function (r) { set[r.strike] = 1; }); });
  var strikes = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  function val(b, label, k, side) {
    var j = b.idx[label]; if (j == null) return 0;
    var r = b.m[k]; if (!r) return 0;
    var arr = side === "c" ? r.calls : r.puts;
    return arr && arr[j] != null ? Number(arr[j]) || 0 : 0;
  }
  var rows = strikes.map(function (k) {
    return { strike: k, cells: pairs.map(function (pr) {
      var o = {};
      ["c", "p"].forEach(function (sd) {
        var sp = 0, su = 0, a = 0;
        blks.forEach(function (b) {
          if (b.exp < pr.P.iso) return;
          sp += val(b, pr.P.label, k, sd);
          var vu = val(b, pr.U.label, k, sd);
          if (b.exp >= pr.U.iso) su += vu; else a += vu;   // انتهى بين التحديثين: أوبنه في التحديث الأحدث («بعد»)
        });
        o[sd] = { sp: sp, a: a, su: su, d: su + a - sp };
      });
      return o;
    }) };
  });
  return { pairs: pairs, rows: rows, close: close };
}
function agNum(n) { return n ? Number(n).toLocaleString() : "—"; }
function agDelta(d) {
  if (!d) return '<td class="delta ba-dcell ag-d"><span class="ag-z">0</span></td>';
  return '<td class="delta ba-dcell ag-d"><span class="' + (d > 0 ? "ag-up" : "ag-dn") + '">' + (d > 0 ? "+" : "−") + Math.abs(Math.round(d)).toLocaleString() + "</span></td>";
}
function renderActualGrowthTable() {
  var host = document.getElementById("tableHost"), data = state.cache[state.ticker];
  if (!host) return;
  if (!data) { host.innerHTML = '<p class="status">لا بيانات</p>'; return; }
  var nd = parseInt(state.days, 10), np = isFinite(nd) && nd > 0 ? Math.min(nd, 5) : (String(state.days) === "ALL" ? 5 : 1);
  var v = agBuild(data, np, state.strikes);
  if (!v) { host.innerHTML = '<p class="status">يلزم تحديثان على الأقل لحساب التزايد الفعلي</p>'; return; }
  var P = v.pairs, gw = 4, close = v.close;
  var html = '<div class="table-title"><div>التزايد الفعلي | ' + state.ticker + '</div><div class="close-pill">الإغلاق: ' + (close != null ? Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—") + "</div></div>";
  html += '<div class="ag-note">الفعلي = (مجموع التحديث الأحدث + أوبن المنتهي «بعد») − مجموع التحديث الأسبق — على كل الانتهاءات من تاريخ التحديث الأسبق</div>';
  html += '<div class="table-scroll tawafuq-wrap"><table class="oi tawafuq-oi ba-table ag-table" style="width:auto;max-width:none"><thead>';
  html += '<tr class="side-label-row"><th class="side-label call-side" colspan="' + (gw * P.length) + '">CALL</th><th class="strike" rowspan="3">STRIKE</th><th class="side-label put-side" colspan="' + (gw * P.length) + '">PUT</th></tr>';
  function dayTh(pr) { var a = formatPullDate(pr.P.label), b = formatPullDate(pr.U.label); return '<th colspan="' + gw + '"><span class="d">' + a.top + " ← " + b.top + '</span><br><span class="subh">' + b.sub + "</span></th>"; }
  function updCall(pr) { var a = formatPullDate(pr.P.label).top, b = formatPullDate(pr.U.label).top; return "<th>الفعلي</th><th>مجموع<br><span class=\"subh\">" + b + "</span></th><th title=\"أوبن المنتهي في التحديث الأحدث\">بعد</th><th>مجموع<br><span class=\"subh\">" + a + "</span></th>"; }
  function updPut(pr) { var a = formatPullDate(pr.P.label).top, b = formatPullDate(pr.U.label).top; return "<th>مجموع<br><span class=\"subh\">" + a + "</span></th><th title=\"أوبن المنتهي في التحديث الأحدث\">بعد</th><th>مجموع<br><span class=\"subh\">" + b + "</span></th><th>الفعلي</th>"; }
  var callOrder = P.slice(), putOrder = P.slice().reverse();   // الأحدث بجانب السترايك في الجهتين
  html += "<tr>" + callOrder.map(dayTh).join("") + putOrder.map(dayTh).join("") + "</tr>";
  html += "<tr>" + callOrder.map(updCall).join("") + putOrder.map(updPut).join("") + "</tr></thead><tbody>";
  v.rows.forEach(function (r) {
    var c = "", p = "";
    callOrder.forEach(function (pr) { var o = r.cells[P.indexOf(pr)].c; c += agDelta(o.d) + "<td>" + agNum(o.su) + "</td><td>" + agNum(o.a) + "</td><td>" + agNum(o.sp) + "</td>"; });
    putOrder.forEach(function (pr) { var o = r.cells[P.indexOf(pr)].p; p += "<td>" + agNum(o.sp) + "</td><td>" + agNum(o.a) + "</td><td>" + agNum(o.su) + "</td>" + agDelta(o.d); });
    html += "<tr>" + c + '<td class="strike">' + r.strike + "</td>" + p + "</tr>";
  });
  html += "</tbody></table></div>";
  host.innerHTML = html;
}
function renderTable() {
  if (state.baMode && (state.seriesMode || state.tawafuqMode || state.x3Mode || state.mapHeatMode)) {
    state.baMode = false;
    var __bb = document.getElementById("beforeAfterBtn"); if (__bb) __bb.classList.remove("active");
  }
  if (state.agMode && (state.seriesMode || state.tawafuqMode || state.x3Mode || state.mapHeatMode || state.baMode)) {
    state.agMode = false;
    var __ab = document.getElementById("actualGrowthBtn"); if (__ab) __ab.classList.remove("active");
  }
  syncModeButtons();
  if (state.agMode) { renderActualGrowthTable(); return; }
  if (state.baMode) { renderBeforeAfterTable(); return; }
  if (state.mapHeatMode && typeof renderMapHeatTable === "function") {
    return renderMapHeatTable();
  }
  if (state.tawafuqMode && typeof renderTawafuqTable === 'function') {
    return renderTawafuqTable();
  }
  if (state.seriesMode && typeof renderSeriesTable === 'function') {
    return renderSeriesTable();
  }
  if (state.seriesMode && typeof buildSeriesTableHtml === 'function') {
    var seriesHost = document.getElementById('tableHost');
    if (seriesHost) seriesHost.innerHTML = buildSeriesTableHtml();
    return;
  }
  const data = state.cache[state.ticker];
  const host = $("#tableHost");
  if (state.x3Mode) {
    renderX3();
    return;
  }
  if (!data || !state.expiration) {
    host.innerHTML = '<p class="status">اختر تاريخ انتهاء</p>';
    return;
  }
  const view = getViewRows(data);
  if (!view) {
    host.innerHTML = '<p class="status">لا بيانات لهذا الانتهاء / الأيام</p>';
    return;
  }
  const pullDates = view.pullDates;
  const rows = view.rows;
  const close = effectiveClose(data);
  const canDelta = state.showDelta && pullDates.length >= 2;
  const gDays = effectiveGrowthDays(pullDates.length, state.growthDays);
  const canGrowth = state.showGrowth && pullDates.length >= 2 && gDays >= 1 && pullDates.length > gDays;
  const canSigma = !!(state.showSigma && state.sigmaExps && state.sigmaExps.length);
  var sigmaLookup = null;
  if (canSigma) {
    sigmaLookup = buildSigmaLookup(data, state.sigmaExps);
    data._sigmaLookup = sigmaLookup;
    data._sigmaLookupKey = (state.sigmaExps || []).join(",");
  }

  const lastI = pullDates.length - 1;
  const prevI = pullDates.length - 2;

  let html =
    '<div class="table-title">' +
    "<div>" +
    state.ticker +
    " | Exp: " +
    state.expiration +
    "</div>";
  if (close != null) {
    const liveTag = state.livePrice != null ? " · مباشر" : "";
    html +=
      '<div class="close-pill">الإغلاق: ' +
      Number(close).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
      liveTag +
      "</div>";
  }
  html += '</div>';
  html += colXReset() + '<div class="table-scroll"><table class="oi"><thead><tr>';

  // ترتيب الطرف: ΣΔ ثم G ثم Δ ثم التواريخ
  if (canSigma) html += '<th class="sigma" style="background:rgba(45,212,191,0.12)!important;color:inherit;font-weight:600" title="المجموع">' + SUM_HTML + '</th>';
  if (canGrowth) html += '<th class="growth">G<br><span class="subh">' + gDays + "d</span></th>";
  if (canDelta) html += '<th class="delta">Δ</th>';
  for (let i = pullDates.length - 1; i >= 0; i--) {
    const f = formatPullDate(pullDates[i]);
    html += '<th class="has-colx">' + colXBtn("pull", pullDates[i]) + f.top + '<br><span class="subh">' + f.sub + "</span></th>";
  }
  html += '<th class="strike">STRIKE</th>';
  for (let j = 0; j < pullDates.length; j++) {
    const f = formatPullDate(pullDates[j]);
    html += '<th class="has-colx">' + colXBtn("pull", pullDates[j]) + f.top + '<br><span class="subh">' + f.sub + "</span></th>";
  }
  if (canDelta) html += '<th class="delta">Δ</th>';
  if (canGrowth) html += '<th class="growth">G<br><span class="subh">' + gDays + "d</span></th>";
  if (canSigma) html += '<th class="sigma" style="background:rgba(45,212,191,0.12)!important;color:inherit;font-weight:600" title="المجموع">' + SUM_HTML + '</th>';
  html += "</tr></thead><tbody>";

  const callMax = [];
  const putMax = [];
  for (let i = 0; i < pullDates.length; i++) {
    let mc = 0, mp = 0;
    rows.forEach(function (r) {
      const cv = r.calls[i] || 0;
      const pv = r.puts[i] || 0;
      if (cv > mc) mc = cv;
      if (pv > mp) mp = pv;
    });
    callMax.push(mc);
    putMax.push(mp);
  }
  let deltaCallMax = 0, deltaPutMax = 0;
  if (canDelta) {
    rows.forEach(function (r) {
      const dc = positiveDelta(r.calls[lastI], r.calls[prevI]);
      const dp = positiveDelta(r.puts[lastI], r.puts[prevI]);
      if (dc != null && dc > deltaCallMax) deltaCallMax = dc;
      if (dp != null && dp > deltaPutMax) deltaPutMax = dp;
    });
  }
  let growthCallMax = 0, growthPutMax = 0;
  if (canGrowth) {
    rows.forEach(function (r) {
      const gc = positiveGrowth(r.calls, gDays);
      const gp = positiveGrowth(r.puts, gDays);
      if (gc != null && gc > growthCallMax) growthCallMax = gc;
      if (gp != null && gp > growthPutMax) growthPutMax = gp;
    });
  }
  const rkD_C = canDelta ? rankTop4(rows.map(function (r) { return positiveDelta(r.calls[lastI], r.calls[prevI]); })) : {};
const rkD_P = canDelta ? rankTop4(rows.map(function (r) { return positiveDelta(r.puts[lastI], r.puts[prevI]); })) : {};
const rkG_C = canGrowth ? rankTop4(rows.map(function (r) { return positiveGrowth(r.calls, gDays); })) : {};
const rkG_P = canGrowth ? rankTop4(rows.map(function (r) { return positiveGrowth(r.puts, gDays); })) : {};
const rkS_C = canSigma ? rankTop4(rows.map(function (r) { return sumSigmaAcrossExps(data, r.strike, "call", state.sigmaExps); })) : {};
const rkS_P = canSigma ? rankTop4(rows.map(function (r) { return sumSigmaAcrossExps(data, r.strike, "put", state.sigmaExps); })) : {};
let sigmaCallMax = 0, sigmaPutMax = 0;
  if (canSigma) {
    rows.forEach(function (r) {
      const sc = sumSigmaAcrossExps(data, r.strike, "call", state.sigmaExps);
      const sp = sumSigmaAcrossExps(data, r.strike, "put", state.sigmaExps);
      if (sc != null && sc > sigmaCallMax) sigmaCallMax = sc;
      if (sp != null && sp > sigmaPutMax) sigmaPutMax = sp;
    });
  }

  let barDone = false;
  rows.forEach(function (r, ri) {
    if (close != null && !barDone && r.strike > close) {
      html += greenBarRow(canDelta, canGrowth, pullDates.length, close, canSigma);
      barDone = true;
    }
    const zebra = ri % 2 === 1 ? " zebra" : "";
    const above = close != null && r.strike > close;
    const below = close != null && r.strike < close;
    const callCls =
      below || (close != null && r.strike === close) ? "itm" : "otm";
    const putCls =
      above || (close != null && r.strike === close) ? "itm" : "otm";

    html += '<tr class="' + zebra + '">';
    if (canSigma) {
      const s = sumSigmaAcrossExps(data, r.strike, "call", state.sigmaExps);
      const maxCls = s != null && sigmaCallMax > 0 && s === sigmaCallMax ? " max-oi" : "";
      html +=
        (maxCls
        ? '<td class="sigma max-oi">'
        : '<td class="sigma" style="background:rgba(45,212,191,0.12)!important;color:inherit">') +
        (s != null ? s.toLocaleString() + rkSuffix(rkS_C[ri]) : "") +
        "</td>";
    }
    if (canGrowth) {
      const g = positiveGrowth(r.calls, gDays);
      const maxCls = g != null && growthCallMax > 0 && g === growthCallMax ? " max-oi" : "";
      html +=
        '<td class="growth' + maxCls + '">' +
        (g != null ? g.toLocaleString() + rkSuffix(rkG_C[ri]) : "") +
        "</td>";
    }
    if (canDelta) {
      const d = positiveDelta(r.calls[lastI], r.calls[prevI]);
      const maxCls = d != null && deltaCallMax > 0 && d === deltaCallMax ? " max-oi" : "";
      html +=
        '<td class="delta' + maxCls + '">' +
        (d != null ? d.toLocaleString() + rkSuffix(rkD_C[ri]) : "") +
        "</td>";
    }
    for (let i = pullDates.length - 1; i >= 0; i--) {
      const cv = r.calls[i] || 0;
      const maxCls = callMax[i] > 0 && cv === callMax[i] ? " max-oi" : "";
      const h5 = typeof spxHi5kClass === "function" ? spxHi5kClass(state.ticker, i, lastI, cv) : "";
      html +=
        '<td class="' + callCls + maxCls + h5 + '">' +
        cv.toLocaleString() +
        "</td>";
    }
    html += '<td class="strike">' + r.strike + "</td>";
    for (let i = 0; i < pullDates.length; i++) {
      const pv = r.puts[i] || 0;
      const maxCls = putMax[i] > 0 && pv === putMax[i] ? " max-oi" : "";
      const h5p = typeof spxHi5kClass === "function" ? spxHi5kClass(state.ticker, i, lastI, pv) : "";
      html +=
        '<td class="' + putCls + maxCls + h5p + '">' +
        pv.toLocaleString() +
        "</td>";
    }
    if (canDelta) {
      const d = positiveDelta(r.puts[lastI], r.puts[prevI]);
      const maxCls = d != null && deltaPutMax > 0 && d === deltaPutMax ? " max-oi" : "";
      html +=
        '<td class="delta' + maxCls + '">' +
        (d != null ? d.toLocaleString() + rkSuffix(rkD_P[ri]) : "") +
        "</td>";
    }
    if (canGrowth) {
      const g = positiveGrowth(r.puts, gDays);
      const maxCls = g != null && growthPutMax > 0 && g === growthPutMax ? " max-oi" : "";
      html +=
        '<td class="growth' + maxCls + '">' +
        (g != null ? g.toLocaleString() + rkSuffix(rkG_P[ri]) : "") +
        "</td>";
    }
    if (canSigma) {
      const s = sumSigmaAcrossExps(data, r.strike, "put", state.sigmaExps);
      const maxCls = s != null && sigmaPutMax > 0 && s === sigmaPutMax ? " max-oi" : "";
      html +=
        (maxCls
        ? '<td class="sigma max-oi">'
        : '<td class="sigma" style="background:rgba(45,212,191,0.12)!important;color:inherit">') +
        (s != null ? s.toLocaleString() + rkSuffix(rkS_P[ri]) : "") +
        "</td>";
    }
    html += "</tr>";
  });
  if (close != null && !barDone) {
    html += greenBarRow(canDelta, canGrowth, pullDates.length, close, canSigma);
  }
  html += "</tbody></table></div>";
  host.innerHTML = html;
  
}


/** أعمدة محذوفة بزر × (لقياس التزايد/النمو بدونها) */
function hiddenPullSet() { return (state.hiddenPulls && state.hiddenPulls[state.ticker]) || {}; }
function colXBtn(kind, key) { return '<button type="button" class="col-x" data-' + kind + '="' + key + '" title="حذف هذا العمود من القياس">×</button>'; }
function colXReset() {
  var n = Object.keys(hiddenPullSet()).length + Object.keys((state.hiddenTwExps && state.hiddenTwExps[state.ticker]) || {}).length;
  return n ? '<div class="col-x-bar"><button type="button" class="col-x-reset">إظهار الأعمدة المحذوفة (' + n + ")</button></div>" : "";
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
function oiJumpHighlightFlags(values, gainFloor) {
  var n = (values && values.length) || 0;
  var flags = new Array(n);
  var i;
  for (i = 0; i < n; i++) flags[i] = false;
  if (n < 2) return flags;
  var JUMP = 1.2;
  var KEEP = 0.85;
  var MIN_LEVEL = 1000;
  var MAX_RUN = 6;
  var MIN_ABS = Math.max(500, Math.min(2000, Number(gainFloor) || 800));
  // آخر الأعمدة فقط — index 0 أقدم، n-1 أحدث
  var RECENT = Math.max(6, Math.min(12, Math.ceil(n * 0.35)));
  var startFrom = Math.max(1, n - RECENT);
  var inRun = false;
  var runLen = 0;
  for (i = startFrom; i < n; i++) {
    var prev = Number(values[i - 1]) || 0;
    var curr = Number(values[i]) || 0;
    var absGain = curr - prev;
    if (!inRun) {
      if (curr < MIN_LEVEL || absGain < MIN_ABS) continue;
      var pctOk = prev >= MIN_LEVEL && curr >= prev * JUMP;
      var absOk = absGain >= MIN_ABS * 1.25;
      var enterOk = prev < MIN_LEVEL && absGain >= MIN_ABS;
      if (pctOk || absOk || enterOk) {
        inRun = true;
        runLen = 1;
        flags[i] = true;
      }
    } else {
      runLen += 1;
      if (runLen > MAX_RUN) {
        inRun = false;
        runLen = 0;
      } else if (curr < MIN_LEVEL) {
        inRun = false;
        runLen = 0;
      } else if (prev > 0 && curr < prev * KEEP) {
        inRun = false;
        runLen = 0;
      } else {
        flags[i] = true;
      }
    }
  }
  return flags;
}

function writeOiTableToSheet(ws, startRow, startCol, view, ticker, showDelta, showGrowth, growthDays, opts) {
  const arabicMonths = {
    1: "يناير", 2: "فبراير", 3: "مارس", 4: "أبريل",
    5: "مايو", 6: "يونيو", 7: "يوليو", 8: "أغسطس",
    9: "سبتمبر", 10: "أكتوبر", 11: "نوفمبر", 12: "ديسمبر",
  };
  const pullDates = view.pullDates.slice();
  const rows = view.rows;
  const n = pullDates.length;
  const hasDelta = !!(showDelta && n >= 2);
  const gDays = effectiveGrowthDays(n, growthDays === undefined ? state.growthDays : growthDays);
  const hasGrowth = !!(showGrowth && n >= 2 && n > gDays);
  const hasSigma = !!(state.showSigma && state.sigmaExps && state.sigmaExps.length);
  var sigmaDataX = state.cache[state.ticker];
  const lastI = n - 1;
  const prevI = n - 2;
  const pad = 0; // لا أعمدة ترتيب م/ن (الترتيب صار بجانب الرقم)

  const fillTicker = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3EAF3" } };
  const fillPutCall = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
  const fillRow3 = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
  const fillRow4 = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  const fillDelta = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0ECF9" } };
  const fillGrowth = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCEFD6" } };
  // أعلى نمو — لون c8c4d6 + إطار أسود خارجي سميك فقط
  const fillMax = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD3DCEE" } };
  const fillJump = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F0FB" } }; // تزايد فارق OI
  const fontB = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1E293B" } };
  const fontN = { name: "Calibri", size: 11, color: { argb: "FF334155" } };
  const fillPut = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F7" } };
  const fillCall = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F7" } };
  const fillZebra = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  const fontRank = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
  const alignC = { horizontal: "center", vertical: "middle" };
  const border = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };
  const edgeBlack = { style: "medium", color: { argb: "FF475569" } };


  let headerDate = view.expiration || "";
  try {
    const p = String(view.expiration).split("-").map(Number);
    if (p.length >= 3) headerDate = p[2] + "-" + (arabicMonths[p[1]] || "");
  } catch (e) {}

  const rTitle = startRow;
  const rSection = startRow + 1;
  const rDates = startRow + 2;
  const rExp = startRow + 3;
  const dataStart = startRow + 4;

  // Put side: ΣΔ ثم G ثم Δ ثم تواريخ
  let col = startCol + pad;
  let putSigmaCol = null;
  let putGrowthCol = null;
  let putDeltaCol = null;
  if (hasSigma) {
    putSigmaCol = col;
    col += 1;
  }
  if (hasGrowth) {
    putGrowthCol = col;
    col += 1;
  }
  if (hasDelta) {
    putDeltaCol = col;
    col += 1;
  }
  const putDateCols = [];
  for (let j = n - 1; j >= 0; j--) {
    putDateCols.push({ c: col, idx: j, d: pullDates[j] });
    col += 1;
  }
  const strikeCol = col;
  col += 1;
  const callDateCols = [];
  for (let j = 0; j < n; j++) {
    callDateCols.push({ c: col, idx: j, d: pullDates[j] });
    col += 1;
  }
  let callDeltaCol = null;
  let callGrowthCol = null;
  let callSigmaCol = null;
  if (hasDelta) {
    callDeltaCol = col;
    col += 1;
  }
  if (hasGrowth) {
    callGrowthCol = col;
    col += 1;
  }
  if (hasSigma) {
    callSigmaCol = col;
    col += 1;
  }
  const contentEnd = col - 1;
  const headerEnd = contentEnd + pad;

  for (let c = startCol; c <= headerEnd; c++) {
    for (const r of [rTitle, rSection, rDates, rExp]) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.alignment = alignC;
      cell.font = fontB;
    }
    ws.getCell(rTitle, c).fill = fillTicker;
    ws.getCell(rSection, c).fill = fillPutCall;
    ws.getCell(rDates, c).fill = fillRow3;
    ws.getCell(rExp, c).fill = fillRow4;
  }

  // Title = ticker only on strike column (rest soft gray)
  ws.getCell(rTitle, strikeCol).value = ticker;
  ws.getCell(rTitle, strikeCol).font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF334155" } };
  ws.getRow(rTitle).height = 25; ws.getRow(rSection).height = 22; ws.getRow(rDates).height = 22; ws.getRow(rExp).height = 22;

  // Section labels Put / Strike / Call
  const putCols = []
    .concat(putSigmaCol ? [putSigmaCol] : [])
    .concat(putGrowthCol ? [putGrowthCol] : [])
    .concat(putDeltaCol ? [putDeltaCol] : [])
    .concat(putDateCols.map(function (x) { return x.c; }));
  const callCols = callDateCols
    .map(function (x) { return x.c; })
    .concat(callDeltaCol ? [callDeltaCol] : [])
    .concat(callGrowthCol ? [callGrowthCol] : [])
    .concat(callSigmaCol ? [callSigmaCol] : []);
  if (putCols.length) {
    ws.mergeCells(rSection, Math.min.apply(null, putCols), rSection, Math.max.apply(null, putCols));
    const cell = ws.getCell(rSection, Math.min.apply(null, putCols));
    cell.value = "Put";
    cell.fill = fillPut;
    cell.font = fontB;
    cell.alignment = alignC;
  }
  if (callCols.length) {
    ws.mergeCells(rSection, Math.min.apply(null, callCols), rSection, Math.max.apply(null, callCols));
    const cell = ws.getCell(rSection, Math.min.apply(null, callCols));
    cell.value = "Call";
    cell.fill = fillCall;
    cell.font = fontB;
    cell.alignment = alignC;
  }
  try {
    ws.mergeCells(rSection, strikeCol, rDates, strikeCol);
  } catch (e) {}
  const strikeHdr = ws.getCell(rSection, strikeCol);
  strikeHdr.value = "Strike";
  strikeHdr.fill = fillRow3;
  strikeHdr.font = fontB;
  strikeHdr.alignment = alignC;

  // Dates row: 10-8 style (pull_date as stored)
  putDateCols.forEach(function (x) {
    const cell = ws.getCell(rDates, x.c);
    cell.value = x.d;
    cell.fill = fillRow3;
    cell.font = fontB;
    cell.alignment = alignC;
  });
  callDateCols.forEach(function (x) {
    const cell = ws.getCell(rDates, x.c);
    cell.value = x.d;
    cell.fill = fillRow3;
    cell.font = fontB;
    cell.alignment = alignC;
  });

  // Exp row: Arabic date under strike
  ws.getCell(rExp, strikeCol).value = headerDate;
  ws.getCell(rExp, strikeCol).font = fontB;
  ws.getCell(rExp, strikeCol).alignment = alignC;

  // Max per column
  const putMax = {};
  const callMax = {};
  putDateCols.forEach(function (x) {
    let m = 0;
    rows.forEach(function (r) {
      const v = r.puts[x.idx] || 0;
      if (v > m) m = v;
    });
    putMax[x.c] = m;
  });
  callDateCols.forEach(function (x) {
    let m = 0;
    rows.forEach(function (r) {
      const v = r.calls[x.idx] || 0;
      if (v > m) m = v;
    });
    callMax[x.c] = m;
  });

  let putDeltaMax = 0, callDeltaMax = 0;
  var putGrowthRank = {};
  var callGrowthRank = {};
  var putSigmaRank = {};
  var callSigmaRank = {};
  function assignTop3Ranks(getVal) {
    var items = [];
    rows.forEach(function (r, ri) {
      var v = getVal(r);
      if (v != null && v > 0) items.push({ ri: ri, v: v });
    });
    items.sort(function (a, b) {
      if (b.v !== a.v) return b.v - a.v;
      return a.ri - b.ri;
    });
    var map = {};
    for (var i = 0; i < items.length && i < 4; i++) map[items[i].ri] = i + 1;
    return map;
  }
  var putDeltaRank = {}, callDeltaRank = {};
  function rkFmt(r) { return r && !(opts && opts.noRank) ? '#,##0" (' + r + ')"' : "#,##0"; }
  if (hasDelta) {
    putDeltaRank = assignTop3Ranks(function (r) { return positiveDelta(r.puts[lastI], r.puts[prevI]); });
    callDeltaRank = assignTop3Ranks(function (r) { return positiveDelta(r.calls[lastI], r.calls[prevI]); });
    rows.forEach(function (r) {
      const dp = positiveDelta(r.puts[lastI], r.puts[prevI]);
      const dc = positiveDelta(r.calls[lastI], r.calls[prevI]);
      if (dp != null && dp > putDeltaMax) putDeltaMax = dp;
      if (dc != null && dc > callDeltaMax) callDeltaMax = dc;
    });
  }
  if (hasGrowth) {
    putGrowthRank = assignTop3Ranks(function (r) {
      return positiveGrowth(r.puts, gDays);
    });
    callGrowthRank = assignTop3Ranks(function (r) {
      return positiveGrowth(r.calls, gDays);
    });
  }
  if (hasSigma && sigmaDataX) {
    putSigmaRank = assignTop3Ranks(function (r) {
      return sumSigmaAcrossExps(sigmaDataX, r.strike, "put", state.sigmaExps);
    });
    callSigmaRank = assignTop3Ranks(function (r) {
      return sumSigmaAcrossExps(sigmaDataX, r.strike, "call", state.sigmaExps);
    });
  }

  // ترويسة G / Δ
  if (hasSigma && putSigmaCol) {
    const cell = ws.getCell(rDates, putSigmaCol);
    cell.value = SUM_TXT;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E5F8" } };
    cell.font = fontB;
    cell.alignment = alignC;
  }
  if (hasGrowth && putGrowthCol) {
    const cell = ws.getCell(rDates, putGrowthCol);
    cell.value = "G·" + gDays;
    cell.fill = fillGrowth;
    cell.font = fontB;
    cell.alignment = alignC;
  }
  if (hasDelta && putDeltaCol) {
    const cell = ws.getCell(rDates, putDeltaCol);
    cell.value = "Δ";
    cell.fill = fillDelta;
    cell.font = fontB;
    cell.alignment = alignC;
  }
  if (hasDelta && callDeltaCol) {
    const cell = ws.getCell(rDates, callDeltaCol);
    cell.value = "Δ";
    cell.fill = fillDelta;
    cell.font = fontB;
    cell.alignment = alignC;
  }
  if (hasSigma && callSigmaCol) {
    const cell = ws.getCell(rDates, callSigmaCol);
    cell.value = SUM_TXT;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E5F8" } };
    cell.font = fontB;
    cell.alignment = alignC;
  }
  if (hasGrowth && callGrowthCol) {
    const cell = ws.getCell(rDates, callGrowthCol);
    cell.value = "G·" + gDays;
    cell.fill = fillGrowth;
    cell.font = fontB;
    cell.alignment = alignC;
  }
  // أعلى نمو فقط: لون + إطار خارجي من الاسترايك حتى عمود G + رقم 1 على الطرفين
  function applyOuterBlackBorder(rowIdx, cFrom, cTo) {
    if (cFrom == null || cTo == null || cFrom > cTo) return;
    for (var c = cFrom; c <= cTo; c++) {
      var cell = ws.getCell(rowIdx, c);
      cell.border = {
        top: edgeBlack,
        bottom: edgeBlack,
        left: c === cFrom ? edgeBlack : undefined,
        right: c === cTo ? edgeBlack : undefined,
      };
    }
  }

  // عتبة القفزة من توزيع الزيادات الموجبة الفعلية في هذا الجدول
  var jumpGains = [];
  rows.forEach(function (r0) {
    var ii;
    for (ii = 1; ii < n; ii++) {
      var pp = r0.puts[ii - 1] || 0;
      var pc = r0.puts[ii] || 0;
      var cp = r0.calls[ii - 1] || 0;
      var cc = r0.calls[ii] || 0;
      if (pc >= 1000 && pc > pp) jumpGains.push(pc - pp);
      if (cc >= 1000 && cc > cp) jumpGains.push(cc - cp);
    }
  });
  jumpGains.sort(function (a, b) {
    return a - b;
  });
  var gainFloor = 800;
  if (jumpGains.length >= 5) {
    // المئين ~60: أعلى من نصف الزيادات → يفلتر الضعيف ويبقي المهم
    var gi = Math.min(
      jumpGains.length - 1,
      Math.max(0, Math.floor(jumpGains.length * 0.6))
    );
    gainFloor = jumpGains[gi];
  } else if (jumpGains.length) {
    gainFloor = jumpGains[Math.floor(jumpGains.length / 2)];
  }
  gainFloor = Math.max(500, Math.min(2000, gainFloor));

  rows.forEach(function (r, ri) {
    const rowIdx = dataStart + ri;
    const gPut = hasGrowth ? positiveGrowth(r.puts, gDays) : null;
    const gCall = hasGrowth ? positiveGrowth(r.calls, gDays) : null;
    const putGRank = hasGrowth ? putGrowthRank[ri] || 0 : 0;
    const callGRank = hasGrowth ? callGrowthRank[ri] || 0 : 0;
    const putSRank = hasSigma ? putSigmaRank[ri] || 0 : 0;
    const callSRank = hasSigma ? callSigmaRank[ri] || 0 : 0;
    const isMaxPutG = putGRank === 1;
    const isMaxCallG = callGRank === 1;

    if (hasSigma && putSigmaCol) {
      const sv = sumSigmaAcrossExps(sigmaDataX, r.strike, "put", state.sigmaExps);
      const isTopS = putSRank === 1;
      const cell = ws.getCell(rowIdx, putSigmaCol);
      cell.value = sv != null ? sv : "";
      cell.numFmt = rkFmt(putSRank);
      cell.font = putSRank ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (isTopS) cell.fill = fillMax;
      else cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F2FC" } };
    }
    if (hasGrowth && putGrowthCol) {
      const cell = ws.getCell(rowIdx, putGrowthCol);
      cell.value = gPut != null ? gPut : "";
      cell.numFmt = rkFmt(putGRank);
      cell.font = putGRank ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (putGRank === 1) cell.fill = fillMax;
      else cell.fill = fillGrowth;
    }
    if (hasDelta && putDeltaCol) {
      const dlt = positiveDelta(r.puts[lastI], r.puts[prevI]);
      const isMaxD = dlt != null && putDeltaMax > 0 && dlt === putDeltaMax;
      const cell = ws.getCell(rowIdx, putDeltaCol);
      cell.value = dlt != null ? dlt : "";
      cell.numFmt = rkFmt(putDeltaRank[ri] || 0);
      cell.font = isMaxD ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (isMaxD) cell.fill = fillMax;
      else cell.fill = fillDelta;
    }
    var putJumpFlags = oiJumpHighlightFlags(r.puts, gainFloor);
    putDateCols.forEach(function (x) {
      const val = r.puts[x.idx] || 0;
      const isMaxOi = putMax[x.c] > 0 && val === putMax[x.c];
      const isJump = putJumpFlags[x.idx];
      const cell = ws.getCell(rowIdx, x.c);
      cell.value = val;
      cell.numFmt = "#,##0";
      cell.font = isMaxOi ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (isMaxOi) cell.fill = fillMax;
      else if (isJump) cell.fill = fillJump;
    });
    const sc = ws.getCell(rowIdx, strikeCol);
    const s = Number(r.strike);
    if (Math.abs(s - Math.round(s)) < 1e-9) {
      sc.value = Math.round(s);
      sc.numFmt = "0";
    } else {
      sc.value = Math.round(s * 100) / 100;
      sc.numFmt = "0.0";
    }
    sc.font = fontB;
    sc.alignment = alignC;
    sc.border = border;
    var callJumpFlags = oiJumpHighlightFlags(r.calls, gainFloor);
    callDateCols.forEach(function (x) {
      const val = r.calls[x.idx] || 0;
      const isMaxOi = callMax[x.c] > 0 && val === callMax[x.c];
      const isJump = callJumpFlags[x.idx];
      const cell = ws.getCell(rowIdx, x.c);
      cell.value = val;
      cell.numFmt = "#,##0";
      cell.font = isMaxOi ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (isMaxOi) cell.fill = fillMax;
      else if (isJump) cell.fill = fillJump;
    });
    if (hasDelta && callDeltaCol) {
      const dlt = positiveDelta(r.calls[lastI], r.calls[prevI]);
      const isMaxD = dlt != null && callDeltaMax > 0 && dlt === callDeltaMax;
      const cell = ws.getCell(rowIdx, callDeltaCol);
      cell.value = dlt != null ? dlt : "";
      cell.numFmt = rkFmt(callDeltaRank[ri] || 0);
      cell.font = isMaxD ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (isMaxD) cell.fill = fillMax;
      else cell.fill = fillDelta;
    }
    if (hasGrowth && callGrowthCol) {
      const cell = ws.getCell(rowIdx, callGrowthCol);
      cell.value = gCall != null ? gCall : "";
      cell.numFmt = rkFmt(callGRank);
      cell.font = callGRank ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (callGRank === 1) cell.fill = fillMax;
      else cell.fill = fillGrowth;
    }
    if (hasSigma && callSigmaCol) {
      const sv = sumSigmaAcrossExps(sigmaDataX, r.strike, "call", state.sigmaExps);
      const isTopS = callSRank === 1;
      const cell = ws.getCell(rowIdx, callSigmaCol);
      cell.value = sv != null ? sv : "";
      cell.numFmt = rkFmt(callSRank);
      cell.font = callSRank ? fontB : fontN;
      cell.alignment = alignC;
      cell.border = border;
      if (isTopS) cell.fill = fillMax;
      else cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F2FC" } };
    }

    // إطار خارجي سميك لأعلى نمو فقط (ن1)
    if (isMaxPutG && putGrowthCol != null) {
      applyOuterBlackBorder(rowIdx, putGrowthCol, strikeCol);
    }
    if (isMaxCallG && callGrowthCol != null) {
      applyOuterBlackBorder(rowIdx, strikeCol, callGrowthCol);
    }

  });

  // تنسيق مريح للعين: تظليل متبادل خفيف، سترايك بارز، أعمدة أوسع
  var fillStrikeC = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
  var oiCols = putDateCols.map(function (x) { return x.c; }).concat(callDateCols.map(function (x) { return x.c; }));
  rows.forEach(function (r, ri) {
    var rowIdx = dataStart + ri;
    ws.getRow(rowIdx).height = 22;
    var scl = ws.getCell(rowIdx, strikeCol);
    scl.fill = fillStrikeC;
    scl.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF1E293B" } };
  });
  for (let c = startCol; c <= headerEnd; c++) {
    var isX = c === putSigmaCol || c === putGrowthCol || c === putDeltaCol || c === callDeltaCol || c === callGrowthCol || c === callSigmaCol;
    ws.getColumn(c).width = c === strikeCol ? 12.5 : isX ? 12.5 : 11.5;
  }
  return headerEnd;
}

function formatExpExportChip(exp) {
  try {
    var d = new Date(String(exp) + "T12:00:00");
    var monthsAr = {
      0: "يناير", 1: "فبراير", 2: "مارس", 3: "أبريل", 4: "مايو", 5: "يونيو",
      6: "يوليو", 7: "أغسطس", 8: "سبتمبر", 9: "أكتوبر", 10: "نوفمبر", 11: "ديسمبر"
    };
    var isOpx = typeof isThirdFridayExp === "function" && isThirdFridayExp(exp);
    return {
      day: d.getDate(),
      monShort: d.toLocaleString("en", { month: "short" }),
      weekday: d.toLocaleString("en", { weekday: "short" }),
      monthKey: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
      monthLabel: (monthsAr[d.getMonth()] || "") + " " + d.getFullYear(),
      sub: isOpx ? "OPX" : d.toLocaleString("en", { weekday: "short" }),
    };
  } catch (e) {
    return { day: exp, monShort: "", weekday: "", monthKey: "x", monthLabel: "", sub: "" };
  }
}


/** أول يوم من الشهر الميلادي (1 من كل شهر — بتاريخ الجهاز) */

function isFirstDayOfMonth(d) {
  d = d || new Date();
  return d.getDate() === 1;
}



/** تصدير جدول الأيام إلى ورقة Excel */
function writeBeforeAfterToSheet(ws, startRow, startCol, data, ticker, daysLimit, strikesLimit, showDelta, onlyExps) {
  var v = getBeforeAfterView(data, daysLimit, strikesLimit, onlyExps);
  if (!v) return startCol;
  var C = baCalc(v), nc = v.cols.length, gw = showDelta ? 3 : 2;
  var thin = { style: "thin", color: { argb: "FFE2E8F0" } }, border = { top: thin, bottom: thin, left: thin, right: thin };
  var alignC = { horizontal: "center", vertical: "middle", wrapText: true };
  var fontB = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1E293B" } }, fontN = { name: "Calibri", size: 11, color: { argb: "FF334155" } };
  var teal = { name: "Calibri", size: 11, bold: true, color: { argb: "FF0F766E" } };
  function fill(c) { return { type: "pattern", pattern: "solid", fgColor: { argb: c } }; }
  var callStart = startCol, strikeCol = startCol + nc * gw, putStart = strikeCol + 1, endCol = putStart + nc * gw - 1;
  // الورقة من اليمين لليسار، والتخطيط أدناه مصمَّم يسارًا لليمين (الكول يسار والبوت يمين كما في الويب):
  // نعكس فهرس العمود داخل النطاق فيظهر كل جانب في مكانه الصحيح (والأعمدة داخل كل يوم أيضًا)
  function mc(c) { return startCol + endCol - c; }
  function cell(r, c) { return ws.getCell(r, mc(c)); }
  function mrg(r1, c1, r2, c2) { return ws.mergeCells(r1, mc(c2), r2, mc(c1)); }
  var rTitle = startRow, rSide = startRow + 1, rDay = startRow + 2, rUpd = startRow + 3, dataStart = startRow + 4;
  var tcell = cell(rTitle, strikeCol); tcell.value = "قبل وبعد · " + ticker; tcell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF334155" } }; tcell.alignment = alignC;
  for (var c0 = startCol; c0 <= endCol; c0++) cell(rTitle, c0).fill = fill("FFE3EAF3");
  try { mrg(rSide, callStart, rSide, callStart + nc * gw - 1); mrg(rSide, putStart, rSide, endCol); mrg(rSide, strikeCol, rUpd, strikeCol); } catch (e) {}
  // بعد العكس تصبح الخلية الرئيسية للدمج هي الأخيرة في التصميم (لذلك نكتب العنوان فيها)
  [[callStart + nc * gw - 1, "CALL"], [putStart + nc * gw - 1, "PUT"], [strikeCol, "STRIKE"]].forEach(function (q) { var cl = cell(rSide, q[0]); cl.value = q[1]; cl.font = fontB; cl.alignment = alignC; cl.fill = fill("FFEAF0F7"); cl.border = border; });
  var callCols = [], putCols = [];
  for (var j = 0; j < nc; j++) { callCols.push({ ci: nc - 1 - j, col: callStart + j * gw, call: true }); putCols.push({ ci: j, col: putStart + j * gw, call: false }); }
  function head(g) {
    var fh = formatTawafuqHeader(v.cols[g.ci].exp), fb = formatPullDate(v.cols[g.ci].before), fa = formatPullDate(v.cols[g.ci].after);
    try { mrg(rDay, g.col, rDay, g.col + gw - 1); } catch (e) {}
    var d = cell(rDay, g.col + gw - 1); d.value = fh.top + " " + fh.sub; d.font = fontB; d.alignment = alignC; d.fill = fill("FFE2E8F0"); d.border = border;
    for (var k = 1; k < gw; k++) cell(rDay, g.col + k).border = border;
    var lb = "قبل · " + fb.top, la = "بعد · " + fa.top;
    var labs = g.call ? (showDelta ? ["التزايد", la, lb] : [la, lb]) : (showDelta ? [lb, la, "التزايد"] : [lb, la]);   // الكول مرآة للبوت
    labs.forEach(function (t, k) { var x = cell(rUpd, g.col + k); x.value = t; x.font = fontB; x.alignment = alignC; x.fill = fill(t === "التزايد" ? "FFE0ECF9" : "FFEEF2F7"); x.border = border; });
  }
  callCols.forEach(head); putCols.forEach(head);
  v.rows.forEach(function (r, ri) {
    var rowIdx = dataStart + ri, anyStar = false;
    var sc = cell(rowIdx, strikeCol); sc.value = r.strike; sc.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF1E293B" } }; sc.fill = fill("FFEEF2F7"); sc.alignment = alignC; sc.border = border;
    function put(g, call) {
      var c = r.cells[g.ci], m = C.cols[g.ci];
      var vb = call ? c.cb : c.pb, va = call ? c.ca : c.pa, d = call ? m.dc[ri] : m.dp[ri];
      var mxb = call ? m.mxCb : m.mxPb, mxa = call ? m.mxCa : m.mxPa, top = call ? m.topC : m.topP, rkv = (call ? m.rc : m.rp)[ri];
      var oB = g.call ? (showDelta ? 2 : 1) : 0, oA = g.call ? (showDelta ? 1 : 0) : 1, oD = g.call ? 0 : 2;
      var cb = cell(rowIdx, g.col + oB), ca = cell(rowIdx, g.col + oA);
      cb.border = border; ca.border = border; cb.alignment = alignC; ca.alignment = alignC;
      if (vb) { cb.value = vb; cb.numFmt = "#,##0"; cb.font = vb === mxb ? fontB : fontN; if (vb === mxb) cb.fill = fill("FFD3DCEE"); }
      if (va) { ca.value = va; ca.numFmt = "#,##0"; ca.font = va === mxa ? fontB : fontN; ca.fill = fill(va === mxa ? "FFD3DCEE" : "FFF3F7FC"); }
      if (showDelta) {
        var dc = cell(rowIdx, g.col + oD);
        dc.border = border; dc.alignment = alignC; dc.fill = fill("FFF2F8FE");
        if (d > 0) {
          if (d === top) { anyStar = true; dc.value = { richText: [{ text: "★", font: { name: "Calibri", size: 16, bold: true, color: { argb: "FFF59E0B" } } }, { text: " +" + Number(d).toLocaleString(), font: teal }] }; }
          else if (rkv >= 2) dc.value = { richText: [{ text: "(" + rkv + ") ", font: { name: "Calibri", size: 10, color: { argb: "FF64748B" } } }, { text: "+" + Number(d).toLocaleString(), font: { name: "Calibri", size: 11, color: { argb: "FF0F766E" } } }] };
          else { dc.value = d; dc.numFmt = "+#,##0"; dc.font = { name: "Calibri", size: 11, color: { argb: "FF0F766E" } }; }
        }
      }
    }
    callCols.forEach(function (g) { put(g, true); }); putCols.forEach(function (g) { put(g, false); });
    ws.getRow(rowIdx).height = anyStar ? 28 : 22;
  });
  ws.getRow(rTitle).height = 25;
  for (var cw = startCol; cw <= endCol; cw++) ws.getColumn(cw).width = cw === strikeCol ? 12 : 13;
  return endCol;
}
function writeTawafuqToSheet(ws, startRow, startCol, data, ticker, daysLimit, strikesLimit) {
  var view = getTawafuqView(data, daysLimit, strikesLimit);
  if (!view || !view.columns || !view.columns.length) return startCol;
  var cols = view.columns;
  var rows = view.rows;
  var nCols = cols.length;
  var showDelta = !!state.showDelta;
  var showTot = state.showOiTot !== false;   // عمود مجموع الأوبن (إن كان مفعّلًا في الويب)
  var ext = showTot ? 1 : 0;
  var TC = twCalc(rows, nCols);              // حركة القمة/القاع + مجموع الأوبن + ترتيب التزايد
  var fontB = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
  var fontN = { name: "Calibri", size: 11, color: { argb: "FF000000" } };
  var fontT = { name: "Calibri", size: 13, bold: true, color: { argb: "FF000000" } };
  var fontCall = { name: "Calibri", size: 11, bold: true, color: { argb: "FF2563EB" } };
  var fontPut = { name: "Calibri", size: 11, bold: true, color: { argb: "FF7C3AED" } };
  var alignC = { horizontal: "center", vertical: "middle", wrapText: true };
  var border = {
    top: { style: "thin", color: { argb: "FFD9D9D9" } },
    bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
    left: { style: "thin", color: { argb: "FFD9D9D9" } },
    right: { style: "thin", color: { argb: "FFD9D9D9" } },
  };
  var fillMax = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC8C4D6" } };
  var fillOpx = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
  var fillFri = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  var fillEom = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCFBF1" } };
  var fillNorm = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  var fillHead = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };

  function kindFill(k) {
    if (k === "opx") return fillOpx;
    if (k === "fri") return fillFri;
    if (k === "eom") return fillEom;
    return fillNorm;
  }

  // الورقة بوضع RTL (العمود الأول يمين). لنفس ترتيب الويب بصريًا:
  // يسار → يمين: CALL (الأبعد ← الأقرب) | STRIKE | PUT (الأقرب ← الأبعد)
  // أي بالأعمدة التصاعدية: PUT (الأبعد ← الأقرب) | STRIKE | CALL (الأقرب ← الأبعد)
  var rTitle = startRow;
  var rSide = startRow + 1;
  var rHead = startRow + 2;
  var dataStart = startRow + 3;
  var putTotCol = startCol;                  // الورقة RTL: أقصى اليمين = مجموع Put (مثل الويب)
  var putStart = startCol + ext;
  var strikeCol = putStart + nCols;
  var callStart = strikeCol + 1;
  var callTotCol = callStart + nCols;        // أقصى اليسار = مجموع Call
  var endCol = callStart + nCols - 1 + ext;
  function putCol(ci) { return putStart + (nCols - 1 - ci); }
  function callCol(ci) { return callStart + ci; }

  // صف العنوان: اسم المؤشر | جدول الأيام — في الوسط
  for (var c = startCol; c <= endCol; c++) {
    var cell = ws.getCell(rTitle, c);
    cell.border = border;
    cell.fill = fillHead;
    cell.font = fontT;
    cell.alignment = alignC;
  }
  try { ws.mergeCells(rTitle, startCol, rTitle, endCol); } catch (e) {}
  var tCell = ws.getCell(rTitle, startCol);
  tCell.value = (ticker || "") + " | جدول الأيام";
  tCell.alignment = alignC;
  tCell.font = fontT;
  tCell.fill = fillHead;
  ws.getRow(rTitle).height = 24;

  // صف CALL | PUT
  for (var c2 = startCol; c2 <= endCol; c2++) {
    var sc0 = ws.getCell(rSide, c2);
    sc0.border = border;
    sc0.fill = fillHead;
    sc0.alignment = alignC;
    sc0.font = fontB;
  }
  try { ws.mergeCells(rSide, startCol, rSide, strikeCol - 1); } catch (e) {}
  try { ws.mergeCells(rSide, callStart, rSide, endCol); } catch (e) {}
  var putLab = ws.getCell(rSide, startCol);
  putLab.value = "PUT";
  putLab.font = fontPut;
  putLab.alignment = alignC;
  putLab.fill = fillHead;
  var callLab = ws.getCell(rSide, callStart);
  callLab.value = "CALL";
  callLab.font = fontCall;
  callLab.alignment = alignC;
  callLab.fill = fillHead;

  // ترويسة التواريخ
  for (var i = 0; i < nCols; i++) {
    var fh = formatTawafuqHeader(cols[i].exp);
    var txt = fh.top + (fh.sub ? "\n" + fh.sub : "");
    [putCol(i), callCol(i)].forEach(function (cc) {
      var th = ws.getCell(rHead, cc);
      th.value = txt;
      th.font = fontB;
      th.alignment = alignC;
      th.border = border;
      th.fill = kindFill(cols[i].kind);
    });
  }
  if (showTot) {
    [putTotCol, callTotCol].forEach(function (cc) {
      var tt = ws.getCell(rHead, cc);
      tt.value = "مجموع الأوبن";
      tt.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF3730A3" } }; tt.alignment = alignC; tt.border = border; tt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA5B4FC" } };
    });
  }
  var sc = ws.getCell(rHead, strikeCol);
  sc.value = "STRIKE";
  sc.font = fontB;
  sc.alignment = alignC;
  sc.border = border;
  sc.fill = fillHead;
  // خلية STRIKE في صف CALL/PUT
  var sMid = ws.getCell(rSide, strikeCol);
  sMid.fill = fillHead;
  sMid.border = border;
  ws.getRow(rHead).height = 32;

  // max per col
  var callMax = [], putMax = [], callTop = [], putTop = [];
  for (var ci = 0; ci < nCols; ci++) {
    var mc = 0, mp = 0;
    rows.forEach(function (r) {
      if (r.calls[ci] != null && r.calls[ci] > mc) mc = r.calls[ci];
      if (r.puts[ci] != null && r.puts[ci] > mp) mp = r.puts[ci];
    });
    callMax[ci] = mc;
    putMax[ci] = mp;
    var tdc = 0, tdp = 0;
    rows.forEach(function (r) {
      if (r.present[ci]) {
        if (r.callDeltas[ci] != null && r.callDeltas[ci] > tdc) tdc = r.callDeltas[ci];
        if (r.putDeltas[ci] != null && r.putDeltas[ci] > tdp) tdp = r.putDeltas[ci];
      }
    });
    callTop[ci] = tdc;
    putTop[ci] = tdp;
  }

  function mvTxt(m) { return m.dir === "up" ? "▲ " + m.diff : m.dir === "dn" ? "▼ " + m.diff : "ثابت"; }
  var rowLines = 1, rowStar = false;
  function fillSide(cell, val, dlt, isMax, kind, isTop, rk, mv) {
    cell.border = border;
    cell.alignment = alignC;
    cell.fill = kindFill(kind);
    if (val == null || val === 0) { cell.value = ""; return; }
    var base = isMax ? fontB : fontN;
    var teal = { name: "Calibri", size: 11, bold: true, color: { argb: "FF0F766E" } };
    var parts = [{ text: Number(val).toLocaleString(), font: base }];
    if (isTop && dlt != null && dlt > 0) {   // الأعلى تزايدًا: نجمة ذهبية أكبر
      parts.push({ text: "\n", font: base });
      parts.push({ text: "★", font: { name: "Calibri", size: 17, bold: true, color: { argb: "FFF59E0B" } } });
      parts.push({ text: " +" + dlt.toLocaleString(), font: teal });
    } else if (showDelta && dlt != null && dlt > 0) {
      parts.push({ text: "\n" + (rk >= 2 ? "(" + rk + ") " : "") + "+" + dlt.toLocaleString(), font: { name: "Calibri", size: 10, color: { argb: "FF0F766E" } } });
    }
    if (mv) {   // حركة القمة/القاع: أخضر ▲ مرتفع · أحمر ▼ نازل · رمادي ثابت
      parts.push({ text: "\n" + mvTxt(mv), font: { name: "Calibri", size: 10, bold: true, color: { argb: mv.dir === "up" ? "FF16A34A" : mv.dir === "dn" ? "FFDC2626" : "FF64748B" } } });
    }
    var nl = 1 + ((isTop || showDelta) && dlt != null && dlt > 0 ? 1 : 0) + (mv ? 1 : 0);
    if (nl > rowLines) rowLines = nl;
    if (isTop && dlt != null && dlt > 0) rowStar = true;
    if (parts.length === 1) { cell.value = val; cell.numFmt = "#,##0"; cell.font = base; }
    else cell.value = { richText: parts };
    if (isMax) cell.fill = fillMax;
  }

  rows.forEach(function (r, ri) {
    var rowIdx = dataStart + ri;
    for (var k = 0; k < nCols; k++) {
      var cv = r.present[k] ? r.calls[k] : null;
      var pv = r.present[k] ? r.puts[k] : null;
      fillSide(ws.getCell(rowIdx, callCol(k)), cv, r.callDeltas[k], cv != null && callMax[k] > 0 && cv === callMax[k], cols[k].kind, r.present[k] && r.callDeltas[k] != null && r.callDeltas[k] === callTop[k], showDelta ? TC.rkDC[k][ri] : 0, TC.peakIdx[k] === ri ? TC.peakMv[k] : null);
      fillSide(ws.getCell(rowIdx, putCol(k)), pv, r.putDeltas[k], pv != null && putMax[k] > 0 && pv === putMax[k], cols[k].kind, r.present[k] && r.putDeltas[k] != null && r.putDeltas[k] === putTop[k], showDelta ? TC.rkDP[k][ri] : 0, TC.troughIdx[k] === ri ? TC.troughMv[k] : null);
    }
    ws.getRow(rowIdx).height = Math.max(22, rowLines * 15 + (rowStar ? 8 : 4));   // الصف يتّسع لسطور التزايد والسهم فلا تُقصّ
    rowLines = 1; rowStar = false;
    if (showTot) {
      [[putTotCol, TC.totP[ri], TC.rkTotP[ri]], [callTotCol, TC.totC[ri], TC.rkTotC[ri]]].forEach(function (q) {
        var tc = ws.getCell(rowIdx, q[0]);
        var fIdx = { name: "Calibri", size: 11, bold: true, color: { argb: "FF3730A3" } };
        tc.border = { top: { style: "thin", color: { argb: "FF6366F1" } }, bottom: { style: "thin", color: { argb: "FF6366F1" } }, left: { style: "medium", color: { argb: "FF6366F1" } }, right: { style: "medium", color: { argb: "FF6366F1" } } };
        tc.alignment = alignC;
        tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: q[2] ? "FFC7D2FE" : "FFE0E7FF" } };   // مميّز عن باقي الأعمدة
        if (q[1] > 0) {
          if (q[2]) tc.value = { richText: [{ text: Number(q[1]).toLocaleString(), font: fIdx }, { text: "\n(" + q[2] + ")", font: { name: "Calibri", size: 10, bold: true, color: { argb: "FF4F46E5" } } }] };
          else { tc.value = q[1]; tc.numFmt = "#,##0"; tc.font = fIdx; }
        }
      });
    }
    var strikeCell = ws.getCell(rowIdx, strikeCol);
    strikeCell.value = r.strike;
    strikeCell.font = fontB;
    strikeCell.alignment = alignC;
    strikeCell.border = border;
  });

  var legR = dataStart + rows.length;
  try { ws.mergeCells(legR, startCol, legR, endCol); } catch (e) {}
  var lg = ws.getCell(legR, startCol);
  lg.value = "★ = الأعلى تزايدًا في ذلك اليوم · (2)-(4) = ترتيب التزايد · ▲▼ = انتقال القمة/القاع عن السحب السابق وبكم نقطة (بلا سهم = لم تتحرك)" + (showTot ? " · مجموع الأوبن: (1)-(4) = أعلى 4 مجاميع" : "");
  lg.font = { name: "Calibri", size: 10, color: { argb: "FF64748B" } };
  lg.alignment = { horizontal: "center", vertical: "middle" };
  for (var w = startCol; w <= endCol; w++) {
    ws.getColumn(w).width = w === strikeCol ? 11 : (showTot && (w === putTotCol || w === callTotCol)) ? 14 : 13;
  }
  return endCol;
}


function openExportDialog() {
  ensureEq();
  const data = state.cache[state.ticker];
  if (!data) {
    setStatus("لا بيانات — اختر مؤشرًا وحدّث العرض", "err");
    return;
  }
  if (typeof ExcelJS === "undefined") {
    setStatus("مكتبة Excel لم تُحمّل — تحقق من الإنترنت", "err");
    return;
  }
  const modal = $("#exportModal");
  const body = $("#exportBody");
  if (!modal || !body) {
    setStatus("نافذة التصدير غير متوفرة", "err");
    return;
  }
  const allExps = Object.keys(data.by_expiration || {}).sort();
  const exps = futureExpirations(allExps);
  if (!exps.length) {
    setStatus("لا تواريخ انتهاء متاحة من اليوم فصاعدًا", "err");
    return;
  }
  const curExp = state.expiration;

  // تجميع حسب الشهر
  const groups = {};
  const order = [];
  exps.forEach(function (exp) {
    const meta = formatExpExportChip(exp);
    if (!groups[meta.monthKey]) {
      groups[meta.monthKey] = { label: meta.monthLabel, items: [] };
      order.push(meta.monthKey);
    }
    groups[meta.monthKey].items.push({ exp: exp, meta: meta });
  });

  let html = "";
  html += '<div class="exp-export-top">';
  html += '<div class="exp-export-heading">';
  html += '<div class="exp-export-title">' + (state.ticker || "") + "</div>";
  if (isFirstDayOfMonth(new Date())) {
    html += '<div class="exp-month-tip">بداية شهر جديد — مناسبة لتصدير ما يهمّك</div>';
  }
  html += "</div>";
  html += '<button type="button" class="btn-sm exp-select-all" id="expSelectAll">تحديد الكل</button>';
  html += "</div>";

  html += '<div class="exp-month-list">';
  // اليوم بالسابق داخل شريط بنفس تنسيق الأشهر
  html += '<div class="exp-month">';
  html += '<div class="exp-month-dates">';
  html +=
    '<button type="button" class="exp-date-chip exp-series-chip" data-exp="__SERIES_PREV__">' +
    '<span class="d">اليوم بالسابق</span>' +
    '<span class="s">مقارنة يومية</span></button>';
  html +=
    '<button type="button" class="exp-date-chip exp-tawafuq-chip" data-exp="__TAWAFUQ__">' +
    '<span class="d">جدول الأيام</span>' +
    '<span class="s">انتهاءات قادمة</span></button>';
  html +=
    '<button type="button" class="exp-date-chip exp-tawafuq-chip" data-exp="__BEFORE_AFTER__">' +
    '<span class="d">قبل وبعد</span>' +
    '<span class="s">بعد الانتهاء</span></button>';
  html +=
    '<button type="button" class="exp-date-chip exp-mapheat-chip" data-exp="__MAP_HEAT__">' +
    '<span class="d">Map heat</span></button>';
  html +=
    '<button type="button" class="exp-date-chip exp-report-chip" data-exp="__REPORT__">' +
    '<span class="d">التقرير</span><span class="s">N ' + (loadRepPrefs().n || 5) + ' · G ' + (loadRepPrefs().g || parseInt(state.growthDays, 10) || 3) + '</span></button>';
  html += "</div></div>";
  order.forEach(function (key) {
    const g = groups[key];
    html += '<div class="exp-month">';
    html += '<div class="exp-month-title">' + (g.label || key) + "</div>";
    html += '<div class="exp-month-dates">';
    html += '<button type="button" class="exp-date-chip exp-month-all" data-month-all="' + key + '"><span class="d">الكل</span></button>';
    g.items.forEach(function (it) {
      const on = it.exp === curExp ? " on" : "";
      html +=
        '<button type="button" class="exp-date-chip' +
        on +
        '" data-exp="' +
        it.exp +
        '">' +
        '<span class="d">' +
        it.meta.day +
        (it.meta.monShort ? " " + it.meta.monShort : "") +
        "</span>" +
        '<span class="s">' +
        it.meta.sub +
        "</span></button>";
    });
    html += "</div></div>";
  });
  html += "</div>";

  // شريط موحّد: Days + Strikes + الوضع + Excel
  html += '<div class="exp-unified-bar">';
  html += '<span class="lab">Days</span>';
  ["2", "3", "5", "10", "ALL"].forEach(function (d) {
    const on = String(state.days) === d ? " on" : "";
    html +=
      '<button type="button" class="chip' +
      on +
      '" data-edays="' +
      d +
      '">' +
      d +
      "</button>";
  });
  var _cd = ["2", "3", "5", "10", "ALL"].indexOf(String(state.days)) >= 0 ? "" : String(state.days || "");
  html += '<input type="number" min="1" max="365" id="expDaysCustom" class="exp-days-custom" placeholder="حر" value="' + _cd + '" title="عدد أيام مخصص" />';
  html += '<span class="lab">Strikes</span>';
  ["30", "50", "100", "ALL"].forEach(function (s) {
    const curS =
      ["30", "50", "100", "ALL"].indexOf(String(state.strikes)) >= 0
        ? String(state.strikes)
        : "50";
    const on = curS === s ? " on" : "";
    html +=
      '<button type="button" class="chip' +
      on +
      '" data-estrikes="' +
      s +
      '">' +
      s +
      "</button>";
  });
  html +=
    '<button type="button" class="chip on" data-emode="single">صفحة واحدة</button>';
  html +=
    '<button type="button" class="chip" data-emode="multi">متعددة</button>';
  html +=
    '<button type="button" class="btn btn-teal exp-do-inline" id="expDoBtn">Excel</button>';
  html += "</div>";
  html += '<p id="expStatus" class="exp-status"></p>';

  body.innerHTML = html;
  modal.classList.remove("hidden");

  let emode = "single";
  let edays = String(state.days || "2");
  let estrikes =
    ["30", "50", "100", "ALL"].indexOf(String(state.strikes)) >= 0
      ? String(state.strikes)
      : "50";

  body.querySelectorAll(".exp-date-chip").forEach(function (btn) {
    btn.onclick = function () {
      btn.classList.toggle("on");
    };
  });
  body.querySelectorAll(".exp-month-all").forEach(function (btn) {   // «الكل» لتحديد/إلغاء كل تواريخ هذا الشهر
    btn.onclick = function (ev) {
      ev.stopPropagation();
      var box = btn.closest(".exp-month");
      if (!box) return;
      var chips = box.querySelectorAll(".exp-month-dates .exp-date-chip:not(.exp-month-all)");
      var allOn = Array.prototype.every.call(chips, function (c) { return c.classList.contains("on"); });
      chips.forEach(function (c) { c.classList.toggle("on", !allOn); });
      btn.classList.toggle("on", !allOn);
    };
  });

  body.querySelectorAll("[data-emode]").forEach(function (btn) {
    btn.onclick = function () {
      emode = btn.getAttribute("data-emode");
      body.querySelectorAll("[data-emode]").forEach(function (b) {
        b.classList.toggle("on", b === btn);
      });
    };
  });
  body.querySelectorAll("[data-edays]").forEach(function (btn) {
    btn.onclick = function () {
      edays = btn.getAttribute("data-edays");
      var _cu = document.getElementById("expDaysCustom");
      if (_cu) _cu.value = "";
      body.querySelectorAll("[data-edays]").forEach(function (b) {
        b.classList.toggle("on", b === btn);
      });
    };
  });
  body.querySelectorAll("[data-estrikes]").forEach(function (btn) {
    btn.onclick = function () {
      estrikes = btn.getAttribute("data-estrikes");
      body.querySelectorAll("[data-estrikes]").forEach(function (b) {
        b.classList.toggle("on", b === btn);
      });
    };
  });

  const selAll = $("#expSelectAll");
  if (selAll) {
    selAll.onclick = function () {
      const chips = body.querySelectorAll(".exp-date-chip");
      const allOn = Array.prototype.every.call(chips, function (c) {
        return c.classList.contains("on");
      });
      chips.forEach(function (c) {
        c.classList.toggle("on", !allOn);
      });
    };
  }

  const doBtn = $("#expDoBtn");
  if (doBtn) {
    doBtn.onclick = function () {
      var daysArg = edays;
      var custom = document.getElementById("expDaysCustom");
      if (custom && String(custom.value || "").trim() !== "") {
        var n = parseInt(custom.value, 10);
        if (n >= 1 && n <= 365) {
          daysArg = String(n);
        }
      }
      runExportFromDialog(emode, daysArg, estrikes);
    };
  }
  var customIn = document.getElementById("expDaysCustom");
  if (customIn) {
    customIn.addEventListener("input", function () {
      if (String(customIn.value || "").trim() !== "") {
        body.querySelectorAll("[data-edays]").forEach(function (b) {
          b.classList.remove("on");
        });
      }
    });
  }
}

function closeExportDialog() {
  const modal = $("#exportModal");
  if (modal) modal.classList.add("hidden");
}



function runExportFromDialog(emode, edays, estrikes) {
  const data = state.cache[state.ticker];
  const body = $("#exportBody");
  const st = $("#expStatus");
  const chosen = [];
  if (body) {
    body.querySelectorAll("input[data-exp]:checked").forEach(function (cb) {
      chosen.push(cb.getAttribute("data-exp"));
    });
    body.querySelectorAll(".exp-date-chip.on").forEach(function (btn) {
      var e = btn.getAttribute("data-exp");
      if (e && chosen.indexOf(e) < 0) chosen.push(e);
    });
  }
  if (!chosen.length) {
    if (st) st.textContent = "اختر تاريخ انتهاء واحدًا على الأقل";
    return;
  }
  if (st) st.textContent = "جاري إنشاء الملف…";

  try {
    const wb = new ExcelJS.Workbook();
    const GAP = 4;
    const showDelta = !!state.showDelta;
    const showGrowth = !!state.showGrowth;
    // إن كُتب رقم أيام حر في التصدير → الأعمدة والنمو على أساسه
    var growthDays = state.growthDays;
    if (edays && String(edays) !== "ALL") {
      var edn = parseInt(edays, 10);
      if (edn >= 1) growthDays = edn;
    }

    function mapHeatExpsForExport() {
      if (state.mapHeatExps && state.mapHeatExps.length) return state.mapHeatExps.slice();
      // تواريخ مختارة في النافذة (بدون السيري والحيت)
      return chosen.filter(function (e) {
        return e && e !== "__SERIES_PREV__" && e !== "__MAP_HEAT__" && e !== "__TAWAFUQ__" && e !== "__REPORT__" && e !== "__BEFORE_AFTER__";
      });
    }

    if (emode === "multi") {
      chosen.forEach(function (exp, i) {
        if (exp === "__REPORT__") return;
        if (exp === "__MAP_HEAT__") {
          var mhExps = mapHeatExpsForExport();
          if (!mhExps.length) return;
          const ws = wb.addWorksheet("Map heat", {
            views: [{ rightToLeft: true }],
          });
          writeMapHeatToSheet(ws, 2, 2, data, state.ticker, mhExps, edays, estrikes);
          return;
        }
        if (exp === "__BEFORE_AFTER__") {
          const wsBa = wb.addWorksheet("قبل وبعد", { views: [{ rightToLeft: true }] });
          writeBeforeAfterToSheet(wsBa, 2, 2, data, state.ticker, "1", estrikes, showDelta);
          return;
        }
        if (exp === "__TAWAFUQ__") {
          const wsTw = wb.addWorksheet("جدول الأيام", {
            views: [{ rightToLeft: true }],
          });
          writeTawafuqToSheet(wsTw, 2, 2, data, state.ticker, edays, estrikes);
          return;
        }
        var view =
          exp === "__SERIES_PREV__"
            ? getSeriesPrevDayView(data, edays, estrikes)
            : getViewRowsFor(data, exp, edays, estrikes);
        if (!view) return;
        var sheetName =
          exp === "__SERIES_PREV__" ? "Series" : multiSheetNameForExp(exp);
        const ws = wb.addWorksheet(String(sheetName).slice(0, 31), {
          views: [{ rightToLeft: true }],
        });
        writeOiTableToSheet(ws, 2, 2, view, state.ticker, showDelta, showGrowth, growthDays);
      });
    } else {
      const ws = wb.addWorksheet("Export", {
        views: [{ rightToLeft: true }],
      });
      let col = 2;
      chosen.forEach(function (exp) {
        if (exp === "__REPORT__") return;
        if (exp === "__MAP_HEAT__") {
          var mhExps2 = mapHeatExpsForExport();
          if (!mhExps2.length) return;
          const lastMh = writeMapHeatToSheet(ws, 2, col, data, state.ticker, mhExps2, edays, estrikes);
          col = lastMh + 1 + GAP;
          return;
        }
        if (exp === "__BEFORE_AFTER__") {
          const lastBa = writeBeforeAfterToSheet(ws, 2, col, data, state.ticker, "1", estrikes, showDelta);
          col = lastBa + 1 + GAP;
          return;
        }
        if (exp === "__TAWAFUQ__") {
          const lastTw = writeTawafuqToSheet(ws, 2, col, data, state.ticker, edays, estrikes);
          col = lastTw + 1 + GAP;
          return;
        }
        var view =
          exp === "__SERIES_PREV__"
            ? getSeriesPrevDayView(data, edays, estrikes)
            : getViewRowsFor(data, exp, edays, estrikes);
        if (!view) return;
        const last = writeOiTableToSheet(ws, 2, col, view, state.ticker, showDelta, showGrowth, growthDays);
        col = last + 1 + GAP;
      });
    }

    // التقرير: ورقة مستقلة دائمًا (من التواريخ الحقيقية المختارة)
    if (chosen.indexOf("__REPORT__") >= 0) {
      var repExps = chosen.filter(function (e) { return e && e.indexOf("__") !== 0; });
      var rp = loadRepPrefs();
      if (!repExps.length) {
        // لا تواريخ محددة في التصدير: استخدم تواريخ آخر تقرير ولّدته، وإلا أقرب 10 انتهاءات
        repExps = (rp.exps || []).filter(function (e) { return data.by_expiration && data.by_expiration[e]; });
        if (!repExps.length) {
          var fromIsoR = latestPullIso(data) || "";
          repExps = Object.keys(data.by_expiration || {}).sort().filter(function (e) { return e >= fromIsoR; }).slice(0, 10);
        }
      }
      var gdRep = parseInt(rp.g, 10) || parseInt(state.growthDays, 10) || 3;
      var nRep = parseInt(rp.n, 10) || 5;
      var repData = applyRepHidden(computeReports(data, repExps, edays, estrikes, nRep, gdRep), rp.hidden);
      fillReportSheet(wb.addWorksheet("التقرير"), repData, state.ticker);
    }

    if (wb.worksheets.length === 0) {
      if (st) st.textContent = "لا بيانات للجداول المختارة";
      return;
    }

    const fname = state.ticker + "-" + exportFileStamp() + ".xlsx";

    wb.xlsx.writeBuffer().then(function (buffer) {
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      if (typeof saveAs === "function") {
        saveAs(blob, fname);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      if (st) {
        st.textContent = "تم التصدير: " + fname;
        st.style.color = "#94a3b8";
      }
      setStatus("تم التصدير: " + fname, "muted");
    }).catch(function (err) {
      if (st) st.textContent = "خطأ: " + (err && err.message ? err.message : err);
      setStatus("خطأ تصدير: " + (err && err.message ? err.message : err), "err");
    });
  } catch (err) {
    if (st) st.textContent = "خطأ: " + (err && err.message ? err.message : err);
  }
}


function exportExcel() {
  openExportDialog();
}

// —— سعر مباشر للشريط الأخضر (ويب فقط، مع قيود الاستضافة الثابتة) ——
const YAHOO_MAP = {
  SPY: "SPY", QQQ: "QQQ", IWM: "IWM", GLD: "GLD", SPX: "^GSPC",
  AAPL: "AAPL", MSFT: "MSFT", NVDA: "NVDA", TSLA: "TSLA", AMZN: "AMZN",
  META: "META", GOOGL: "GOOGL", AVGO: "AVGO", MSTR: "MSTR", AMD: "AMD",
  MU: "MU", COHR: "COHR", SNDK: "SNDK", CRWD: "CRWD", CRCL: "CRCL", NDX: "^NDX",
};
let liveTimer = null;

function isUsMarketHours() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    const wd = map.weekday;
    if (wd === "Sat" || wd === "Sun") return false;
    const h = parseInt(map.hour, 10);
    const m = parseInt(map.minute, 10);
    const mins = h * 60 + m;
    // 9:30–16:00 ET
    return mins >= 9 * 60 + 30 && mins <= 16 * 60;
  } catch (e) {
    return false;
  }
}

async function fetchSessionClose(ticker) {
  /**
   * إغلاق آخر جلسة مكتملة من Yahoo:
   * - يقرأ الشموع اليومية
   * - إن كان آخر يوم close=null يستخدم regularMarketPrice
   * - يعيد آخر إغلاق ≤ أمس (جلسة مكتملة) وليس السعر اللحظي أثناء الجلسة إن وُجد شريط أمس
   */
  try {
    var symbol = (typeof YAHOO_MAP !== "undefined" && YAHOO_MAP[ticker]) ? YAHOO_MAP[ticker] : ticker;
    if (ticker === "SPX") symbol = "^GSPC";
    if (ticker === "NDX") symbol = "^NDX";
    var url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?range=15d&interval=1d";
    var res = await fetch(url);
    if (!res.ok) return null;
    var j = await res.json();
    var result = j && j.chart && j.chart.result && j.chart.result[0];
    if (!result) return null;
    var ts = result.timestamp || [];
    var quotes = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    var closes = quotes.close || [];
    var meta = result.meta || {};
    var rmp = meta.regularMarketPrice;
    var rows = [];
    for (var i = 0; i < ts.length; i++) {
      var c = closes[i];
      // تاريخ تقريبي من timestamp (Yahoo daily عادةً بتوقيت السوق)
      var d = new Date(ts[i] * 1000);
      // استخدم تاريخ تقويم محلي UTC-date من الـ timestamp
      var y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
      var key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      var val = (c != null && !isNaN(Number(c)) && Number(c) > 0) ? Number(c) : null;
      rows.push({ key: key, date: new Date(Date.UTC(y, m, day)), val: val });
    }
    // املأ آخر شريط الناقص
    if (rows.length && rows[rows.length - 1].val == null && rmp != null && !isNaN(Number(rmp)) && Number(rmp) > 0) {
      rows[rows.length - 1].val = Number(rmp);
    }
    var valid = rows.filter(function (r) { return r.val != null; });
    if (!valid.length) {
      if (rmp != null && !isNaN(Number(rmp)) && Number(rmp) > 0) return Number(rmp);
      return null;
    }
    // آخر جلسة مكتملة: آخر شريط صالح
    // (إذا السوق مفتوح اليوم وآخر شريط = اليوم بسعر لحظي، نفضّل الشريط السابق إن وُجد)
    var last = valid[valid.length - 1];
    var today = new Date();
    var todayKey =
      today.getUTCFullYear() +
      "-" +
      String(today.getUTCMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getUTCDate()).padStart(2, "0");
    // إن كان آخر شريط هو "اليوم" وما زال الجلسة جارية، خذ السابق
    if (last.key === todayKey && valid.length >= 2) {
      // أثناء الجلسة: الإغلاق المعروض = إغلاق أمس
      return valid[valid.length - 2].val;
    }
    return last.val;
  } catch (e) {
    return null;
  }
}

async function fetchLivePrice(ticker) {
  const sym = YAHOO_MAP[ticker] || ticker;
  const yahoo =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(sym) +
    "?interval=1m&range=1d";
  // محاولة مباشرة ثم عبر وكيل CORS بسيط عند الفشل
  async function fromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }
  let json;
  try {
    json = await fromUrl(yahoo);
  } catch (e1) {
    try {
      json = await fromUrl(
        "https://api.allorigins.win/raw?url=" + encodeURIComponent(yahoo)
      );
    } catch (e2) {
      return null;
    }
  }
  try {
    const meta = json.chart.result[0].meta;
    const p = meta.regularMarketPrice || meta.postMarketPrice || meta.previousClose;
    return p != null ? Number(p) : null;
  } catch (e) {
    return null;
  }
}


function effectiveClose(data) {
  if (state.livePrice != null && !isNaN(state.livePrice)) return state.livePrice;
  return data && data.close != null ? data.close : null;
}

async function refreshLivePrice() {
  if (!isUsMarketHours()) {
    state.livePrice = null;
    return;
  }
  const p = await fetchLivePrice(state.ticker);
  if (p != null) {
    state.livePrice = p;
    renderTable();
  }
}

function startLivePriceLoop() {
  if (liveTimer) clearInterval(liveTimer);
  refreshLivePrice();
  liveTimer = setInterval(refreshLivePrice, 60000); // كل دقيقة أثناء الجلسة
}


function toggleTheme() {
  state.dark = true;
  applyTheme();
}

function init() {
  (function () {
    var bb = $("#beforeAfterBtn");
    if (bb) {
      bb.style.setProperty("border-bottom", "none", "important");
      bb.style.setProperty("border-bottom-width", "0", "important");
      bb.style.setProperty("text-decoration", "none", "important");
      bb.style.setProperty("box-shadow", "none", "important");
    }
  })();
  if ($("#seriesBtn")) {
    (function () {
      var sb0 = $("#seriesBtn");
      if (sb0) {
        sb0.style.setProperty("border-bottom", "none", "important");
        sb0.style.setProperty("border-bottom-width", "0", "important");
        sb0.style.setProperty("text-decoration", "none", "important");
        sb0.style.setProperty("box-shadow", "none", "important");
      }
    })();
    $("#seriesBtn").onclick = function () {
      state.seriesMode = !state.seriesMode;
      if (state.seriesMode) {
        state.x3Mode = false;
        state.mapHeatMode = false;
        state.tawafuqMode = false;
        var mhb = $("#mapHeatBtn");
        if (mhb) mhb.classList.remove("active");
        var x3 = $("#x3Btn"); if (x3) x3.classList.remove("active");
        var tw = $("#tawafuqBtn"); if (tw) tw.classList.remove("active");
      }
      $("#seriesBtn").classList.toggle("active", state.seriesMode);
      var _sb = $("#seriesBtn");
      if (_sb) {
        _sb.style.setProperty("border-bottom", "none", "important");
        _sb.style.setProperty("text-decoration", "none", "important");
      }
      renderTable();
    };
    if ($("#tawafuqBtn")) {
      $("#tawafuqBtn").onclick = function () {
        state.tawafuqMode = !state.tawafuqMode;
        if (state.tawafuqMode) {
          state.seriesMode = false;
          state.x3Mode = false;
          state.mapHeatMode = false;
          if (!state.days) state.days = "5";
          var sb = $("#seriesBtn"); if (sb) sb.classList.remove("active");
          var x3 = $("#x3Btn"); if (x3) x3.classList.remove("active");
          var mhb = $("#mapHeatBtn"); if (mhb) mhb.classList.remove("active");
        }
        $("#tawafuqBtn").classList.toggle("active", state.tawafuqMode);
        renderTable();
      };
    }
  }

  state.dark = true;
  try { localStorage.setItem("oi-theme", "dark"); } catch (e) {}
  applyTheme();
  renderTickers();
  renderChips("#daysRow", ["2", "3", "5", "10", "ALL"], "days");
  renderChips("#strikesRow", ["30", "50", "ALL"], "strikes");
  $("#expSelect").onchange = function (e) {
    state.expiration = e.target.value;
    renderTable();
  };
  if ($("#x3Btn")) {
    $("#x3Btn").onclick = function () {
      state.x3Mode = !state.x3Mode;
      if (state.x3Mode) {
        state.mapHeatMode = false;
        state.tawafuqMode = false;
        state.seriesMode = false;
        var mhb2 = $("#mapHeatBtn");
        if (mhb2) mhb2.classList.remove("active");
        var tw2 = $("#tawafuqBtn"); if (tw2) tw2.classList.remove("active");
        var sb2 = $("#seriesBtn"); if (sb2) sb2.classList.remove("active");
      }
      $("#x3Btn").classList.toggle("active", state.x3Mode);
      renderTable();
    };
  }
  $("#deltaBtn").onclick = function () {
    state.showDelta = !state.showDelta;
    $("#deltaBtn").classList.toggle("active", state.showDelta);
    renderTable();
  };
  if ($("#growthBtn")) {
    $("#growthBtn").onclick = function () {
      if (!state.showGrowth) {
        var ans = window.prompt(
          "كم يومًا يُحسب؟",
          ""
        );
        if (ans == null) return; // إلغاء
        ans = String(ans).trim();
        if (ans === "") {
          state.growthDays = "auto";
        } else {
          var n = parseInt(ans, 10);
          if (!n || n < 1) {
            setStatus("يلزم إدخال رقم أيام صحيح أو ترك الخانة فارغة للتلقائي", "err");
            return;
          }
          state.growthDays = n;
        }
        state.showGrowth = true;
      } else {
        state.showGrowth = false;
      }
      $("#growthBtn").classList.toggle("active", state.showGrowth);
      $("#growthBtn").title = state.showGrowth
        ? (state.growthDays === "auto"
            ? "النمو تلقائي حسب الأعمدة — الضغط يوقفه"
            : "النمو نشط — " + state.growthDays + " يوم — الضغط يوقفه")
        : "النمو — فارغ=تلقائي أو رقم مخصص";
      renderTable();
    };
  }
  document.addEventListener("click", function (ev) {   // × على رأس عمود / إظهار المحذوف
    var t = ev.target;
    if (!t || !t.closest) return;
    var bx = t.closest(".col-x"), br = t.closest(".col-x-reset");
    if (!bx && !br) return;
    ev.preventDefault(); ev.stopPropagation();
    var tk = state.ticker;
    if (br) { if (state.hiddenPulls) state.hiddenPulls[tk] = {}; if (state.hiddenTwExps) state.hiddenTwExps[tk] = {}; }
    else if (bx.getAttribute("data-pull")) { state.hiddenPulls = state.hiddenPulls || {}; (state.hiddenPulls[tk] = state.hiddenPulls[tk] || {})[bx.getAttribute("data-pull")] = 1; }
    else if (bx.getAttribute("data-twexp")) { state.hiddenTwExps = state.hiddenTwExps || {}; (state.hiddenTwExps[tk] = state.hiddenTwExps[tk] || {})[bx.getAttribute("data-twexp")] = 1; }
    renderTable();
  }, true);
  if ($("#beforeAfterBtn") && !$("#actualGrowthBtn")) {   // تبويب «التزايد الفعلي» بجانب «قبل وبعد»
    var __b0 = $("#beforeAfterBtn"), __b1 = __b0.cloneNode(true), __lab = String(__b0.textContent || "").trim();
    __b1.id = "actualGrowthBtn"; __b1.classList.remove("active");
    if (__lab && __b1.innerHTML.indexOf(__lab) >= 0) __b1.innerHTML = __b1.innerHTML.replace(__lab, "التزايد الفعلي"); else __b1.textContent = "التزايد الفعلي";
    __b1.setAttribute("title", "صافي تغيّر الأوبن بين تحديثين على كل الانتهاءات");
    __b0.insertAdjacentElement("afterend", __b1);
    __b1.onclick = function () {
      state.agMode = !state.agMode;
      if (state.agMode) {
        state.seriesMode = false; state.x3Mode = false; state.mapHeatMode = false; state.tawafuqMode = false; state.baMode = false;
        ["#seriesBtn", "#x3Btn", "#tawafuqBtn", "#mapHeatBtn", "#beforeAfterBtn"].forEach(function (q) { var b = $(q); if (b) b.classList.remove("active"); });
      }
      __b1.classList.toggle("active", !!state.agMode);
      renderTable();
    };
  }
  if ($("#beforeAfterBtn")) {
    $("#beforeAfterBtn").onclick = function () {
      state.baMode = !state.baMode;
      if (state.baMode) {
        state.agMode = false; var __ag = $("#actualGrowthBtn"); if (__ag) __ag.classList.remove("active");
        state.seriesMode = false; state.x3Mode = false; state.mapHeatMode = false; state.tawafuqMode = false;
        ["#seriesBtn", "#x3Btn", "#tawafuqBtn", "#mapHeatBtn"].forEach(function (q) { var b = $(q); if (b) b.classList.remove("active"); });
      }
      $("#beforeAfterBtn").classList.toggle("active", !!state.baMode);
      renderTable();
    };
  }
  if ($("#oiTotBtn")) {
    try { if (localStorage.getItem("oi_show_oitot") === "0") state.showOiTot = false; } catch (eO) {}
    $("#oiTotBtn").classList.toggle("active", state.showOiTot !== false);
    $("#oiTotBtn").onclick = function () {
      state.showOiTot = state.showOiTot === false;
      try { localStorage.setItem("oi_show_oitot", state.showOiTot ? "1" : "0"); } catch (eO2) {}
      $("#oiTotBtn").classList.toggle("active", state.showOiTot);
      renderTable();
    };
  }
  if ($("#sigmaBtn")) {
    $("#sigmaBtn").onclick = function () {
      // مثل Δ و G: إن كان مفعّلًا → إيقاف؛ وإلا → فتح نافذة الاختيار
      if (state.showSigma) {
        state.showSigma = false;
        $("#sigmaBtn").classList.remove("active");
        renderTable();
        return;
      }
      openSigmaDialog();
    };
  }

  if ($("#mapHeatBtn")) {
    $("#mapHeatBtn").onclick = function () {
      if (state.mapHeatMode) {
        state.mapHeatMode = false;
        $("#mapHeatBtn").classList.remove("active");
        renderTable();
        return;
      }
      openMapHeatDialog();
    };
  }
  $("#exportBtn").onclick = function () {
    try {
      exportExcel();
    } catch (err) {
      setStatus("خطأ تصدير: " + (err && err.message ? err.message : err), "err");
      console.error(err);
    }
  };
  if ($("#themeSwitch")) $("#themeSwitch").onclick = toggleTheme;
  if ($("#mapBtn")) $("#mapBtn").onclick = function () { openMap(); };
  if ($("#archiveBtn")) $("#archiveBtn").onclick = function () { openArchive(); };
  if ($("#archiveClose")) $("#archiveClose").onclick = function () { closeArchive(); };
  if ($("#archiveModal")) $("#archiveModal").addEventListener("click", function (e) {
    if (e.target.id === "archiveModal") closeArchive();
  });
  try {
    if (localStorage.getItem("oi-spx5k") === "1") state.spx5k = true;
  } catch (e) {}
  if (typeof syncSpx5kBtn === "function") syncSpx5kBtn();
  if ($("#spx5kBtn")) {
    $("#spx5kBtn").onclick = function () {
      state.spx5k = !state.spx5k;
      try { localStorage.setItem("oi-spx5k", state.spx5k ? "1" : "0"); } catch (e) {}
      syncSpx5kBtn();
      renderTable();
    };
  }
  if ($("#mapClose")) $("#mapClose").onclick = closeMap;
  if ($("#exportClose")) $("#exportClose").onclick = closeExportDialog;
  if ($("#reportsBtn")) $("#reportsBtn").onclick = function () {
    try { openReports(); } catch (err) {
      setStatus("Reports: " + (err && err.message ? err.message : err), "err");
      console.error(err);
    }
  };
  if ($("#reportsClose")) $("#reportsClose").onclick = closeReports;
  if ($("#reportsModal")) $("#reportsModal").addEventListener("click", function (e) {
    if (e.target.id === "reportsModal") closeReports();
  });
  if ($("#feedbackBtn")) $("#feedbackBtn").onclick = openFeedback;
  if ($("#feedbackClose")) $("#feedbackClose").onclick = closeFeedback;
  if ($("#fbCancel")) $("#fbCancel").onclick = closeFeedback;
  if ($("#feedbackForm")) $("#feedbackForm").onsubmit = submitFeedback;
  if ($("#feedbackModal")) $("#feedbackModal").addEventListener("click", function (e) {
    if (e.target.id === "feedbackModal") closeFeedback();
  });
  if ($("#exportModal")) $("#exportModal").addEventListener("click", function (e) {
    if (e.target.id === "exportModal") closeExportDialog();
  });
  if ($("#sigmaModal")) $("#sigmaModal").addEventListener("click", function (e) {
    if (e.target.id === "sigmaModal") closeSigmaDialog();
  });
  if ($("#sigmaClose")) $("#sigmaClose").onclick = function () { closeSigmaDialog(); };
  if ($("#mapModal")) $("#mapModal").addEventListener("click", function (e) {
    if (e.target.id === "mapModal") closeMap();
  });
  if ($("#reloadBtn")) $("#reloadBtn").onclick = function () {
    delete state.cache[state.ticker];
    levelsCache = null;
    refresh();
  };
  // ابنِ شريط التحكم كاملًا قبل أول تحميل حتى لا يظهر select فارغ أثناء "جاري التحميل"
  try {
    if (typeof ensureExpDropdownUI === "function") ensureExpDropdownUI();
    if (typeof syncExpDropdownLabel === "function") syncExpDropdownLabel();
    if (typeof renderStocksDropdown === "function") renderStocksDropdown();
  } catch (eInitUi) {}
  refresh();
  startLivePriceLoop();
}



// ========== Levels Map (3 phases) ==========
let levelsCache = null;
let mapRawL = null;

async function loadLevels() {
  if (levelsCache) return levelsCache;
  var bases = dataBases();
  for (var i = 0; i < bases.length; i++) {
    try {
      var res = await fetch(bases[i] + "/levels.json?t=" + Date.now());
      if (res.ok) {
        levelsCache = await res.json();
        return levelsCache;
      }
    } catch (e) {}
  }
  throw new Error("لا يوجد levels.json بعد — شغّل Actions أولًا");
}

function fmtNum(v, d) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d == null ? 2 : d });
}

/** يحافظ على نصف السترايك (212.5) بدون تقريب لعدد صحيح */
function fmtStrike(v) {
  if (v == null || isNaN(Number(v))) return "—";
  var n = Number(v);
  var r2 = Math.round(n * 100) / 100;
  if (Math.abs(r2 - Math.round(r2)) < 1e-9) return String(Math.round(r2));
  return String(r2);
}

function strikeKey(v) {
  // مفتاح تجميع بدقة 0.01 (يدعم 212.5)
  return Math.round(Number(v) * 100) / 100;
}

function distInfo(price, level) {
  if (price == null || level == null) return { pts: null, pct: null, txt: "—" };
  const pts = level - price;
  const pct = price ? (pts / price) * 100 : null;
  const sign = pts > 0 ? "+" : "";
  return {
    pts: pts,
    pct: pct,
    txt: sign + fmtNum(pts, 1) + " pts (" + sign + fmtNum(pct, 2) + "%)",
  };
}

function levelRowsHtml(L, price) {
  const bands = [
    { key: "daily", label: "يومي Daily" },
    { key: "weekly", label: "أسبوعي Weekly" },
    { key: "opx", label: "OPX شهري" },
    { key: "next_opx", label: "OPX القادم" },
  ];
  let html = "";
  bands.forEach(function (b) {
    const block = L[b.key] || {};
    const s = block.support;
    const r = block.resistance;
    const ds = distInfo(price, s);
    const dr = distInfo(price, r);
    html +=
      '<div class="map-row"><span>' +
      b.label +
      '</span><span class="tag-res">قمة ' +
      fmtStrike(r) +
      "</span></div>";
    html +=
      '<div class="map-row"><span style="opacity:.7;font-size:11px">→ للقمة</span><span>' +
      dr.txt +
      "</span></div>";
    html +=
      '<div class="map-row"><span>' +
      b.label +
      '</span><span class="tag-sup">قاع ' +
      fmtStrike(s) +
      "</span></div>";
    html +=
      '<div class="map-row"><span style="opacity:.7;font-size:11px">→ للقاع</span><span>' +
      ds.txt +
      "</span></div>";
  });
  return html;
}





function buildMapSvg(L) {
  const path = (L.path || []).slice();
  const price = L.close;
  const bandDefs = [
    { key: "daily", label: "اليوم" },
    { key: "tomorrow", label: "يوم بعد" },
    { key: "weekly", label: "الأسبوع" },
    { key: "opx", label: "OPX" },
    { key: "next_opx", label: "OPX+" },
  ];

  // price -> { sup: [labels], res: [labels] }
  const byPrice = {};
  function add(price, kind, lab) {
    if (price == null || isNaN(price)) return;
    const k = Math.round(Number(price));
    if (!byPrice[k]) byPrice[k] = { sup: [], res: [] };
    const arr = byPrice[k][kind];
    if (arr.indexOf(lab) < 0) arr.push(lab);
  }
  bandDefs.forEach(function (b) {
    const block = L[b.key] || {};
    add(block.support, "sup", b.label);
    add(block.resistance, "res", b.label);
  });

  const levels = Object.keys(byPrice)
    .map(Number)
    .sort(function (a, b) { return b - a; });

  const nums = levels.slice();
  if (price != null) nums.push(Number(price));
  path.forEach(function (p) {
    if (p.close != null) nums.push(Number(p.close));
  });
  if (!nums.length) {
    return '<p style="color:#94a3b8;padding:20px;text-align:center">لا بيانات رسم بعد</p>';
  }

  let minV = Math.min.apply(null, nums);
  let maxV = Math.max.apply(null, nums);
  const pad = (maxV - minV) * 0.12 || 10;
  minV -= pad;
  maxV += pad;

  const W = 760, H = 380, ML = 150, MR = 150, MT = 16, MB = 20;
  const iw = W - ML - MR, ih = H - MT - MB;

  function yScale(v) {
    return MT + ((maxV - v) / (maxV - minV)) * ih;
  }
  function xScale(i, n) {
    if (n <= 1) return ML + iw * 0.92;
    return ML + (i / (n - 1)) * iw;
  }

  function joinNames(names) {
    return names.join("+");
  }

  function spread(sideItems) {
    sideItems.sort(function (a, b) { return b.v - a.v; });
    const out = [];
    const gap = 16;
    sideItems.forEach(function (it) {
      let y = yScale(it.v);
      if (out.length) {
        const prev = out[out.length - 1];
        if (y - prev.y < gap) y = prev.y + gap;
      }
      if (y > MT + ih) y = MT + ih;
      if (y < MT + 8) y = MT + 8;
      out.push({ v: it.v, text: it.text, y: y, lineY: yScale(it.v) });
    });
    return out;
  }

  const leftItems = [];
  const rightItems = [];
  levels.forEach(function (v) {
    const info = byPrice[v];
    if (info.sup.length) {
      leftItems.push({
        v: v,
        text: v + " قاع " + joinNames(info.sup),
      });
    }
    if (info.res.length) {
      rightItems.push({
        v: v,
        text: v + " قمة " + joinNames(info.res),
      });
    }
  });
  const leftPlaced = spread(leftItems);
  const rightPlaced = spread(rightItems);

  let svg = '<svg viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg">';

  for (let g = 0; g < 5; g++) {
    const yy = MT + (ih * g) / 4;
    svg +=
      '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + yy + '" y2="' + yy +
      '" stroke="#1e293b" stroke-width="1"/>';
  }

  // خطوط: قاع تركواز | قمة بنفسجي | الاثنان معًا رمادي محايد
  levels.forEach(function (v) {
    const info = byPrice[v];
    const isSup = info.sup.length > 0;
    const isRes = info.res.length > 0;
    const y = yScale(v);
    let stroke = "#94a3b8";
    if (isSup && isRes) stroke = "#94a3b8"; // محايد
    else if (isSup) stroke = "#2dd4bf";
    else if (isRes) stroke = "#a78bfa";
    const width = isSup && isRes ? 2.2 : 1.8;
    svg +=
      '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + y + '" y2="' + y +
      '" stroke="' + stroke + '" stroke-dasharray="6 4" stroke-width="' + width + '" opacity="0.95"/>';
  });

  if (path.length) {
    let d = "";
    path.forEach(function (p, i) {
      d += (i === 0 ? "M" : "L") + xScale(i, path.length) + " " + yScale(p.close) + " ";
    });
    svg +=
      '<path d="' + d + '" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    path.forEach(function (p, i) {
      svg +=
        '<circle cx="' + xScale(i, path.length) + '" cy="' + yScale(p.close) +
        '" r="3" fill="#38bdf8"/>';
    });
  }

  leftPlaced.forEach(function (it) {
    svg +=
      '<text x="' + (ML - 8) + '" y="' + (it.y + 4) +
      '" fill="#5eead4" font-size="11" font-weight="600" text-anchor="end">' +
      it.text +
      "</text>";
  });
  rightPlaced.forEach(function (it) {
    svg +=
      '<text x="' + (W - MR + 8) + '" y="' + (it.y + 4) +
      '" fill="#c4b5fd" font-size="11" font-weight="600" text-anchor="start">' +
      it.text +
      "</text>";
  });

  if (price != null) {
    const y = yScale(price);
    const x = path.length ? xScale(path.length - 1, Math.max(path.length, 1)) : ML + iw * 0.92;
    svg +=
      '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + y + '" y2="' + y +
      '" stroke="#f8fafc" stroke-width="1.3" opacity="0.45"/>';
    svg +=
      '<circle cx="' + x + '" cy="' + y + '" r="6" fill="#22d3ee" stroke="#f8fafc" stroke-width="2"/>';
    svg +=
      '<text x="' + x + '" y="' + (y - 14) +
      '" fill="#f8fafc" font-size="13" font-weight="700" text-anchor="middle">' +
      fmtNum(price, 2) +
      "</text>";
  }

  svg += "</svg>";
  return svg;
}



/* ===== Map helpers: arrows + internal chart zoom (TradingView-style) ===== */
var mapZoom = 1;
var mapDragY = null;
var mapDragZoom = null;
var mapLastL = null;

function levelArrow(curr, prev) {
  if (curr == null || prev == null || isNaN(Number(curr)) || isNaN(Number(prev))) return "";
  var c = Number(curr), p = Number(prev);
  // تسامح كسور السترايك
  if (Math.abs(c - p) < 0.001)
    return '<span class="lvl-arrow flat" title="ثابت عند ' + fmtStrike(p) + '">·</span>';
  if (c > p)
    return '<span class="lvl-arrow up" title="رُفع من ' + fmtStrike(p) + ' → ' + fmtStrike(c) + '">↑</span>';
  return '<span class="lvl-arrow down" title="نُزّل من ' + fmtStrike(p) + ' → ' + fmtStrike(c) + '">↓</span>';
}

function readPrevLevels(ticker) {
  try {
    var raw = localStorage.getItem("oi-levels-prev-" + ticker);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function savePrevLevels(ticker, L) {
  try {
    var snap = { as_of: L.as_of || L.updated_at || "", bands: {} };
    ["daily", "tomorrow", "weekly", "opx", "next_opx"].forEach(function (k) {
      var b = L[k] || {};
      snap.bands[k] = { support: b.support, resistance: b.resistance };
    });
    var curKey = "oi-levels-cur-" + ticker;
    var prevKey = "oi-levels-prev-" + ticker;
    var cur = null;
    try { cur = JSON.parse(localStorage.getItem(curKey) || "null"); } catch (e) {}
    if (cur && cur.as_of && snap.as_of && cur.as_of !== snap.as_of) {
      localStorage.setItem(prevKey, JSON.stringify(cur));
    }
    localStorage.setItem(curKey, JSON.stringify(snap));
  } catch (e) {}
}

function getCompareBands(ticker, L) {
  // مصدر وحيد: levels.json من السيرفر (لكل رمز على حدة)
  // لا localStorage — كان يخلط بين SPY وQQQ ويقلب الأسهم
  var out = {};
  ["daily", "tomorrow", "weekly", "opx", "next_opx"].forEach(function (k) {
    var b = L[k] || {};
    out[k] = {
      prev_support: b.prev_support != null ? b.prev_support : null,
      prev_resistance: b.prev_resistance != null ? b.prev_resistance : null,
    };
  });
  return out;
}

function mapScale(L) {
  var bands = ["daily", "tomorrow", "weekly", "opx", "next_opx"];
  var nums = [];
  bands.forEach(function (k) {
    var b = L[k] || {};
    if (b.support != null) nums.push(Number(b.support));
    if (b.resistance != null) nums.push(Number(b.resistance));
  });
  var price = L.close;
  if (price != null && !isNaN(Number(price))) nums.push(Number(price));
  if (!nums.length) return null;
  var minV0 = Math.min.apply(null, nums);
  var maxV0 = Math.max.apply(null, nums);
  var mid = price != null && !isNaN(Number(price)) ? Number(price) : (minV0 + maxV0) / 2;
  // النطاق متماثل حول السعر لكن يغطي أبعد مستوى فوقه وتحته (كان يُحسب بنصف المدى فتختفي مستويات بعيدة)
  var half0 = Math.max(maxV0 - mid, mid - minV0, 2) * 1.06;
  var half = half0 / Math.max(mapZoom, 0.35);
  return { lo: mid - half, hi: mid + half, mid: mid, minV0: minV0, maxV0: maxV0, price: price };
}


/** يوم بعد يوافق الجمعة/نفس انتهاء الأسبوع → نكتفي ببطاقة الأسبوع */

/** ترتيب بطاقات الماب حسب اليوم (جمعة الأسبوع vs باقي الأيام) */
function getMapBandDefs(L) {
  var meta = (L && L.meta) || {};
  var daily = (L && L.daily) || {};
  var weekly = (L && L.weekly) || {};
  var opx = (L && L.opx) || {};
  var nextOpx = (L && L.next_opx) || {};
  var t = (L && L.tomorrow) || {};

  // جمعة هذا الأسبوع عطلة → المرجع الجمعة التالية + تسمية «الأسبوع القادم»
  var weekWord = meta.weekly_is_next_week ? "الأسبوع القادم" : "الأسبوع";

  var weeklyIsOpx = !!(weekly.exp && opx.exp && String(weekly.exp) === String(opx.exp));
  var dailyIsWeekly =
    meta.today_is_weekly === true ||
    !!(daily.exp && weekly.exp && String(daily.exp) === String(weekly.exp));
  var tomorrowIsWeekly =
    meta.tomorrow_merged_weekly === true ||
    t.merged_into === "weekly" ||
    !!(t.exp && weekly.exp && String(t.exp) === String(weekly.exp));

  function addNextOpx(bands) {
    // نفس انتهاء OPX → لا بطاقة مكررة؛ غير ذلك تظهر (حتى بلا بيانات)
    if (opx.exp && nextOpx.exp && String(nextOpx.exp) === String(opx.exp)) return bands;
    bands.push({ key: "next_opx", label: "OPX+" });
    return bands;
  }

  // الجمعة: اليوم = الأسبوع
  if (dailyIsWeekly) {
    var lab = weeklyIsOpx
      ? ("اليوم · " + weekWord + " · OPX")
      : ("اليوم · " + weekWord);
    var bands = [
      { key: "weekly", label: lab },
      { key: "tomorrow", label: "يوم بعد" },
    ];
    if (!weeklyIsOpx) bands.push({ key: "opx", label: "OPX" });
    return addNextOpx(bands);
  }

  // الخميس: يوم بعد = الجمعة = الأسبوع
  if (tomorrowIsWeekly) {
    var lab2 = weeklyIsOpx
      ? ("يوم بعد · " + weekWord + " · OPX")
      : ("يوم بعد · " + weekWord);
    var bands2 = [
      { key: "daily", label: "اليوم" },
      { key: "weekly", label: lab2 },
    ];
    if (!weeklyIsOpx) bands2.push({ key: "opx", label: "OPX" });
    return addNextOpx(bands2);
  }

  // إثنين–أربعاء (وأي يوم عادي)
  var wlab = weeklyIsOpx ? (weekWord + " · OPX") : weekWord;
  var bands3 = [
    { key: "daily", label: "اليوم" },
    { key: "tomorrow", label: "يوم بعد" },
    { key: "weekly", label: wlab },
  ];
  if (!weeklyIsOpx) bands3.push({ key: "opx", label: "OPX" });
  return addNextOpx(bands3);
}


function shouldSkipOpx(L) {
  if (!L) return false;
  var w = L.weekly || {};
  var o = L.opx || {};
  return !!(w.exp && o.exp && w.exp === o.exp);
}

function shouldSkipTomorrow(L) {
  if (!L) return false;
  var t = L.tomorrow || {};
  var w = L.weekly || {};
  var d = L.daily || {};
  if (L.meta && L.meta.tomorrow_merged_weekly) return true;
  if (t.merged_into === "weekly") return true;
  // انتهاء يوم بعد = انتهاء الأسبوع → مدمج في بطاقة الأسبوع
  if (t.exp && w.exp && String(t.exp) === String(w.exp)) return true;
  if (t.support == null && t.resistance == null && !t.exp) return true;
  // تطابق تام مع اليوم → لا بطاقة مكررة
  if (
    t.exp && d.exp && String(t.exp) === String(d.exp) &&
    t.support === d.support && t.resistance === d.resistance
  ) return true;
  return false;
}


function renderMapPanel(L) {
  mapLastL = L;
  const price = L.close;
  const bands = getMapBandDefs(L);

  // قارن أولًا ثم احفظ — حتى لا تُستبدل لقطة الأمس قبل المقارنة
  const cmp = getCompareBands(state.ticker, L);
  savePrevLevels(state.ticker, L);

  const byPrice = {};
  function add(v, kind, lab) {
    if (v == null || isNaN(Number(v))) return;
    const k = strikeKey(v);
    if (!byPrice[k]) byPrice[k] = { sup: false, res: false, labels: [] };
    if (kind === "sup") byPrice[k].sup = true;
    if (kind === "res") byPrice[k].res = true;
    if (lab && byPrice[k].labels.indexOf(lab) < 0) byPrice[k].labels.push(lab);
  }
  bands.forEach(function (b) {
    // تخطي يوم بعد إذا اندمجت مع الأسبوع
    if (b.key === "tomorrow" && shouldSkipTomorrow(L)) return;
    if (b.key === "opx" && shouldSkipOpx(L)) return;
    const block = L[b.key] || {};
    add(block.support, "sup", b.label);
    add(block.resistance, "res", b.label);
  });

  const sc = mapScale(L);
  if (!sc) {
    return '<div class="map-h1"><p style="color:#94a3b8;text-align:center;padding:20px">لا مستويات متاحة</p></div>';
  }
  const lo = sc.lo, hi = sc.hi, span = hi - lo || 1;
  function pct(v) {
    return ((Number(v) - lo) / span) * 100;
  }

  // axis ticks inside chart (TradingView-style)
  var tickCount = 8;
  var ticksHtml = "";
  for (var ti = 0; ti <= tickCount; ti++) {
    var tv = lo + (span * ti) / tickCount;
    var tPct = (ti / tickCount) * 100;
    ticksHtml +=
      '<div class="axis-tick" style="bottom:' + tPct.toFixed(2) + '%">' +
      '<span>' + (Math.round(tv * 100) / 100) + "</span></div>";
  }

  let levelsHtml = "";
  Object.keys(byPrice)
    .map(Number)
    .sort(function (a, b) { return a - b; })
    .forEach(function (strike) {
      if (strike < lo || strike > hi) return;
      const info = byPrice[strike];
      const isDual = info.sup && info.res;
      const cls = isDual ? "dual" : info.res ? "res" : "sup";
      const label = isDual ? fmtStrike(strike) + " قاع+قمة" : fmtStrike(strike);
      levelsHtml +=
        '<div class="level ' + cls + '" style="bottom:' + pct(strike).toFixed(2) + '%">' +
        '<div class="line"></div><div class="end"></div><div class="num">' + label + "</div></div>";
    });

  let pxHtml = "";
  if (price != null && !isNaN(Number(price)) && Number(price) >= lo && Number(price) <= hi) {
    pxHtml =
      '<div class="px" style="bottom:' + pct(price).toFixed(2) + '%"><span>' +
      fmtNum(price, 2) +
      "</span></div>";
  }

  let cards = "";
  bands.forEach(function (b) {
    if (b.key === "tomorrow" && shouldSkipTomorrow(L)) return;
    if (b.key === "opx" && shouldSkipOpx(L)) return;
    const block = L[b.key] || {};
    const peak = block.resistance;
    const floor = block.support;
    // أظهر البطاقة حتى بدون بيانات
    const c = cmp[b.key] || {};
    const aR = levelArrow(peak, c.prev_resistance);
    const aS = levelArrow(floor, c.prev_support);
    cards +=
      '<div class="card"><div class="t">' + b.label + "</div>" +
      '<div class="r res"><span>قمة ' + aR + "</span><b>" + (peak != null ? fmtStrike(peak) : "—") + "</b></div>" +
      '<div class="r sup"><span>قاع ' + aS + "</span><b>" + (floor != null ? fmtStrike(floor) : "—") + "</b></div></div>";
  });

  return (
    '<div class="map-h1">' +
    '<div class="price-card">' +
    '<div class="close-label">الإغلاق</div>' +
    '<b>' + (price != null ? fmtNum(price, 2) : "—") + "</b>" +
    '<p class="map-range-intro">تُحدد القمم والقيعان بناءً على نطاق السترايكات المُختار<br><span class="map-range-sub" dir="rtl">(حيث ALL يمثل النطاق العام)</span></p>' +
    '<div class="map-range-row">' +
      mapRangeChip("30", state.mapRange) +
      mapRangeChip("50", state.mapRange) +
      mapRangeChip("100", state.mapRange) +
      mapRangeChip("ALL", state.mapRange) +
    "</div>" +
    "</div>" +
    '<div class="grid-wrap">' +
    '<div class="stage" id="mapStage">' +
    '<div class="track"></div>' +
    levelsHtml +
    pxHtml +
    '<div class="price-axis" id="mapPriceAxis" title="اسحب للتكبير أو التصغير">' +
    ticksHtml +
    '<div class="axis-grip"></div>' +
    "</div>" +
    '<div class="zoom-badge" id="mapZoomBadge">' + mapZoom.toFixed(1) + "×</div>" +
    "</div>" +
    '<div class="cards">' + cards + "</div>" +
    "</div></div>"
  );
}

function bindMapRangeChips() {
  document.querySelectorAll("[data-map-range]").forEach(function (btn) {
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      setMapRange(btn.getAttribute("data-map-range"));
    };
  });
}

function bindMapZoom(L) {
  bindMapRangeChips();

  mapLastL = L;
  var stage = document.getElementById("mapStage");
  var axis = document.getElementById("mapPriceAxis");
  if (!stage) return;

  function fullRedraw() {
    var body = document.getElementById("mapBody");
    if (!body || !mapLastL) return;
    body.innerHTML = renderMapPanel(mapLastL);
    bindMapZoom(mapLastL);
  }

  function setZoom(next) {
    if (next < 0.5) next = 0.5;
    if (next > 8) next = 8;
    next = Math.round(next * 20) / 20;
    if (next === mapZoom) return false;
    mapZoom = next;
    return true;
  }

  // Wheel → zoom (spread/compress levels around price)
  function onWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    if (setZoom(mapZoom + (e.deltaY > 0 ? -0.3 : 0.3))) fullRedraw();
  }
  stage.addEventListener("wheel", onWheel, { passive: false });
  if (axis) axis.addEventListener("wheel", onWheel, { passive: false });

  // Drag on price axis (window-level move so redraw won't kill drag)
  var dragTarget = axis || stage;
  var dragging = false;
  var startY = 0;
  var startZoom = 1;

  function onWinMove(e) {
    if (!dragging) return;
    var clientY = e.clientY != null ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
    if (clientY == null) return;
    var dy = startY - clientY;
    var next = startZoom + dy / 60;
    if (!setZoom(next)) return;
    // re-render chart while keeping window listeners
    var body = document.getElementById("mapBody");
    if (!body) return;
    body.innerHTML = renderMapPanel(mapLastL);
    // re-get elements (listeners stay on window)
    stage = document.getElementById("mapStage");
    axis = document.getElementById("mapPriceAxis");
    if (stage) stage.addEventListener("wheel", onWheel, { passive: false });
    if (axis) {
      axis.addEventListener("wheel", onWheel, { passive: false });
      axis.style.cursor = "ns-resize";
    }
  }
  function onWinUp() {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp);
    window.removeEventListener("pointercancel", onWinUp);
    window.removeEventListener("mousemove", onWinMove);
    window.removeEventListener("mouseup", onWinUp);
    window.removeEventListener("touchmove", onWinMove);
    window.removeEventListener("touchend", onWinUp);
    fullRedraw();
  }

  function startDrag(clientY) {
    dragging = true;
    startY = clientY;
    startZoom = mapZoom;
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
    window.addEventListener("touchmove", onWinMove, { passive: false });
    window.addEventListener("touchend", onWinUp);
  }

  if (dragTarget) {
    dragTarget.style.cursor = "ns-resize";
    dragTarget.onpointerdown = function (e) {
      e.preventDefault();
      e.stopPropagation();
      startDrag(e.clientY);
    };
    dragTarget.onmousedown = function (e) {
      e.preventDefault();
      startDrag(e.clientY);
    };
    dragTarget.ontouchstart = function (e) {
      if (!e.touches || !e.touches[0]) return;
      startDrag(e.touches[0].clientY);
    };
    dragTarget.ondblclick = function (e) {
      e.preventDefault();
      mapZoom = 1;
      fullRedraw();
    };
  }
}




function mapRangeN(range) {
  if (range === "30") return 30;
  if (range === "50") return 50;
  if (range === "100") return 100;
  return null;
}

function maxOiNearClose(data, exp, close, nEach, dateIdx) {
  var block = data && data.by_expiration && data.by_expiration[exp];
  if (!block || !block.rows || !block.rows.length || dateIdx < 0) {
    return { support: null, resistance: null };
  }
  var rows = block.rows.map(function (r) {
    return {
      strike: Number(r.strike),
      call: Number((r.calls && r.calls[dateIdx]) || 0),
      put: Number((r.puts && r.puts[dateIdx]) || 0),
    };
  });
  // نفس منطق filterStrikes في الجدول: أقرب n*2 سترايك من الإغلاق
  if (close != null && !isNaN(Number(close)) && nEach != null) {
    var c = Number(close);
    rows = rows
      .map(function (r) { return { r: r, dist: Math.abs(r.strike - c) }; })
      .sort(function (a, b) { return a.dist - b.dist; })
      .slice(0, nEach * 2)
      .map(function (x) { return x.r; })
      .sort(function (a, b) { return a.strike - b.strike; });
  } else {
    rows.sort(function (a, b) { return a.strike - b.strike; });
  }
  var maxPut = 0, maxCall = 0, sup = null, res = null;
  rows.forEach(function (r) {
    if (r.put > maxPut) { maxPut = r.put; sup = r.strike; }
    if (r.call > maxCall) { maxCall = r.call; res = r.strike; }
  });
  return { support: sup, resistance: res };
}

async function levelsForMapRange(baseL, range) {
  if (!baseL) return baseL;
  // دائمًا من JSON الرمز الحالي (وليس levels.json فقط) حتى ينعكس SPX/SPXW + آخر سحب
  var data;
  try { data = await loadTicker(state.ticker); } catch (e) { return baseL; }
  var nEach = mapRangeN(range); // null = ALL كل السترايكات
  var close = null;
  if (baseL.close != null && !isNaN(Number(baseL.close)) && Number(baseL.close) > 0) {
    close = Number(baseL.close);
  } else if (typeof effectiveClose === "function") {
    close = effectiveClose(data);
  } else if (data.close != null && !isNaN(Number(data.close)) && Number(data.close) > 0) {
    close = Number(data.close);
  }
  var pullDates = data.pull_dates || [];
  var L2 = JSON.parse(JSON.stringify(baseL));
  L2.mapRange = range || "ALL";
  L2.close = close;
  ["daily", "tomorrow", "weekly", "opx", "next_opx"].forEach(function (key) {
    var band = L2[key] || {};
    var exp = band.exp;
    if (!exp) return;
    // SPX + ثالث جمعة: نفس الواجهة — آخر يوم سحب فقط
    var useLastOnly =
      String(state.ticker).toUpperCase() === "SPX" &&
      typeof isThirdFridayExp === "function" &&
      isThirdFridayExp(exp);
    // أعمدة OI لكل انتهاء مرتبطة بـ pull_dates الخاصة به (انتهاءات اليوم/يوم بعد أقصر من القائمة العامة)
    var blk = data.by_expiration && data.by_expiration[exp];
    var bpd = (blk && blk.pull_dates && blk.pull_dates.length) ? blk.pull_dates : pullDates;
    var idx = bpd.length - 1;
    var pidx = useLastOnly ? -1 : (bpd.length > 1 ? bpd.length - 2 : -1);
    var cur = maxOiNearClose(data, exp, close, nEach, idx);
    var old = pidx >= 0 ? maxOiNearClose(data, exp, close, nEach, pidx) : {};
    L2[key] = Object.assign({}, band, {
      support: cur.support,
      resistance: cur.resistance,
      prev_support: old.support != null ? old.support : null,
      prev_resistance: old.resistance != null ? old.resistance : null,
      range: range || "ALL",
    });
  });
  return L2;
}

function mapRangeChip(val, cur) {
  var active = (cur || "ALL") === val ? " active" : "";
  return (
    '<button type="button" class="map-range-chip' + active + '" data-map-range="' + val + '">' +
    val + "</button>"
  );
}

function mapRangeHint(range) {
  if (range === "30") return "30 — نفس نطاق الواجهة";
  if (range === "50") return "50 — نفس نطاق الواجهة";
  if (range === "100") return "100 سترايك تحت/فوق الإغلاق (الماب فقط)";
  return "ALL — كل السترايكات";
}

function isoFromDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function getArchiveWeekBounds(data) {
  var s = dataSessionFromPull(data);
  var d;
  if (s) {
    d = new Date(s.year, s.month - 1, s.day, 12, 0, 0);
  } else {
    try { d = dataSessionCutoffDate(data); } catch (e) { d = null; }
  }
  if (!d || isNaN(d.getTime())) d = new Date();
  d.setHours(12, 0, 0, 0);
  // أسبوع الأرشفة: اثنين → جمعة. يبقى حتى الاثنين التالي ويتجدد الثلاثاء:
  // (تاريخ الجلسة − يوم) → اثنين ذلك الأسبوع. مثال: 12→16 أكتوبر حتى الاثنين 19، ثم من الثلاثاء 19→23
  var ref = new Date(d);
  ref.setDate(d.getDate() - 1);
  var back = (ref.getDay() + 6) % 7;
  var mon = new Date(ref);
  mon.setDate(ref.getDate() - back);
  mon.setHours(0, 0, 0, 0);
  var fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  fri.setHours(23, 59, 59, 999);
  return { mon: mon, fri: fri, monIso: isoFromDate(mon), friIso: isoFromDate(fri) };
}

/** أسابيع شهر الأرشيف: كل أسبوع (اثنين–جمعة) شريط مستقل، بتواريخ ذلك الشهر فقط */
function archiveMonthWeeks(data) {
  var res = { month: null, year: null, label: "", weeks: [] };
  if (!data) return res;
  var b = getArchiveWeekBounds(data), by = data.by_expiration || {};
  var y = b.fri.getFullYear(), mo = b.fri.getMonth();
  res.month = mo; res.year = y; res.label = AR_MONTHS[mo] + " " + y;
  var all = (data.expirations || Object.keys(by)).filter(function (e) { return by[e]; }).slice().sort();
  var last = new Date(y, mo + 1, 0);
  var cur = new Date(y, mo, 1);
  cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));   // اثنين الأسبوع الأول
  var idx = 0;
  while (cur <= last) {
    idx++;
    var wStart = new Date(cur), wEnd = new Date(cur);
    wEnd.setDate(wEnd.getDate() + 6); wEnd.setHours(23, 59, 59, 999);
    var seen = {};
    var exps = all.filter(function (e) {
      var dt = new Date(String(e) + "T12:00:00");
      if (isNaN(dt.getTime()) || seen[e]) return false;
      seen[e] = 1;
      return dt >= wStart && dt <= wEnd && dt.getMonth() === mo && dt.getFullYear() === y;
    });
    if (exps.length) res.weeks.push({ n: idx, exps: exps });
    cur.setDate(cur.getDate() + 7);
  }
  return res;
}
function archiveExpirations(data) {
  if (!data) return [];
  var bounds = getArchiveWeekBounds(data);
  var by = data.by_expiration || {};
  var all = (data.expirations || Object.keys(by) || []).slice();
  var out = [];
  all.forEach(function (exp) {
    var dt = new Date(String(exp) + "T12:00:00");
    if (isNaN(dt.getTime())) return;
    // ضمن أسبوع الجلسة (اثنين–جمعة)
    if (dt < bounds.mon || dt > bounds.fri) return;
    if (!by[exp]) return;
    out.push(exp);
  });
  // إن لم نجد شيئاً (مثلاً سهم أسبوعي فقط وانتهى قبل الاثنين):
  // أضف أقرب انتهاء جمعة هذا الأسبوع إن وُجد في البيانات
  if (!out.length) {
    all.forEach(function (exp) {
      var dt = new Date(String(exp) + "T12:00:00");
      if (isNaN(dt.getTime()) || !by[exp]) return;
      // نفس الأسبوع بالمقارنة على iso أسبوع
      var mon = new Date(bounds.mon);
      var fri = new Date(bounds.fri);
      // وسّع يومين للتسامح
      mon.setDate(mon.getDate() - 1);
      fri.setDate(fri.getDate() + 2);
      if (dt >= mon && dt <= fri) out.push(exp);
    });
  }
  out.sort();
  // إزالة تكرار
  var seen = {};
  out = out.filter(function (e) {
    if (seen[e]) return false;
    seen[e] = true;
    return true;
  });
  return out;
}

function formatArchDayTitle(exp) {
  try {
    var d = new Date(String(exp) + "T12:00:00");
    var top = d.getDate() + " " + d.toLocaleString("en", { month: "short" });
    var sub = d.toLocaleString("en", { weekday: "short" });
    return { top: top, sub: sub };
  } catch (e) {
    return { top: exp, sub: "" };
  }
}

function getViewRowsForExp(data, exp, daysLimit, strikesLimit) {
  if (!data || !exp || !data.by_expiration || !data.by_expiration[exp]) return null;
  var block = data.by_expiration[exp];
  var basePull = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates.slice()
    : (data.pull_dates || []).slice();
  if (
    String(state.ticker).toUpperCase() === "SPX" &&
    typeof isThirdFridayExp === "function" &&
    isThirdFridayExp(exp)
  ) {
    basePull = filterSpxMonthlyPullDates(basePull);
  }
  var fullDates = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates
    : (data.pull_dates || []);
  var idxFull = basePull.map(function (d) { return fullDates.indexOf(d); });
  var rowsAligned = (block.rows || []).map(function (r) {
    return {
      strike: r.strike,
      calls: idxFull.map(function (i) { return i >= 0 ? (r.calls[i] || 0) : 0; }),
      puts: idxFull.map(function (i) { return i >= 0 ? (r.puts[i] || 0) : 0; }),
    };
  });
  var trimmed = trimLeadingZeroColumns(basePull, rowsAligned);
  basePull = trimmed.pullDates;
  rowsAligned = trimmed.rows;
  var pullDates = lastN(basePull, daysLimit);
  if (!pullDates.length) return null;
  var idx = pullDates.map(function (d) { return basePull.indexOf(d); });
  var rows = rowsAligned.map(function (r) {
    return {
      strike: r.strike,
      calls: idx.map(function (i) { return i >= 0 ? r.calls[i] : 0; }),
      puts: idx.map(function (i) { return i >= 0 ? r.puts[i] : 0; }),
    };
  });
  var close = effectiveClose(data);
  rows = filterStrikes(rows, close, strikesLimit);
  return { pullDates: pullDates, rows: rows, close: close };
}

function buildOneArchiveTableHtml(exp, view, showDelta) {
  if (!view || !view.rows || !view.rows.length) {
    return '<div class="archive-empty">لا بيانات</div>';
  }
  var pullDates = view.pullDates;
  var rows = view.rows;
  var close = view.close;
  var canDelta = showDelta && pullDates.length >= 2;
  var lastI = pullDates.length - 1;
  var prevI = pullDates.length - 2;
  var title = formatArchDayTitle(exp);
  var html = '<div class="archive-day">';
  html += '<div class="archive-day-head"><span>' + title.top + '</span><em>' + title.sub + '</em></div>';
  html += '<div class="table-scroll"><table class="oi" style="width:auto;max-width:none"><thead><tr>';
  if (canDelta) html += '<th class="delta">Δ</th>';
  for (var i = pullDates.length - 1; i >= 0; i--) {
    var f = formatPullDate(pullDates[i]);
    html += "<th>" + f.top + '<br><span class="subh">' + f.sub + "</span></th>";
  }
  html += '<th class="strike">STRIKE</th>';
  for (var j = 0; j < pullDates.length; j++) {
    var f2 = formatPullDate(pullDates[j]);
    html += "<th>" + f2.top + '<br><span class="subh">' + f2.sub + "</span></th>";
  }
  if (canDelta) html += '<th class="delta">Δ</th>';
  html += "</tr></thead><tbody>";

  var callMax = [], putMax = [];
  for (var ci = 0; ci < pullDates.length; ci++) {
    var mc = 0, mp = 0;
    rows.forEach(function (r) {
      var cv = r.calls[ci] || 0, pv = r.puts[ci] || 0;
      if (cv > mc) mc = cv;
      if (pv > mp) mp = pv;
    });
    callMax.push(mc);
    putMax.push(mp);
  }
  var deltaCallMax = 0, deltaPutMax = 0;
  if (canDelta) {
    rows.forEach(function (r) {
      var dc = positiveDelta(r.calls[lastI], r.calls[prevI]);
      var dp = positiveDelta(r.puts[lastI], r.puts[prevI]);
      if (dc != null && dc > deltaCallMax) deltaCallMax = dc;
      if (dp != null && dp > deltaPutMax) deltaPutMax = dp;
    });
  }
  var barDone = false;
  rows.forEach(function (r, ri) {
    if (close != null && !barDone && r.strike > close) {
      html += greenBarRow(canDelta, pullDates.length, close);
      barDone = true;
    }
    var zebra = ri % 2 === 1 ? " zebra" : "";
    var above = close != null && r.strike > close;
    var below = close != null && r.strike < close;
    var callCls = below || (close != null && r.strike === close) ? "itm" : "otm";
    var putCls = above || (close != null && r.strike === close) ? "itm" : "otm";
    html += '<tr class="' + zebra + '">';
    if (canDelta) {
      var d = positiveDelta(r.calls[lastI], r.calls[prevI]);
      var maxCls = d != null && deltaCallMax > 0 && d === deltaCallMax ? " max-oi" : "";
      html += '<td class="delta' + maxCls + '">' + (d != null ? d.toLocaleString() : "") + "</td>";
    }
    for (var ii = pullDates.length - 1; ii >= 0; ii--) {
      var cv = r.calls[ii] || 0;
      var maxC = callMax[ii] > 0 && cv === callMax[ii] ? " max-oi" : "";
      html += '<td class="' + callCls + maxC + '">' + cv.toLocaleString() + "</td>";
    }
    html += '<td class="strike">' + r.strike + "</td>";
    for (var pi = 0; pi < pullDates.length; pi++) {
      var pv = r.puts[pi] || 0;
      var maxP = putMax[pi] > 0 && pv === putMax[pi] ? " max-oi" : "";
      html += '<td class="' + putCls + maxP + '">' + pv.toLocaleString() + "</td>";
    }
    if (canDelta) {
      var dp2 = positiveDelta(r.puts[lastI], r.puts[prevI]);
      var maxDp = dp2 != null && deltaPutMax > 0 && dp2 === deltaPutMax ? " max-oi" : "";
      html += '<td class="delta' + maxDp + '">' + (dp2 != null ? dp2.toLocaleString() : "") + "</td>";
    }
    html += "</tr>";
  });
  if (close != null && !barDone) {
    html += greenBarRow(canDelta, pullDates.length, close);
  }
  html += "</tbody></table></div></div>";
  return html;
}


function renderArchChips() {
  var daysHost = $("#archDaysRow");
  var strikesHost = $("#archStrikesRow");
  if (daysHost) {
    daysHost.innerHTML = "";
    ["2", "3", "5", "10", "ALL"].forEach(function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (String(state.archDays) === opt ? " active" : "");
      b.textContent = opt;
      b.onclick = function () {
        state.archDays = opt;
        renderArchChips();
      };
      daysHost.appendChild(b);
    });
  }
  if (strikesHost) {
    strikesHost.innerHTML = "";
    ["30", "50", "ALL"].forEach(function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (String(state.archStrikes) === opt ? " active" : "");
      b.textContent = opt;
      b.onclick = function () {
        state.archStrikes = opt;
        renderArchChips();
      };
      strikesHost.appendChild(b);
    });
  }
  var db = $("#archDeltaBtn");
  if (db) db.classList.toggle("active", !!state.archShowDelta);
}

function updateArchSelectHint() {
  /* hint removed by design */
}

function renderArchDateRow() {
  var row = $("#archDateRow");
  if (!row) return;
  row.innerHTML = "";
  var model = state.archModel;
  if (!model || !model.weeks.length) {
    row.innerHTML = '<span class="archive-empty-inline">لا تواريخ لهذا الشهر</span>';
    return;
  }
  model.weeks.forEach(function (w) {
    var box = document.createElement("div");
    box.className = "arch-week";
    var d1 = new Date(String(w.exps[0]) + "T12:00:00"), d2 = new Date(String(w.exps[w.exps.length - 1]) + "T12:00:00");
    var ttl = document.createElement("div");
    ttl.className = "arch-week-title";
    ttl.textContent = "الأسبوع " + w.n + " · " + (w.exps.length > 1 ? d1.getDate() + "–" + d2.getDate() : d1.getDate()) + " " + AR_MONTHS[d1.getMonth()];
    box.appendChild(ttl);
    var sel = state.archSelected || [];
    var allOn = w.exps.every(function (e) { return sel.indexOf(e) >= 0; });
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "arch-date-chip arch-all-chip" + (allOn ? " active" : "");
    allBtn.innerHTML = '<span class="d-top">الكل</span>';
    allBtn.onclick = function () {
      var cur = (state.archSelected || []).slice();
      if (allOn) cur = cur.filter(function (e) { return w.exps.indexOf(e) < 0; });
      else w.exps.forEach(function (e) { if (cur.indexOf(e) < 0) cur.push(e); });
      cur.sort();
      state.archSelected = cur;
      renderArchDateRow();
    };
    box.appendChild(allBtn);
    w.exps.forEach(function (exp) {
      var t = formatArchDayTitle(exp);
      var kd = ""; try { kd = tawafuqColKind(exp); } catch (e0) {}
      var on = sel.indexOf(exp) >= 0;
      var bt = document.createElement("button");
      bt.type = "button";
      bt.className = "arch-date-chip" + (on ? " active" : "") + (kd ? " arch-k-" + kd : "");
      bt.innerHTML = '<span class="d-top">' + t.top + '</span><span class="d-sub">' + t.sub + "</span>";
      bt.onclick = function () {
        var arr = (state.archSelected || []).slice();
        var i = arr.indexOf(exp);
        if (i >= 0) arr.splice(i, 1); else arr.push(exp);
        arr.sort();
        state.archSelected = arr;
        renderArchDateRow();
      };
      box.appendChild(bt);
    });
    row.appendChild(box);
  });
}

function openArchive() {
  var modal = $("#archiveModal");
  if (!modal) return;
  state.archSelected = [];
  state.archShowDelta = false;
  state.archShowGrowth = false;
  modal.classList.remove("hidden");
  var title = $("#archiveTitle");
  var sub = $("#archiveSub");
  try { state.archModel = archiveMonthWeeks(state.cache[state.ticker]); } catch (e0) { state.archModel = null; }
  if (title) title.textContent = "الأرشيف — " + (state.ticker || "") + (state.archModel && state.archModel.label ? " · " + state.archModel.label : "");
  if (sub) sub.textContent = "اختر تاريخًا";
  // دائمًا ارسم شرائح Days/Strikes أولًا
  try { renderArchChips(); } catch (e1) { console.error("renderArchChips", e1); }
  try { renderArchDateRow(); } catch (e3) { console.error("renderArchDateRow", e3); }
  var modeSel = $("#archExportMode");
  if (modeSel) modeSel.value = state.archExportMode || "multi";
  var db = $("#archDeltaBtn");
  if (db) {
    db.classList.remove("active");
    db.onclick = function () {
      state.archShowDelta = !state.archShowDelta;
      db.classList.toggle("active", !!state.archShowDelta);
    };
  }
  var gb = $("#archGrowthBtn");
  if (gb) {
    gb.classList.remove("active");
    gb.onclick = function () {
      state.archShowGrowth = !state.archShowGrowth;
      gb.classList.toggle("active", !!state.archShowGrowth);
    };
  }
  var modeSel2 = $("#archExportMode");
  if (modeSel2) {
    modeSel2.onchange = function () {
      state.archExportMode = modeSel2.value || "multi";
    };
  }
  var expBtn = $("#archExportBtn");
  if (expBtn) {
    expBtn.onclick = function () {
      if (typeof exportArchiveExcel === "function") exportArchiveExcel();
    };
  }
  updateArchSelectHint();
}

function closeArchive() {
  var modal = $("#archiveModal");
  if (modal) modal.classList.add("hidden");
  state.archSelected = [];
}


function expIsoSortKey(exp) {
  try {
    var p = String(exp).split("-").map(Number);
    if (p.length < 3) return 0;
    return new Date(p[0], p[1] - 1, p[2]).getTime();
  } catch (e) {
    return 0;
  }
}

/** إزالة أعمدة الأصفار من نهاية الجدول */
function trimTrailingZeroColumns(pullDates, rows) {
  if (!pullDates || !pullDates.length || !rows || !rows.length) {
    return { pullDates: pullDates || [], rows: rows || [] };
  }
  var n = pullDates.length, last = n - 1, found = false;
  for (var i = n - 1; i >= 0; i--) {
    for (var r = 0; r < rows.length; r++) {
      var c = rows[r].calls && rows[r].calls[i] != null ? Number(rows[r].calls[i]) : 0;
      var pt = rows[r].puts && rows[r].puts[i] != null ? Number(rows[r].puts[i]) : 0;
      if (c > 0 || pt > 0) { last = i; found = true; break; }
    }
    if (found) break;
  }
  if (!found) last = 0;
  if (last === n - 1) return { pullDates: pullDates, rows: rows };
  return {
    pullDates: pullDates.slice(0, last + 1),
    rows: rows.map(function (row) {
      return {
        strike: row.strike,
        calls: (row.calls || []).slice(0, last + 1),
        puts: (row.puts || []).slice(0, last + 1),
      };
    }),
  };
}

/**
 * عرض أرشيف لتاريخ انتهاء:
 * - أعمدة السحب فقط حتى يوم الانتهاء (شاملًا) بدون أيام لاحقة
 * - بدون أعمدة أصفار في البداية أو النهاية
 * - Days = آخر N أيام سحب حقيقية لهذا الانتهاء
 * - Δ = آخر عمود مقابل الذي قبله
 */
function getArchiveViewRows(data, exp, daysLimit, strikesLimit) {
  if (!data || !exp) return null;
  var block = data.by_expiration[exp];
  if (!block) return null;

  var basePull = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates.slice()
    : (data.pull_dates || []).slice();

  if (
    String(state.ticker).toUpperCase() === "SPX" &&
    typeof isThirdFridayExp === "function" &&
    isThirdFridayExp(exp)
  ) {
    basePull = filterSpxMonthlyPullDates(basePull);
  }
  if (
    String(state.ticker).toUpperCase() === "NDX" &&
    typeof isThirdFridayExp === "function" &&
    isThirdFridayExp(exp) &&
    typeof filterSpxMonthlyPullDates === "function"
  ) {
    basePull = filterSpxMonthlyPullDates(basePull);
  }

  // فقط أيام السحب في أو قبل تاريخ الانتهاء
  var expKey = expIsoSortKey(exp);
  basePull = basePull.filter(function (pd) {
    return pullDateSortKey(pd) <= expKey;
  });
  if (!basePull.length) return null;

  var fullDates = (block.pull_dates && block.pull_dates.length)
    ? block.pull_dates
    : (data.pull_dates || []);
  var idxFull = basePull.map(function (d) { return fullDates.indexOf(d); });
  var rowsAligned = (block.rows || []).map(function (r) {
    return {
      strike: r.strike,
      calls: idxFull.map(function (i) { return i >= 0 ? (r.calls[i] || 0) : 0; }),
      puts: idxFull.map(function (i) { return i >= 0 ? (r.puts[i] || 0) : 0; }),
    };
  });

  if (typeof trimLeadingZeroColumns === "function") {
    var t1 = trimLeadingZeroColumns(basePull, rowsAligned);
    basePull = t1.pullDates;
    rowsAligned = t1.rows;
  }
  var t2 = trimTrailingZeroColumns(basePull, rowsAligned);
  basePull = t2.pullDates;
  rowsAligned = t2.rows;
  if (!basePull.length) return null;

  var pullDates = lastN(basePull, daysLimit);
  if (!pullDates.length) return null;
  var idx = pullDates.map(function (d) { return basePull.indexOf(d); });
  var rows = rowsAligned.map(function (r) {
    return {
      strike: r.strike,
      calls: idx.map(function (i) { return i >= 0 ? (r.calls[i] || 0) : 0; }),
      puts: idx.map(function (i) { return i >= 0 ? (r.puts[i] || 0) : 0; }),
    };
  });
  rows = filterStrikes(rows, data.close, strikesLimit);
  if (!rows.length) return null;
  return { pullDates: pullDates, rows: rows, close: data.close, expiration: exp };
}

async function exportArchiveExcel() {
  var data = state.cache[state.ticker];
  if (!data) {
    setStatus("لا بيانات للتصدير", "err");
    return;
  }
  var weekExps = [];
  try { (archiveMonthWeeks(data).weeks || []).forEach(function (w) { weekExps = weekExps.concat(w.exps); }); } catch (e0) {}
  var exps = (state.archSelected && state.archSelected.length)
    ? state.archSelected.filter(function (e) { return weekExps.indexOf(e) >= 0; })
    : [];
  if (!weekExps.length) {
    setStatus("الأرشيف فارغ", "err");
    return;
  }
  if (!exps.length) {
    setStatus("حدّد تاريخًا واحدًا على الأقل من البطاقات", "err");
    return;
  }
  if (typeof ExcelJS === "undefined") {
    setStatus("مكتبة Excel غير محمّلة", "err");
    return;
  }
  if (typeof writeOiTableToSheet !== "function" || typeof getArchiveViewRows !== "function") {
    setStatus("دوال التصدير غير متوفرة", "err");
    return;
  }

  var mode = state.archExportMode || "multi";
  var showDelta = !!state.archShowDelta;
  var showGrowthA = !!state.archShowGrowth;
  function keyDay(e) { var k = ""; try { k = tawafuqColKind(e); } catch (x) {} return k === "fri" || k === "opx" || k === "eom"; }
  var edays = state.archDays || "2";
  var estrikes = state.archStrikes || "30";
  var GAP = 4;

  var wb = new ExcelJS.Workbook();
  wb.creator = "Oi Archive";

  if (mode === "ba") {
    var wsBa2 = wb.addWorksheet("قبل وبعد", { views: [{ rightToLeft: true }] });
    var lastBa2 = writeBeforeAfterToSheet(wsBa2, 2, 2, data, state.ticker, "ALL", estrikes, showDelta, exps);
    if (lastBa2 <= 2) { setStatus("لا تحديث بعد الانتهاء للتواريخ المحددة", "err"); return; }
  } else if (mode === "multi") {
    exps.forEach(function (exp) {
      var view = getArchiveViewRows(data, exp, edays, estrikes);
      if (!view) return;
      var ws = wb.addWorksheet(String(exp).slice(0, 31), {
        views: [{ rightToLeft: true }],
      });
      writeOiTableToSheet(ws, 2, 2, view, state.ticker, showDelta, showGrowthA && keyDay(exp), state.growthDays, { noRank: !keyDay(exp) });
    });
  } else {
    var ws = wb.addWorksheet("Archive", {
      views: [{ rightToLeft: true }],
    });
    var col = 2;
    exps.forEach(function (exp) {
      var view = getArchiveViewRows(data, exp, edays, estrikes);
      if (!view) return;
      var last = writeOiTableToSheet(ws, 2, col, view, state.ticker, showDelta, showGrowthA && keyDay(exp), state.growthDays, { noRank: !keyDay(exp) });
      col = last + 1 + GAP;
    });
  }

  if (!wb.worksheets.length) {
    setStatus("لا بيانات للجداول المختارة", "err");
    return;
  }

  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  var stamp = new Date().toISOString().slice(0, 10);
  var fname =
    state.ticker +
    "_Archive_D" +
    edays +
    "_S" +
    estrikes +
    "_" +
    stamp +
    ".xlsx";
  if (typeof saveAs === "function") {
    saveAs(blob, fname);
  } else {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  setStatus("تم التصدير", "muted");
}



async function openMap() {
  levelsCache = null; // إعادة قراءة levels + حساب من JSON الحالي

  const modal = $("#mapModal");
  const body = $("#mapBody");
  const title = $("#mapTitle");
  const sub = $("#mapSub");
  if (!modal) return;
  modal.classList.remove("hidden"); modal.style.display = ""; modal.setAttribute("aria-hidden", "false");
  body.innerHTML = '<p style="color:#94a3b8">جاري تحميل المستويات…</p>';
  try {
    const all = await loadLevels();
    var raw = (all.tickers || {})[state.ticker];
    if (!raw) throw new Error("لا مستويات لـ " + state.ticker);
    // عبّئ الإغلاق من بيانات الرمز إن كان levels بلا close
    try {
      var td = await loadTicker(state.ticker);
      if ((!raw.close || isNaN(Number(raw.close))) && td) {
        var cx = (typeof effectiveClose === "function") ? effectiveClose(td) : td.close;
        if (cx != null && !isNaN(Number(cx))) raw.close = Number(cx);
      }
    } catch (e2) {}
    mapZoom = 1;
    mapRawL = raw;
    const L = await levelsForMapRange(raw, state.mapRange || "ALL");
    title.textContent = state.ticker;
    if (sub) {
      sub.textContent = "";
      sub.style.display = "none";
    }
    body.innerHTML = renderMapPanel(L);
    bindMapZoom(L);
  } catch (e) {
    body.innerHTML =
      '<p style="color:#f87171">' + (e.message || e) + "</p>" +
      '<p style="color:#94a3b8;font-size:12px">بعد دمج الكود، شغّل Actions مرة لينشأ data/levels.json</p>';
  }
}

async function setMapRange(range) {
  state.mapRange = range || "ALL";
  if (!$("#mapModal") || $("#mapModal").classList.contains("hidden")) return;
  const body = $("#mapBody");
  if (!body) return;
  body.innerHTML = '<p style="color:#94a3b8">جاري تحديث النطاق…</p>';
  try {
    var raw = mapRawL;
    if (!raw) {
      const all = await loadLevels();
      raw = (all.tickers || {})[state.ticker];
      mapRawL = raw;
    }
    if (!raw) throw new Error("لا بيانات");
    mapZoom = 1;
    const L = await levelsForMapRange(raw, state.mapRange);
    body.innerHTML = renderMapPanel(L);
    bindMapZoom(L);
  } catch (e) {
    body.innerHTML = '<p style="color:#f87171">' + (e.message || e) + "</p>";
  }
}

function closeMap() {
  const modal = $("#mapModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    modal.style.display = "none";
  }
}



// —— تعليقات خاصة (Web3Forms) ——
// يوضع هنا مفتاح https://web3forms.com بعد التسجيل (Access Key)
const FEEDBACK_ACCESS_KEY = "53716803-35b4-4c15-a27e-0cde07f2e555";

function openFeedback() {
  const modal = $("#feedbackModal");
  if (!modal) return;
  const st = $("#fbStatus");
  if (st) st.textContent = "";
  modal.classList.remove("hidden"); modal.style.display = ""; modal.setAttribute("aria-hidden", "false");
}
function closeFeedback() {
  const modal = $("#feedbackModal");
  if (modal) modal.classList.add("hidden");
}
async function submitFeedback(e) {
  if (e && e.preventDefault) e.preventDefault();
  const st = $("#fbStatus");
  const msg = ($("#fbMsg") && $("#fbMsg").value || "").trim();
  const name = ($("#fbName") && $("#fbName").value || "").trim();
  if (!msg) {
    if (st) st.textContent = "يلزم كتابة التعليق أولًا";
    return;
  }
  if (!FEEDBACK_ACCESS_KEY) {
    if (st) st.textContent = "لم يُضبط مفتاح الإرسال بعد (Web3Forms)";
    setStatus("يلزم إضافة FEEDBACK_ACCESS_KEY في app.js", "err");
    return;
  }
  if (st) st.textContent = "جاري الإرسال…";
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: FEEDBACK_ACCESS_KEY,
        subject: "Oi Web — تعليق جديد",
        from_name: name || "زائر Oi",
        message: msg,
        ticker: state.ticker || "",
      }),
    });
    const data = await res.json();
    if (data.success) {
      if (st) st.textContent = "✅ تم الإرسال — شكرًا لك";
      if ($("#fbMsg")) $("#fbMsg").value = "";
      if ($("#fbName")) $("#fbName").value = "";
      setStatus("✅ وصل تعليقك", "ok");
      setTimeout(closeFeedback, 1200);
    } else {
      if (st) st.textContent = data.message || "تعذر الإرسال";
    }
  } catch (err) {
    if (st) st.textContent = "خطأ شبكة — تُعاد المحاولة لاحقًا";
  }
}


(function bindDdReposition() {
  function repo() {
    try {
      var eBtn = document.getElementById("expDdBtn");
      var eList = document.getElementById("expDdList");
      if (eBtn && eList && eBtn.classList.contains("open") && !eList.hidden) placeFixedDropdown(eBtn, eList);
      var sBtn = document.getElementById("stocksDdBtn");
      var sList = document.getElementById("stocksDdList");
      if (sBtn && sList && sBtn.classList.contains("open") && !sList.hidden) placeFixedDropdown(sBtn, sList);
    } catch (e) {}
  }
  window.addEventListener("resize", repo);
  window.addEventListener("scroll", repo, true);
})();

document.addEventListener("DOMContentLoaded", init);

// ========== Reports ==========
function getViewForExp(data, expiration, daysLimit, strikesLimit) {
  // نفس مسار الجداول الفعلية: تواريخ سحب كل انتهاء + محاذاة الأعمدة (إصلاح قراءة الأيام الأولى من الأسبوع)
  try { return getViewRowsFor(data, expiration, daysLimit, strikesLimit); } catch (e) { return null; }
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

function confidenceOf(top) {
  if (!top) return { level: "low", label: "منخفضة" };
  if (top.score >= 12) return { level: "high", label: "عالية" };
  if (top.score >= 7) return { level: "mid", label: "متوسطة" };
  return { level: "low", label: "منخفضة" };
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

function repRowsHtml(items, valueLabel) {
  if (!items || !items.length) {
    return '<tr><td colspan="4" style="color:var(--gray)">لا نتائج</td></tr>';
  }
  return items
    .map(function (x, i) {
      return (
        "<tr><td>" +
        (i + 1) +
        "</td><td>" +
        x.strike +
        "</td><td>" +
        Number(x.value).toLocaleString() +
        "</td><td>" +
        (x.exp || "") +
        "</td></tr>"
      );
    })
    .join("");
}


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

function buildInsightSentence(rep, ticker) {
  var top = rep.top;
  var topCall = rep.topCall;
  var topPut = rep.topPut;
  if (!top && !topCall && !topPut) {
    return {
      line1: "لا يظهر مستوى بارز ضمن التواريخ المختارة",
      line2: "",
      line3: "",
      side: "",
      strike: null,
      conf: "",
    };
  }

  var conf = (rep.conf && rep.conf.label) || "—";
  var lead = top || topCall || topPut;
  var strike = lead.strike;
  var callScore = topCall ? topCall.score : 0;
  var putScore = topPut ? topPut.score : 0;
  var side = "مشترك";
  if (callScore > putScore + 2) side = "Call";
  else if (putScore > callScore + 2) side = "Put";
  else if (top && top.side) side = top.side;

  // سطر 1: أبرز مستوى + السترايك فقط (بدون اسم الرمز وبدون ثقة)
  var line1 = "أبرز مستوى: " + strike;

  // سطر 2: كما هو
  var line2 = "";
  if (topCall && topPut) {
    line2 =
      "Call الأقوى: " +
      topCall.strike +
      " (" +
      topCall.score +
      ") · Put الأقوى: " +
      topPut.strike +
      " (" +
      topPut.score +
      ")";
  } else if (topCall) {
    line2 = "Call الأقوى: " + topCall.strike + " (" + topCall.score + ")";
  } else if (topPut) {
    line2 = "Put الأقوى: " + topPut.strike + " (" + topPut.score + ")";
  }

  // سطر 3: محذوف
  var line3 = "";

  return {
    line1: line1,
    line2: line2,
    line3: line3,
    side: side,
    strike: strike,
    conf: conf,
  };
}

function moveIcon(move) {
  if (move === "↑") return '<span class="mv-up">↑</span>';
  if (move === "↓") return '<span class="mv-down">↓</span>';
  if (move === "ثابت") return '<span class="mv-flat">●</span>';
  return move || "—";
}

/** يعزل المقاطع اللاتينية (Call · OPX Oct · Strike …) داخل النص العربي حتى لا تنقلب ترتيب الجمل */
function repBidi(html) {
  return String(html).replace(/>([^<>]+)</g, function (m, t) {
    if (!/[A-Za-z]/.test(t) || t.indexOf("\u2066") >= 0) return m;   // رقم المقابل (≈ SPX …) يبقى كما هو
    var parts = t.split(/(&[#a-zA-Z0-9]+;)/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].charAt(0) === "&") continue;
      parts[i] = parts[i].replace(/[A-Za-z][A-Za-z0-9+%.\-\/]*(?: [A-Za-z0-9][A-Za-z0-9+%.\-\/]*)*/g, function (w) { return '<bdi dir="ltr">' + w + "</bdi>"; });
    }
    return ">" + parts.join("") + "<";
  });
}
function renderReportsResult(rep, ticker) {
  return repBidi(renderReportsResultRaw(rep, ticker));
}
function renderReportsResultRaw(rep, ticker) {
  var topSet = {};
  ["call", "put"].forEach(function (sd) { ((rep.topDelta && rep.topDelta[sd]) || []).forEach(function (t) { topSet[sd + "|" + t.exp + "|" + t.strike] = 1; }); });
  function isTop(sd, exp, strike) { return !!topSet[sd + "|" + exp + "|" + strike]; }
  var STAR_H = ' <span class="rep-top-star" title="الأعلى تزايدًا في هذا اليوم">★</span>';
  // ترتيب التزايد داخل كل يوم: الأول نجمة ذهبية، والثاني والثالث والرابع دوائر ملونة
  var rkMap = {};
  [["call", "deltaCall"], ["put", "deltaPut"]].forEach(function (cfg) {
    var byE = {}, seenK = {};
    (rep[cfg[1]] || []).concat((rep.opxLv && rep.opxLv[cfg[1]]) || []).forEach(function (x) {
      var kk = x.exp + "|" + x.strike; if (seenK[kk]) return; seenK[kk] = 1;
      (byE[x.exp] = byE[x.exp] || []).push(x);
    });
    Object.keys(byE).forEach(function (e) {
      byE[e].slice().sort(function (a, b) { return b.value - a.value; }).forEach(function (x, i) { rkMap[cfg[0] + "|" + e + "|" + x.strike] = i + 1; });
    });
  });
  function rankMark(sd, exp, strike) {
    var r = rkMap[sd + "|" + exp + "|" + strike];
    return r === 1 ? STAR_H : "";
  }
  var insight = buildInsightSentence(rep, ticker || state.ticker);
  if (typeof insight === "string") {
    insight = { line1: insight, line2: "", line3: "", side: "", strike: null, conf: "" };
  }
  rep.insightText = [insight.line1, insight.line2, insight.line3].filter(Boolean).join(" | ");

  var html = "";
  html += '<div class="rep-insight rep-insight-soft">';
  html += '<div class="rep-insight-title">الملخص</div>';
  html += '<div class="rep-insight-main">🎯 ' + insight.line1 + "</div>";
  if (insight.line2) html += '<div class="rep-insight-sub">⚖️ ' + insight.line2 + "</div>";
    html += '<div class="rep-insight-meta">';
  html += "G = " + (rep.gDays >= 999 ? "كل الأيام" : rep.gDays + " يوم") + " · أعلى " + rep.topN + " لكل جهة";
  if (rep.conf && rep.conf.label) {
    html +=
      ' · <span class="rep-badge ' +
      (rep.conf.level || "") +
      '">' +
      rep.conf.label +
      "</span>";
  }
  html += "</div></div>";

  function off(n) { return !!(rep.off && rep.off[n]); }
  function secX(n) { return '<button type="button" class="rep-sec-x" data-hk="sec|' + n + '" title="إخفاء هذا الجدول">×</button>'; }
  function mTable(label, rows, cls, sec) {
    if (!groupRows(rows).length) return "";
    var h = '<div class="rep-sub ' + cls + '">' + label + '</div>';
    h += '<table class="rep-table rep-m" dir="rtl"><thead><tr><th class="rep-xh"></th><th>#</th><th>اليوم</th><th>القيمة</th><th>Strike</th></tr></thead><tbody>';
    var g = groupRows(rows), topMap = {};
    if (sec === "d" && rep.topDelta) (rep.topDelta[cls === "c" ? "call" : "put"] || []).forEach(function (t) { topMap[t.exp + "|" + t.strike] = 1; });
    var STAR = '<span class="rep-top-star" title="الأعلى تزايدًا في هذا اليوم">★</span>';
    if (!g.length) {
      h += '<tr><td colspan="5" class="rep-empty">لا نتائج</td></tr>';
    } else {
      g.forEach(function (x, i) {
        var days;
        var sdk0 = cls === "c" ? "call" : "put", under = "";
        if (x.items.length === 1) {
          days = x.items[0].exp ? reportDayLabel(x.items[0].exp) : SUM_HTML;
          if (sec === "d" && x.items[0].exp) { var mk1 = rankMark(sdk0, x.items[0].exp, x.strike); if (mk1) under = '<div class="rk-under">' + mk1 + "</div>"; }
        }
        else days = x.items.map(function (it) {
          var k = ""; try { k = tawafuqColKind(it.exp); } catch (e) {}
          return '<span class="rep-dc rep-dc-' + (k || "oth") + '">' + reportDayLabel(it.exp) + " <b>+" + Number(it.value).toLocaleString() + "</b>" + (sec === "d" ? rankMark(sdk0, it.exp, x.strike) : "") + "</span>";
        }).join("");
        h += '<tr><td class="rep-xcell"><button type="button" class="rep-x-btn" data-hk="' + repKey(sec, cls, x.strike, "*") + '" title="حذف من التقرير">×</button></td><td>' + (i + 1) +
          '</td><td class="rep-dcs">' + days + "</td><td>" + Number(x.value).toLocaleString() + under + "</td><td>" + strikeHtml(x.strike) + "</td></tr>";
      });
    }
    return h + "</tbody></table>";
  }
  function metricCol(title, callRows, putRows, sec) {
    if (off(sec)) return "";
    if (!(callRows && callRows.length) && !(putRows && putRows.length)) return "";
    return '<div class="rep-card rep-secbox">' + secX(sec) + '<div class="rep-card-title center">' + title + "</div>" + (sec === "d" ? '<div class="rep-cf-sub">★ = الأعلى تزايدًا في ذلك اليوم</div>' : "") +
      mTable("CALL", callRows, "c", sec) + mTable("PUT", putRows, "p", sec) + "</div>";
  }
  html += '<div class="rep-find"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
    '<input id="repFind" type="text" autocomplete="off" placeholder="ابحث في التقرير" value="' + String(window.__repFindQ || "").replace(/"/g, "") + '" /><span id="repFindCount"></span></div>';
  if (rep.hiddenCount) html += '<button type="button" class="rep-restore">استعادة المحذوف (' + rep.hiddenCount + ')</button>';
  html += '<div class="rep-spacer"></div>';
  var lvPk = levelCard("peak", rep.peaks, rep.repPeak), lvTr = levelCard("trough", rep.troughs, rep.repTrough);
  if (lvPk || lvTr) html += '<div class="rep-grid rep-grid-2 rep-grid-rtl">' + lvTr + lvPk + "</div>";
  html += opxSection();
  if (rep.skipped && rep.skipped.length) {
    html += '<div class="rep-note">أيام بلا بيانات OI في آخر سحب: ' + rep.skipped.map(reportDayLabel).join(" · ") + "</div>";
  }

  html += '<div class="rep-spacer"></div>';
  function sideCard(name, cls, dRows, gRows) {
    var sd = off("d") ? "" : mTable("التزايد", dRows, cls, "d");
    var sg = off("g") ? "" : mTable("النمو", gRows, cls, "g");
    if (!sd && !sg) return "";
    return '<div class="rep-card rep-secbox rep-side-card"><div class="rep-card-title">' + name + '</div><div class="rep-dg-grid">' +
      (sd ? '<div class="rep-dg-col">' + sd + "</div>" : "") + (sg ? '<div class="rep-dg-col">' + sg + "</div>" : "") + "</div></div>";
  }
  var cPut = sideCard("Put", "p", rep.deltaPut, rep.growthPut);
  var cCall = sideCard("Call", "c", rep.deltaCall, rep.growthCall);
  html += cPut + cCall;
  html += dualCard();
  html += dBothTbl();
  // المجموع — النسخة الذكية
  window.__repSig = rep.sigmaSmart || null;
  var STN = { "new": "فتح جديد", grow: "متزايد", hold: "ثابت", build: "تراكم تدريجي", drop: "تناقص", fade: "تبخّر", norm: "عادي" };
  function sigTbl(side, label, rows) {
    if (!rows || !rows.length) return "";
    var h = '<div class="rep-sub ' + (side === "call" ? "c" : "p") + '">' + label + "</div>";
    h += '<table class="rep-table rep-sig" dir="rtl"><thead><tr><th class="rep-xh"></th><th>Strike</th><th title="المجموع">' + SUM_HTML + '</th><th>أين وُضع مجموع التزايد؟</th><th>التركّز</th><th>حالة المركز</th></tr></thead><tbody>';
    if (!rows.length) h += '<tr><td colspan="6" class="rep-empty">لا نتائج</td></tr>';
    rows.forEach(function (x, i) {
      var mainD = x.dist.filter(function (d) { return d.share >= 2; }), restD = x.dist.filter(function (d) { return d.share < 2; });
      if (!mainD.length) { mainD = x.dist; restD = []; }
      var restSum = restD.reduce(function (a, d) { return a + d.delta; }, 0);
      var chips = mainD.map(function (d) {
        var k = ""; try { k = tawafuqColKind(d.exp); } catch (e) {}
        return '<span class="rep-dc rep-dc-' + (k || "oth") + '" data-exp="' + d.exp + '" title="' + d.share + "% — " + String(d.note).replace(/"/g, "") + '"><i class="rep-dot rep-dot-' + d.state + '"></i>' +
          reportDayLabel(d.exp) + " <b>" + Number(d.delta).toLocaleString() + "</b>" + rankMark(side, d.exp, x.strike) + "</span>";
      }).join("") + (restD.length ? '<span class="rep-dc rep-dc-oth" title="أيام نسبتها أقل من 2%">أخرى ' + restD.length + " <b>" + Number(restSum).toLocaleString() + "</b></span>" : "");
      h += '<tr class="rep-sigrow" data-sig="' + side + "|" + i + '"><td class="rep-xcell"><button type="button" class="rep-x-btn" data-hk="' + repKey("s", side, x.strike, "-") + '" title="حذف">×</button></td><td>' +
        strikeHtml(x.strike) + "</td><td>" + fmtK(x.tot) + '</td><td class="rep-dcs">' + chips + "</td><td>" + (x.conc ? "مركّز" : "موزّع") +
        '</td><td><span class="rep-st rep-st-' + x.state + '">' + STN[x.state] + (daysState(x.state) ? " " + x.stateDays + " يوم" : "") +
        '</span><div class="rep-st-day">' + reportDayLabel(x.topExp) + "</div></td></tr>";
    });
    return h + '</tbody></table><div class="rep-mem" id="repMem_' + side + '"></div>';
  }
  function bothTbl(ssm) {
    var cm = {}, out = [];
    function ex(x) { return (x.items || []).map(function (it) { return it.exp; }).filter(Boolean); }
    (ssm.call || []).forEach(function (x, i) { cm[x.strike] = { r: i + 1, t: x.tot, e: ex(x) }; });
    (ssm.put || []).forEach(function (x, i) { if (cm[x.strike]) out.push({ strike: x.strike, c: cm[x.strike], p: { r: i + 1, t: x.tot, e: ex(x) } }); });
    if (!out.length) return "";
    out.sort(function (a, b) { return (b.c.t + b.p.t) - (a.c.t + a.p.t); });
    var h = '<div class="rep-card rep-secbox rep-both-card"><div class="rep-card-title">مجموع الجهتين</div><table class="rep-table rep-both" dir="rtl"><thead><tr><th>Strike</th><th>Call · الترتيب</th><th>Call · المجموع</th><th>Put · الترتيب</th><th>Put · المجموع</th><th>الإجمالي</th><th>الأيام</th></tr></thead><tbody>';
    out.forEach(function (x) {
      h += "<tr><td>" + strikeHtml(x.strike) + "</td><td>" + x.c.r + "</td><td>" + fmtK(x.c.t) + "</td><td>" + x.p.r + "</td><td>" + fmtK(x.p.t) + "</td><td><b>" + fmtK(x.c.t + x.p.t) + "</b></td><td class=\"rep-dayl\">" + x.c.e.concat(x.p.e.filter(function (e) { return x.c.e.indexOf(e) < 0; })).sort().map(function (e) { return reportDayLabel(e); }).join("، ") + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function posTbl(ps) {
    var all = posMerged(ps);
    if (!all.length) return "";
    var h = '<details class="rep-fold rep-pos-fold"><summary class="rep-fold-sum">المراكز المفتوحة <small>كم يوم منذ الفتح وهل تتزايد؟</small></summary>';
    [["call", "CALL", "c"], ["put", "PUT", "p"]].forEach(function (cfg) {
      var rows = all.filter(function (q) { return q.side === cfg[0]; });
      if (!rows.length) return;
      h += '<div class="rep-sub ' + cfg[2] + '">' + cfg[1] + '</div><table class="rep-table rep-pos" dir="rtl"><thead><tr><th class="rep-xh"></th><th>Strike</th><th>اليوم</th><th>فُتح</th><th>الآن</th><th>منذ</th><th>الحالة</th></tr></thead><tbody>';
      rows.forEach(function (q) {
        h += '<tr><td class="rep-xcell"><button type="button" class="rep-x-btn" data-hk="' + repKey("pos", q.side, q.f.strike, q.f.exp) + '" title="حذف">×</button></td><td>' + strikeHtml(q.f.strike) +
          "</td><td>" + reportDayLabel(q.f.exp) + rankMark(q.side, q.f.exp, q.f.strike) + "</td><td>" + fmtK(q.f.openV) + "</td><td>" + fmtK(q.f.now) +
          "</td><td>" + (q.f.since ? q.f.since + " يوم" : "اليوم") + '</td><td><span class="rep-st rep-st-' + q.f.state + '">' + STN[q.f.state] + "</span></td></tr>";
      });
      h += "</tbody></table>";
    });
    return h + '<div class="rep-legend"><b>الحالة</b> تُقاس على نفس اليوم وحده: فتح جديد = قفز من قاعدة صغيرة في آخر سحب · متزايد / ثابت = بعد الفتح · تناقص · تبخّر = نزل تحت 40% مما فُتح · تراكم تدريجي = زيادة بطيئة بلا فتح مفاجئ.</div>' + "</details>";
  }
  var posHtml = "";
  if (!off("s")) {
    var ssm = rep.sigmaSmart || { call: [], put: [], positions: null };
    var sigInner = sigTbl("call", "CALL", ssm.call) + sigTbl("put", "PUT", ssm.put);
    posHtml = posTbl(ssm.positions);
    if (sigInner) {
      html += '<div class="rep-card rep-secbox rep-sig-card" id="repSigCard">' + secX("s") + '<div class="rep-card-title center">' + SUM_HTML + ' المجموع</div>' +
        ((rep.sigmaCustomExps || []).length ? '<div class="rep-note">على التواريخ التي حددتَها: ' + rep.sigmaCustomExps.map(function (e) { return reportDayLabel(e); }).join("، ") + "</div>" : "") + sigInner +
        '</div>';
    }
    html += bothTbl(ssm);
  }


  // ===== التوافق: كل ما اجتمع على السترايك في مكان واحد =====
  function sdTag(sd) { return '<i class="rep-sd rep-sd-' + (sd === "call" ? "c" : "p") + '">' + (sd === "call" ? "Call" : "Put") + "</i>"; }
  function cfRow(label, chips) { return chips ? '<div class="rep-cf-row"><span class="rep-cf-l">' + label + '</span><span class="rep-cf-chips">' + chips + "</span></div>" : ""; }
  function cfCard(m) {
    var hasPk = m.wall.some(function (w) { return w.side === "call"; }), hasTr = m.wall.some(function (w) { return w.side === "put"; });
    var tag = hasPk && hasTr ? "قمة + قاع" : hasPk ? "قمة" : hasTr ? "قاع" : (m.sides.call && m.sides.put ? "Call + Put" : m.sides.call ? "Call" : "Put");
    var dots = ""; for (var q = 0; q < 5; q++) dots += q < m.factors ? "●" : "○";
    var h = '<div class="rep-cf-card"><button type="button" class="rep-x-btn rep-cf-x" data-hk="' + repKey("cf", "x", m.strike, "*") + '" title="حذف من التوافق">×</button>';
    h += '<div class="rep-cf-head"><span class="rep-cf-k">' + m.strike + '</span><span class="rep-cf-tag">' + tag + '</span><span class="rep-cf-str" title="عدد العوامل المجتمعة">' + dots + " " + m.factors + "/5</span></div>";
    if (eqText(m.strike)) h += '<div class="rep-cf-eq">' + eqText(m.strike) + "</div>";
    var mk = cfMerge(m);
    h += cfRow("الأعلى تزايدًا", m.td.filter(function (t) { return !mk[t.side + "|" + t.exp]; }).map(function (t) {
      return '<span class="rep-cfc">' + sdTag(t.side) + reportDayLabel(t.exp) + rankMark(t.side, t.exp, m.strike) + " <b>+" + Number(t.value).toLocaleString() + "</b> <em>OI " + Number(t.oi).toLocaleString() + "</em></span>";
    }).join(""));
    h += cfRow("الجدار", m.wall.map(function (w) {
      return '<span class="rep-cfc cf-wall">' + (w.side === "call" ? "قمة" : "قاع") + " " + reportDayLabel(w.exp) + " <em>OI " + Number(w.oi).toLocaleString() + "</em> " + arrowHtml(w) +
        (w.top ? ' <b>+' + Number(w.top.value).toLocaleString() + "</b>" + STAR_H : "") + "</span>";
    }).join(""));
    h += cfRow("النمو", m.gr.map(function (g) {
      return '<span class="rep-cfc">' + sdTag(g.side) + "G" + g.rank + (g.exp ? " " + reportDayLabel(g.exp) : "") + "</span>";
    }).join(""));
    h += cfRow("المجموع", m.sg.map(function (g) {
      var st = cfState(g);
      return '<span class="rep-cfc">' + sdTag(g.side) + SUM_HTML + g.rank + " <b>" + fmtK(g.tot) + "</b>" + (st ? ' <span class="rep-st rep-st-' + g.state + '">' + st + "</span>" : "") + "</span>";
    }).join(""));
    h += cfRow("تزايد مزدوج", m.dual.map(function (d) {
      return '<span class="rep-cfc">' + reportDayLabel(d.exp) + " <b>Call +" + Number(d.call).toLocaleString() + "</b> <b>Put +" + Number(d.put).toLocaleString() + "</b></span>";
    }).join(""));
    if (m.sg.length) h += '<button type="button" class="rep-goto" data-goto="repSigCard">تفاصيل التمركز ↓</button>';
    return h + "</div>";
  }
  if (!off("cf") && (rep.confluence || []).length) {
    html += '<div class="rep-card rep-secbox rep-cf">' + secX("cf") + '<div class="rep-card-title center">التوافق</div><div class="rep-cf-grid">';
    rep.confluence.forEach(function (m) { html += cfCard(m); });
    html += "</div></div>";
  }

  function arrowHtml(x) {
    if (x.move === "↑") return '<span class="mv-up">▲ ' + Math.abs(x.diff) + "</span>";
    if (x.move === "↓") return '<span class="mv-down">▼ ' + Math.abs(x.diff) + "</span>";
    if (x.move === "ثابت") return '<span class="mv-flat">▬ ثابت</span>';
    return '<span class="mv-flat">—</span>';
  }



  function levelCard(kind, rows, repeated, pfx) {
    var isPeak = kind === "peak";
    var title = (pfx ? "OPXs · " : "") + (isPeak ? "القمم · Call" : "القيعان · Put");
    var cls = isPeak ? "rep-card-peak" : "rep-card-trough";
    var repLabel = isPeak ? "قمم متكررة" : "قيعان متكررة";
    var skk = pfx ? (isPeak ? "ok" : "ot") : (isPeak ? "k" : "t");
    if (off(skk) || !rows || !rows.length) return "";
    var h = '<div class="rep-card rep-secbox ' + cls + '">' + secX(skk);
    h += '<div class="rep-card-title center">' + title + "</div>";
    h +=
      '<table class="rep-table rep-lv" dir="rtl"><thead><tr>' +
      "<th class=\"rep-xh\"></th><th>اليوم</th><th>المسار</th><th>الحركة</th><th>OI</th><th>Strike</th>" +
      "</tr></thead><tbody>";
    if (!rows || !rows.length) {
      h += '<tr><td colspan="6" class="rep-empty">—</td></tr>';
    } else {
      rows.forEach(function (x) {
        h += '<tr><td class="rep-xcell"><button type="button" class="rep-x-btn" data-hk="' + repKey(skk, isPeak ? "c" : "p", x.strike, x.exp) + '" title="حذف من التقرير">×</button></td><td>' +
          (pfx ? "OPX " + new Date(String(x.exp) + "T12:00:00").toLocaleString("en", { month: "short" }) : reportDayLabel(x.exp)) + '</td><td class="rep-path">' + (x.path && x.path.length > 1 ? x.path.join(" → ") : "—") + "</td><td>" + arrowHtml(x) + "</td><td>" +
          (x.oi != null ? Number(x.oi).toLocaleString() : "—") +
          (x.delta ? '<small class="rep-dl ' + (x.delta > 0 ? "up" : "dn") + '">' + (x.delta > 0 ? "+" : "") + Number(x.delta).toLocaleString() + "</small>" : "") +
          (function () { var mk = x.strike != null ? rankMark(isPeak ? "call" : "put", x.exp, x.strike) : ""; return mk ? '<div class="rk-under">' + mk + "</div>" : ""; })() +
          "</td><td>" + (x.strike != null ? strikeHtml(x.strike) : "—") + "</td></tr>";
      });
    }
    h += "</tbody></table>";
    if (repeated && repeated.length) {
      h += '<div class="rep-repeat-title">' + repLabel + "</div>";
      h += '<div class="rep-repeat-list">';
      repeated.forEach(function (r) {
        h += '<div class="rep-rep-row"><span class="rep-rep-k">' + r.strike + '</span><span class="rep-rep-n">×' + r.days.length + '</span><span class="rep-rep-days">' +
          r.days.slice().sort().map(function (d) { return '<span class="rep-rep-d">' + (pfx ? "OPX " + new Date(String(d) + "T12:00:00").toLocaleString("en", { month: "short" }) : reportDayLabel(d)) + "</span>"; }).join("") + "</span></div>";
      });
      h += "</div>";
    }
    h += "</div>";
    return h;
  }

  // مستويات بعيدة (مدى طويل) — خارج نافذة السترايكات
  html += '<div class="rep-spacer"></div>';
  var _htmlMain = html;
  html = "";
  html += '<details class="rep-card rep-secbox rep-far-card rep-fold">' + secX("f") + '<summary class="rep-fold-sum">مدى طويل · جدران خارج النافذة</summary>';
  if (rep.far && rep.far.length) {
    html += '<table class="rep-table" dir="rtl"><thead><tr><th class="rep-xh"></th><th>اليوم</th><th>البعد</th><th>OI</th><th>Strike</th><th>النوع</th></tr></thead><tbody>';
    rep.far.forEach(function (f) {
      html += '<tr><td class="rep-xcell"><button type="button" class="rep-x-btn" data-hk="' + repKey("f", f.kind, f.strike, f.exp) + '" title="حذف من التقرير">×</button></td><td>' + reportDayLabel(f.exp) + "</td><td>" +
        (f.dist != null ? (f.dist > 0 ? "+" : "") + f.dist.toFixed(1) + "%" : "—") + "</td><td>" + Number(f.oi).toLocaleString() + "</td><td>" + strikeHtml(f.strike) + "</td><td>" + f.kind + "</td></tr>";
    });
    html += "</tbody></table>";
  } else {
    html += '<div class="rep-empty" style="padding:10px">لا جدران أقوى خارج النافذة الحالية</div>';
  }
  html += "</details>";

  function opxSection() {
    var o = rep.opxLv;
    if (!o) return "";
    var pk = levelCard("peak", o.peaks, o.repPeak, "opx"), tr = levelCard("trough", o.troughs, o.repTrough, "opx");
    if (!pk && !tr) return "";
    return '<div class="rep-sec-h">OPXs</div><div class="rep-grid rep-grid-2 rep-grid-rtl">' + tr + pk + "</div>";
  }
  function dualCard() {
    var L = (rep.dual || []).slice();
    if (!L.length || off("dz")) return "";
    L.sort(function (a, b) { return a.exp < b.exp ? -1 : a.exp > b.exp ? 1 : (b.call + b.put) - (a.call + a.put); });
    var h = '<div class="rep-card rep-secbox rep-dual-card">' + secX("dz") + '<div class="rep-card-title">تزايد مزدوج</div><table class="rep-table rep-dual" dir="rtl"><thead><tr><th class="rep-xh"></th><th>اليوم</th><th>Strike</th><th>Call · التزايد</th><th>Put · التزايد</th><th>الإجمالي</th></tr></thead><tbody>';
    L.forEach(function (d) {
      h += '<tr><td class="rep-xcell"><button type="button" class="rep-x-btn" data-hk="' + repKey("dz", "x", d.strike, d.exp) + '" title="حذف من التقرير">×</button></td><td>' + reportDayLabel(d.exp) + "</td><td>" + strikeHtml(d.strike) +
        "</td><td>+" + Number(d.call).toLocaleString() + "</td><td>+" + Number(d.put).toLocaleString() + "</td><td><b>+" + Number(d.call + d.put).toLocaleString() + "</b></td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function dBothTbl() {
    function agg(list) { var m = {}; (list || []).forEach(function (x) { var e = m[x.strike] || (m[x.strike] = { strike: x.strike, tot: 0, exps: [] }); e.tot += x.value; if (e.exps.indexOf(x.exp) < 0) e.exps.push(x.exp); }); return m; }
    function dayList(a, b) { var all = a.concat(b.filter(function (e) { return a.indexOf(e) < 0; })).sort(); return all.map(function (e) { return reportDayLabel(e); }).join("، "); }
    var cm = agg(rep.deltaCall), pm = agg(rep.deltaPut), crank = {}, prank = {};
    Object.keys(cm).map(function (k) { return cm[k]; }).sort(function (a, b) { return b.tot - a.tot; }).forEach(function (e, i) { crank[e.strike] = i + 1; });
    Object.keys(pm).map(function (k) { return pm[k]; }).sort(function (a, b) { return b.tot - a.tot; }).forEach(function (e, i) { prank[e.strike] = i + 1; });
    var out = Object.keys(cm).filter(function (k) { return pm[k]; }).map(function (k) { return { strike: cm[k].strike, c: cm[k], p: pm[k] }; });
    if (!out.length) return "";
    out.sort(function (a, b) { return (b.c.tot + b.p.tot) - (a.c.tot + a.p.tot); });
    var h = '<div class="rep-card rep-secbox rep-both-card"><div class="rep-card-title">تزايد الجهتين</div><table class="rep-table rep-both" dir="rtl"><thead><tr><th>Strike</th><th>Call · الترتيب</th><th>Call · التزايد</th><th>Put · الترتيب</th><th>Put · التزايد</th><th>الإجمالي</th><th>الأيام</th></tr></thead><tbody>';
    out.forEach(function (x) {
      h += "<tr><td>" + strikeHtml(x.strike) + "</td><td>" + crank[x.strike] + "</td><td>+" + Number(x.c.tot).toLocaleString() + "</td><td>" + prank[x.strike] + "</td><td>+" + Number(x.p.tot).toLocaleString() + "</td><td><b>+" + Number(x.c.tot + x.p.tot).toLocaleString() + "</b></td><td class=\"rep-dayl\">" + dayList(x.c.exps, x.p.exps) + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }

  function scoreTable(list, sdk) {
    var h =
      '<table class="rep-table rep-sc" dir="rtl"><thead><tr>' +
      "<th class=\"rep-xh\"></th><th>#</th><th>Strike</th><th>النقاط</th><th>تقاطع</th><th>الأيام</th><th>لماذا</th>" +
      "</tr></thead><tbody>";
    if (!list || !list.length) {
      h += '<tr><td colspan="7" class="rep-empty">—</td></tr>';
    } else {
      list.forEach(function (s, i) {
        var ord = function (r) { r = String(r); return r.indexOf(SUM_TXT) === 0 ? 2 : r.indexOf("Δ") === 0 ? 0 : r.indexOf("G") === 0 ? 1 : 3; };
        var chips = (s.reasons || []).slice().sort(function (x, y) { return ord(x) - ord(y); })
          .map(function (r) {
            var t = String(r), cls = "chip-reason " + (ord(t) === 0 ? "chip-d" : ord(t) === 1 ? "chip-g" : ord(t) === 2 ? "chip-s" : "chip-lv");
            if (ord(t) === 3) {   // قمة/قاع توافقت مع جمعة/أسبوع · OPX · نهاية الشهر → بلون عمود ذلك اليوم
              var rx = s.rexp && s.rexp[r], rk0 = ""; try { rk0 = rx ? tawafuqColKind(rx) : ""; } catch (e9) {}
              if (rk0 === "fri" || rk0 === "opx" || rk0 === "eom") cls += " chip-k-" + rk0;
            }
            t = t.replace(SUM_TXT, SUM_HTML).replace(/▲ (\d+)/, '<span class="mv-up">▲ $1</span>').replace(/▼ (\d+)/, '<span class="mv-down">▼ $1</span>').replace(/▬ ثابت/, '<span class="mv-flat">▬ ثابت</span>');
            return '<span class="' + cls + '">' + t + "</span>";
          }).join("");
        h +=
          "<tr class='" +
          (i === 0 ? "rep-top-row" : "") +
          "'><td class=\"rep-xcell\"><button type=\"button\" class=\"rep-x-btn\" data-hk=\"" + repKey("q", sdk, s.strike, "-") + "\" title=\"حذف من الترتيب\">×</button></td><td>" +
          (i + 1) +
          "</td><td>" +
          strikeHtml(s.strike) +
          "</td><td><b>" +
          s.score +
          "</b></td><td>" +
          (s.srcCount >= 2
            ? '<span class="rep-x rep-x' + s.srcCount + '">' + s.srcCount + "/4</span>"
            : '<span class="rep-x0">1/4</span>') +
          "</td><td class='rep-days-cell'>" +
          Object.keys(s.exps || {}).sort().filter(function (e) {
            var k = ""; try { k = tawafuqColKind(e); } catch (er) {}
            return k === "fri" || k === "opx" || k === "eom";
          }).map(function (e) {
            return '<span class="rep-nd rep-nd-' + tawafuqColKind(e) + '">' + reportDayLabel(e).replace(/ - /g, "<br>") + "</span>";
          }).join("") +
          "</td><td class='rep-reasons'><div class='rep-why'>" +
          chips +
          "</div></td></tr>";
      });
    }
    h += "</tbody></table>";
    return h;
  }

  var farHtml = (off("f") || !(rep.far && rep.far.length)) ? "" : html;
  html = _htmlMain;
  html += '<div class="rep-spacer"></div>';
  html += '<div class="rep-grid rep-grid-2 rep-grid-rtl">';
  if (!off("sc") && (rep.scoresCall || []).length) html += '<div class="rep-card rep-secbox rep-score-card">' + secX("sc") + '<div class="rep-card-title center">ترتيب المستويات · Call</div>' + scoreTable(rep.scoresCall, "c") + "</div>";
  if (!off("sp") && (rep.scoresPut || []).length) html += '<div class="rep-card rep-secbox rep-score-card">' + secX("sp") + '<div class="rep-card-title center">ترتيب المستويات · Put</div>' + scoreTable(rep.scoresPut, "p") + "</div>";
  html += "</div>";

  html += '<div class="rep-spacer"></div>';
  html += '<div id="repLensBox" class="rep-lens-box"></div>';

  if (posHtml || farHtml) html += '<div class="rep-spacer"></div><div class="rep-bottom-folds">' + posHtml + farHtml + "</div>";   // المراكز المفتوحة + المدى الطويل أسفل التقرير

  return html;
}

function analyzeStrikeLens(data, selectedExps, strike, daysLimit, strikesLimit, gDays) {
  var target = Number(strike);
  if (isNaN(target)) return { error: "يلزم إدخال رقم سترايك صحيح" };
  var close = data.close;
  var lines = [];
  var found = 0;
  (selectedExps || []).forEach(function (exp) {
    var view = getViewForExp(data, exp, daysLimit, strikesLimit);
    if (!view) view = null;
    var row = null;
    if (view) {
      for (var i = 0; i < view.rows.length; i++) {
        if (Number(view.rows[i].strike) === target) {
          row = view.rows[i];
          break;
        }
      }
    }
    if (!row) {
      var block = data.by_expiration && data.by_expiration[exp];
      if (block && block.rows) {
        for (var j = 0; j < block.rows.length; j++) {
          if (Number(block.rows[j].strike) === target) {
            var fullDates = data.pull_dates || [];
            var pullDates = lastN(fullDates, daysLimit);
            var idx = pullDates.map(function (d) { return fullDates.indexOf(d); });
            row = {
              strike: target,
              calls: idx.map(function (ix) {
                return ix >= 0 ? block.rows[j].calls[ix] || 0 : 0;
              }),
              puts: idx.map(function (ix) {
                return ix >= 0 ? block.rows[j].puts[ix] || 0 : 0;
              }),
            };
            view = { pullDates: pullDates, rows: [row], close: close, expiration: exp };
            break;
          }
        }
      }
    }
    if (!row || !view) return;
    found++;
    var n = view.pullDates.length;
    var lastI = n - 1;
    var prevI = n - 2;
    var g = Math.max(1, parseInt(gDays, 10) || 3);
    lines.push({
      exp: exp,
      callLast: row.calls[lastI] || 0,
      putLast: row.puts[lastI] || 0,
      dCall: prevI >= 0 ? positiveDelta(row.calls[lastI], row.calls[prevI]) : null,
      dPut: prevI >= 0 ? positiveDelta(row.puts[lastI], row.puts[prevI]) : null,
      gCall: positiveGrowth(row.calls, g),
      gPut: positiveGrowth(row.puts, g),
    });
  });
  if (!found) return { error: "السترايك " + target + " غير موجود في التواريخ المحددة" };

  var maxPut = 0, maxCall = 0, maxPutExp = "", maxCallExp = "";
  lines.forEach(function (L) {
    if (L.putLast > maxPut) { maxPut = L.putLast; maxPutExp = L.exp; }
    if (L.callLast > maxCall) { maxCall = L.callLast; maxCallExp = L.exp; }
  });

  var bullets = [];
  bullets.push("عدد الانتهاءات: " + found);
  if (close != null) {
    var pos =
      target > close ? "فوق الإغلاق" : target < close ? "تحت الإغلاق" : "عند الإغلاق";
    bullets.push("الموقع: " + pos + " (إغلاق " + Number(close).toLocaleString() + ")");
  }
  if (maxCall > 0) {
    bullets.push(
      "أعلى Call OI: " + maxCall.toLocaleString() + " @ " + formatExpAr(maxCallExp)
    );
  }
  if (maxPut > 0) {
    bullets.push(
      "أعلى Put OI: " + maxPut.toLocaleString() + " @ " + formatExpAr(maxPutExp)
    );
  }
  if (maxCall >= maxPut && maxCall > 0) {
    bullets.push("الخلاصة: تركّز Call — غالبًا مقاومة يُختبر عند الاقتراب");
  } else if (maxPut > 0) {
    bullets.push("الخلاصة: تركّز Put — غالبًا دعم يُحترم عند اللمس");
  }

  return { strike: target, lines: lines, bullets: bullets, close: close };
}

function renderLensResult(res) {
  if (!res) return "";
  if (res.error) return '<div class="rep-lens-err">' + res.error + "</div>";
  var h = '<div class="rep-card rep-lens-card">';
  h += '<div class="rep-card-title center">🔍 ' + res.strike + "</div>";
  h += '<ul class="rep-lens-bullets">';
  (res.bullets || []).forEach(function (b) {
    h += "<li>" + b + "</li>";
  });
  h += "</ul>";
  h +=
    '<table class="rep-table" dir="ltr"><thead><tr>' +
    "<th>اليوم</th><th>Call OI</th><th>Put OI</th><th>Δ Call</th><th>Δ Put</th><th>G Call</th><th>G Put</th>" +
    "</tr></thead><tbody>";
  (res.lines || []).forEach(function (L) {
    h +=
      "<tr><td>" +
      formatExpAr(L.exp) +
      "</td><td>" +
      Number(L.callLast).toLocaleString() +
      "</td><td>" +
      Number(L.putLast).toLocaleString() +
      "</td><td>" +
      (L.dCall != null ? Number(L.dCall).toLocaleString() : "—") +
      "</td><td>" +
      (L.dPut != null ? Number(L.dPut).toLocaleString() : "—") +
      "</td><td>" +
      (L.gCall != null ? Number(L.gCall).toLocaleString() : "—") +
      "</td><td>" +
      (L.gPut != null ? Number(L.gPut).toLocaleString() : "—") +
      "</td></tr>";
  });
  h += "</tbody></table></div>";
  return h;
}

function paintCell(cell, argb, bold, align) {
  if (!cell) return;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb } };
  cell.font = { name: "Calibri", size: 11, bold: !!bold };
  cell.alignment = {
    horizontal: align || "center",
    vertical: "middle",
    wrapText: true,
  };
}


/** إعدادات التقرير المحفوظة: تربط نافذة التقرير بتبويب التقرير في تصدير Excel */


/** التوافق: يقابل السترايك بالمؤشر المرتبط (SPY↔SPX · QQQ↔NDX) بنسبة الإغلاقين من بيانات التطبيق نفسها */
/* نسب موقع spyconverter.com المستخرجة من لقطاتك (آخر تحديث للموقع 6-10-2026):
   SPY 800 → /ES 8073.43 | QQQ 765 → NDX 31451.76  — حدّثها هنا عند تغيّر نسبة الموقع */
var EQ_FIXED = { asOf: "2026-10-13", SPY_ES: 10.091785, QQQ_NDX: 41.112312 };
async function ensureEq() {
  try {
    var t = state.ticker, own = state.cache && state.cache[t], items = [];
    function okClose(d) { return d && d.close != null && isFinite(Number(d.close)) && Number(d.close) > 0; }
    state.esPerSpy = EQ_FIXED.SPY_ES;
    // ثابت: النسبة بين الأداة ومقابلها تُحسب من إغلاقيهما في بيانات التطبيق (مثل SPX/SPY)،
    // والقيمة الثابتة احتياط فقط إن غاب أحد الإغلاقين أو خرجت النسبة عن المعقول (±5%).
    function closeRatio(otherT, fixed, ownIsFund) {
      return loadTicker(otherT).then(function (od) {
        if (!okClose(od) || !okClose(own)) return fixed;
        var r = ownIsFund ? od.close / own.close : own.close / od.close;   // مؤشر ÷ صندوق
        var ref = fixed;
        return r > ref * 0.95 && r < ref * 1.05 ? r : fixed;
      }).catch(function () { return fixed; });
    }
    if (t === "SPY") {
      try { var spx = await loadTicker("SPX"); if (okClose(spx) && okClose(own)) items.push({ to: "SPX", ratio: spx.close / own.close, dec: 2 }); } catch (e1) {}
    } else if (t === "QQQ") {
      var qr = await closeRatio("NDX", EQ_FIXED.QQQ_NDX, true);
      items.push({ to: "NDX", ratio: qr, dec: 2 });
    } else if (t === "SPX") {
      try { var spy = await loadTicker("SPY"); if (okClose(spy) && okClose(own)) items.push({ to: "SPY", ratio: spy.close / own.close, dec: 2 }); } catch (e2) {}
    } else if (t === "NDX") {
      var qr2 = 1 / (await closeRatio("QQQ", EQ_FIXED.QQQ_NDX, false));
      items.push({ to: "QQQ", ratio: qr2, dec: 2 });
    }
    // موقع spyconverter عبر /api/ratio: نسبة ES (لـ SPY/SPX) + تاريخ آخر تحديث للنسبة في الموقع (لكل الرموز)
    var esSrc = "none", esUpd = null, esVal = null, siteNdx = null;
    try {
      var ctl = new AbortController();
      var tmo = setTimeout(function () { ctl.abort(); }, 4000);
      var rr0 = await fetch("/api/ratio", { cache: "no-store", signal: ctl.signal });
      clearTimeout(tmo);
      var js = rr0.ok ? await rr0.json() : null;
      if (js) {
        if (js.updated) esUpd = js.updated;
        if (js.es && js.es > 9.9 && js.es < 10.4) { esVal = js.es; esSrc = "live"; }
        if (js.ndx && js.ndx > 40 && js.ndx < 42.5) siteNdx = js.ndx;
        if (esUpd || esVal || siteNdx) { try { localStorage.setItem("oi_ratio_site", JSON.stringify({ es: esVal, ndx: siteNdx, updated: esUpd, savedAt: Date.now() })); } catch (e6) {} }
      }
    } catch (e5) {}
    if (!esUpd || !esVal) {
      try {
        var sv = JSON.parse(localStorage.getItem("oi_ratio_site") || "null");
        if (sv) {
          if (!esUpd && sv.updated) esUpd = sv.updated;
          if (!esVal && sv.es && sv.es > 9.9 && sv.es < 10.4) { esVal = sv.es; esSrc = "saved"; }
          if (!siteNdx && sv.ndx && sv.ndx > 40 && sv.ndx < 42.5) siteNdx = sv.ndx;
        }
      } catch (e7) {}
    }
    if (esVal) state.esPerSpy = esVal;
    // QQQ ↔ NDX: نسبة الموقع (مثل 770 → 31656.48)، وتُقبل فقط إن قاربت نسبة الإغلاقين (±0.5%) حتى لا تفسدها قراءة خاطئة
    if ((t === "QQQ" || t === "NDX") && items.length) {
      var q0 = t === "QQQ" ? items[0].ratio : 1 / items[0].ratio;   // NDX لكل QQQ من الإغلاقين
      function near(v) { return v && Math.abs(v / q0 - 1) < 0.005; }
      var qn = near(siteNdx) ? siteNdx : near(EQ_FIXED.QQQ_NDX) ? EQ_FIXED.QQQ_NDX : q0;
      items[0].ratio = t === "QQQ" ? qn : 1 / qn;
    }
    if (t === "SPY") {
      items.push({ to: "ES", ratio: state.esPerSpy, dec: 2, src: esSrc });
    } else if (t === "SPX") {
      var spyIt = items.filter(function (it) { return it.to === "SPY"; })[0];
      if (spyIt) items.push({ to: "ES", ratio: state.esPerSpy * spyIt.ratio, dec: 2, src: esSrc });   // ES لكل نقطة SPX
    }
    state.eqSite = { updated: esUpd, es: esVal, src: esSrc };
    state.eq = items.length ? { from: t, items: items } : null;
  } catch (e) { state.eq = null; }
}
function eqText(strike) {
  try {
    if (!state.eq || state.eq.from !== state.ticker || strike == null || isNaN(Number(strike))) return "";
    var its = state.eq.items;
    if (state.ticker === "SPY") its = its.filter(function (it) { return it.to === "SPX"; });
    else if (state.ticker === "SPX") its = its.filter(function (it) { return it.to === "SPY"; });
    if (!its.length) return "";
    return "≈ " + its.map(function (it) {
      return it.to + " " + (Number(strike) * it.ratio).toLocaleString("en", { maximumFractionDigits: it.dec, minimumFractionDigits: it.dec });
    }).join(" · ");
  } catch (e) { return ""; }
}
function strikeHtml(strike) {
  var e = eqText(strike);
  return '<b class="rep-sk">' + strike + "</b>" + (e ? '<small class="rep-eq" dir="ltr">\u2066' + e + "\u2069</small>" : "");
}
function strikeXl(strike) { var e = eqText(strike); return e ? strike + "\\n" + e : strike; }


var AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function fullDateAr(exp) {
  try { var d = new Date(String(exp) + "T12:00:00"); return d.getDate() + " " + AR_MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  catch (e) { return String(exp); }
}
function fmtK(n) {
  return (Number(n) || 0).toLocaleString();
}
/** وزن زمني: اليوم/يوم بعد ×3 · الأسبوع ×2 · OPX والإغلاق الشهري ×1.5 · البعيد ×0.5 */
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
function groupRows(rows) {
  var m = {}, order = [];
  (rows || []).forEach(function (x) {
    var k = String(x.strike);
    if (!m[k]) { m[k] = { strike: x.strike, value: 0, items: [] }; order.push(k); }
    m[k].value += Number(x.value) || 0;
    m[k].items.push({ exp: x.exp, value: x.value });
  });
  return order.map(function (k) { return m[k]; }).sort(function (a, b) { return b.value - a.value; });
}
/** سطر خبر: الرقم يسار والتاريخ (يوم شهر سنة) بترتيب عربي صحيح */
function bdLine(numHtml, exp) {
  return '<span class="rep-bd" dir="ltr">' + numHtml + '</span> · <span class="rep-bd" dir="rtl">' + fullDateAr(exp) + "</span>";
}
/** حالة مركز على (انتهاء + سترايك): فتح جديد / مستمر / تناقص / تبخّر — تتبّع نفس اليوم عبر الأسحب */
function daysState(st) { return st === "grow" || st === "hold" || st === "build" || st === "drop" || st === "fade"; }
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
function posMerged(ps) {
  var all = [];
  ["call", "put"].forEach(function (sd) { ((ps && ps[sd]) || []).forEach(function (f) { all.push({ side: sd, f: f }); }); });
  all.sort(function (a, b) {
    if (a.f.exp !== b.f.exp) return a.f.exp < b.f.exp ? -1 : 1;
    if (a.f.now !== b.f.now) return b.f.now - a.f.now;
    return a.side === b.side ? 0 : a.side === "call" ? -1 : 1;
  });
  return all;
}
function repDrawMem(side, idx, exp) {
  var ss = window.__repSig;
  if (!ss || !ss[side] || !ss[side][idx]) return;
  var r = ss[side][idx], box = document.getElementById("repMem_" + side);
  if (!box) return;
  var it = r.dist[0];
  if (exp) r.dist.forEach(function (d) { if (d.exp === exp) it = d; });
  var ser = it.series, from = Math.max(0, ser.length - 12), shown = ser.slice(from);
  var vals = shown.map(function (p) { return p[1]; });
  var mx = Math.max.apply(null, vals) || 1, n = shown.length, bw = 22, g = 12, W = n * (bw + g) + g, out = "";
  shown.forEach(function (p, j) {
    var h = Math.max(2, p[1] / mx * 52), x = g + j * (bw + g), y = 66 - h;
    var cls = j === n - 1 ? "mem-now" : (it.open >= 0 && from + j === it.open ? "mem-open" : "mem-b");
    out += '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="4"/>' +
      '<text class="mem-v" x="' + (x + bw / 2) + '" y="' + (y - 3) + '" text-anchor="middle">' + fmtK(p[1]) + "</text>" +
      '<text class="mem-d" x="' + (x + bw / 2) + '" y="80" text-anchor="middle">' + String(p[0]).slice(5) + "</text>";
  });
  box.innerHTML = '<div class="rep-mem-title">ذاكرة سترايك ' + r.strike + " على يوم " + reportDayLabel(it.exp) + " · " + ser.length +
    ' سحب</div><svg viewBox="0 0 ' + W + ' 86" style="width:100%;max-width:' + Math.min(W * 1.5, 560) + 'px;height:auto">' + out +
    '</svg>';
  document.querySelectorAll("tr.rep-sigrow").forEach(function (tr) {
    tr.classList.toggle("on", tr.getAttribute("data-sig") === side + "|" + idx);
  });
}
function repApplyFind() {
  var host = document.getElementById("repResult");
  if (!host) return;
  var inp = document.getElementById("repFind");
  var raw = String(inp ? inp.value : (window.__repFindQ || "")).trim();
  window.__repFindQ = raw;
  var q = raw.toLowerCase().replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  var qn = q.replace(/,/g, ""), isNum = /^[0-9]+(\.[0-9]+)?$/.test(qn);
  var SEL = ".rep-table tbody tr, .rep-news-line, .rep-rep-row, .rep-ag-group, .rep-pt-group, .rep-cf-card";
  var rows = host.querySelectorAll(SEL), mode = "eq";
  function skOf(r) { return Array.prototype.map.call(r.querySelectorAll(".rep-sk"), function (e) { return e.textContent.replace(/,/g, "").trim(); }); }
  function test(r, md) {
    if (!q) return true;
    if (!isNum) return r.textContent.toLowerCase().indexOf(q) >= 0;
    if (md === "eq") return skOf(r).some(function (k) { return k === qn; });
    if (md === "pre") return skOf(r).some(function (k) { return k.indexOf(qn) === 0; });
    return (r.textContent.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) || []).indexOf(qn) >= 0;
  }
  if (q && isNum) {
    var any = Array.prototype.some.call(rows, function (r) { return test(r, "eq"); });
    if (!any) { mode = "pre"; any = Array.prototype.some.call(rows, function (r) { return test(r, "pre"); }); }
    if (!any) mode = "tok";
  }
  var shown = 0;
  rows.forEach(function (r) {
    var ok = test(r, mode);
    r.style.display = ok ? "" : "none";
    if (ok && q && !r.querySelector(".rep-empty") && !r.classList.contains("rep-empty")) shown++;
  });
  host.querySelectorAll(".rep-card, .rep-news").forEach(function (c) {
    if (!q) { c.style.display = ""; return; }
    var any2 = false;
    c.querySelectorAll(SEL).forEach(function (r) { if (r.style.display !== "none" && !r.querySelector(".rep-empty")) any2 = true; });
    c.style.display = any2 ? "" : "none";
  });
  var cnt = document.getElementById("repFindCount");
  if (cnt) cnt.textContent = q ? shown + " نتيجة" : "";
}
function fmtSiteDate(x) {
  try {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(x).trim());
    if (!m) return String(x);
    var yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return Number(m[2]) + " " + AR_MONTHS[Number(m[1]) - 1] + " " + yr;   // الموقع بصيغة شهر/يوم/سنة
  } catch (e) { return String(x); }
}
function updateRatioStat() {
  // لم يعد سطر «النسبة» يُعرض: تحويل SPY/SPX و QQQ/NDX يُحسب من إغلاقات التطبيق نفسه
  try { var el = document.getElementById("repRatioStat"); if (el) el.textContent = ""; } catch (er) {}
}
function ensureRepFind() { var old = document.querySelector("#reportsModal .map-head .rep-find"); if (old) old.remove(); }
function repAutoMem() { repDrawMem("call", 0); repDrawMem("put", 0); repApplyFind(); }


function cfMerge(m) {
  var mk = {};
  m.wall.forEach(function (w) {
    w.top = null;
    m.td.forEach(function (t) { if (t.side === w.side && t.exp === w.exp) { w.top = t; mk[t.side + "|" + t.exp] = 1; } });
  });
  return mk;
}
function cfState(g) {
  if (!g || !g.state) return "";
  var L = { "new": "فتح اليوم", grow: "متزايد", hold: "ثابت", build: "تراكم", drop: "تناقص", fade: "تبخّر" };
  if (!L[g.state]) return "";
  return L[g.state] + (daysState(g.state) ? " " + g.days + " يوم" : "");
}
/** التوافق: يجمع في بطاقة واحدة لكل سترايك كل العوامل التي اجتمعت عليه (تزايد · جدار · نمو · مجموع · مزدوج) */
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
function filterRepToStrike(rep, k) {
  var kk = Number(k);
  function f(list) { return (list || []).filter(function (x) { return Number(x.strike) === kk; }); }
  ["growthCall", "growthPut"].forEach(function (key) { (rep[key] || []).forEach(function (x, i) { x._rank = i + 1; }); });
  if (rep.sigmaSmart) ["call", "put"].forEach(function (sd) { (rep.sigmaSmart[sd] || []).forEach(function (x, i) { x._rank = i + 1; }); });
  var o = {};
  Object.keys(rep).forEach(function (key) { o[key] = rep[key]; });
  ["deltaCall", "deltaPut", "growthCall", "growthPut", "sigmaCall", "sigmaPut", "troughs", "peaks", "far", "scoresCall", "scoresPut"].forEach(function (key) { o[key] = f(rep[key]); });
  o.repTrough = []; o.repPeak = []; o.skipped = []; o.dual = f(rep.dual, "dz", "x");
  if (rep.sigmaSmart) {
    o.sigmaSmart = {
      call: f(rep.sigmaSmart.call), put: f(rep.sigmaSmart.put),
      positions: rep.sigmaSmart.positions ? { call: f(rep.sigmaSmart.positions.call), put: f(rep.sigmaSmart.positions.put) } : null,
    };
  }
  var tp = { call: f((rep.topPer || {}).call), put: f((rep.topPer || {}).put) };
  o.topPer = tp;
  o.topDelta = { call: tp.call.map(function (x) { return { exp: x.exp, strike: x.strike }; }), put: tp.put.map(function (x) { return { exp: x.exp, strike: x.strike }; }) };
  o.confluence = buildConfluence({ topPer: tp, peaks: o.peaks, troughs: o.troughs, growthCall: o.growthCall, growthPut: o.growthPut, dual: o.dual, sigmaSmart: o.sigmaSmart }, 1);
  o.lensStrike = kk;
  return o;
}

/** الصندوق (يمين) · المؤشر (يسار): نفس التحليل يومًا بيوم، قمة بقمة وقاع بقاع والأعلى تزايدًا بمثله */
var PAIRS = { SPY: { fund: "SPY", index: "SPX" }, SPX: { fund: "SPY", index: "SPX" }, QQQ: { fund: "QQQ", index: "NDX" }, NDX: { fund: "QQQ", index: "NDX" } };
async function buildPairReports(data, exps, days, strikes, topN, gDays) {
  var pr = PAIRS[state.ticker];
  if (!pr) return null;
  await ensureEq();
  var other = state.ticker === pr.fund ? pr.index : pr.fund;
  var odata = await loadTicker(other);
  if (!odata) return null;
  // نسبة التحويل: المؤشر = الصندوق × k
  var k = null;
  if (state.eq && state.eq.items) {
    state.eq.items.forEach(function (it) {
      if (state.ticker === pr.fund && it.to === pr.index) k = it.ratio;
      if (state.ticker === pr.index && it.to === pr.fund) k = it.ratio ? 1 / it.ratio : null;
    });
  }
  if (!k && data.close && odata.close) k = state.ticker === pr.fund ? odata.close / data.close : data.close / odata.close;
  if (!k) return null;
  // نطاق سترايكات الجهة الأخرى = نطاق هذه الجهة محوّلًا بالنسبة
  var mine = state.ticker === pr.fund ? { lo: 1, hi: 1 } : { lo: 1, hi: 1 };
  var rows = [];
  try { var v0 = getViewRowsFor(data, exps[0], days, strikes); rows = v0 ? v0.rows : []; } catch (e) {}
  var strikesOther = "ALL";
  if (rows.length) {
    var los = Math.min.apply(null, rows.map(function (r) { return r.strike; })), his = Math.max.apply(null, rows.map(function (r) { return r.strike; }));
    var factor = state.ticker === pr.fund ? k : 1 / k;          // من سترايك هذه الجهة إلى الأخرى
    strikesOther = "range:" + (los * factor - 0.5 * factor) + ":" + (his * factor + 0.5 * factor);
  }
  var keep = state.ticker;
  var repOther = null;
  try {
    state.ticker = other;
    var expOther = exps.filter(function (e) { return odata.by_expiration && odata.by_expiration[e]; });
    repOther = computeReports(odata, expOther, days, strikesOther, topN, gDays);
  } finally { state.ticker = keep; }
  var repMine = computeReports(data, exps, days, strikes, topN, gDays);
  var fundIsMine = state.ticker === pr.fund;
  return { fund: fundIsMine ? repMine : repOther, index: fundIsMine ? repOther : repMine, fundT: pr.fund, indexT: pr.index, k: k, exps: exps, esPerSpy: pr.index === "SPX" ? (state.esPerSpy || EQ_FIXED.SPY_ES) : null };
}
function renderPairView(p) {
  function cell(item, kind, isIndex) {
    if (!item) return '<div class="rep-pc rep-pc-none">—</div>';
    var strike = item.strike, eq = "";
    function f2(v) { return Number(v).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    if (isIndex) eq = p.fundT + " " + f2(Number(strike) / p.k);                       // يسار القارئ: رقم المؤشر + ما يقابله في الصندوق فقط
    else eq = p.indexT + " " + f2(Number(strike) * p.k);                             // يمين القارئ: رقم الصندوق + ما يقابله في المؤشر
    var h = '<div class="rep-pc"><b class="rep-pc-k">' + strike + '</b><span class="rep-pc-eq">' + eq + "</span>";
    if (kind === "wall") {
      h += '<span class="rep-pc-oi">OI ' + Number(item.oi).toLocaleString() + "</span>";
      if (item.delta) h += '<span class="rep-dl ' + (item.delta > 0 ? "up" : "dn") + '">' + (item.delta > 0 ? "+" : "") + Number(item.delta).toLocaleString() + "</span>";
      if (item.move === "↑") h += '<span class="mv-up">▲ ' + Math.abs(item.diff) + "</span>";
      else if (item.move === "↓") h += '<span class="mv-down">▼ ' + Math.abs(item.diff) + "</span>";
      else if (item.move === "ثابت") h += '<span class="mv-flat">▬ ثابت</span>';
    } else {
      h += '<span class="rep-pc-oi">OI ' + Number(item.oi).toLocaleString() + '</span><span class="rep-pc-d"><span class="rep-top-star">★</span> +' + Number(item.value).toLocaleString() + "</span>";
    }
    return h + "</div>";
  }
  function byExp(list, exp) { var r = null; (list || []).forEach(function (x) { if (x.exp === exp) r = x; }); return r; }
  var html = '<div class="rep-pair-head"><span>' + p.fundT + ' · الصندوق</span><span class="rep-pair-k">× ' + Number(p.k).toLocaleString("en", { maximumFractionDigits: 4 }) + '</span><span>' + p.indexT + " · المؤشر</span></div>";
  var any = false;
  p.exps.slice().sort().forEach(function (exp) {
    var F = p.fund, I = p.index;
    var lines = [
      ["قمة · Call", "wall", byExp(F.peaks, exp), byExp(I.peaks, exp)],
      ["قاع · Put", "wall", byExp(F.troughs, exp), byExp(I.troughs, exp)],
      ["الأعلى تزايدًا · Call", "td", byExp((F.topPer || {}).call, exp), byExp((I.topPer || {}).call, exp)],
      ["الأعلى تزايدًا · Put", "td", byExp((F.topPer || {}).put, exp), byExp((I.topPer || {}).put, exp)],
    ].filter(function (l) { return l[2] || l[3]; });
    if (!lines.length) return;
    any = true;
    html += '<div class="rep-pair-day"><div class="rep-pair-dl">' + reportDayLabel(exp) + '<small>' + fullDateAr(exp) + "</small></div>";
    lines.forEach(function (l) {
      var ok = l[2] && l[3] && Math.abs(Number(l[2].strike) * p.k - Number(l[3].strike)) <= 0.5 * p.k + 0.01;
      html += '<div class="rep-pair-row' + (ok ? " rep-pair-match" : "") + '">' + cell(l[2], l[1], false) + '<div class="rep-pair-lab">' + l[0] + (ok ? ' <span class="rep-pair-ok" title="الصندوق والمؤشر على نفس المنطقة">✓</span>' : "") + "</div>" + cell(l[3], l[1], true) + "</div>";
    });
    html += "</div>";
  });
  if (!any) html += '<div class="rep-news-none">لا بيانات للمقارنة في الأيام المحددة</div>';
  return html;
}
/** مراجع الجلسة (اليوم · يوم بعد · الأسبوع) من بيانات الرمز نفسها — مثل الجداول الرئيسية وليس ساعة الجهاز */
var __sref = {};
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
function repKey(sec, side, strike, exp) { return [sec, side, strike, exp || "-"].join("|"); }
function applyRepHidden(rep, hidden) {
  if (!rep || !hidden || !Object.keys(hidden).length) return rep;
  var o = {};
  Object.keys(rep).forEach(function (k) { o[k] = rep[k]; });
  function f(list, sec, side) {
    return (list || []).filter(function (x) { return !hidden[repKey(sec, side, x.strike, x.exp)] && !hidden[repKey(sec, side, x.strike, "*")]; });
  }
  o.deltaCall = f(rep.deltaCall, "d", "c"); o.deltaPut = f(rep.deltaPut, "d", "p");
  o.growthCall = f(rep.growthCall, "g", "c"); o.growthPut = f(rep.growthPut, "g", "p");
  o.sigmaCall = f(rep.sigmaCall, "s2", "c"); o.sigmaPut = f(rep.sigmaPut, "s2", "p");
  o.scoresCall = (rep.scoresCall || []).filter(function (x) { return !hidden[repKey("q", "c", x.strike, "-")]; });
  o.scoresPut = (rep.scoresPut || []).filter(function (x) { return !hidden[repKey("q", "p", x.strike, "-")]; });
  o.troughs = f(rep.troughs, "t", "p"); o.peaks = f(rep.peaks, "k", "c");
  if (rep.opxLv) {
    var _op = f(rep.opxLv.peaks, "ok", "c"), _ot = f(rep.opxLv.troughs, "ot", "p");
    o.opxLv = { peaks: _op, troughs: _ot, deltaCall: rep.opxLv.deltaCall, deltaPut: rep.opxLv.deltaPut, repPeak: repeatedStrikes(_op), repTrough: repeatedStrikes(_ot) };
  }
  o.far = (rep.far || []).filter(function (x) { return !hidden[repKey("f", x.kind, x.strike, x.exp)]; });
  o.off = {};
  Object.keys(hidden).forEach(function (k) { if (k.indexOf("sec|") === 0) o.off[k.slice(4)] = true; });
  if (rep.sigmaSmart) {
    o.sigmaSmart = {
      positions: rep.sigmaSmart.positions ? {
        call: rep.sigmaSmart.positions.call.filter(function (x) { return !hidden[repKey("pos", "call", x.strike, x.exp)]; }),
        put: rep.sigmaSmart.positions.put.filter(function (x) { return !hidden[repKey("pos", "put", x.strike, x.exp)]; }),
      } : null,
      call: rep.sigmaSmart.call.filter(function (x) { return !hidden[repKey("s", "call", x.strike, "-")]; }),
      put: rep.sigmaSmart.put.filter(function (x) { return !hidden[repKey("s", "put", x.strike, "-")]; }),
    };
  }
  o.confluence = (rep.confluence || []).filter(function (x) { return !hidden[repKey("cf", "x", x.strike, "*")]; });
  o.hiddenCount = Object.keys(hidden).length;
  o.repTrough = repeatedStrikes(o.troughs);
  o.repPeak = repeatedStrikes(o.peaks);
  return o;
}

/** إعدادات التقرير المحفوظة */
function loadRepPrefs() {
  try {
    var p = JSON.parse(localStorage.getItem("oi_rep_prefs_v1") || "{}");
    return p && typeof p === "object" ? p : {};
  } catch (e) { return {}; }
}
function saveRepPrefs(patch) {
  try {
    var p = loadRepPrefs();
    Object.keys(patch || {}).forEach(function (k) { p[k] = patch[k]; });
    localStorage.setItem("oi_rep_prefs_v1", JSON.stringify(p));
  } catch (e) {}
}

function fillReportSheet(ws, rep, ticker) {
  function offS(n) { return !!(rep.off && rep.off[n]); }
  function hasAny(a, b) { return !!((a && a.length) || (b && b.length)); }
  var topX = {};
  ["call", "put"].forEach(function (sd) { ((rep.topDelta && rep.topDelta[sd]) || []).forEach(function (t) { topX[sd + "|" + t.exp + "|" + t.strike] = 1; }); });
  var HEAD = "FFE7E6E6", BODY = "FFF8FAFC", WHITE = "FFFFFFFF";
  var BLUE = "FF2563EB", VIOLET = "FF7C3AED", GREEN = "FF059669", RED = "FFDC2626", GRAY = "FF64748B";
  var bd = { style: "thin", color: { argb: "FFD9D9D9" } };
  var border = { top: bd, bottom: bd, left: bd, right: bd };
  function kindFill(exp) {
    var k = "";
    try { k = tawafuqColKind(exp); } catch (e) {}
    return k === "opx" ? "FFEDE9FE" : k === "fri" ? "FFDBEAFE" : k === "eom" ? "FFCCFBF1" : "FFF1F5F9";
  }
  function put(r, c, v, o) {
    o = o || {};
    var cell = ws.getCell(r, c);
    if (v !== undefined && v !== null) cell.value = v;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill || WHITE } };
    cell.font = { name: "Calibri", size: o.size || 11, bold: !!o.bold, color: { argb: o.color || "FF111827" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: !!o.wrap };
    cell.border = border;
    if (o.fmt) cell.numFmt = o.fmt;
    return cell;
  }
  function band(r, c1, c2, text, fill, color, size) {
    for (var c = c1; c <= c2; c++) put(r, c, null, { fill: fill });
    try { ws.mergeCells(r, c1, r, c2); } catch (e) {}
    put(r, c1, text, { fill: fill, bold: true, color: color, size: size || 12 });
  }
  function heads(r, c1, arr) { arr.forEach(function (h, i) { put(r, c1 + i, h, { fill: HEAD, bold: true }); }); }

  ws.getColumn(1).width = 2;
  for (var c = 2; c <= 15; c++) ws.getColumn(c).width = 13;
  try { ws.views = [{ state: "normal", rightToLeft: true, showGridLines: false }]; } catch (e) {}

  band(2, 2, 15, String(ticker) + " | التقرير", HEAD, "FF111827", 16);
  ws.getRow(2).height = 30;
  var closeTxt = rep.close != null ? "الإغلاق ≈ " + Number(rep.close).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";
  if (closeTxt) { band(3, 2, 15, closeTxt, "FFEFF1F5", GRAY, 11); }

  // الجداول تبدأ من يمين القارئ (ورقة RTL: العمود الأصغر يظهر يمينًا) — المجموع ثم التزايد ثم النمو
  function metricBlock(top, c1, title, callRows, putRows) {
    band(top, c1, c1 + 3, title, HEAD, "FF111827", 12);
    var r = top + 1;
    [["CALL", callRows, "FFDBEAFE", BLUE], ["PUT", putRows, "FFEDE9FE", VIOLET]].forEach(function (sec) {
      band(r, c1, c1 + 3, sec[0], sec[2], sec[3], 11); r++;
      heads(r, c1, ["#", "اليوم", "القيمة", "Strike"]); r++;
      var list = sec[1] && sec[1].length ? groupRows(sec[1]) : [null];
      list.forEach(function (x, i) {
        var f = i % 2 ? WHITE : BODY;
        if (x) {
          var one = x.items.length === 1;
          put(r, c1, i + 1, { fill: f });
          put(r, c1 + 1, one ? (x.items[0].exp ? reportDayLabel(x.items[0].exp) : SUM_TXT) : x.items.map(function (it) { return reportDayLabel(it.exp) + " +" + Number(it.value).toLocaleString(); }).join("\n"),
            { fill: one && x.items[0].exp ? kindFill(x.items[0].exp) : f, bold: one && !!x.items[0].exp, wrap: !one });
          put(r, c1 + 2, x.value, { fill: f, fmt: "#,##0" });
          put(r, c1 + 3, strikeXl(x.strike), { fill: f, bold: true, wrap: true });
        } else {
          put(r, c1, "—", { fill: f }); for (var z = 1; z < 4; z++) put(r, c1 + z, "", { fill: f });
        }
        r++;
      });
    });
    return r;
  }
  var row = 5;
  var STX = { "new": "فتح جديد", grow: "متزايد", hold: "ثابت", build: "تراكم تدريجي", drop: "تناقص", fade: "تبخّر", norm: "عادي" };
  var STC = { "new": GREEN, grow: GREEN, hold: BLUE, build: GRAY, drop: "FFD97706", fade: RED, norm: GRAY };
  function sigTable(top, label, rows, fillH, colH) {
    band(top, 2, 14, label, fillH, colH, 12);
    var r = top + 1;
    heads(r, 2, ["Strike", SUM_TXT, "أين وُضع مجموع التزايد؟", "", "", "", "", "", "", "التركّز", "", "الحالة", ""]);
    try { ws.mergeCells(r, 4, r, 10); ws.mergeCells(r, 11, r, 12); ws.mergeCells(r, 13, r, 14); } catch (e) {}
    r++;
    (rows && rows.length ? rows : [null]).forEach(function (q, i) {
      var f = i % 2 ? WHITE : BODY;
      for (var c = 2; c <= 14; c++) put(r, c, "", { fill: f });
      if (q) {
        put(r, 2, strikeXl(q.strike), { fill: f, bold: true, wrap: true });
        put(r, 3, q.tot, { fill: f, fmt: "#,##0" });
        put(r, 4, q.dist.map(function (d) { return reportDayLabel(d.exp) + " " + Number(d.delta).toLocaleString() + (topX[(label.indexOf("CALL") >= 0 ? "call" : "put") + "|" + d.exp + "|" + q.strike] ? " ★" : ""); }).join(" · "), { fill: f, wrap: true });
        put(r, 11, q.conc ? "مركّز" : "موزّع", { fill: f });
        put(r, 13, STX[q.state] + (daysState(q.state) ? " " + q.stateDays + " يوم" : "") + "\n" + reportDayLabel(q.topExp), { fill: f, bold: true, color: STC[q.state], wrap: true });
      } else { put(r, 2, "—", { fill: f }); }
      try { ws.mergeCells(r, 4, r, 10); ws.mergeCells(r, 11, r, 12); ws.mergeCells(r, 13, r, 14); } catch (e) {}
      r++;
    });
    return r;
  }
  if (!offS("s") && rep.sigmaSmart) {
    if (rep.sigmaSmart.call.length) row = sigTable(row, "المجموع · CALL", rep.sigmaSmart.call, "FFDBEAFE", BLUE);
    if (rep.sigmaSmart.put.length) row = sigTable(row + 1, "المجموع · PUT", rep.sigmaSmart.put, "FFEDE9FE", VIOLET);
    row += 1;
    var psx = rep.sigmaSmart.positions, allP = posMerged(psx).map(function (q) { return { sd: q.side, f: q.f }; });
    if (allP.length) {
      band(row, 2, 10, "المراكز المفتوحة · كم يوم منذ الفتح وهل تتزايد", HEAD, "FF111827", 12); row++;
      heads(row, 2, ["Strike", "الجهة", "اليوم", "", "فُتح", "الآن", "منذ", "الحالة", ""]);
      try { ws.mergeCells(row, 4, row, 5); ws.mergeCells(row, 9, row, 10); } catch (e) {}
      row++;
      allP.forEach(function (q, i) {
        var f = i % 2 ? WHITE : BODY;
        for (var c = 2; c <= 10; c++) put(row, c, "", { fill: f });
        put(row, 2, strikeXl(q.f.strike), { fill: f, bold: true, wrap: true });
        put(row, 3, q.sd === "call" ? "CALL" : "PUT", { fill: f, bold: true, color: q.sd === "call" ? BLUE : VIOLET });
        put(row, 4, reportDayLabel(q.f.exp) + (topX[q.sd + "|" + q.f.exp + "|" + q.f.strike] ? " ★" : ""), { fill: kindFill(q.f.exp), bold: true });
        put(row, 6, q.f.openV, { fill: f, fmt: "#,##0" });
        put(row, 7, q.f.now, { fill: f, fmt: "#,##0" });
        put(row, 8, q.f.since ? q.f.since + " يوم" : "اليوم", { fill: f });
        put(row, 9, STX[q.f.state], { fill: f, bold: true, color: STC[q.f.state] });
        try { ws.mergeCells(row, 4, row, 5); ws.mergeCells(row, 9, row, 10); } catch (e) {}
        row++;
      });
    }
    row += 2;
  }
  var e2 = offS("d") || !hasAny(rep.deltaCall, rep.deltaPut) ? row : metricBlock(row, 2, "التزايد · Δ", rep.deltaCall, rep.deltaPut);
  var e3 = offS("g") || !hasAny(rep.growthCall, rep.growthPut) ? row : metricBlock(row, 7, "النمو · G", rep.growthCall, rep.growthPut);
  row = Math.max(e2, e3) + 1;

  function arrow(x) {
    if (x.move === "↑") return { t: "▲ " + Math.abs(x.diff), c: GREEN };
    if (x.move === "↓") return { t: "▼ " + Math.abs(x.diff), c: RED };
    if (x.move === "ثابت") return { t: "ثابت", c: GRAY };
    return { t: "—", c: GRAY };
  }
  // التوافق: صف لكل سترايك
  if (!offS("cf") && (rep.confluence || []).length) {
    band(row, 2, 15, "التوافق · كل ما اجتمع على السترايك", HEAD, "FF111827", 12); row++;
    heads(row, 2, ["Strike", "التوافق", "الأعلى تزايدًا", "", "", "الجدار", "", "", "النمو", "", "المجموع · المركز", "", "تزايد مزدوج", ""]);
    try { ws.mergeCells(row, 4, row, 6); ws.mergeCells(row, 7, row, 9); ws.mergeCells(row, 10, row, 11); ws.mergeCells(row, 12, row, 13); ws.mergeCells(row, 14, row, 15); } catch (e) {}
    row++;
    var cfl = rep.confluence || [];
    if (!cfl.length) { band(row, 2, 15, "لا توجد حالة", "FFF1F5F9", GRAY, 10); row++; }
    cfl.forEach(function (m, i) {
      var f = i % 2 ? WHITE : BODY;
      for (var c = 2; c <= 15; c++) put(row, c, "", { fill: f });
      put(row, 2, strikeXl(m.strike), { fill: f, bold: true, wrap: true });
      put(row, 3, m.factors + "/5", { fill: f, bold: true, color: GREEN });
      var mkx = cfMerge(m);
      put(row, 4, m.td.filter(function (t) { return !mkx[t.side + "|" + t.exp]; }).map(function (t) { return (t.side === "call" ? "Call " : "Put ") + reportDayLabel(t.exp) + " ★ OI " + Number(t.oi).toLocaleString() + " +" + Number(t.value).toLocaleString(); }).join("\n"), { fill: f, wrap: true });
      put(row, 7, m.wall.map(function (w) { var a = arrow(w); return (w.side === "call" ? "قمة " : "قاع ") + reportDayLabel(w.exp) + " OI " + Number(w.oi).toLocaleString() + " " + a.t + (w.top ? " ★ الأعلى تزايدًا +" + Number(w.top.value).toLocaleString() : ""); }).join("\n"), { fill: f, wrap: true });
      put(row, 10, m.gr.map(function (g) { return (g.side === "call" ? "Call" : "Put") + " G" + g.rank; }).join("\n"), { fill: f, wrap: true });
      put(row, 12, m.sg.map(function (g) { var st = cfState(g); return (g.side === "call" ? "Call" : "Put") + " " + SUM_TXT + g.rank + " " + fmtK(g.tot) + (st ? " · " + st : ""); }).join("\n"), { fill: f, wrap: true });
      put(row, 14, m.dual.map(function (d) { return reportDayLabel(d.exp) + " C+" + Number(d.call).toLocaleString() + " P+" + Number(d.put).toLocaleString(); }).join("\n"), { fill: f, wrap: true });
      try { ws.mergeCells(row, 4, row, 6); ws.mergeCells(row, 7, row, 9); ws.mergeCells(row, 10, row, 11); ws.mergeCells(row, 12, row, 13); ws.mergeCells(row, 14, row, 15); } catch (e) {}
      row++;
    });
    row++;
  }
  function levelBlock(top, c1, title, list, repeated, fillHead, color, repTitle) {
    band(top, c1, c1 + 5, title, fillHead, color, 12);
    var r = top + 1;
    heads(r, c1, ["اليوم", "المسار", "", "الحركة", "OI", "Strike"]);
    try { ws.mergeCells(r, c1 + 1, r, c1 + 2); } catch (e) {}
    r++;
    (list && list.length ? list : [null]).forEach(function (x, i) {
      var f = i % 2 ? WHITE : BODY;
      if (x) {
        var a = arrow(x);
        put(r, c1, reportDayLabel(x.exp), { fill: kindFill(x.exp), bold: true });
        put(r, c1 + 1, x.path && x.path.length > 1 ? "\u202A" + x.path.join(" → ") + "\u202C" : "—", { fill: f, color: GRAY, size: 10 });
        put(r, c1 + 2, "", { fill: f });
        try { ws.mergeCells(r, c1 + 1, r, c1 + 2); } catch (e) {}
        put(r, c1 + 3, a.t, { fill: f, bold: true, color: a.c });
        put(r, c1 + 4, x.delta ? Number(x.oi).toLocaleString() + "\n" + (x.delta > 0 ? "+" : "") + Number(x.delta).toLocaleString() : x.oi, { fill: f, fmt: "#,##0", wrap: !!x.delta });
        put(r, c1 + 5, strikeXl(x.strike), { fill: f, bold: true, wrap: true });
      } else {
        put(r, c1, "—", { fill: f }); for (var z = 1; z < 6; z++) put(r, c1 + z, "", { fill: f });
      }
      r++;
    });
    if (repeated && repeated.length) {
      band(r, c1, c1 + 5, repTitle, fillHead, color, 11); r++;
      repeated.forEach(function (rp) {
        put(r, c1, rp.strike, { fill: BODY, bold: true });
        for (var z = 1; z < 6; z++) put(r, c1 + z, "", { fill: BODY });
        try { ws.mergeCells(r, c1 + 1, r, c1 + 5); } catch (e) {}
        put(r, c1 + 1, rp.days.slice().sort().map(reportDayLabel).join(" · "), { fill: BODY, wrap: true });
        r++;
      });
    }
    return r;
  }
  // PUT (قيعان) يمين · CALL (قمم) يسار — مثل جدول الأيام
  var l1 = offS("t") || !(rep.troughs && rep.troughs.length) ? row : levelBlock(row, 2, "القيعان · PUT", rep.troughs, rep.repTrough, "FFEDE9FE", VIOLET, "قيعان متكررة");
  var l2 = offS("k") || !(rep.peaks && rep.peaks.length) ? row : levelBlock(row, 9, "القمم · CALL", rep.peaks, rep.repPeak, "FFDBEAFE", BLUE, "قمم متكررة");
  row = Math.max(l1, l2) + 1;

  if (!offS("f") && rep.far && rep.far.length) {
  band(row, 2, 15, "مدى طويل · جدران خارج النافذة", "FFFEF3C7", "FF92400E", 12); row++;
  heads(row, 2, ["النوع", "Strike", "OI", "البعد", "اليوم"]); row++;
  (rep.far && rep.far.length ? rep.far : [null]).forEach(function (f, i) {
    var fl = i % 2 ? WHITE : BODY;
    if (f) {
      put(row, 2, f.kind, { fill: fl, bold: true, color: f.kind === "قمة" ? BLUE : VIOLET });
      put(row, 3, strikeXl(f.strike), { fill: fl, bold: true, wrap: true });
      put(row, 4, f.oi, { fill: fl, fmt: "#,##0" });
      put(row, 5, f.dist != null ? (f.dist > 0 ? "+" : "") + f.dist.toFixed(1) + "%" : "—", { fill: fl });
      put(row, 6, reportDayLabel(f.exp), { fill: kindFill(f.exp), bold: true });
    } else {
      put(row, 2, "—", { fill: fl });
    }
    row++;
  });
  }
  if (rep.skipped && rep.skipped.length) {
    row++;
    band(row, 2, 15, "أيام بلا بيانات OI في آخر سحب: " + rep.skipped.map(reportDayLabel).join(" · "), "FFF1F5F9", GRAY, 10);
  }
}

async function exportReportsExcel(rep, ticker) {
  if (typeof ExcelJS === "undefined") throw new Error("ExcelJS غير محمّل");
  var wb = new ExcelJS.Workbook();
  fillReportSheet(wb.addWorksheet("التقرير"), rep, ticker);
  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  var fname = String(ticker) + "_Reports.xlsx";
  var downloaded = false;
  try {
    if (typeof saveAs === "function") {
      saveAs(blob, fname);
      downloaded = true;
    }
  } catch (eSave) {
    console.warn("saveAs failed", eSave);
  }
  if (!downloaded) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fname;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
      try { a.remove(); } catch (e) {}
    }, 2000);
  }
}

var TV_PINE_CODE = "//@version=5\nindicator(\"Oi Levels\", shorttitle=\"Oi Levels\", overlay=true, max_lines_count=500, max_labels_count=500)\n\n// ════════════════════════════════════════════════════════════\n//  Oi Levels\n//  صيغة كل سطر:  الرمز,النوع,السعر,الاسم,تاريخ الانتهاء(YYYYMMDD)\n//  الأنواع:  P قمة (كول) | T قاع (بوت) | DC / DP / D تزايد | S ترتيب\n//  السطر الذي يبدأ بـ # يُتجاهل (طريقة لإخفاء مستوى بعينه)\n//  ملاحظة: المحارف غير المرئية (RLE / PDF / RLM) داخل الكود تضبط اتجاه النص العربي، ولا تُحذف\n// ════════════════════════════════════════════════════════════\n\nVER = \"v17\"   // رقم النسخة (يظهر في لوحة المعلومات أسفل يسار الشارت للتأكد من النسخة المفعّلة)\nNC = 8     // عدد فئات الصفوف لكل مستوى\nAXN = 30   // عدد مستويات المسطرة (الحد الأعلى لعدد الصناديق على محور السعر)\n\n// ===== المستويات =====\nGRP1 = \"المستويات\"\nlevelsTxt  = input.text_area(\"\", \"المستويات\", group=GRP1, tooltip=\"يُلصق هنا الناتج من زر «نسخ لـ TradingView» في الويب. كل سطر: الرمز,النوع,السعر,الاسم,تاريخ الانتهاء. الرمز * أو ALL يطابق أي رمز.\")\nlevelsTxt2 = input.text_area(\"\", \"المستويات (2) — لصق إضافي\", group=GRP1, tooltip=\"خانة إضافية للصق دفعة ثانية (مثلًا رمز آخر). تُدمج مع الخانتين الأخرى.\")\nlevelsTxt3 = input.text_area(\"\", \"المستويات (3) — لصق إضافي\", group=GRP1)\nsrcTicker  = input.string(\"\", \"رمز المستويات (فارغ = تعرّف تلقائي)\", group=GRP1, tooltip=\"يُترك فارغًا: يُتعرّف تلقائيًا على رمز الرسم، ومنه SPX500 / US500 / ES ← SPX، و NAS100 / US100 / NQ ← NDX، وبقية الرموز (SPY / QQQ / IWM ...) كما هي.\", display=display.none)\nratio      = input.float(1.0, \"نسبة التحويل (السعر × النسبة)\", minval=0.0001, step=0.0001, group=GRP1, display=display.none)\nautoDelete = input.bool(true, \"حذف المنتهي تلقائيًا\", group=GRP1, display=display.none)\ntz         = input.string(\"GMT+3\", \"المنطقة الزمنية للتواريخ\", group=GRP1, tooltip=\"تُحدَّد بها «اليوم» و«يوم بعد» و«الأسبوع»، ويُعدّ المستوى منتهيًا بنهاية يوم تاريخه بهذه المنطقة. في عطلة نهاية الأسبوع يُعامل أول يوم تداول (الإثنين) معاملة «اليوم».\", display=display.none)\nhidTxt     = input.string(\"\", \"أسعار مخفية (مفصولة بفاصلة)\", group=GRP1, tooltip=\"مثال: 7800,7650 — يُخفي كل المستويات بهذه الأسعار دون حذفها من النص.\", display=display.none)\n\n// ===== النص =====\nGRP2 = \"النص\"\nshowText     = input.bool(true, \"إظهار النص\", group=GRP2, display=display.none)\nlabelMode    = input.string(\"على الخط\", \"موضع النص\", options=[\"على الخط\", \"فوق الخط\"], group=GRP2, tooltip=\"كل مستوى له نص واحد متعدد الأسطر يُثبَّت عند سعر خطه تمامًا، فأسطره متلاصقة بمسافة ثابتة مهما كان الفريم أو توسيع المسطرة.\", display=display.none)\nalignEnd     = input.bool(true, \"النص ينتهي عند أقصى اليمين (ملاصق للمسطرة)\", group=GRP2, display=display.none)\ntxtOffset    = input.int(80, \"مسافة النص عن آخر شمعة (شموع)\", minval=1, maxval=500, group=GRP2, tooltip=\"يحدد مدى ابتعاد النص لليمين. تُضبط مرة واحدة حسب التقريب (zoom).\", display=display.none)\nlang         = input.string(\"عربي\", \"لغة النص\", options=[\"عربي\", \"English\"], group=GRP2, display=display.none)\nshowName     = input.bool(false, \"إظهار الاسم (العمود الرابع) على الخط\", group=GRP2, display=display.none)\nshowPxInText = input.bool(false, \"كتابة الرقم داخل النص (يظهر أصلًا على المسطرة)\", group=GRP2, display=display.none)\nshowDist     = input.bool(false, \"إظهار المسافة عن السعر الحالي %\", group=GRP2, display=display.none)\nshowMove     = input.bool(true, \"إظهار حركة القمة/القاع بالأسهم ▲ ▼ (عدد النقاط)\", group=GRP2, tooltip=\"يظهر عندما تحمل البيانات عمود الحركة (السادس). موجب = ارتفعت ▲، سالب = انخفضت ▼.\", display=display.none)\nstarMode     = input.string(\"تلقائي\", \"شكل نجمة الأعلى تزايدًا\", options=[\"تلقائي\", \"⭐ إيموجي\", \"★ بلون الصف\", \"بدون نجمة\"], group=GRP2, tooltip=\"تلقائي: ⭐ العادية، وتصبح ★ بلون الصف في نمط «حسب التاريخ». ⭐ الإيموجي لا يتغير لونها أبدًا. ★ تأخذ لون الصف. بدون نجمة: يُكتب (1) مثل بقية الترتيب.\", display=display.none)\nshowCP       = input.bool(true, \"كتابة C / P أمام تواريخ التزايد\", group=GRP2, tooltip=\"C للكول وP للبوت، لكل تاريخ حسب نوعه.\", display=display.none)\nshowNums     = input.bool(true, \"إظهار الأوبن والتزايد عند وجود تزايد\", group=GRP2, tooltip=\"يظهر عندما تحمل البيانات عمودي الأوبن (السابع) والتزايد (الثامن)، بصيغة: الأوبن (+التزايد).\", display=display.none)\ncompactMode  = input.bool(false, \"عرض مختصر: الحرف C/P مع الأوبن والتزايد فقط\", group=GRP2, tooltip=\"بلا كلمة قمة/قاع ولا التاريخ: يظهر الحرف (C للقمة وتزايد الكول، P للقاع وتزايد البوت) ثم الأوبن (+التزايد).\", display=display.none)\ntxtSize      = input.string(\"normal\", \"حجم النص\", options=[\"tiny\", \"small\", \"normal\", \"large\"], group=GRP2, display=display.none)\ntextTransp   = input.int(0, \"شفافية لون النص\", minval=0, maxval=100, group=GRP2, display=display.none)\nbgOn         = input.bool(true, \"خلفية للنص\", group=GRP2, display=display.none)\nbgTransp     = input.int(40, \"شفافية الخلفية\", minval=0, maxval=100, group=GRP2, tooltip=\"تخص الخلفية فقط، ولون النص مستقل عنها.\", display=display.none)\n\n// ===== الخط =====\nGRP3 = \"الخط\"\nlineW      = input.int(2, \"سُمك الخط\", minval=1, maxval=5, group=GRP3, display=display.none)\nlineTransp = input.int(55, \"شفافية الخط\", minval=0, maxval=95, group=GRP3, display=display.none)\nlineSty    = input.string(\"متصل\", \"نمط الخط\", options=[\"متصل\", \"متقطع\", \"منقط\"], group=GRP3, display=display.none)\nlenBack    = input.int(40, \"طول الخط للخلف (شموع)\", minval=0, maxval=400, group=GRP3, display=display.none)\nlenFwd     = input.int(30, \"طول الخط للأمام (شموع)\", minval=1, maxval=500, group=GRP3, display=display.none)\nextendR    = input.bool(false, \"تمديد الخط لليمين\", group=GRP3, display=display.none)\n\n// ===== المسطرة =====\nGRP6 = \"المسطرة (محور السعر)\"\nshowAxis = input.bool(true, \"إظهار رقم المستوى في صندوق على محور السعر\", group=GRP6, tooltip=\"يظهر الصندوق بلون المستوى. يلزم تفعيل عرض قيم المؤشرات على محور السعر من إعدادات الرسم (المقياس).\", display=display.none)\n\n// ===== عام =====\nGRP4 = \"عام\"\nmergeSame = input.bool(true, \"دمج المستويات المتطابقة في السعر (تجمع التواريخ)\", group=GRP4, display=display.none)\nshowInfo  = input.bool(true, \"إظهار لوحة المعلومات\", group=GRP4, display=display.none)\n\n// ===== نمط التلوين =====\nGRP8 = \"نمط التلوين\"\ncolorMode = input.string(\"موحّد\", \"نمط التلوين\", options=[\"موحّد\", \"كول/بوت\", \"حسب التاريخ\"], group=GRP8, tooltip=\"موحّد: لون واحد لكل الخطوط (الأساسي). كول/بوت: لون للكول ولون للبوت، والخط حيادي عند اجتماع قمة وقاع. حسب التاريخ: لكل يوم لون مستقل لقمته وقاعه وتزايده (اليوم ويوم بعد والأسبوع وOPX والشهر)، ويُلوَّن الخط بأقرب تاريخ فيه.\", display=display.none)\noneColor    = input.color(color.gray, \"اللون الموحّد\", group=GRP8, display=display.none)\n\n// ===== الألوان =====\nGRP5 = \"ألوان الأنواع\"\ncCall = input.color(#F77C80, \"لون الكول (قمة / تزايد كول)\", group=GRP5, display=display.none)\ncPut  = input.color(#22AB94, \"لون البوت (قاع / تزايد بوت)\", group=GRP5, display=display.none)\ncD  = input.color(#e5b84b, \"تزايد عام\", group=GRP5, display=display.none)\ncS  = input.color(#a78bfa, \"الأعلى في الترتيب\", group=GRP5, display=display.none)\ncN  = input.color(#9598A1, \"حيادي (قمة وقاع على نفس الخط)\", group=GRP5, display=display.none)\n\n// ===== ألوان التواريخ (لنمط «حسب التاريخ») =====\nGRP7 = \"ألوان التواريخ\"\ncDay    = input.color(#F77C80, \"اليوم\", group=GRP7, display=display.none)\ncNextD  = input.color(#FFA726, \"يوم بعد\", group=GRP7, display=display.none)\ncWeekD  = input.color(#22AB94, \"الأسبوع\", group=GRP7, display=display.none)\ncOpxD   = input.color(#5B9CF6, \"OPX\", group=GRP7, display=display.none)\ncMonthD = input.color(#A78BFA, \"الشهر\", group=GRP7, display=display.none)\ncOtherD = input.color(#9598A1, \"تواريخ أخرى\", group=GRP7, display=display.none)\n\n// ===== ثوابت =====\nisAr    = lang == \"عربي\"\nemb     = isAr ? \"\u202b\" : \"\"   // بداية سياق يمين ← يسار\npdf     = isAr ? \"\u202c\" : \"\"   // نهايته\nblank   = \"\u00a0\u200b\"   // سطر فارغ لتثبيت موضع الصفوف الملوّنة\nrlm     = isAr ? \"\u200f\" : \"\"   // يُبقي الرقم بعد الحرف في ترتيب القراءة\nstarTxt = starMode == \"بدون نجمة\" ? \"\" : starMode == \"⭐ إيموجي\" ? \"⭐\" : starMode == \"★ بلون الصف\" ? \"★\" : (colorMode == \"حسب التاريخ\" ? \"★\" : \"⭐\")\nuni     = colorMode == \"موحّد\"\nbyType  = colorMode == \"كول/بوت\"\nbyDate  = colorMode == \"حسب التاريخ\"\nwToday  = isAr ? \"اليوم\" : \"Today\"\nwNext   = isAr ? \"يوم بعد\" : \"Next day\"\nwWeek   = isAr ? \"الأسبوع\" : \"Week\"\nwMonth  = isAr ? \"الشهر الحالي\" : \"This month\"\nwPeak   = isAr ? \"قمة\" : \"Peak\"\nwTrough = isAr ? \"قاع\" : \"Trough\"\nwRank   = isAr ? \"ترتيب\" : \"Rank\"\nvar monAr = array.from(\"يناير\", \"فبراير\", \"مارس\", \"أبريل\", \"مايو\", \"يونيو\", \"يوليو\", \"أغسطس\", \"سبتمبر\", \"أكتوبر\", \"نوفمبر\", \"ديسمبر\")\nvar monEn = array.from(\"Jan\", \"Feb\", \"Mar\", \"Apr\", \"May\", \"Jun\", \"Jul\", \"Aug\", \"Sep\", \"Oct\", \"Nov\", \"Dec\")\n\n// الأسماء البديلة للمؤشرات (تعرّف تلقائي)\nvar spxAl = array.from(\"SPX\", \"SPX500\", \"SPXUSD\", \"SPX500USD\", \"US500\", \"SP500\", \"GSPC\", \"ES\", \"ES1\", \"MES\", \"MES1\")\nvar ndxAl = array.from(\"NDX\", \"NAS100\", \"NAS100USD\", \"US100\", \"USTEC\", \"NQ\", \"NQ1\", \"MNQ\", \"MNQ1\", \"NDX100\", \"NASDAQ100\")\n\nvar array<line>  lns = array.new<line>()\nvar array<label> lbs = array.new<label>()\nvar table infoTbl = table.new(position.bottom_left, 1, 1)\nvar array<float> axisPx  = array.new_float(AXN, na)\nvar array<color> axisCol = array.new_color(AXN, color.gray)\n\n// ===== دوال =====\nf_tk(s) =>\n    u = str.upper(str.trim(s))\n    p = str.pos(u, \":\")\n    na(p) ? u : str.substring(u, p + 1)\n\nf_canon(s) =>\n    u = str.replace_all(f_tk(s), \"!\", \"\")\n    array.includes(spxAl, u) ? \"SPX\" : array.includes(ndxAl, u) ? \"NDX\" : u\n\nf_key(ts) =>\n    year(ts, tz) * 10000 + month(ts, tz) * 100 + dayofmonth(ts, tz)\n\nf_expiry(s) =>\n    y = str.tonumber(str.substring(s, 0, 4))\n    m = str.tonumber(str.substring(s, 4, 6))\n    d = str.tonumber(str.substring(s, 6, 8))\n    (na(y) or na(m) or na(d)) ? na : timestamp(tz, int(y), int(m), int(d), 23, 59, 59)\n\nf_has(cur, add) =>\n    str.contains(\" + \" + cur + \" + \", \" + \" + add + \" + \")\n\n// فئة الصف: 0 قمة، 1 قاع، 2 أعلى تزايد (الأول)، 3/4/5 ترتيب التزايد 2/3/4، 6 ترتيب المجموع، 7 أخرى\nf_cat(t, rkv) =>\n    t == \"P\" ? 0 : t == \"T\" ? 1 : str.startswith(t, \"D\") ? 2 : (t == \"RC\" or t == \"RP\") ? (nz(rkv) >= 4 ? 5 : nz(rkv) == 3 ? 4 : 3) : str.startswith(t, \"S\") ? 6 : 7\n\n// أسطر فارغة قبل النص أو بعده (لتوزيع صفوف ملوّنة بمسافة ثابتة بالبكسل)\nf_padB(n) =>\n    string s = \"\"\n    if n > 0\n        for i = 1 to n\n            s += blank + \"\\n\"\n    s\n\nf_padA(n) =>\n    string s = \"\"\n    if n > 0\n        for i = 1 to n\n            s += \"\\n\" + blank\n    s\n\n// نص صف واحد: قمة/قاع/تزايد/ترتيب\nf_row(q, dd, ot, nmv) =>\n    string txt = \"\"\n    if q == 2 and starTxt != \"\"\n        txt := starTxt\n        if dd != \"\"\n            txt += \" \" + dd\n    else\n        word = q == 0 ? wPeak : q == 1 ? wTrough : (q >= 2 and q <= 5) ? \"(\" + str.tostring(q - 1) + \")\" : q == 6 ? wRank : (ot == \"\" ? \"-\" : ot)\n        if compactMode\n            txt := q < 2 ? dd : (dd == \"\" ? word : word + \" \" + dd)\n        else\n            txt := word\n            if dd != \"\"\n                txt += \" | \" + dd\n    if showName and nmv != \"\"\n        txt += \" · \" + nmv\n    txt\n\n// لون التاريخ حسب رتبته: 0 اليوم، 1 يوم بعد، 2 الشهر، 3 OPX، 4 الأسبوع، غير ذلك أخرى\nf_rkCol(r) =>\n    r == 0 ? cDay : r == 1 ? cNextD : r == 2 ? cMonthD : r == 3 ? cOpxD : r == 4 ? cWeekD : cOtherD\n\n// تنسيق رقم صحيح بفواصل الآلاف (19711 ← 19,711)\nf_num(x) =>\n    s = str.tostring(math.round(math.abs(x)))\n    string r = \"\"\n    L = str.length(s)\n    for i = 0 to L - 1\n        r += str.substring(s, i, i + 1)\n        rm = L - 1 - i\n        if rm > 0 and rm % 3 == 0\n            r += \",\"\n    r\n\n// وصف واحد لكل تاريخ بالأولوية:\n// اليوم > آخر يوم عمل بالشهر (الشهر الحالي / اسم الشهر) > OPX{الشهر} (ثالث جمعة) > الأسبوع (أقرب جمعة) > يوم بعد > يوم + شهر\n// عطلة نهاية الأسبوع: أول يوم تداول (الإثنين) = «اليوم»\nf_date(ex) =>\n    string res = \"\"\n    int rk = 6\n    kn = str.length(ex) == 8 ? str.tonumber(ex) : na\n    if not na(kn)\n        y = int(math.floor(kn / 10000))\n        m = int(math.floor((kn % 10000) / 100))\n        d = int(math.floor(kn % 100))\n        mName = (m >= 1 and m <= 12) ? array.get(isAr ? monAr : monEn, m - 1) : str.tostring(m)\n\n        nowNoon = timestamp(tz, year(timenow, tz), month(timenow, tz), dayofmonth(timenow, tz), 12, 0, 0)\n        dowNow = dayofweek(nowNoon, tz)\n        addD = dowNow == dayofweek.saturday ? 2 : dowNow == dayofweek.sunday ? 1 : 0\n        tdNoon = nowNoon + addD * 86400000\n        dowT = dayofweek(tdNoon, tz)\n        todayK = f_key(tdNoon)\n        nextK = f_key(tdNoon + (dowT == dayofweek.friday ? 3 : 1) * 86400000)\n        friK = f_key(tdNoon + ((dayofweek.friday - dowT + 7) % 7) * 86400000)\n        isCurMonth = m == month(tdNoon, tz) and y == year(tdNoon, tz)\n\n        dow = dayofweek(timestamp(tz, y, m, d, 12, 0, 0), tz)\n        nextM = m == 12 ? 1 : m + 1\n        nextY = m == 12 ? y + 1 : y\n        lastTs = timestamp(tz, nextY, nextM, 1, 12, 0, 0) - 86400000\n        lastD = dayofmonth(lastTs, tz)\n        lastDow = dayofweek(lastTs, tz)\n        lastBiz = lastD - (lastDow == dayofweek.sunday ? 2 : lastDow == dayofweek.saturday ? 1 : 0)\n        isOpx = dow == dayofweek.friday and d >= 15 and d <= 21\n\n        res := kn == todayK ? wToday : d == lastBiz ? (isCurMonth ? wMonth : mName) : isOpx ? \"OPX\" + str.tostring(m) + rlm : kn == friK ? wWeek : kn == nextK ? wNext : str.tostring(d) + \" \" + mName\n        rk := kn == todayK ? 0 : d == lastBiz ? 2 : isOpx ? 3 : kn == friK ? 4 : kn == nextK ? 1 : 5\n    [res, rk]\n\n// ===== الرسم =====\nif barstate.islast\n    while array.size(lns) > 0\n        line.delete(array.pop(lns))\n    while array.size(lbs) > 0\n        label.delete(array.pop(lbs))\n    for i = 0 to AXN - 1\n        array.set(axisPx, i, na)\n\n    myTk = f_canon(str.length(srcTicker) > 0 ? srcTicker : syminfo.ticker)\n    rows = str.split(levelsTxt + \"\\n\" + levelsTxt2 + \"\\n\" + levelsTxt3, \"\\n\")\n    sz = txtSize == \"tiny\" ? size.tiny : txtSize == \"normal\" ? size.normal : txtSize == \"large\" ? size.large : size.small\n    lst = lineSty == \"متقطع\" ? line.style_dashed : lineSty == \"منقط\" ? line.style_dotted : line.style_solid\n    stl = labelMode == \"فوق الخط\" ? (alignEnd ? label.style_label_lower_right : label.style_label_lower_left) : (alignEnd ? label.style_label_right : label.style_label_left)\n    hal = alignEnd ? text.align_right : text.align_left\n\n    // --- الأسعار المخفية ---\n    hid = array.new_float()\n    hp = str.split(hidTxt, \",\")\n    for i = 0 to array.size(hp) - 1\n        hv = str.tonumber(str.trim(array.get(hp, i)))\n        if not na(hv)\n            array.push(hid, hv)\n\n    // --- 1) القراءة ---\n    pxA  = array.new_float()\n    tA   = array.new_string()\n    exA  = array.new_string()\n    nmA  = array.new_string()\n    ordA = array.new_float()\n    mvA  = array.new_float()\n    oiA  = array.new_float()\n    dlA  = array.new_float()\n    rkA  = array.new_float()\n    totalRows = 0\n    for i = 0 to array.size(rows) - 1\n        ln = str.trim(array.get(rows, i))\n        if str.length(ln) > 0 and str.substring(ln, 0, 1) != \"#\"\n            p = str.split(ln, \",\")\n            if array.size(p) >= 3\n                totalRows += 1\n                tkr = f_canon(array.get(p, 0))\n                t = str.upper(str.trim(array.get(p, 1)))\n                px = str.tonumber(str.trim(array.get(p, 2)))\n                nm = array.size(p) >= 4 ? str.trim(array.get(p, 3)) : \"\"\n                ex = array.size(p) >= 5 ? str.trim(array.get(p, 4)) : \"\"\n                ok = not na(px) and (tkr == myTk or tkr == \"*\" or tkr == \"ALL\")\n                if ok and array.includes(hid, px)\n                    ok := false\n                if ok and autoDelete and str.length(ex) == 8\n                    exTs = f_expiry(ex)\n                    if not na(exTs)\n                        ok := timenow <= exTs\n                if ok\n                    kn = str.length(ex) == 8 ? str.tonumber(ex) : na\n                    array.push(pxA, px)\n                    array.push(tA, t)\n                    array.push(exA, ex)\n                    array.push(nmA, nm)\n                    array.push(mvA, array.size(p) >= 6 ? str.tonumber(str.trim(array.get(p, 5))) : na)\n                    array.push(oiA, array.size(p) >= 7 ? str.tonumber(str.trim(array.get(p, 6))) : na)\n                    array.push(dlA, array.size(p) >= 8 ? str.tonumber(str.trim(array.get(p, 7))) : na)\n                    array.push(rkA, array.size(p) >= 9 ? str.tonumber(str.trim(array.get(p, 8))) : na)\n                    array.push(ordA, math.round(px * 100) * 100000000 + nz(kn))\n\n    n = array.size(pxA)\n\n    // ترتيب التزايد 2..4: يُؤخذ من عمود الترتيب القادم من الويب (فيبقى صحيحًا عند حذف صف)، وإن غاب العمود يُحسب هنا من قيم التزايد لكل (تاريخ، جهة) تنازليًا\n    rkE = array.new_float()\n    if n > 0\n        for i = 0 to n - 1\n            float rr = array.get(rkA, i)\n            ti = array.get(tA, i)\n            if ti == \"RC\" or ti == \"RP\"\n                dli = array.get(dlA, i)\n                if na(rr) and not na(dli)\n                    int cnt = 2\n                    for k2 = 0 to n - 1\n                        if array.get(tA, k2) == ti and array.get(exA, k2) == array.get(exA, i)\n                            dlk = array.get(dlA, k2)\n                            if not na(dlk) and dlk > dli\n                                cnt += 1\n                    rr := cnt\n            array.push(rkE, rr)\n\n    // --- 2) الترتيب (سعر ثم تاريخ) والتجميع: لكل سعر 5 فئات 0 قمة 1 قاع 2 تزايد 3 ترتيب 4 أخرى ---\n    gPx   = array.new_float()\n    gHas  = array.new_bool()\n    gDt   = array.new_string()\n    gNm   = array.new_string()\n    gDC   = array.new_bool()\n    gDP   = array.new_bool()\n    gOT   = array.new_string()\n    rwG   = array.new_int()      // صفوف لكل تاريخ (لنمط التاريخ)\n    rwQ   = array.new_int()\n    rwTok = array.new_string()\n    rwRk  = array.new_int()\n    gRk   = array.new_int()   // أقرب رتبة تاريخ لكل مستوى\n    wallKeys = array.new_string()   // قمة/قاع لها تزايد ظاهر: لا يتكرر رقمها مع الأعلى تزايدًا\n    gSide = array.new_int()   // جهة الخط: 1 كول، 2 بوت، 0 حيادي/بلا جهة\n\n    if n > 0\n        idx = array.sort_indices(ordA, order.ascending)\n        rowG = array.new_int()\n        float lastKey = na\n        // المرور الأول: تكوين المجموعات\n        for k = 0 to n - 1\n            j = array.get(idx, k)\n            px = array.get(pxA, j)\n            t = array.get(tA, j)\n            key = math.round(px * 100)\n            if not mergeSame or na(lastKey) or key != lastKey\n                array.push(gPx, px)\n                array.push(gDC, false)\n                array.push(gDP, false)\n                array.push(gOT, \"\")\n                array.push(gRk, 9)\n                for q = 0 to NC - 1\n                    array.push(gHas, false)\n                    array.push(gDt, \"\")\n                    array.push(gNm, \"\")\n            lastKey := key\n            gi = array.size(gPx) - 1\n            array.push(rowG, gi)\n            cat = f_cat(t, array.get(rkE, j))\n            ci = gi * NC + cat\n            array.set(gHas, ci, true)\n            dl0 = array.get(dlA, j)\n            if cat < 2 and not na(dl0) and dl0 > 0\n                array.push(wallKeys, str.tostring(gi) + \"|\" + (cat == 0 ? \"1\" : \"2\") + \"|\" + array.get(exA, j))\n            nmv = array.get(nmA, j)\n            if nmv != \"\"\n                array.set(gNm, ci, nmv)\n            if t == \"DC\" or t == \"RC\"\n                array.set(gDC, gi, true)\n            if t == \"DP\" or t == \"RP\"\n                array.set(gDP, gi, true)\n            if cat == 4 and array.get(gOT, gi) == \"\"\n                array.set(gOT, gi, t)\n\n        // جهة كل خط: القمة/القاع أولًا، ثم التزايد إن لم توجد قمة أو قاع\n        mm = array.size(gPx)\n        for g = 0 to mm - 1\n            hP = array.get(gHas, g * NC)\n            hT = array.get(gHas, g * NC + 1)\n            dc = array.get(gDC, g)\n            dp = array.get(gDP, g)\n            int sd = 0\n            if hP and hT\n                sd := 0\n            else if hP\n                sd := 1\n            else if hT\n                sd := 2\n            else if dc and dp\n                sd := 0\n            else if dc\n                sd := 1\n            else if dp\n                sd := 2\n            array.push(gSide, sd)\n\n        // المرور الثاني: التواريخ (أمام تاريخ التزايد حرف C أو P عند الحاجة)\n        for k = 0 to n - 1\n            j = array.get(idx, k)\n            gi = array.get(rowG, k)\n            t = array.get(tA, j)\n            cat = f_cat(t, array.get(rkE, j))\n            ci = gi * NC + cat\n            [dtxt, drk] = f_date(array.get(exA, j))\n            array.set(gRk, gi, math.min(array.get(gRk, gi), drk))\n            string tok = compactMode ? \"\" : dtxt\n            if cat >= 2 and cat <= 5 and (t == \"DC\" or t == \"DP\" or t == \"RC\" or t == \"RP\") and (showCP or compactMode)\n                L = (t == \"DC\" or t == \"RC\") ? \"C\" : \"P\"\n                tok := tok == \"\" ? L + rlm : L + rlm + \" \" + tok\n            else if compactMode and cat < 2\n                tok := (cat == 0 ? \"C\" : \"P\") + rlm\n            // حركة القمة/القاع (▲ ▼ وعدد النقاط) ثم الأوبن (+التزايد) عند وجود تزايد\n            mvv = array.get(mvA, j)\n            oiv = array.get(oiA, j)\n            dlv = array.get(dlA, j)\n            string extra = \"\"\n            if showMove and (cat == 0 or cat == 1) and not na(mvv) and mvv != 0\n                extra := (mvv > 0 ? \"▲\" : \"▼\") + f_num(mvv)\n            wk = str.tostring(gi) + \"|\" + ((t == \"DC\" or t == \"RC\") ? \"1\" : \"2\") + \"|\" + array.get(exA, j)\n            dupNums = cat >= 2 and cat <= 5 and array.includes(wallKeys, wk)\n            bool hasDl = not na(dlv) and dlv > 0\n            bool hasOi = not na(oiv) and oiv > 0\n            if showNums and not dupNums and (hasDl or hasOi)\n                string nums = hasOi ? f_num(oiv) : \"\"\n                if hasDl\n                    nums := (nums == \"\" ? \"\" : nums + \" \") + \"(+\" + f_num(dlv) + \")\"\n                extra := extra == \"\" ? nums : extra + \"  \" + nums\n            if extra != \"\"\n                tok := tok == \"\" ? extra : tok + \"  \" + extra\n            cur = array.get(gDt, ci)\n            if tok != \"\" and not f_has(cur, tok)\n                array.set(gDt, ci, cur == \"\" ? tok : cur + \" + \" + tok)\n            // صف مستقل لكل (فئة، تاريخ) لنمط التلوين حسب التاريخ\n            bool dupR = false\n            rn0 = array.size(rwG)\n            if rn0 > 0\n                for r = 0 to rn0 - 1\n                    if array.get(rwG, r) == gi and array.get(rwQ, r) == cat and array.get(rwTok, r) == tok\n                        dupR := true\n            if not dupR\n                array.push(rwG, gi)\n                array.push(rwQ, cat)\n                array.push(rwTok, tok)\n                array.push(rwRk, drk)\n\n    m = array.size(gPx)\n\n    // --- 3) الصفوف والرسم: كل نص يُثبَّت عند سعر خطه تمامًا (بلا إزاحة) ---\n    xLine = bar_index + (extendR ? lenFwd : math.max(lenFwd, txtOffset))\n    xLbl  = bar_index + txtOffset\n\n    if m > 0\n        for g = 0 to m - 1\n            px = array.get(gPx, g)\n            price = px * ratio\n            hasP = array.get(gHas, g * NC)\n            hasT = array.get(gHas, g * NC + 1)\n            hasD = array.get(gHas, g * NC + 2) or array.get(gHas, g * NC + 3) or array.get(gHas, g * NC + 4) or array.get(gHas, g * NC + 5)\n            hasS = array.get(gHas, g * NC + 6)\n            dcf = array.get(gDC, g)\n            dpf = array.get(gDP, g)\n            sd = array.get(gSide, g)\n            conflict = (hasP and hasT) or (not hasP and not hasT and dcf and dpf)\n\n            // لون الخط\n            color lc = oneColor\n            if byDate\n                lc := f_rkCol(array.get(gRk, g))\n            else if byType\n                if conflict\n                    lc := cN\n                else if sd == 1\n                    lc := cCall\n                else if sd == 2\n                    lc := cPut\n                else if hasD\n                    lc := cD\n                else if hasS\n                    lc := cS\n\n            // الصفوف (من الأعلى للأسفل): قمة، قاع، تزايد، ترتيب، أخرى\n            rt = array.new_string()\n            rc = array.new_color()\n            for q = 0 to NC - 1\n                if array.get(gHas, g * NC + q)\n                    ot = array.get(gOT, g)\n                    nmv = array.get(gNm, g * NC + q)\n                    if byDate\n                        int cntR = 0\n                        rn = array.size(rwG)\n                        if rn > 0\n                            for r = 0 to rn - 1\n                                if array.get(rwG, r) == g and array.get(rwQ, r) == q\n                                    array.push(rt, f_row(q, array.get(rwTok, r), ot, nmv))\n                                    array.push(rc, f_rkCol(array.get(rwRk, r)))\n                                    cntR += 1\n                        if cntR == 0\n                            array.push(rt, f_row(q, \"\", ot, nmv))\n                            array.push(rc, cOtherD)\n                    else\n                        color rowC = oneColor\n                        if byType\n                            rowC := q == 0 ? cCall : q == 1 ? cPut : (q >= 2 and q <= 5) ? (dcf and dpf ? cN : dcf ? cCall : dpf ? cPut : cD) : q == 6 ? cS : oneColor\n                        array.push(rt, f_row(q, array.get(gDt, g * NC + q), ot, nmv))\n                        array.push(rc, rowC)\n\n            K = array.size(rt)\n            string allT = \"\"\n            if K > 0\n                string first = array.get(rt, 0)\n                if showDist and close != 0\n                    pct = (price - close) / close * 100\n                    first += \"  (\" + (pct >= 0 ? \"+\" : \"\") + str.tostring(pct, \"#.##\") + \"%)\"\n                if showPxInText or g >= AXN or not showAxis\n                    first := str.tostring(px) + \" \" + first\n                array.set(rt, 0, first)\n                for i = 0 to K - 1\n                    t2 = emb + array.get(rt, i) + pdf\n                    array.set(rt, i, t2)\n                    allT := i == 0 ? t2 : allT + \"\\n\" + t2\n\n            array.push(lns, line.new(math.max(0, bar_index - lenBack), price, xLine, price, color=color.new(lc, lineTransp), width=lineW, style=lst, extend=extendR ? extend.right : extend.none))\n            if g < AXN\n                array.set(axisPx, g, price)\n                array.set(axisCol, g, lc)\n\n            if showText and K > 0\n                bgc = bgOn ? color.new(chart.bg_color, bgTransp) : color.new(lc, 100)\n                if uni or K == 1\n                    c1 = uni ? lc : array.get(rc, 0)\n                    array.push(lbs, label.new(xLbl, price, allT, style=stl, color=bgc, textcolor=color.new(c1, textTransp), size=sz, textalign=hal))\n                else\n                    // خلفية واحدة للكتلة، ثم كل صف بلونه في موضعه\n                    if bgOn\n                        array.push(lbs, label.new(xLbl, price, allT, style=stl, color=bgc, textcolor=color.new(color.white, 100), size=sz, textalign=hal))\n                    for i = 0 to K - 1\n                        ci3 = array.get(rc, i)\n                        array.push(lbs, label.new(xLbl, price, f_padB(i) + array.get(rt, i) + f_padA(K - 1 - i), style=stl, color=color.new(ci3, 100), textcolor=color.new(ci3, textTransp), size=sz, textalign=hal))\n\n    // --- 4) لوحة المعلومات ---\n    table.clear(infoTbl, 0, 0)\n    if showInfo\n        if n == 0\n            table.cell(infoTbl, 0, 0, \"Oi Levels \" + VER + \": لا توجد مستويات مطابقة للرمز \" + myTk + \" (الأسطر المقروءة: \" + str.tostring(totalRows) + \")\", text_color=color.orange, text_size=size.small, bgcolor=color.new(chart.bg_color, 30))\n        else\n            table.cell(infoTbl, 0, 0, \"Oi Levels \" + VER + \": \" + str.tostring(m) + \" مستوى | \" + myTk, text_color=color.gray, text_size=size.small, bgcolor=color.new(chart.bg_color, 50))\n\n// ===== صناديق الأرقام على محور السعر (تظهر بلا رسم داخل الشارت) =====\nplot(showAxis and barstate.islast ? array.get(axisPx, 0) : na, \"L1\", color=array.get(axisCol, 0), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 1) : na, \"L2\", color=array.get(axisCol, 1), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 2) : na, \"L3\", color=array.get(axisCol, 2), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 3) : na, \"L4\", color=array.get(axisCol, 3), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 4) : na, \"L5\", color=array.get(axisCol, 4), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 5) : na, \"L6\", color=array.get(axisCol, 5), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 6) : na, \"L7\", color=array.get(axisCol, 6), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 7) : na, \"L8\", color=array.get(axisCol, 7), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 8) : na, \"L9\", color=array.get(axisCol, 8), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 9) : na, \"L10\", color=array.get(axisCol, 9), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 10) : na, \"L11\", color=array.get(axisCol, 10), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 11) : na, \"L12\", color=array.get(axisCol, 11), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 12) : na, \"L13\", color=array.get(axisCol, 12), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 13) : na, \"L14\", color=array.get(axisCol, 13), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 14) : na, \"L15\", color=array.get(axisCol, 14), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 15) : na, \"L16\", color=array.get(axisCol, 15), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 16) : na, \"L17\", color=array.get(axisCol, 16), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 17) : na, \"L18\", color=array.get(axisCol, 17), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 18) : na, \"L19\", color=array.get(axisCol, 18), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 19) : na, \"L20\", color=array.get(axisCol, 19), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 20) : na, \"L21\", color=array.get(axisCol, 20), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 21) : na, \"L22\", color=array.get(axisCol, 21), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 22) : na, \"L23\", color=array.get(axisCol, 22), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 23) : na, \"L24\", color=array.get(axisCol, 23), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 24) : na, \"L25\", color=array.get(axisCol, 24), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 25) : na, \"L26\", color=array.get(axisCol, 25), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 26) : na, \"L27\", color=array.get(axisCol, 26), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 27) : na, \"L28\", color=array.get(axisCol, 27), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 28) : na, \"L29\", color=array.get(axisCol, 28), display=display.price_scale)\nplot(showAxis and barstate.islast ? array.get(axisPx, 29) : na, \"L30\", color=array.get(axisCol, 29), display=display.price_scale)\n";

/** نسخ نص للحافظة (مع احتياط للمتصفحات القديمة) */
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

/** نص مستويات TradingView: سطر لكل مستوى → الرمز,النوع,السعر,الاسم,YYYYMMDD[,الحركة,الأوبن,التزايد,الترتيب]
 *  الحركة: عدد نقاط حركة القمة/القاع عن السحب السابق (موجب ↑ سالب ↓)، والأوبن والتزايد للمستوى */
function tvBuildLines(rep, tk, types) {
  var out = [], seen = {};
  out.ranks = {};
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
    var rk = ex.rank ? String(ex.rank) : "";                                          // ترتيب التزايد (1 إلى 4) — عمود تاسع يقرأه المؤشر
    var tail = (mv || oi || dl || rk) ? "," + mv + "," + oi + "," + dl + (rk ? "," + rk : "") : "";
    var line = tk + "," + t + "," + p + "," + nm(exp) + "," + ymd(exp) + tail;
    out.push(line);
    if (ex.rank) out.ranks[line] = ex.rank;   // للواجهة (ويدخل النص المنسوخ أيضًا كعمود الترتيب)
  }
  if (types.P) (rep.peaks || []).forEach(function (x) { add("P", x.strike, x.exp, x); });
  if (types.T) (rep.troughs || []).forEach(function (x) { add("T", x.strike, x.exp, x); });
  function ranked(list) {   // { تاريخ: [عناصر مرتبة بالتزايد تنازليًا] }
    var m = {};
    (list || []).forEach(function (x) { (m[x.exp] = m[x.exp] || []).push(x); });
    Object.keys(m).forEach(function (e) { m[e].sort(function (a, b) { return b.value - a.value; }); });
    return m;
  }
  function addRanked(lc, lp, ranks, cc, cp) {
    [[cc, lc], [cp, lp]].forEach(function (q) {
      var m = ranked(q[1]);
      Object.keys(m).forEach(function (e) {
        ranks.forEach(function (r) { var x = m[e][r]; if (x) add(q[0], x.strike, e, { oi: x.oi, delta: x.value, rank: r + 1 }); });
      });
    });
  }
  if (types.O && rep.opxLv) {
    (rep.opxLv.peaks || []).forEach(function (x) { add("P", x.strike, x.exp, x); });
    (rep.opxLv.troughs || []).forEach(function (x) { add("T", x.strike, x.exp, x); });
    if (types.D) addRanked(rep.opxLv.deltaCall, rep.opxLv.deltaPut, [0], "DC", "DP");
    if (types.R) addRanked(rep.opxLv.deltaCall, rep.opxLv.deltaPut, [1, 2, 3], "RC", "RP");
  }
  if (types.R) addRanked(rep.deltaCall, rep.deltaPut, [1, 2, 3], "RC", "RP");   // ترتيب التزايد: الثاني والثالث والرابع
  if (types.D && rep.topPer) {
    (rep.topPer.call || []).forEach(function (x) { add("DC", x.strike, x.exp, { oi: x.oi, delta: x.value }); });
    (rep.topPer.put || []).forEach(function (x) { add("DP", x.strike, x.exp, { oi: x.oi, delta: x.value }); });
  }
  if (types.S) {
    [["SC", rep.scoresCall], ["SP", rep.scoresPut]].forEach(function (q) {
      (q[1] || []).slice(0, 3).forEach(function (sc) {
        var ex = Object.keys(sc.exps || {}).sort().pop() || ((rep.exps || [])[0]) || "";
        add(q[0], sc.strike, ex);
      });
    });
  }
  return out;
}

/** تقرير رمز آخر بنفس تواريخ/أيام/سترايكات التقرير الحالي (لنسخ عدة رموز دفعة واحدة) */
async function tvReportFor(tk, params, stOver) {
  var keep = state.ticker;
  try {
    var d = await loadTicker(tk);
    if (!d) return null;
    state.ticker = tk;
    var ex = (params.exps || []).filter(function (e) { return d.by_expiration && d.by_expiration[e]; });
    if (!ex.length) return null;
    var st0 = stOver || params.strikes;   // عدد سترايكات خاص بهذا الرمز (إن وُجد) وإلا إعداد التقرير
    var st = /^range:/.test(String(st0)) ? "ALL" : st0;
    return computeReports(d, ex, params.days, st, params.n, params.g);
  } catch (e) { return null; } finally { state.ticker = keep; }
}

/** نافذة «نسخ TradingView» — رموز متعددة في نص واحد، مستويات مقسّمة بين الرموز وقابلة للحذف بـ × */
function openTvDialog(params) {
  var old = document.getElementById("repTvPop"); if (old) old.remove();
  var TICKS = INDEX_TICKERS.map(function (t) { return t.symbol; });      // المؤشرات الستة: SPY QQQ IWM GLD SPX NDX
  var COMPS = STOCKS_TICKERS.map(function (t) { return t.symbol; });     // الشركات (قائمة منسدلة)
  var ALLT = TICKS.concat(COMPS), compOpen = COMPS.indexOf(state.ticker) >= 0;
  var TYPES = [["P", "القمم"], ["T", "القيعان"], ["D", "الأعلى تزايدًا"], ["R", "ترتيب التزايد"], ["S", "الأعلى في الترتيب"], ["O", "OPXs"]];
  var SECS = [["القمم والقيعان", ["P", "T"]], ["الأعلى تزايدًا", ["DC", "DP"]], ["ترتيب التزايد (2 - 4)", ["RC", "RP"]], ["الأعلى في الترتيب", ["SC", "SP"]]];
  var TN = { P: "قمة", T: "قاع", DC: "Call", DP: "Put", RC: "Call", RP: "Put", SC: "Call", SP: "Put" };
  var selT = {}; selT[state.ticker] = true; selT.SPY = true; selT.QQQ = true;
  var selK = { P: true, T: true }, selRk = { 2: true, 3: true, 4: true };
  var cache = {}, deleted = {}, lastLevels = [], selS = {};   // selS: عدد السترايكات لكل رمز
  var pop = document.createElement("div");
  pop.id = "repTvPop"; pop.className = "tv-pop";
  pop.innerHTML = '<div class="tv-box" dir="rtl">' +
    '<button type="button" class="tv-x" id="tvClose" aria-label="إغلاق">×</button>' +
    '<div class="tv-head"><div class="tv-title"><bdi dir="ltr">TradingView</bdi></div></div>' +
    '<div class="tv-body">' +
    '<div class="tv-sec"><div class="tv-lab">الرموز والسترايكات</div><div class="tv-strips" id="tvSyms"></div><div class="tv-more" id="tvMore"></div></div>' +
    '<div class="tv-sec"><div class="tv-lab">نوع المستويات</div><div class="tv-strips"><div class="tv-strip"><div class="tv-strip-in" id="tvTypes"></div></div><div class="tv-strip" id="tvRankStrip"><span class="tv-strip-lab">الترتيبات المضمّنة</span><div class="tv-strip-in" id="tvRanks"></div></div></div></div>' +
    '<div class="tv-sec"><div class="tv-lab">المستويات <span id="tvCount"></span><button type="button" class="tv-restore" id="tvRestore" style="display:none"></button></div><div class="tv-cards" id="tvLevels"></div></div>' +
    "</div>" +
    '<div class="tv-foot"><button type="button" class="tv-copy" id="tvCopy"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg><span>نسخ المستويات</span><em id="tvCopyN"></em></button></div></div>';
  document.body.appendChild(pop);
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
    var rkStrip = document.getElementById("tvRankStrip"), rkHost = document.getElementById("tvRanks");
    rkStrip.style.display = selK.R ? "" : "none";
    rkHost.innerHTML = selK.R ? [2, 3, 4].map(function (n) { return chip("الترتيب " + n, !!selRk[n], 'data-rk="' + n + '"'); }).join("") : "";
    pop.querySelectorAll("[data-rk]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-rk"); selRk[k] = !selRk[k]; drawChips(); build(); }; });
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
        var p = line.split(","), rkv = (rows.ranks || {})[line] || 0;
        if (rkv >= 2 && !selRk[rkv]) return;   // استبعاد ترتيب غير مختار
        all.push({ line: line, tk: p[0], t: p[1], price: p[2], label: p[3], mv: p[5] || "", rank: rkv >= 2 ? rkv : 0 });
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
          var tag = l.t.charAt(0) === "D" ? '<i class="tv-star" title="الأعلى تزايدًا">★</i>' : (l.rank ? '<i class="tv-rk" title="ترتيب التزايد ' + l.rank + '">' + l.rank + "</i>" : "");
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
async function buildBoxesReports(exps, days, strikes, topN, gDays) {
  var out = {}, keep = state.ticker;
  try {
    var list = ["SPY", "QQQ"];
    for (var i = 0; i < list.length; i++) {
      var tk = list[i], d = await loadTicker(tk);
      if (!d) return null;
      state.ticker = tk;
      var ex = exps.filter(function (e) { return d.by_expiration && d.by_expiration[e]; });
      var st = /^range:/.test(String(strikes)) ? "ALL" : strikes;
      out[tk] = computeReports(d, ex, days, st, topN, gDays);
    }
  } finally { state.ticker = keep; }
  return out;
}
function renderBoxesView(b) {
  var A = b.SPY, B = b.QQQ;
  function byExp(list) { var m = {}; (list || []).forEach(function (x) { m[x.exp] = x; }); return m; }
  function f(v) { return Number(v).toLocaleString(); }
  function mv(x) {
    if (x.move === "↑") return '<span class="mv-up">▲ ' + Math.abs(x.diff) + "</span>";
    if (x.move === "↓") return '<span class="mv-down">▼ ' + Math.abs(x.diff) + "</span>";
    return "—";
  }
  function cells(x, sep) {
    var s0 = sep ? ' class="rep-bx-sep"' : "";
    if (!x || x.strike == null) return "<td" + s0 + ">—</td><td>—</td><td>—</td><td>—</td>";
    var d = x.delta == null || x.delta === 0 ? "" : '<small class="rep-dl ' + (x.delta > 0 ? "up" : "dn") + '">' + (x.delta > 0 ? "+" : "−") + f(Math.abs(x.delta)) + "</small>";
    return '<td class="rep-path' + (sep ? " rep-bx-sep" : "") + '">' + (x.path || []).join(" → ") + "</td><td>" + mv(x) + "</td><td>" + (x.oi == null ? "—" : f(x.oi)) + d + '</td><td class="rep-bx-k"><b>' + x.strike + "</b></td>";
  }
  function opxName(e) { return "OPX " + new Date(String(e) + "T12:00:00").toLocaleString("en", { month: "short" }); }
  function card(title, la, lb, isOpx) {
    var ma = byExp(la), mb = byExp(lb), ex = Object.keys(ma).concat(Object.keys(mb).filter(function (e) { return !(e in ma); })).sort();
    if (!ex.length) return "";
    var h = '<div class="rep-card rep-secbox"><div class="rep-card-title">' + title + '</div><div class="rep-tbl-scroll"><table class="rep-table rep-boxes" dir="rtl"><thead><tr><th>' + (isOpx ? "OPX" : "اليوم") + '</th><th>المسار · SPY</th><th>الحركة</th><th>OI</th><th>Strike · SPY</th><th class="rep-bx-sep">المسار · QQQ</th><th>الحركة</th><th>OI</th><th>Strike · QQQ</th></tr></thead><tbody>';
    ex.forEach(function (e) { h += "<tr><td>" + (isOpx ? opxName(e) : reportDayLabel(e)) + "</td>" + cells(ma[e]) + cells(mb[e], true) + "</tr>"; });
    return h + "</tbody></table></div></div>";
  }
  var html = '<div class="rep-sec-h">SPY · QQQ</div>';
  html += card("القيعان · Put", A.troughs, B.troughs, false);
  html += card("القمم · Call", A.peaks, B.peaks, false);
  var oa = A.opxLv || {}, ob = B.opxLv || {};
  var o1 = card("OPXs · القيعان · Put", oa.troughs, ob.troughs, true), o2 = card("OPXs · القمم · Call", oa.peaks, ob.peaks, true);
  if (o1 || o2) html += '<div class="rep-sec-h">OPXs</div>' + o1 + o2;
  return repBidi(html);
}

function openReports() {
  ensureEq().then(updateRatioStat);
  ensureRepFind();
  var data = state.cache[state.ticker];
  if (!data) {
    setStatus("لا بيانات — انتظر التحميل أو حدد مؤشرًا", "err");
    return;
  }
  var modal = document.getElementById("reportsModal");
  var body = document.getElementById("reportsBody");
  var sub = document.getElementById("reportsSub");
  if (!modal || !body) {
    setStatus("نافذة Reports غير موجودة", "err");
    return;
  }
  if (sub) sub.textContent = state.ticker + " · حدد التواريخ ثم توليد التقرير";

  var allExps = Object.keys(data.by_expiration || {}).sort();
  var exps = filterTickerExpirations(state.ticker, allExps);
  if (!exps.length) {
    setStatus("لا تواريخ انتهاء متاحة", "err");
    return;
  }
  var curExp = state.expiration;
  var html = "";
  html += '<div class="rep-controls">';
  var rGroups = {}, rOrder = [];
  exps.forEach(function (exp) {
    var meta = formatExpExportChip(exp);
    if (!rGroups[meta.monthKey]) { rGroups[meta.monthKey] = { label: meta.monthLabel, items: [] }; rOrder.push(meta.monthKey); }
    rGroups[meta.monthKey].items.push({ exp: exp, meta: meta });
  });
  html += '<div class="exp-export-block">';
  html += '<div class="exp-month-list">';
  rOrder.forEach(function (key) {
    var g = rGroups[key];
    html += '<div class="exp-month"><div class="exp-month-title">' + (g.label || key) + '</div><div class="exp-month-dates">';
    html += '<button type="button" class="exp-date-chip rep-month-all" data-rmonth="' + key + '"><span class="d">الكل</span><span class="s">' + g.items.length + " يوم</span></button>";
    g.items.forEach(function (it) {
      html += '<button type="button" class="exp-date-chip' + (it.exp === curExp ? " on" : "") + '" data-rm="' + key + '" data-rexp="' + it.exp + '">' +
        '<span class="d">' + it.meta.day + (it.meta.monShort ? " " + it.meta.monShort : "") + '</span>' +
        '<span class="s">' + it.meta.sub + "</span></button>";
    });
    html += "</div></div>";
  });
  html += "</div></div>";

  var dChips = ["2", "3", "5", "10", "ALL"], sChips = ["30", "50", "100", "ALL"];
  var nChips = ["3", "5", "10"], gChips = ["2", "3", "5", "10"];
  var rpf = loadRepPrefs();
  var curN = String(rpf.n || 5);
  var dNum0 = parseInt(String(state.days), 10);
  var curG = isFinite(dNum0) && dNum0 > 0 ? String(dNum0) : "";   // النمو يتبع الأيام تلقائيًا (ALL = تلقائي)
  var dFree = dChips.indexOf(String(state.days)) < 0 ? String(state.days || "") : "";
  var rgm0 = /^range:([\d.]+):([\d.]+)$/.exec(String(state.strikes || ""));
  var rgFrom = rgm0 ? rgm0[1] : "", rgTo = rgm0 ? rgm0[2] : "";
  var sFree = sChips.indexOf(String(state.strikes)) < 0 && !rgm0 ? String(state.strikes || "") : "";
  function grp(label, chips, attr, cur, free) {
    var h = '<div class="rep-grp"><span class="rep-lab">' + label + "</span>";
    chips.forEach(function (c) {
      h += '<button type="button" class="rchip' + (cur === c ? " on" : "") + '" ' + attr + '="' + c + '">' + c + "</button>";
    });
    if (free) h += free;
    return h + "</div>";
  }
  html += '<div class="rep-bar">';
  html += grp("DAYS", dChips, "data-rdays", String(state.days), '<input id="repDaysFree" class="rep-free" type="number" min="1" max="60" value="' + dFree + '" placeholder="—" title="عدد أيام حر" />');
  html += '<span class="rep-sep"></span>';
  html += grp("STRIKES", sChips, "data-rstrikes", String(state.strikes), '' +
    '<span class="rep-rng-l">من</span><input id="repRngFrom" class="rep-free rep-free-n rep-rng" type="number" value="' + rgFrom + '" title="من سترايك" />' +
    '<span class="rep-rng-l">إلى</span><input id="repRngTo" class="rep-free rep-free-n rep-rng" type="number" value="' + rgTo + '" title="إلى سترايك" />');
  html += '<span class="rep-sep"></span>';
  html += '<div class="rep-grp"><span class="rep-lab">TOP</span><input id="repTopInput" class="rep-free rep-free-n" type="number" min="1" max="50" value="' + curN + '" title="عدد النتائج" /></div>';
  html += '<span class="rep-sep"></span>';
  html += '<div class="rep-grp"><span class="rep-lab">G</span><input id="repGrowthInput" class="rep-free rep-free-n" type="number" min="1" max="60" value="' + curG + '" placeholder="تلقائي" title="أيام النمو — تتبع عدد الأيام تلقائيًا، ويمكن تعديلها يدويًا" /></div>';
  html += '<span class="rep-sep"></span>';
  html += '<div class="rep-search"><button type="button" id="repLensBtn" class="rep-lens-btn" title="بحث سترايك">' +
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>' +
    '<input id="repLensInput" class="rep-lens-input" type="number" step="0.5" placeholder="اكتب السترايك" title="عدسة السترايك" /></div>';
  html += "</div>";

  html += '<div class="rep-actions">';
  html += '<button type="button" class="rep-btn rep-btn-run" id="repRunBtn">عرض التقرير</button>';
  html += '<div class="rep-seg" dir="rtl"><button type="button" class="rep-seg-btn" id="repTvCode" title="نسخ كود مؤشر Pine لتركيبه في TradingView (مرة واحدة)">نسخ كود المؤشر</button>' +
    '<button type="button" class="rep-seg-btn" id="repTvBtn" title="نسخ مستويات الويب لمؤشر TradingView">نسخ <bdi dir="ltr">TradingView</bdi></button></div>';
  html += "</div></div>";
  html += '<div class="rep-tabs" id="repTabs" style="display:none"><button type="button" class="rep-tab on" data-rtab="main">التقرير</button><button type="button" class="rep-tab" data-rtab="pair">الصندوق · المؤشر</button><button type="button" class="rep-tab" data-rtab="boxes" id="repTabBoxes" style="display:none">الصندوقين</button></div>';
  html += '<div id="repResult" class="rep-result"></div>';
  body.innerHTML = html;
  modal.classList.remove("hidden"); modal.style.display = ""; modal.setAttribute("aria-hidden", "false");
  // إظهار أعلى نافذة التقارير عند الفتح
  try {
    body.scrollTop = 0;
    if (typeof body.scrollTo === "function") body.scrollTo(0, 0);
    modal.scrollTop = 0;
    if (typeof modal.scrollTo === "function") modal.scrollTo(0, 0);
    var panel = modal.querySelector(".map-panel, .reports-panel");
    if (panel) panel.scrollTop = 0;
  } catch (eOpenScroll) {}

  var rdays = String(state.days || "2");
  var rstrikes = String(state.strikes || "30");
  var lastRep = null;
  var repHidden = {};
  var lensRep = null;
  var lastParams = null;
  var gManual = false;   // true لو عدّل المستخدم خانة G بنفسه
  var gInputEl = document.getElementById("repGrowthInput");
  function syncGFromDays() {
    if (gManual || !gInputEl) return;
    var n = parseInt(rdays, 10);
    gInputEl.value = isFinite(n) && n > 0 ? String(n) : "";
  }
  function currentG() {
    var v = parseInt(gInputEl && gInputEl.value, 10);
    if (isFinite(v) && v > 0) return v;
    var n = parseInt(rdays, 10);
    return isFinite(n) && n > 0 ? n : 999;   // ALL → كل الأعمدة المتاحة
  }

  var dFreeEl = document.getElementById("repDaysFree");
  var sFreeEl = document.getElementById("repStrikesFree");
  body.querySelectorAll("[data-rdays]").forEach(function (btn) {
    btn.onclick = function () {
      rdays = btn.getAttribute("data-rdays");
      if (dFreeEl) dFreeEl.value = "";
      syncGFromDays();
      body.querySelectorAll("[data-rdays]").forEach(function (b) { b.classList.toggle("on", b === btn); });
    };
  });
  body.querySelectorAll("[data-rstrikes]").forEach(function (btn) {
    btn.onclick = function () {
      rstrikes = btn.getAttribute("data-rstrikes");
      if (sFreeEl) sFreeEl.value = "";
      body.querySelectorAll("[data-rstrikes]").forEach(function (b) { b.classList.toggle("on", b === btn); });
    };
  });
  if (dFreeEl) dFreeEl.oninput = function () {
    var v = parseInt(dFreeEl.value, 10);
    if (isFinite(v) && v > 0) {
      rdays = String(v);
      body.querySelectorAll("[data-rdays]").forEach(function (b) { b.classList.remove("on"); });
      syncGFromDays();
    }
  };
  if (sFreeEl) sFreeEl.oninput = function () {
    var v = parseInt(sFreeEl.value, 10);
    if (isFinite(v) && v > 0) {
      rstrikes = String(v);
      body.querySelectorAll("[data-rstrikes]").forEach(function (b) { b.classList.remove("on"); });
    }
  };
  var rgF = document.getElementById("repRngFrom"), rgT2 = document.getElementById("repRngTo");
  function applyRng() {
    var a = parseFloat(rgF.value), b = parseFloat(rgT2.value);
    if (isFinite(a) && isFinite(b) && a !== b) {
      rstrikes = "range:" + Math.min(a, b) + ":" + Math.max(a, b);
      body.querySelectorAll("[data-rstrikes]").forEach(function (b2) { b2.classList.remove("on"); });
      if (sFreeEl) sFreeEl.value = "";
    }
  }
  if (rgF) rgF.addEventListener("input", applyRng);
  if (rgT2) rgT2.addEventListener("input", applyRng);
  body.querySelectorAll("[data-rstrikes]").forEach(function (b3) { b3.addEventListener("click", function () { if (rgF) rgF.value = ""; if (rgT2) rgT2.value = ""; }); });
  if (sFreeEl) sFreeEl.addEventListener("input", function () { if (rgF) rgF.value = ""; if (rgT2) rgT2.value = ""; });
  var topInEl = document.getElementById("repTopInput");
  if (topInEl) topInEl.oninput = function () {
    var v = parseInt(topInEl.value, 10);
    if (isFinite(v) && v > 0) saveRepPrefs({ n: String(v) });
  };
  if (gInputEl) gInputEl.oninput = function () {
    var v = parseInt(gInputEl.value, 10);
    gManual = isFinite(v) && v > 0;   // خانة فارغة = العودة للتلقائي
    if (!gManual) syncGFromDays();
  };
  var lensInEl = document.getElementById("repLensInput");
  if (lensInEl) lensInEl.onkeydown = function (ev) {
    if (ev.key === "Enter") { var lb = document.getElementById("repLensBtn"); if (lb) lb.click(); }
  };
  body.querySelectorAll(".rep-month-all").forEach(function (mb) {
    mb.onclick = function () {
      var key = mb.getAttribute("data-rmonth");
      var cs = body.querySelectorAll('.exp-date-chip[data-rm="' + key + '"]');
      var allOn = Array.prototype.every.call(cs, function (x) { return x.classList.contains("on"); });
      cs.forEach(function (x) { x.classList.toggle("on", !allOn); });
    };
  });

  var selAll = document.getElementById("repSelectAll");
  if (selAll) {
    selAll.onclick = function () {
      var allC = body.querySelectorAll(".exp-date-chip[data-rexp]");
      var allOn = Array.prototype.every.call(allC, function (x) { return x.classList.contains("on"); });
      allC.forEach(function (cb) { cb.classList.toggle("on", !allOn); });
    };
  }

  body.querySelectorAll(".exp-date-chip[data-rexp]").forEach(function (chip) {
    chip.onclick = function () { chip.classList.toggle("on"); };
  });
  var runBtn = document.getElementById("repRunBtn");
  var excelBtn = document.getElementById("repExcelBtn");
  var resultHost = document.getElementById("repResult");
  if (resultHost) resultHost.addEventListener("input", function (ev) { if (ev.target && ev.target.id === "repFind") repApplyFind(); });
  if (resultHost) resultHost.addEventListener("click", function (ev) {
    var t = ev.target;
    var xb = t && t.closest ? t.closest("[data-hk]") : null;
    var rs = t && t.closest ? t.closest(".rep-restore") : null;
    var gt = t && t.closest ? t.closest("[data-goto]") : null;
    if (gt) { var tg = document.getElementById(gt.getAttribute("data-goto")); if (tg && tg.scrollIntoView) tg.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    var sr = !xb && t && t.closest ? t.closest(".rep-sigrow") : null;
    var chp = !xb && t && t.closest ? t.closest(".rep-dc[data-exp]") : null;
    if (sr) { var pp = sr.getAttribute("data-sig").split("|"); repDrawMem(pp[0], parseInt(pp[1], 10), chp ? chp.getAttribute("data-exp") : null); return; }
    if (!xb && !rs) return;
    if (xb) repHidden[xb.getAttribute("data-hk")] = 1; else repHidden = {};
    saveRepPrefs({ hidden: repHidden });
    if (lastRep) {
      var keep = body.scrollTop;
      resultHost.innerHTML = renderReportsResult(applyRepHidden(lastRep, repHidden), state.ticker); repAutoMem();
      body.scrollTop = keep;
    }
  });

  if (runBtn) {
    runBtn.onclick = function () {
      try {
        var selected = [];
        body.querySelectorAll(".exp-date-chip.on[data-rexp]").forEach(function (cb) {
          selected.push(cb.getAttribute("data-rexp"));
        });
        if (!selected.length) {
          if (resultHost)
            resultHost.innerHTML = '<p class="status err">حدد تاريخ انتهاء واحد على الأقل</p>';
          setStatus("حدد تاريخ انتهاء واحد على الأقل", "err");
          return;
        }
        var topEl = document.getElementById("repTopInput");
        var rtop = parseInt(topEl && topEl.value, 10) || 5;
        var rgrowth = currentG();
        if (rtop < 1) rtop = 5;
        if (rgrowth < 1) rgrowth = 3;
        lastRep = computeReports(data, selected, rdays, rstrikes, rtop, rgrowth);
        repHidden = {};
        saveRepPrefs({ hidden: {} });
        saveRepPrefs({ n: String(rtop), exps: selected.slice(), days: rdays, strikes: rstrikes });
        lastParams = { exps: selected.slice(), days: rdays, strikes: rstrikes, n: rtop, g: rgrowth };
        lensRep = null;
        if (resultHost) {
          resultHost.innerHTML = renderReportsResult(applyRepHidden(lastRep, repHidden), state.ticker); repAutoMem();
          // العودة لأعلى التقرير (الملخص أولاً) بدل القفز لمنتصف النافذة
          try {
            body.scrollTop = 0;
            if (typeof body.scrollTo === "function") body.scrollTo(0, 0);
            modal.scrollTop = 0;
            resultHost.scrollTop = 0;
          } catch (e) {}
        }
        if (excelBtn) excelBtn.disabled = false;
        if (sub)
          sub.textContent = state.ticker + " · " + selected.length + " انتهاء · N " + rtop;
        var tabsEl = document.getElementById("repTabs");
        if (tabsEl) {
          tabsEl.style.display = PAIRS[state.ticker] ? "flex" : "none";
          var bxTab = document.getElementById("repTabBoxes");
          if (bxTab) bxTab.style.display = (state.ticker === "SPY" || state.ticker === "QQQ") ? "" : "none";
          body.querySelectorAll(".rep-tab").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-rtab") === "main"); });
        }
        setStatus("تم توليد التقرير", "ok");
      } catch (err) {
        console.error(err);
        if (resultHost)
          resultHost.innerHTML =
            '<p class="status err">خطأ: ' + (err && err.message ? err.message : err) + "</p>";
        setStatus("خطأ في التقرير: " + (err && err.message ? err.message : err), "err");
      }
    };
  }
  if (excelBtn) {
    excelBtn.onclick = async function () {
      if (!lastRep) {
        setStatus("ولّد التقرير أولًا قبل التصدير", "err");
        return;
      }
      excelBtn.disabled = true;
      setStatus("جاري تصدير Excel…", "");
      try {
        await exportReportsExcel(lastRep, state.ticker);
        setStatus("تم التصدير", "muted");
      } catch (err) {
        console.error(err);
        setStatus("فشل التصدير: " + (err && err.message ? err.message : err), "err");
        alert("فشل تصدير Excel: " + (err && err.message ? err.message : err));
      } finally {
        excelBtn.disabled = false;
      }
    };
  }

  body.querySelectorAll(".rep-tab").forEach(function (tb) {
    tb.onclick = function () {
      body.querySelectorAll(".rep-tab").forEach(function (x) { x.classList.toggle("on", x === tb); });
      var which = tb.getAttribute("data-rtab");
      if (which === "main") {
        if (lastRep) { resultHost.innerHTML = renderReportsResult(applyRepHidden(lastRep, repHidden), state.ticker); repAutoMem(); }
        return;
      }
      if (!lastRep || !lastParams) { resultHost.innerHTML = '<div class="rep-news-none">يظهر هذا التبويب بعد عرض التقرير</div>'; return; }
      if (which === "boxes") {
        if (state.ticker !== "SPY" && state.ticker !== "QQQ") { resultHost.innerHTML = '<div class="rep-news-none">هذا التبويب لـ SPY و QQQ فقط</div>'; return; }
        resultHost.innerHTML = '<div class="rep-news-none">جارٍ تحميل الصندوقين…</div>';
        buildBoxesReports(lastParams.exps, lastParams.days, lastParams.strikes, lastParams.n, lastParams.g).then(function (bx) {
          resultHost.innerHTML = bx ? renderBoxesView(bx) : '<div class="rep-news-none">تعذّر تحميل بيانات الصندوقين</div>';
        }).catch(function (e) { console.error(e); resultHost.innerHTML = '<div class="rep-news-none">تعذّر بناء المقارنة</div>'; });
        return;
      }
      if (!PAIRS[state.ticker]) { resultHost.innerHTML = '<div class="rep-news-none">هذا التبويب للأزواج SPY/SPX و QQQ/NDX فقط</div>'; return; }
      resultHost.innerHTML = '<div class="rep-news-none">جارٍ تحميل المؤشر المقابل…</div>';
      buildPairReports(data, lastParams.exps, lastParams.days, lastParams.strikes, lastParams.n, lastParams.g).then(function (p) {
        resultHost.innerHTML = p ? renderPairView(p) : '<div class="rep-news-none">تعذّر تحميل بيانات الجهة المقابلة</div>';
      }).catch(function (e) { console.error(e); resultHost.innerHTML = '<div class="rep-news-none">تعذّر بناء المقارنة</div>'; });
    };
  });
  var tvBtn = document.getElementById("repTvBtn"), tvCode = document.getElementById("repTvCode");
  if (tvCode) tvCode.onclick = function () { repCopyText(TV_PINE_CODE, "تم نسخ كود المؤشر — افتح Pine Editor في TradingView والصقه ثم «Add to chart»"); };
  if (tvBtn) tvBtn.onclick = function () {
    var sel = [];
    body.querySelectorAll(".exp-date-chip.on[data-rexp]").forEach(function (cb) { sel.push(cb.getAttribute("data-rexp")); });
    if (!sel.length) { setStatus("حدد تاريخ انتهاء واحد على الأقل", "err"); return; }
    var tEl = document.getElementById("repTopInput");
    var tn = parseInt(tEl && tEl.value, 10) || 5;
    openTvDialog({ exps: sel, days: rdays, strikes: rstrikes, n: tn < 1 ? 5 : tn, g: currentG() });
  };
  var lensBtn = document.getElementById("repLensBtn");
  function showLens() {
    try {
      var selected = [];
      body.querySelectorAll(".exp-date-chip.on[data-rexp]").forEach(function (cb) { selected.push(cb.getAttribute("data-rexp")); });
      if (!selected.length) { setStatus("يلزم تحديد تواريخ أولًا للعدسة", "err"); return; }
      var lensEl = document.getElementById("repLensInput");
      var strikeVal = lensEl && parseFloat(lensEl.value);
      if (!isFinite(strikeVal)) { setStatus("يلزم إدخال رقم السترايك", "err"); return; }
      var rgrowth = currentG();
      // تقرير كامل على كل السترايكات ثم تصفية السترايك المطلوب (ليظهر بترتيبه الحقيقي)
      var full = computeReports(data, selected, rdays, "ALL", 1000, rgrowth);
      var rl = filterRepToStrike(full, strikeVal);
      lensRep = rl;
      resultHost.innerHTML = '<div class="rep-lens-banner">عدسة سترايك <b>' + strikeVal + '</b><button type="button" class="rep-goto" id="repLensBack">عرض التقرير كاملًا</button></div>' +
        renderReportsResult(applyRepHidden(rl, repHidden), state.ticker);
      repAutoMem();
      try { resultHost.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    } catch (err) {
      console.error(err);
      setStatus("خطأ العدسة: " + (err && err.message ? err.message : err), "err");
    }
  }
  if (lensBtn) lensBtn.onclick = showLens;
  if (resultHost) resultHost.addEventListener("click", function (ev) {
    if (ev.target && ev.target.id === "repLensBack" && lastRep) {
      lensRep = null;
      resultHost.innerHTML = renderReportsResult(applyRepHidden(lastRep, repHidden), state.ticker);
      repAutoMem();
    }
  });
}

function closeReports() {
  var modal = document.getElementById("reportsModal");
  if (modal) modal.classList.add("hidden");
}

/* ===== واجهة النسخة الخاصة: تُحقن من app.js لتعمل مهما كانت نسخة styles.css ===== */
var OI_PRIVATE_CSS = "/* =========================================================\n   شريط التحكم — النسخة الخاصة (ألوان وأبعاد مطابقة للمرجع)\n   كتلة واحدة بخصوصية عالية تغلب كل القواعد القديمة.\n   نفس الحجم على كل الأجهزة، والتابلت/الجوال: تمرير أفقي.\n   ========================================================= */\nhtml body .app .controls {\n  --cb-bg: #0f172a;\n  --cb-border: #1e293b;\n  --cb-pill: #111827;\n  --cb-pill-border: #1e293b;\n  --cb-divider: #1f2b46;\n  --cb-text: #f1f5f9;\n  --cb-series: #cbd5e1;\n  --cb-muted: #8f9bb5;\n  --cb-label: #7c89a6;\n  --cb-input: #1a2332;\n  --cb-input-border: #2a3548;\n  --cb-accent: #3b82f6;\n  --cb-h: 40px;\n  display: flex !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  justify-content: flex-start !important;\n  gap: 14px !important;\n  width: 100% !important;\n  max-width: 100% !important;\n  margin: 0 0 18px 0 !important;\n  padding: 14px 22px !important;\n  box-sizing: border-box !important;\n  direction: ltr !important;\n  background: var(--cb-bg) !important;\n  border: 1px solid var(--cb-border) !important;\n  border-radius: 22px !important;\n  box-shadow: none !important;\n  backdrop-filter: none !important;\n  -webkit-backdrop-filter: none !important;\n  overflow-x: auto !important;\n  overflow-y: hidden !important;\n  -webkit-overflow-scrolling: touch;\n  overscroll-behavior-x: contain;\n  scrollbar-width: none !important;\n  -ms-overflow-style: none !important;\n  position: relative;\n  z-index: 40;\n}\nhtml[data-theme=\"light\"] body .app .controls {\n  --cb-bg: #f4f6fb; --cb-border: #dbe2ef; --cb-pill: #ffffff; --cb-pill-border: #d5deee;\n  --cb-divider: #d5deee; --cb-text: #1e293b; --cb-series: #334155; --cb-muted: #64748b;\n  --cb-label: #8392ad; --cb-input: #eef2f9; --cb-input-border: #d5deee;\n}\nhtml body .app .controls::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }\nhtml body .app .controls::before,\nhtml body .app .controls::after { content: none !important; display: none !important; }\n/* توسيط بدون قصّ: عند الاتساع يتوسّط، وعند الضيق يتمرّر */\nhtml body .app .controls > * { flex: 0 0 auto !important; }\nhtml body .app .controls > *:first-child { margin-left: auto !important; }\nhtml body .app .controls > *:last-child { margin-right: auto !important; }\nhtml body .main { min-width: 0 !important; }\n\n/* مجموعة: [شريحة اليوم بالسابق | جدول الأيام] + قائمة التاريخ + فاصل */\nhtml body .app .controls .select-exp-series {\n  display: flex !important;\n  align-items: center !important;\n  height: var(--cb-h) !important;\n  margin: 0 !important;\n  padding: 0 16px 0 0 !important;\n  border-right: 1px solid var(--cb-divider) !important;\n  overflow: visible !important;\n}\nhtml body .app .controls .select-exp-series .exp-series-row {\n  display: flex !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  gap: 12px !important;\n  margin: 0 !important;\n  padding: 0 !important;\n}\nhtml body .app .controls .exp-label { display: none !important; }\n\nhtml body .app .controls .series-pill {\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 2px !important;\n  height: var(--cb-h) !important;\n  padding: 0 6px !important;\n  box-sizing: border-box !important;\n  background: var(--cb-pill) !important;\n  border: 1px solid var(--cb-pill-border) !important;\n  border-radius: 12px !important;\n}\nhtml body .app .controls .series-pill button#seriesBtn,\nhtml body .app .controls .series-pill button#tawafuqBtn {\n  all: unset !important;\n  position: relative !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  height: 34px !important;\n  padding: 0 12px !important;\n  margin: 0 !important;\n  box-sizing: border-box !important;\n  font-family: inherit !important;\n  font-size: 13px !important;\n  font-weight: 600 !important;\n  white-space: nowrap !important;\n  cursor: pointer !important;\n  color: var(--cb-series) !important;\n  background: transparent !important;\n  border: none !important;\n  border-radius: 8px !important;\n}\nhtml body .app .controls .series-pill button#seriesBtn:hover,\nhtml body .app .controls .series-pill button#tawafuqBtn:hover { color: var(--cb-text) !important; }\nhtml body .app .controls .series-pill button#seriesBtn.active,\nhtml body .app .controls .series-pill button#tawafuqBtn.active {\n  color: #f8fafc !important;\n  font-weight: 700 !important;\n}\nhtml[data-theme=\"light\"] body .app .controls .series-pill button.active { color: #0f172a !important; }\nhtml body .app .controls .series-pill button.active::after {\n  content: \"\" !important;\n  position: absolute;\n  left: 50%; bottom: 3px;\n  width: 16px; height: 2px;\n  transform: translateX(-50%);\n  border-radius: 2px;\n  background: var(--cb-accent);\n}\n\n/* قائمة التاريخ */\nhtml body .app .controls .exp-dd,\nhtml body .app .controls #expDropdown {\n  width: 196px !important; min-width: 196px !important; max-width: 196px !important;\n  margin: 0 !important;\n}\nhtml body .app .controls .exp-dd-btn {\n  width: 100% !important; min-width: 0 !important; max-width: none !important;\n  height: var(--cb-h) !important;\n  padding: 0 40px 0 18px !important;\n  font-size: 14px !important;\n  font-weight: 500 !important;\n  color: var(--cb-text) !important;\n  background-color: var(--cb-pill) !important;\n  background-image: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237c89a6' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\") !important;\n  background-repeat: no-repeat !important;\n  background-position: right 16px center !important;\n  border: 1px solid var(--cb-pill-border) !important;\n  border-radius: 12px !important;\n  box-shadow: none !important;\n}\nhtml body .app .controls .exp-dd-btn.open { border-color: var(--cb-accent) !important; }\n\n/* التسميات */\nhtml body .app .controls > label,\nhtml body .app .controls .stocks-inline .stocks-label {\n  margin: 0 !important; padding: 0 !important;\n  font-family: \"Montserrat\", system-ui, sans-serif !important;\n  font-size: 11px !important;\n  font-weight: 600 !important;\n  letter-spacing: 0.16em !important;\n  text-transform: uppercase !important;\n  color: var(--cb-label) !important;\n  white-space: nowrap !important;\n}\n\n/* Days / Strikes */\nhtml body .app .controls .chip-row {\n  display: inline-flex !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  gap: 4px !important;\n  height: var(--cb-h) !important;\n  margin: 0 !important;\n  padding: 0 6px !important;\n  box-sizing: border-box !important;\n  background: var(--cb-pill) !important;\n  border: 1px solid var(--cb-pill-border) !important;\n  border-radius: 12px !important;\n}\nhtml body .app .controls .chip {\n  position: relative;\n  min-width: 34px !important; height: 34px !important;\n  padding: 0 12px !important; margin: 0 !important;\n  font-size: 14px !important; font-weight: 500 !important;\n  color: var(--cb-muted) !important;\n  background: transparent !important;\n  border: none !important; border-radius: 8px !important;\n  box-shadow: none !important;\n}\nhtml body .app .controls .chip:hover { color: var(--cb-text) !important; }\nhtml body .app .controls .chip.active {\n  color: #f1f5ff !important; font-weight: 700 !important;\n  background: transparent !important; border: none !important;\n}\nhtml[data-theme=\"light\"] body .app .controls .chip.active { color: #0f172a !important; }\nhtml body .app .controls .chip.active::after {\n  content: \"\"; position: absolute; left: 50%; bottom: 3px;\n  width: 14px; height: 2px; transform: translateX(-50%);\n  border-radius: 2px; background: var(--cb-accent);\n}\nhtml body .app .controls .chip-row input.days-free-input,\nhtml body .app .controls input.days-free-input {\n  width: 36px !important; min-width: 36px !important; max-width: 36px !important;\n  height: 34px !important; min-height: 34px !important; max-height: 34px !important;\n  flex: 0 0 36px !important;\n  margin: 0 0 0 4px !important; padding: 0 !important;\n  background: var(--cb-input) !important; background-color: var(--cb-input) !important;\n  color: var(--cb-text) !important;\n  border: 1px solid var(--cb-input-border) !important;\n  border-radius: 8px !important;\n  font-size: 13px !important; font-weight: 700 !important; text-align: center !important;\n  box-sizing: border-box !important; box-shadow: none !important; outline: none !important;\n  -webkit-appearance: none !important; -moz-appearance: textfield !important; appearance: none !important;\n}\nhtml body .app .controls input.days-free-input:focus { border-color: var(--cb-accent) !important; }\n\n/* أزرار Δ / G / ΣΔ / Map / 5K+ */\nhtml body .app .controls .delta-btn,\nhtml body .app .controls .spx5k-btn {\n  align-items: center !important; justify-content: center !important;\n  min-width: var(--cb-h) !important; height: var(--cb-h) !important;\n  margin: 0 !important; padding: 0 12px !important;\n  font-size: 15px !important; font-weight: 600 !important;\n  color: var(--cb-muted) !important;\n  background: var(--cb-pill) !important;\n  border: 1px solid var(--cb-pill-border) !important;\n  border-radius: 12px !important;\n  box-shadow: none !important;\n}\nhtml body .app .controls .delta-btn { display: inline-flex !important; width: var(--cb-h) !important; padding: 0 !important; }\nhtml body .app .controls .delta-btn:hover,\nhtml body .app .controls .spx5k-btn:hover { color: var(--cb-text) !important; }\nhtml body .app .controls .delta-btn.active,\nhtml body .app .controls .spx5k-btn.active {\n  color: #fff !important; border-color: var(--cb-accent) !important;\n  background: rgba(59,130,246,0.16) !important; box-shadow: none !important;\n}\nhtml body .app .controls .delta-btn svg { stroke: currentColor; }\n\n/* STOCKS */\nhtml body .app .controls .stocks-inline {\n  display: inline-flex !important; align-items: center !important;\n  gap: 10px !important; margin: 0 !important; padding: 0 !important;\n  overflow: visible !important;\n}\nhtml body .app .controls .stocks-dd-btn {\n  min-width: 120px !important; height: var(--cb-h) !important;\n  padding: 0 16px !important;\n  font-size: 14px !important; font-weight: 500 !important;\n  color: var(--cb-muted) !important;\n  background: var(--cb-pill) !important;\n  border: 1px solid var(--cb-pill-border) !important;\n  border-radius: 12px !important; box-shadow: none !important; text-align: center !important;\n}\nhtml body .app .controls .stocks-dd-btn.open { border-color: var(--cb-accent) !important; }\n\n/* ×3 */\nhtml body .app .controls .x3-btn,\nhtml body .app .controls button#x3Btn.x3-btn {\n  min-width: 52px !important; height: var(--cb-h) !important;\n  margin: 0 !important; padding: 0 16px !important;\n  font-size: 14px !important; font-weight: 600 !important;\n  color: var(--cb-muted) !important;\n  background: var(--cb-pill) !important;\n  border: 1px solid var(--cb-pill-border) !important;\n  border-radius: 12px !important; box-shadow: none !important;\n}\nhtml body .app .controls .x3-btn.active,\nhtml body .app .controls button#x3Btn.x3-btn.active {\n  color: #fff !important; border-color: var(--cb-accent) !important;\n  background: rgba(59,130,246,0.16) !important;\n}\n\n\n\n/* ===== أزرار الرأس: Reports بنفس تأثير Excel / Map بلون بنفسجي ===== */\nhtml body .btn-reports {\n  background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%) !important;\n  color: #fff !important; border: none !important; border-radius: 10px !important;\n  padding: 0 16px !important; height: 36px !important;\n  font-weight: 700 !important; font-size: 13px !important; letter-spacing: .02em !important;\n  box-shadow: 0 0 0 1px rgba(167,139,250,.28), 0 4px 14px rgba(124,58,237,.38) !important;\n}\nhtml body .btn-reports:hover { filter: brightness(1.08); box-shadow: 0 0 0 1px rgba(167,139,250,.45), 0 6px 18px rgba(124,58,237,.5) !important; }\n#exportModal .exp-report-chip { border: 1.5px solid #a78bfa !important; }\n\n/* ===== نافذة التقرير ===== */\n#reportsModal .reports-body {\n  --r-bg:#0f172a; --r-card:#111827; --r-bd:#1e293b; --r-hd:#162033; --r-tx:#f1f5f9; --r-mu:#8f9bb5;\n  --r-ac:#3b82f6; --r-call:#93c5fd; --r-put:#c4b5fd; --r-up:#34d399; --r-dn:#f87171; --r-gold:#fbbf24;\n  padding: 16px !important; color: var(--r-tx);\n}\nhtml[data-theme=\"light\"] #reportsModal .reports-body {\n  --r-bg:#f4f6fb; --r-card:#fff; --r-bd:#dbe2ef; --r-hd:#eef2f9; --r-tx:#1e293b; --r-mu:#64748b; --r-call:#2563eb; --r-put:#7c3aed;\n}\n#reportsModal .rep-controls { background: var(--r-card); border: 1px solid var(--r-bd); border-radius: 18px; padding: 14px 16px; margin-bottom: 16px; }\n#reportsModal .exp-export-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }\n#reportsModal .exp-month-list { display:flex; flex-direction:column; gap:10px; max-height:260px; overflow-y:auto; padding:2px; }\n#reportsModal .exp-month-title { font-size:11px; letter-spacing:.12em; color:var(--r-mu); font-weight:700; margin-bottom:6px; }\n#reportsModal .exp-month-dates { display:flex; flex-wrap:wrap; gap:8px; }\n#reportsModal .exp-date-chip { cursor:pointer; display:inline-flex; flex-direction:column; align-items:center; min-width:72px; padding:7px 12px; border-radius:12px;\n  background: var(--r-bg); border:1px solid var(--r-bd); color: var(--r-mu); font-family: inherit; }\n#reportsModal .exp-date-chip .d { font-weight:700; font-size:13px; color: var(--r-tx); }\n#reportsModal .exp-date-chip .s { font-size:10px; opacity:.8; }\n#reportsModal .exp-date-chip.on { border-color: var(--r-ac); background: rgba(59,130,246,.16); box-shadow: inset 0 -2px 0 var(--r-ac); }\n#reportsModal .exp-export-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px; }\n#reportsModal .exp-export-row > span, #reportsModal .rep-tool-label { font-size:11px; letter-spacing:.14em; color:var(--r-mu); font-weight:700; text-transform:uppercase; }\n#reportsModal .chip { cursor:pointer; min-width:38px; height:32px; padding:0 12px; border-radius:10px; font-weight:600; font-family:inherit;\n  background: var(--r-bg); border:1px solid var(--r-bd); color: var(--r-mu); }\n#reportsModal .chip.on { color: var(--r-tx); border-color: var(--r-ac); box-shadow: inset 0 -2px 0 var(--r-ac); }\n#reportsModal .rep-input { width:64px; height:32px; text-align:center; border-radius:10px; background:#1a2332; color:var(--r-tx); border:1px solid #2a3548; font-weight:700; }\nhtml[data-theme=\"light\"] #reportsModal .rep-input { background:#eef2f9; border-color:#d5deee; }\n#reportsModal .rep-tools-gap { width:10px; }\n#reportsModal .btn-teal, #reportsModal #repRunBtn { border-radius:12px; padding:8px 18px; font-weight:700; }\n#reportsModal .rep-insight { background: var(--r-card); border:1px solid var(--r-bd); border-radius:18px; padding:14px 16px; margin-bottom:16px; }\n#reportsModal .rep-insight-title { font-size:11px; letter-spacing:.14em; color:var(--r-mu); font-weight:700; margin-bottom:6px; }\n#reportsModal .rep-insight-main { font-size:15px; font-weight:700; }\n#reportsModal .rep-insight-sub { font-size:13px; color:var(--r-mu); margin-top:4px; }\n#reportsModal .rep-insight-meta { font-size:12px; color:var(--r-mu); margin-top:8px; }\n#reportsModal .rep-badge { padding:2px 10px; border-radius:99px; font-weight:700; font-size:11px; background:rgba(148,163,184,.18); }\n#reportsModal .rep-badge.high { background:rgba(52,211,153,.18); color:var(--r-up); }\n#reportsModal .rep-badge.mid { background:rgba(251,191,36,.18); color:var(--r-gold); }\n#reportsModal .rep-section-label { font-size:12px; letter-spacing:.16em; font-weight:800; color:var(--r-mu); margin:6px 4px; direction:ltr; text-align:center; }\n#reportsModal .rep-grid { display:grid; gap:16px; margin-bottom:16px; }\n#reportsModal .rep-grid-2 { grid-template-columns: 1fr 1fr; }\n@media (max-width: 760px) { #reportsModal .rep-grid-2 { grid-template-columns: 1fr; } }\n#reportsModal .rep-spacer { height: 4px; }\n#reportsModal .rep-card { background: var(--r-card); border:1px solid var(--r-bd); border-radius:18px; padding:14px 16px; overflow-x:auto; margin-bottom:16px; }\n#reportsModal .rep-grid .rep-card { margin-bottom:0; }\n#reportsModal .rep-card-title { font-weight:800; font-size:14px; margin-bottom:10px; text-align:center; }\n#reportsModal .rep-card-peak .rep-card-title { color: var(--r-call); }\n#reportsModal .rep-card-trough .rep-card-title { color: var(--r-put); }\n#reportsModal .rep-table { width:100%; border-collapse:collapse; font-size:13px; direction:ltr; }\n#reportsModal .rep-table th, #reportsModal .rep-table td { border:1px solid var(--r-bd); padding:7px 10px; text-align:center; white-space:nowrap; }\n#reportsModal .rep-table th { background: var(--r-hd); font-weight:700; color: var(--r-tx); }\n#reportsModal .rep-table td b { font-variant-numeric: tabular-nums; }\n#reportsModal .rep-empty { color: var(--r-mu); text-align:center; }\n#reportsModal .rep-top-row td { background: rgba(59,130,246,.1); }\n#reportsModal .rep-path { direction:ltr; font-size:11px; color: var(--r-mu); }\n#reportsModal .mv-up { color: var(--r-up); font-weight:800; }\n#reportsModal .mv-down { color: var(--r-dn); font-weight:800; }\n#reportsModal .mv-flat { color: var(--r-mu); }\n#reportsModal .rep-repeat-title { margin-top:12px; font-size:12px; font-weight:800; color: var(--r-mu); letter-spacing:.06em; }\n#reportsModal .rep-repeat-line { padding:8px 0; border-top:1px solid var(--r-bd); font-size:13px; }\n#reportsModal .rep-repeat-line b { font-size:15px; margin-inline-end:6px; }\n#reportsModal .rep-reasons { white-space: normal !important; }\n#reportsModal .chip-reason { display:inline-block; margin:2px; padding:1px 8px; border-radius:99px; font-size:11px; border:1px solid var(--r-bd); color:var(--r-mu); }\n#reportsModal .chip-call { color: var(--r-call); } #reportsModal .chip-put { color: var(--r-put); }\n#reportsModal .chip-peak { color: var(--r-up); } #reportsModal .chip-trough { color: var(--r-dn); }\n#reportsModal .rep-far-card { border-color: rgba(251,191,36,.4); }\n#reportsModal .rep-far-card .rep-card-title { color: var(--r-gold); }\n#reportsModal .rep-x { display:inline-block; min-width:34px; padding:1px 8px; border-radius:99px; font-size:11px; font-weight:700; }\n#reportsModal .rep-x0 { display:inline-block; min-width:34px; padding:1px 8px; border-radius:99px; font-size:11px; color:var(--r-mu); border:1px solid var(--r-bd); }\n#reportsModal .rep-x2 { background:rgba(251,191,36,.18); color:var(--r-gold); }\n#reportsModal .rep-x3 { background:rgba(52,211,153,.18); color:var(--r-up); }\n";
var OI_PRIVATE_CSS2 = "\n/* ===== نافذة التقرير: حجم مناسب وتمرير داخلي ===== */\nhtml body #reportsModal.map-modal { align-items: flex-start !important; justify-content: center !important; overflow-y: auto !important; padding: 12px !important; }\nhtml body #reportsModal .reports-panel {\n  width: min(1100px, 100%) !important; max-height: calc(100vh - 24px) !important; height: auto !important;\n  margin: 0 auto !important; display: flex !important; flex-direction: column !important; overflow: hidden !important;\n}\nhtml body #reportsModal .map-head { flex: 0 0 auto; position: sticky; top: 0; z-index: 3; }\nhtml body #reportsModal .reports-body { flex: 1 1 auto !important; min-height: 0 !important; max-height: none !important; overflow-y: auto !important; overflow-x: hidden !important; }\nhtml body #reportsModal .exp-month-list { max-height: 190px !important; overflow-y: auto !important; gap: 6px !important; }\nhtml body #reportsModal .exp-month { display: flex !important; align-items: center !important; gap: 12px !important; border: 0 !important; background: none !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }\nhtml body #reportsModal .exp-month-title { flex: 0 0 86px !important; margin: 0 !important; text-align: right !important; }\nhtml body #reportsModal .exp-month-dates { flex: 1 1 auto !important; }\nhtml body #reportsModal .exp-date-chip { min-width: 62px !important; padding: 5px 10px !important; }\n\n/* ===== STOCKS و ×3: بلا تداخل ===== */\nhtml body .app .controls .stocks-inline { flex: 0 0 auto !important; width: auto !important; min-width: 0 !important; max-width: none !important; gap: 10px !important; position: relative !important; }\nhtml body .app .controls .stocks-inline .stocks-dd { flex: 0 0 150px !important; width: 150px !important; min-width: 150px !important; max-width: 150px !important; position: relative !important; margin: 0 !important; }\nhtml body .app .controls .stocks-inline .stocks-dd-btn { width: 100% !important; min-width: 0 !important; }\nhtml body .app .controls .stocks-inline .stocks-select { display: none !important; }\nhtml body .app .controls .x3-btn, html body .app .controls button#x3Btn.x3-btn { flex: 0 0 auto !important; margin-left: 8px !important; position: relative !important; }\n\n/* ===== الشعار: السطر الأول أكبر وبخط مختلف عن الثاني ===== */\nhtml body .sidebar .brand-oi {\n  font-family: \"Montserrat\", system-ui, sans-serif !important;\n  font-size: 34px !important; font-weight: 800 !important; line-height: 1 !important;\n  letter-spacing: -0.03em !important; color: #f8fafc !important;\n}\nhtml body .sidebar .brand-sub {\n  font-family: system-ui, -apple-system, \"Segoe UI\", sans-serif !important;\n  font-size: 11px !important; font-weight: 500 !important; line-height: 1.3 !important;\n  letter-spacing: 0.22em !important; text-transform: uppercase !important; color: #94a3b8 !important;\n}\nhtml[data-theme=\"light\"] body .sidebar .brand-oi { color: #0f172a !important; }\n";
var OI_PRIVATE_CSS3 = "\n/* ===== حجم طبيعي للابتوب: شريط مدمج يظهر كاملًا ===== */\nhtml body .app .controls { --cb-h: 34px; gap: 9px !important; padding: 10px 14px !important; border-radius: 18px !important; margin-bottom: 14px !important; }\nhtml body .app .controls .select-exp-series { padding-right: 10px !important; }\nhtml body .app .controls .select-exp-series .exp-series-row { gap: 8px !important; }\nhtml body .app .controls .series-pill { padding: 0 4px !important; gap: 0 !important; border-radius: 10px !important; }\nhtml body .app .controls .series-pill button#seriesBtn,\nhtml body .app .controls .series-pill button#tawafuqBtn { height: 28px !important; padding: 0 9px !important; font-size: 12px !important; }\nhtml body .app .controls .series-pill button.active::after { bottom: 2px; width: 12px; }\nhtml body .app .controls .exp-dd, html body .app .controls #expDropdown { width: 150px !important; min-width: 150px !important; max-width: 150px !important; }\nhtml body .app .controls .exp-dd-btn { font-size: 12.5px !important; padding: 0 30px 0 12px !important; border-radius: 10px !important; background-position: right 11px center !important; }\nhtml body .app .controls > label,\nhtml body .app .controls .stocks-inline .stocks-label { font-size: 10px !important; letter-spacing: 0.11em !important; }\nhtml body .app .controls .chip-row { padding: 0 4px !important; gap: 1px !important; border-radius: 10px !important; }\nhtml body .app .controls .chip { min-width: 28px !important; height: 28px !important; padding: 0 8px !important; font-size: 12.5px !important; border-radius: 7px !important; }\nhtml body .app .controls .chip.active::after { bottom: 2px; width: 12px; }\nhtml body .app .controls .chip-row input.days-free-input, html body .app .controls input.days-free-input { width: 28px !important; min-width: 28px !important; max-width: 28px !important; height: 26px !important; min-height: 26px !important; max-height: 26px !important; flex: 0 0 28px !important; font-size: 12px !important; margin-left: 3px !important; }\nhtml body .app .controls .delta-btn, html body .app .controls .spx5k-btn { min-width: 34px !important; height: 34px !important; font-size: 13px !important; border-radius: 10px !important; }\nhtml body .app .controls .delta-btn { width: 34px !important; }\nhtml body .app .controls .stocks-inline { gap: 7px !important; }\nhtml body .app .controls .stocks-inline .stocks-dd { flex: 0 0 118px !important; width: 118px !important; min-width: 118px !important; max-width: 118px !important; }\nhtml body .app .controls .stocks-dd-btn { height: 34px !important; font-size: 12.5px !important; padding: 0 10px !important; border-radius: 10px !important; }\nhtml body .app .controls .x3-btn, html body .app .controls button#x3Btn.x3-btn { min-width: 40px !important; height: 34px !important; padding: 0 10px !important; font-size: 12.5px !important; border-radius: 10px !important; margin-left: 4px !important; }\n";
var OI_PRIVATE_CSS4 = "\n/* ===== الشريط الأوسط في جدول الويب: رمادي بدل الأخضر ===== */\nhtml body tr.close-bar td,\nhtml body table.oi tr.close-bar td,\nhtml body table.oi.x3-table tbody tr.close-bar td,\nhtml body table.oi.x3-table tbody tr.close-bar td.max-oi,\nhtml body table.oi.x3-table tbody tr.close-bar td.delta,\nhtml body table.oi.x3-table tbody tr.close-bar td.delta.max-oi,\nhtml body table.oi.x3-table tbody tr.close-bar td.strike,\nhtml body table.oi.x3-table tbody tr.close-bar td.close-strike,\nhtml body .x3-table tr.close-bar td {\n  background: #1e293b !important; color: #cbd5e1 !important;\n  border-top: 1px solid #334155 !important; border-bottom: 1px solid #334155 !important;\n  box-shadow: none !important; font-weight: 600 !important;\n}\nhtml[data-theme=\"light\"] body tr.close-bar td,\nhtml[data-theme=\"light\"] body table.oi tr.close-bar td,\nhtml[data-theme=\"light\"] body table.oi.x3-table tbody tr.close-bar td,\nhtml[data-theme=\"light\"] body table.oi.x3-table tbody tr.close-bar td.max-oi,\nhtml[data-theme=\"light\"] body table.oi.x3-table tbody tr.close-bar td.delta,\nhtml[data-theme=\"light\"] body .x3-table tr.close-bar td {\n  background: #e2e8f0 !important; color: #475569 !important;\n  border-top: 1px solid #cbd5e1 !important; border-bottom: 1px solid #cbd5e1 !important;\n}\n\n/* ===== نافذة التقرير: شريط لكل شهر + Days/Strikes جنب بعض ===== */\nhtml body #reportsModal .exp-month-list { max-height: 230px !important; gap: 8px !important; }\nhtml body #reportsModal .exp-month {\n  display: flex !important; align-items: center !important; gap: 12px !important; flex-wrap: nowrap !important;\n  background: var(--r-bg) !important; border: 1px solid var(--r-bd) !important; border-radius: 14px !important;\n  padding: 8px 12px !important; margin: 0 !important;\n}\nhtml body #reportsModal .exp-month-title { flex: 0 0 92px !important; font-size: 12px !important; color: var(--r-tx) !important; }\nhtml body #reportsModal .exp-month-dates { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; flex: 1 1 auto !important; }\nhtml body #reportsModal .rep-month-all { border-color: var(--r-ac) !important; background: rgba(59,130,246,.12) !important; }\nhtml body #reportsModal .rep-month-all .d { color: #93c5fd !important; }\nhtml body #reportsModal .rep-ds-row { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 8px !important; }\nhtml body #reportsModal .rep-free {\n  width: 46px; height: 32px; text-align: center; border-radius: 10px; font-weight: 700;\n  background: #1a2332; color: var(--r-tx); border: 1px solid #2a3548; -moz-appearance: textfield; appearance: textfield;\n}\nhtml[data-theme=\"light\"] body #reportsModal .rep-free { background: #eef2f9; border-color: #d5deee; }\nhtml body #reportsModal .rep-tools-gap-lg { width: 22px; }\n\n/* ===== نتائج التقرير: 3 أعمدة ===== */\nhtml body #reportsModal .rep-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n@media (max-width: 1000px) { html body #reportsModal .rep-grid-3 { grid-template-columns: 1fr; } }\nhtml body #reportsModal .rep-sub { font-size: 11px; letter-spacing: .14em; font-weight: 800; margin: 10px 0 6px; text-align: center; }\nhtml body #reportsModal .rep-sub.c { color: var(--r-call); }\nhtml body #reportsModal .rep-sub.p { color: var(--r-put); }\nhtml body #reportsModal .rep-note { margin: 0 4px 14px; font-size: 12px; color: var(--r-mu); text-align: center; }\n";
var OI_PRIVATE_CSS5 = "\n/* ===== الشريط الأوسط في جدول الويب (الأخضر) → رمادي ===== */\nhtml { --green-bar: #1e293b; --green-text: #cbd5e1; }\nhtml[data-theme=\"light\"] { --green-bar: #e2e8f0; --green-text: #475569; }\nhtml body table.oi td.green,\nhtml body table.oi .green,\nhtml body table.oi.x3-table td.green,\nhtml body table.oi.x3-table tbody tr td.green,\nhtml body table.oi tr td.green.strike,\nhtml body .close-bar-line {\n  background: #1e293b !important; color: #cbd5e1 !important;\n  border-color: #334155 !important; box-shadow: none !important; font-weight: 600 !important;\n}\nhtml[data-theme=\"light\"] body table.oi td.green,\nhtml[data-theme=\"light\"] body table.oi .green,\nhtml[data-theme=\"light\"] body table.oi.x3-table td.green,\nhtml[data-theme=\"light\"] body .close-bar-line {\n  background: #e2e8f0 !important; color: #475569 !important; border-color: #cbd5e1 !important;\n}\n\n/* ===== نافذة التقرير: واسعة ومريحة ===== */\nhtml body #reportsModal .reports-panel { width: min(1180px, 100%) !important; }\nhtml body #reportsModal .reports-body { padding: 26px 30px 34px !important; }\nhtml body #reportsModal .rep-controls { background: transparent !important; border: 0 !important; padding: 0 !important; margin: 0 0 22px !important; }\nhtml body #reportsModal .exp-export-block { margin-bottom: 18px; }\nhtml body #reportsModal .exp-export-head { margin-bottom: 14px !important; }\nhtml body #reportsModal .exp-export-head b { font-size: 15px; letter-spacing: .02em; }\nhtml body #reportsModal .exp-month-list { max-height: 300px !important; padding: 2px 4px 2px 2px !important; gap: 10px !important; }\nhtml body #reportsModal .exp-month { padding: 12px 18px !important; border-radius: 16px !important; gap: 18px !important; }\nhtml body #reportsModal .exp-month-title { flex: 0 0 104px !important; font-size: 13px !important; font-weight: 800 !important; }\nhtml body #reportsModal .exp-month-dates { gap: 10px !important; }\nhtml body #reportsModal .exp-date-chip { min-width: 70px !important; padding: 7px 12px !important; border-radius: 13px !important; }\n\n/* شريط واحد: DAYS · STRIKES · TOP · G · بحث */\nhtml body #reportsModal .rep-bar {\n  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px 20px;\n  margin-top: 6px; padding: 14px 24px; border-radius: 20px; direction: ltr;\n  background: var(--r-card); border: 1px solid var(--r-bd);\n}\nhtml body #reportsModal .rep-grp { display: inline-flex; align-items: center; gap: 4px; }\nhtml body #reportsModal .rep-lab { font-family: \"Montserrat\", system-ui, sans-serif; font-size: 10.5px; letter-spacing: .16em; font-weight: 700; color: #7c89a6; margin-right: 8px; }\nhtml body #reportsModal .rchip {\n  all: unset; position: relative; cursor: pointer; box-sizing: border-box;\n  min-width: 30px; height: 32px; padding: 0 9px; display: inline-flex; align-items: center; justify-content: center;\n  font-size: 14px; font-weight: 500; color: var(--r-mu);\n}\nhtml body #reportsModal .rchip:hover { color: var(--r-tx); }\nhtml body #reportsModal .rchip.on { color: var(--r-tx); font-weight: 700; }\nhtml body #reportsModal .rchip.on::after { content: \"\"; position: absolute; left: 50%; bottom: 2px; width: 16px; height: 2px; margin-left: -8px; background: var(--r-ac); border-radius: 2px; }\nhtml body #reportsModal .rep-free {\n  width: 38px; height: 28px; margin-left: 6px; padding: 0; text-align: center; font-size: 13px; font-weight: 700;\n  color: var(--r-tx); background: transparent; border: 0; border-bottom: 1px solid #2a3548; border-radius: 0; outline: none;\n  -moz-appearance: textfield; appearance: textfield;\n}\nhtml body #reportsModal .rep-free:focus { border-bottom-color: var(--r-ac); }\nhtml body #reportsModal .rep-free::-webkit-outer-spin-button, html body #reportsModal .rep-free::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }\nhtml body #reportsModal .rep-sep { width: 1px; height: 24px; background: #1f2b46; }\nhtml body #reportsModal .rep-search {\n  display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; min-width: 190px;\n  background: #1a2332; border: 1px solid #2a3548; border-radius: 12px; direction: rtl;\n}\nhtml body #reportsModal .rep-search:focus-within { border-color: var(--r-ac); }\nhtml body #reportsModal .rep-lens-btn { all: unset; cursor: pointer; display: inline-flex; color: var(--r-mu); }\nhtml body #reportsModal .rep-lens-btn:hover { color: var(--r-ac); }\nhtml body #reportsModal .rep-lens-input {\n  flex: 1; min-width: 0; width: 120px; height: 100%; padding: 0; background: transparent; border: 0; outline: none;\n  color: var(--r-tx); font-size: 13px; text-align: right; -moz-appearance: textfield; appearance: textfield;\n}\nhtml body #reportsModal .rep-lens-input::-webkit-outer-spin-button, html body #reportsModal .rep-lens-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }\nhtml[data-theme=\"light\"] body #reportsModal .rep-search { background: #eef2f9; border-color: #d5deee; }\nhtml[data-theme=\"light\"] body #reportsModal .rep-lab { color: #8392ad; }\n\n/* الأزرار */\nhtml body #reportsModal .rep-actions { display: flex; justify-content: center; gap: 14px; margin-top: 20px; }\nhtml body #reportsModal .rep-btn {\n  all: unset; cursor: pointer; box-sizing: border-box; min-width: 170px; height: 44px; padding: 0 26px;\n  display: inline-flex; align-items: center; justify-content: center; border-radius: 14px;\n  font-family: inherit; font-size: 14px; font-weight: 800; letter-spacing: .02em; color: #fff; text-align: center;\n  transition: transform .12s ease, filter .12s ease, box-shadow .12s ease;\n}\nhtml body #reportsModal .rep-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }\nhtml body #reportsModal .rep-btn-run { background: linear-gradient(135deg, #7c3aed, #8b5cf6 55%, #a78bfa); box-shadow: 0 0 0 1px rgba(167,139,250,.3), 0 6px 18px rgba(124,58,237,.38); }\nhtml body #reportsModal .rep-btn-xls { background: linear-gradient(135deg, #0f766e, #14b8a6); box-shadow: 0 0 0 1px rgba(45,212,191,.3), 0 6px 18px rgba(20,184,166,.3); }\nhtml body #reportsModal .rep-btn[disabled] { opacity: .4; cursor: not-allowed; transform: none; filter: none; box-shadow: none; }\n\n/* النتائج: كل شيء في المنتصف */\nhtml body #reportsModal .rep-result { text-align: center; margin-top: 8px; }\nhtml body #reportsModal .rep-insight { text-align: center; padding: 20px 22px; }\nhtml body #reportsModal .rep-insight-main { font-size: 17px; }\nhtml body #reportsModal .rep-card { padding: 18px 20px; text-align: center; }\nhtml body #reportsModal .rep-grid { gap: 20px; margin-bottom: 20px; }\nhtml body #reportsModal .rep-table th, html body #reportsModal .rep-table td { text-align: center; padding: 9px 12px; }\nhtml body #reportsModal .rep-repeat-line, html body #reportsModal .rep-repeat-title, html body #reportsModal .rep-note, html body #reportsModal .rep-reasons { text-align: center; }\nhtml body #reportsModal .rep-section-label { text-align: center; }\n";
var OI_PRIVATE_CSS6 = "\n/* ===== الشريط الأوسط في الجدول: رمادي مزرق كما في صورتك ===== */\nhtml { --green-bar: #2f3f5f; --green-text: #e2e8f0; }\nhtml[data-theme=\"light\"] { --green-bar: #cbd5e1; --green-text: #334155; }\nhtml body table.oi td.green, html body table.oi .green, html body table.oi.x3-table td.green,\nhtml body table.oi.x3-table tbody tr td.green, html body table.oi tr td.green.strike, html body .close-bar-line,\nhtml body tr.close-bar td, html body table.oi tr.close-bar td, html body table.oi.x3-table tbody tr.close-bar td {\n  background: #2f3f5f !important; color: #e2e8f0 !important; border-color: #3d4f73 !important; font-weight: 600 !important;\n}\nhtml[data-theme=\"light\"] body table.oi td.green, html[data-theme=\"light\"] body table.oi .green,\nhtml[data-theme=\"light\"] body table.oi.x3-table td.green, html[data-theme=\"light\"] body .close-bar-line,\nhtml[data-theme=\"light\"] body tr.close-bar td {\n  background: #cbd5e1 !important; color: #334155 !important; border-color: #b6c2d4 !important;\n}\n\n/* ===== نافذة التقرير: تحسينات ===== */\nhtml body #reportsModal .rep-search { min-width: 130px; padding: 0 12px; }\nhtml body #reportsModal .rep-lens-input { width: 64px; }\nhtml body #reportsModal .rep-free-n { width: 44px; }\nhtml body #reportsModal .rep-actions { margin-top: 22px; }\nhtml body #reportsModal .rep-xh, html body #reportsModal .rep-xcell { width: 30px; padding: 0 4px !important; }\nhtml body #reportsModal .rep-x-btn {\n  all: unset; cursor: pointer; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;\n  border-radius: 7px; font-size: 16px; line-height: 1; color: var(--r-mu); opacity: .55;\n}\nhtml body #reportsModal .rep-x-btn:hover { opacity: 1; color: #f87171; background: rgba(248,113,113,.12); }\nhtml body #reportsModal .rep-rep-row {\n  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;\n  padding: 11px 6px; border-top: 1px solid var(--r-bd); direction: rtl;\n}\nhtml body #reportsModal .rep-rep-k { min-width: 64px; padding: 4px 12px; border-radius: 10px; font-weight: 800; font-size: 16px; background: rgba(59,130,246,.14); color: var(--r-tx); direction: ltr; }\nhtml body #reportsModal .rep-rep-n { font-size: 11px; font-weight: 800; color: var(--r-gold); }\nhtml body #reportsModal .rep-rep-days { display: inline-flex; flex-wrap: wrap; gap: 6px; justify-content: center; }\nhtml body #reportsModal .rep-rep-d { padding: 3px 10px; border-radius: 99px; font-size: 12px; border: 1px solid var(--r-bd); color: var(--r-mu); background: var(--r-bg); }\nhtml body #reportsModal .rep-restore { all: unset; cursor: pointer; display: block; margin: 0 auto 14px; font-size: 12px; color: var(--r-ac); text-align: center; }\n";
var OI_PRIVATE_CSS7 = "\n/* ===== نافذة التقرير: بلا شريط تمرير (التمرير يعمل بالعجلة/اللمس) ===== */\nhtml body #reportsModal, html body #reportsModal .reports-panel, html body #reportsModal .reports-body,\nhtml body #reportsModal .exp-month-list, html body #reportsModal .rep-card, html body #reportsModal .rep-result {\n  scrollbar-width: none !important; -ms-overflow-style: none !important;\n}\nhtml body #reportsModal::-webkit-scrollbar, html body #reportsModal *::-webkit-scrollbar {\n  display: none !important; width: 0 !important; height: 0 !important;\n}\nhtml body #reportsModal .mv-ic { display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-weight: 800; }\nhtml body #reportsModal .mv-ic i { font-style: normal; font-variant-numeric: tabular-nums; }\nhtml body #reportsModal .mv-ic svg { flex: 0 0 auto; }\n";
var OI_PRIVATE_CSS8 = "\n/* ===== شريط الإغلاق في جداول الويب: سطر مدمج بلا حدود وبنفس لون الخلفية ===== */\nhtml body table.oi td.green, html body table.oi .green, html body table.oi.x3-table td.green,\nhtml body table.oi.x3-table tbody tr td.green, html body table.oi tr td.green.strike, html body .close-bar-line,\nhtml body tr.close-bar td, html body table.oi tr.close-bar td, html body table.oi.x3-table tbody tr.close-bar td {\n  background: transparent !important; border: 0 !important; box-shadow: none !important;\n  color: #e5e7eb !important; font-weight: 600 !important;\n}\nhtml[data-theme=\"light\"] body table.oi td.green, html[data-theme=\"light\"] body table.oi .green,\nhtml[data-theme=\"light\"] body table.oi.x3-table td.green, html[data-theme=\"light\"] body .close-bar-line,\nhtml[data-theme=\"light\"] body tr.close-bar td { background: transparent !important; color: #334155 !important; }\n\n/* ===== التقرير: التوافق + الخبر + أيام السكور ===== */\nhtml body #reportsModal .rep-eq { display: block; margin-top: 2px; font-size: 10.5px; font-weight: 600; color: var(--r-mu); letter-spacing: .02em; }\nhtml body #reportsModal .rep-news { margin: 0 0 18px; padding: 14px 18px; border-radius: 16px; text-align: center;\n  background: rgba(251,191,36,.10); border: 1px solid rgba(251,191,36,.38); }\nhtml body #reportsModal .rep-news-title { font-size: 11px; letter-spacing: .12em; font-weight: 800; color: var(--r-gold); margin-bottom: 6px; }\nhtml body #reportsModal .rep-news-line { font-size: 14px; padding: 3px 0; }\nhtml body #reportsModal .rep-news-line b { font-size: 16px; }\nhtml body #reportsModal .rep-days-cell { white-space: normal !important; }\nhtml body #reportsModal .rep-nd { display: inline-block; margin: 2px; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; border: 1px solid var(--r-bd); }\nhtml body #reportsModal .rep-nd-fri { color: #93c5fd; background: rgba(59,130,246,.14); }\nhtml body #reportsModal .rep-nd-opx { color: #c4b5fd; background: rgba(124,58,237,.16); }\nhtml body #reportsModal .rep-nd-eom { color: #5eead4; background: rgba(20,184,166,.14); }\n";
var OI_PRIVATE_CSS9 = "\n/* ===== شريط الإغلاق المدمج ===== */\nhtml body table.oi td.close-merged { text-align: center; padding: 18px 0 !important; height: 58px; font-size: 14.5px; letter-spacing: .02em; color: #e5e7eb !important; }\nhtml[data-theme=\"light\"] body table.oi td.close-merged { color: #334155 !important; }\n\n/* ===== شريط التزايد المزدوج: هادئ ===== */\nhtml body #reportsModal .rep-news { margin: 2px 0 20px; padding: 14px 20px; border-radius: 16px; text-align: center;\n  background: rgba(125,211,200,.06); border: 1px solid rgba(125,211,200,.20); }\nhtml body #reportsModal .rep-news-title { font-size: 11px; letter-spacing: .14em; font-weight: 700; color: #7dd3c8; margin-bottom: 6px; }\nhtml body #reportsModal .rep-news-line { font-size: 14px; padding: 3px 0; color: var(--r-tx); }\nhtml body #reportsModal .rep-news-line b { font-size: 15px; }\nhtml body #reportsModal .rep-news-none { font-size: 12.5px; color: var(--r-mu); }\n";
var OI_PRIVATE_CSS10 = "\n/* ===== شريط الإغلاق: بنفس ارتفاع بقية الصفوف ===== */\nhtml body table.oi td.close-merged { height: 34px !important; padding: 2px 4px !important; font-size: inherit !important; }\n\n/* ===== أزرار إخفاء الجداول ×  ===== */\nhtml body #reportsModal .rep-secbox { position: relative; }\nhtml body #reportsModal .rep-sec-x {\n  all: unset; position: absolute; top: 10px; left: 12px; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;\n  border-radius: 9px; font-size: 18px; line-height: 1; color: var(--r-mu); opacity: .5; cursor: pointer; z-index: 2;\n}\nhtml body #reportsModal .rep-sec-x:hover { opacity: 1; color: #f87171; background: rgba(248,113,113,.12); }\n\n/* ===== المجموع الذكي ===== */\nhtml body #reportsModal .rep-scroll { overflow-x: auto; }\nhtml body #reportsModal .rep-dcs { white-space: normal !important; min-width: 230px; }\nhtml body #reportsModal .rep-dc { display: inline-flex; gap: 6px; align-items: center; margin: 2px; padding: 3px 11px; border-radius: 99px; font-size: 12px; border: 1px solid var(--r-bd); color: var(--r-mu); }\nhtml body #reportsModal .rep-dc b { color: var(--r-tx); font-weight: 800; }\nhtml body #reportsModal .rep-dc-fri { border-color: rgba(59,130,246,.5); background: rgba(59,130,246,.12); }\nhtml body #reportsModal .rep-dc-opx { border-color: rgba(139,92,246,.55); background: rgba(139,92,246,.13); }\nhtml body #reportsModal .rep-dc-eom { border-color: rgba(20,184,166,.5); background: rgba(20,184,166,.12); }\nhtml body #reportsModal .rep-st { display: inline-block; padding: 2px 11px; border-radius: 99px; font-size: 11px; font-weight: 800; background: rgba(148,163,184,.15); color: var(--r-mu); }\nhtml body #reportsModal .rep-st-new { color: #34d399; background: rgba(52,211,153,.15); }\nhtml body #reportsModal .rep-st-hold { color: #60a5fa; background: rgba(96,165,250,.15); }\nhtml body #reportsModal .rep-st-fade { color: #f87171; background: rgba(248,113,113,.15); }\nhtml body #reportsModal .rep-sigrow { cursor: pointer; }\nhtml body #reportsModal .rep-sigrow:hover td { background: rgba(59,130,246,.07); }\nhtml body #reportsModal .rep-sigrow.on td { background: rgba(59,130,246,.14); }\nhtml body #reportsModal .rep-mem { margin: 12px 0 6px; padding-top: 10px; border-top: 1px solid var(--r-bd); }\nhtml body #reportsModal .rep-mem-title { text-align: center; font-size: 12px; font-weight: 800; color: var(--r-mu); margin-bottom: 4px; }\nhtml body #reportsModal .rep-mem svg { display: block; margin: 0 auto; }\nhtml body #reportsModal .mem-b { fill: #475569; } html body #reportsModal .mem-now { fill: var(--r-ac); } html body #reportsModal .mem-peak { fill: #f87171; }\nhtml body #reportsModal .mem-v { font-size: 11px; fill: var(--r-tx); } html body #reportsModal .mem-d { font-size: 10px; fill: var(--r-mu); }\nhtml body #reportsModal .rep-mem-note { text-align: center; font-size: 13px; margin-top: 6px; }\n\n/* ===== زر إغلاق نافذة التقرير في الأعلى ===== */\nhtml body #reportsClose { display: inline-flex !important; align-items: center; justify-content: center; flex: 0 0 auto; }\n";
var OI_PRIVATE_CSS11 = "\n/* ===== شريط الإغلاق: أطراف جانبية كأنه جزء من الجدول ===== */\nhtml body table.oi td.close-merged {\n  border-left: 1px solid rgba(148,163,184,.30) !important; border-right: 1px solid rgba(148,163,184,.30) !important;\n  border-top: 0 !important; border-bottom: 0 !important;\n}\n\n/* ===== نافذة التقرير: الإغلاق كنافذة Excel ===== */\nhtml body #reportsModal .reports-panel { position: relative; }\nhtml body #reportsModal .map-head { position: relative; border-bottom: 0 !important; padding: 14px 18px 4px !important; min-height: 0; background: transparent; justify-content: center; }\nhtml body #reportsModal .map-head h3 { display: none; }\nhtml body #reportsModal .map-head > div { width: 100%; text-align: center; }\nhtml body #reportsModal .map-sub { font-size: 17px; font-weight: 800; color: var(--r-tx, #f1f5f9); margin: 6px 0 0; }\nhtml body #reportsClose {\n  position: absolute !important; top: 10px; left: 12px; z-index: 5; background: transparent !important; border: 0 !important;\n  box-shadow: none !important; color: #94a3b8 !important; font-size: 13px; padding: 4px 8px;\n}\nhtml body #reportsClose:hover { color: #f1f5f9 !important; }\n\n/* ===== البحث داخل التقرير ===== */\nhtml body #reportsModal .rep-find { position: sticky; top: 0; z-index: 4; display: flex; align-items: center; gap: 10px; margin: 0 0 16px; padding: 0 14px; height: 42px;\n  border-radius: 14px; background: #1a2332; border: 1px solid #2a3548; color: var(--r-mu); }\nhtml body #reportsModal .rep-find:focus-within { border-color: var(--r-ac); }\nhtml body #reportsModal .rep-find input { flex: 1; min-width: 0; height: 100%; background: transparent; border: 0; outline: none; color: var(--r-tx); font-size: 14px; text-align: right; }\nhtml body #reportsModal #repFindCount { font-size: 12px; font-weight: 700; color: var(--r-ac); white-space: nowrap; }\nhtml[data-theme=\"light\"] body #reportsModal .rep-find { background: #eef2f9; border-color: #d5deee; }\n\n/* ===== أخبار + توافق + حالات ===== */\nhtml body #reportsModal .rep-bd { unicode-bidi: isolate; display: inline-block; }\nhtml body #reportsModal .rep-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-inline-end: 6px; background: #64748b; }\nhtml body #reportsModal .rep-dot-new { background: #34d399; } html body #reportsModal .rep-dot-hold { background: #60a5fa; }\nhtml body #reportsModal .rep-dot-drop { background: #f59e0b; } html body #reportsModal .rep-dot-fade { background: #f87171; }\nhtml body #reportsModal .rep-st-drop { color: #f59e0b; background: rgba(245,158,11,.15); }\nhtml body #reportsModal .rep-st-day { margin-top: 3px; font-size: 11px; color: var(--r-mu); }\nhtml body #reportsModal .rep-dc { cursor: pointer; }\nhtml body #reportsModal .mem-open { fill: #34d399; }\nhtml body #reportsModal .rep-mem-hint { text-align: center; font-size: 11px; color: var(--r-mu); margin-top: 2px; }\nhtml body #reportsModal .rep-legend { margin-top: 12px; padding: 10px 14px; border-radius: 12px; font-size: 12px; line-height: 1.9; color: var(--r-mu); text-align: center; background: rgba(148,163,184,.06); }\nhtml body #reportsModal .rep-legend b { color: var(--r-tx); }\nhtml body #reportsModal .rep-dl { display: block; margin-top: 2px; font-size: 11px; font-weight: 700; }\nhtml body #reportsModal .rep-dl.up { color: #34d399; } html body #reportsModal .rep-dl.dn { color: #f87171; }\nhtml body #reportsModal .rep-x4 { background: rgba(52,211,153,.2); color: #34d399; }\n\n/* ===== توافق الأعلى تزايدًا ===== */\nhtml body #reportsModal .rep-ag-group { padding: 10px 0; border-top: 1px solid var(--r-bd); }\nhtml body #reportsModal .rep-ag-line { text-align: center; font-size: 13px; margin-bottom: 10px; }\nhtml body #reportsModal .rep-ag-line b { font-size: 16px; }\nhtml body #reportsModal .rep-ag-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }\nhtml body #reportsModal .rep-ag-chip { min-width: 96px; padding: 8px 12px; border-radius: 14px; text-align: center; border: 1px solid var(--r-bd); background: var(--r-bg); }\nhtml body #reportsModal .rep-ag-chip .ag-d { font-size: 11px; font-weight: 700; color: var(--r-mu); }\nhtml body #reportsModal .rep-ag-chip .ag-k { font-size: 17px; font-weight: 800; margin: 2px 0; }\nhtml body #reportsModal .rep-ag-chip .ag-oi { font-size: 12px; color: var(--r-mu); }\nhtml body #reportsModal .rep-ag-chip .ag-dl { font-size: 13px; font-weight: 800; color: #34d399; }\nhtml body #reportsModal .rep-ag-fri { border-color: rgba(59,130,246,.5); background: rgba(59,130,246,.10); }\nhtml body #reportsModal .rep-ag-opx { border-color: rgba(139,92,246,.55); background: rgba(139,92,246,.11); }\nhtml body #reportsModal .rep-ag-eom { border-color: rgba(20,184,166,.5); background: rgba(20,184,166,.10); }\n";
var OI_PRIVATE_CSS12 = "\n/* ===== نافذة التقرير: حجم مناسب وبلا تمرير أفقي ===== */\nhtml body #reportsModal .reports-panel { width: min(1500px, 98vw) !important; }\nhtml body #reportsModal .reports-body { padding: 14px 16px 22px !important; }\nhtml body #reportsModal .rep-card { padding: 12px 12px !important; overflow: visible !important; margin-bottom: 12px !important; }\nhtml body #reportsModal .rep-grid { gap: 12px !important; margin-bottom: 12px !important; }\nhtml body #reportsModal .rep-card-title { font-size: 13px !important; margin-bottom: 6px !important; }\nhtml body #reportsModal .rep-scroll { overflow: visible !important; }\nhtml body #reportsModal .rep-table { table-layout: fixed !important; width: 100% !important; font-size: 12px !important; direction: rtl !important; }\nhtml body #reportsModal .rep-table th, html body #reportsModal .rep-table td { padding: 5px 4px !important; white-space: normal !important; word-break: break-word; line-height: 1.35; }\nhtml body #reportsModal .rep-table td b { font-size: 13px; }\nhtml body #reportsModal .rep-eq { font-size: 10px !important; line-height: 1.3; }\nhtml body #reportsModal .rep-m th:nth-child(1), html body #reportsModal .rep-m td:nth-child(1) { width: 26px; }\nhtml body #reportsModal .rep-m th:nth-child(3), html body #reportsModal .rep-m td:nth-child(3) { width: 58px; }\nhtml body #reportsModal .rep-m th:nth-child(5), html body #reportsModal .rep-m td:nth-child(5) { width: 24px; }\nhtml body #reportsModal .rep-lv th:nth-child(1), html body #reportsModal .rep-lv td:nth-child(1) { width: 104px; }\nhtml body #reportsModal .rep-lv th:nth-child(2), html body #reportsModal .rep-lv td:nth-child(2) { width: 66px; }\nhtml body #reportsModal .rep-lv th:nth-child(3), html body #reportsModal .rep-lv td:nth-child(3) { width: 74px; }\nhtml body #reportsModal .rep-lv th:nth-child(5), html body #reportsModal .rep-lv td:nth-child(5) { width: 74px; }\nhtml body #reportsModal .rep-lv th:nth-child(6), html body #reportsModal .rep-lv td:nth-child(6) { width: 24px; }\nhtml body #reportsModal .rep-sc th:nth-child(1), html body #reportsModal .rep-sc td:nth-child(1) { width: 24px; }\nhtml body #reportsModal .rep-sc th:nth-child(2), html body #reportsModal .rep-sc td:nth-child(2) { width: 104px; }\nhtml body #reportsModal .rep-sc th:nth-child(3), html body #reportsModal .rep-sc td:nth-child(3) { width: 50px; }\nhtml body #reportsModal .rep-sc th:nth-child(4), html body #reportsModal .rep-sc td:nth-child(4) { width: 46px; }\nhtml body #reportsModal .rep-sc th:nth-child(5), html body #reportsModal .rep-sc td:nth-child(5) { width: 84px; }\nhtml body #reportsModal .rep-sc th:nth-child(7), html body #reportsModal .rep-sc td:nth-child(7) { width: 24px; }\nhtml body #reportsModal .rep-sig th:nth-child(1), html body #reportsModal .rep-sig td:nth-child(1) { width: 108px; }\nhtml body #reportsModal .rep-sig th:nth-child(2), html body #reportsModal .rep-sig td:nth-child(2) { width: 52px; }\nhtml body #reportsModal .rep-sig th:nth-child(4), html body #reportsModal .rep-sig td:nth-child(4) { width: 56px; }\nhtml body #reportsModal .rep-sig th:nth-child(5), html body #reportsModal .rep-sig td:nth-child(5) { width: 92px; }\nhtml body #reportsModal .rep-sig th:nth-child(6), html body #reportsModal .rep-sig td:nth-child(6) { width: 60px; }\nhtml body #reportsModal .rep-sig th:nth-child(7), html body #reportsModal .rep-sig td:nth-child(7) { width: 24px; }\nhtml body #reportsModal .rep-dcs { min-width: 0 !important; direction: rtl; text-align: center; }\nhtml body #reportsModal .rep-dc { font-size: 11px !important; padding: 2px 8px !important; margin: 1px !important; gap: 4px !important; }\nhtml body #reportsModal .rep-dc b { font-size: 11px !important; }\nhtml body #reportsModal .rep-st { font-size: 10.5px !important; padding: 2px 8px !important; }\nhtml body #reportsModal .rep-sub { margin: 6px 0 4px !important; font-size: 10.5px !important; }\nhtml body #reportsModal .rep-legend { font-size: 11px !important; line-height: 1.7 !important; padding: 8px 10px !important; }\nhtml body #reportsModal .rep-mem { margin: 8px 0 2px !important; padding-top: 6px !important; }\nhtml body #reportsModal .rep-mem svg { max-height: 120px; }\nhtml body #reportsModal .mem-v { font-size: 8px !important; } html body #reportsModal .mem-d { font-size: 7.5px !important; }\nhtml body #reportsModal .rep-mem-note { font-size: 12px !important; margin-top: 2px !important; }\n\n/* ===== البحث ثابت في رأس النافذة ===== */\nhtml body #reportsModal .map-head { flex-wrap: wrap; }\nhtml body #reportsModal .rep-find { position: static !important; flex: 1 0 100%; margin: 8px 0 6px !important; }\n\n/* ===== توافق الأعلى تزايدًا: CALL يسار · PUT يمين ===== */\nhtml body #reportsModal .rep-ag-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; direction: ltr; }\nhtml body #reportsModal .rep-ag-col { min-width: 0; }\nhtml body #reportsModal .rep-ag-group { padding: 6px 0 !important; border-top: 0 !important; }\nhtml body #reportsModal .rep-ag-chips { direction: rtl; gap: 6px !important; }\nhtml body #reportsModal .rep-ag-chip { min-width: 74px !important; padding: 5px 8px !important; border-radius: 12px !important; }\nhtml body #reportsModal .rep-ag-chip .ag-d { font-size: 10.5px !important; }\nhtml body #reportsModal .rep-ag-chip .ag-dt { font-size: 9.5px; color: var(--r-mu); }\nhtml body #reportsModal .rep-ag-chip .ag-k { font-size: 14px !important; margin: 1px 0 !important; }\nhtml body #reportsModal .rep-ag-chip .ag-oi { font-size: 10.5px !important; }\nhtml body #reportsModal .rep-ag-chip .ag-dl { font-size: 11.5px !important; }\n@media (max-width: 900px) { html body #reportsModal .rep-ag-cols { grid-template-columns: 1fr; } }\n\n/* ===== قمة وقاع على نفس السترايك ===== */\nhtml body #reportsModal .rep-pt-group { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 8px 0; border-top: 1px solid var(--r-bd); direction: rtl; flex-wrap: wrap; }\nhtml body #reportsModal .rep-pt-k { font-size: 18px; padding: 3px 12px; border-radius: 10px; background: rgba(59,130,246,.14); direction: ltr; }\nhtml body #reportsModal .rep-pt-rows { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }\nhtml body #reportsModal .rep-pt-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }\nhtml body #reportsModal .rep-pt-l { min-width: 38px; font-size: 11px; font-weight: 800; color: #34d399; }\n\n/* ===== ترتيب المستويات: شرائح \"لماذا\" ===== */\nhtml body #reportsModal .rep-reasons { display: flex !important; flex-wrap: wrap; gap: 5px; justify-content: center; direction: rtl; white-space: normal !important; }\nhtml body #reportsModal .chip-reason { display: inline-flex; align-items: center; gap: 4px; margin: 0 !important; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; white-space: nowrap; border: 1px solid var(--r-bd); }\nhtml body #reportsModal .chip-d { color: #93c5fd; background: rgba(59,130,246,.12); border-color: rgba(59,130,246,.35); }\nhtml body #reportsModal .chip-g { color: #fcd34d; background: rgba(245,158,11,.10); border-color: rgba(245,158,11,.35); }\nhtml body #reportsModal .chip-s { color: #c4b5fd; background: rgba(139,92,246,.13); border-color: rgba(139,92,246,.40); }\nhtml body #reportsModal .chip-lv { color: #34d399; background: rgba(52,211,153,.12); border-color: rgba(52,211,153,.38); }\n";
var OI_PRIVATE_CSS13 = "html body #reportsModal .rep-m th:nth-child(1), html body #reportsModal .rep-m td:nth-child(1) { width: 24px !important; }\nhtml body #reportsModal .rep-m th:nth-child(2), html body #reportsModal .rep-m td:nth-child(2) { width: 26px !important; }\nhtml body #reportsModal .rep-m th:nth-child(3), html body #reportsModal .rep-m td:nth-child(3) { width: auto !important; }\nhtml body #reportsModal .rep-m th:nth-child(4), html body #reportsModal .rep-m td:nth-child(4) { width: 58px !important; }\nhtml body #reportsModal .rep-m th:nth-child(5), html body #reportsModal .rep-m td:nth-child(5) { width: 104px !important; }\nhtml body #reportsModal .rep-lv th:nth-child(1), html body #reportsModal .rep-lv td:nth-child(1) { width: 24px !important; }\nhtml body #reportsModal .rep-lv th:nth-child(2), html body #reportsModal .rep-lv td:nth-child(2) { width: 74px !important; }\nhtml body #reportsModal .rep-lv th:nth-child(3), html body #reportsModal .rep-lv td:nth-child(3) { width: auto !important; }\nhtml body #reportsModal .rep-lv th:nth-child(4), html body #reportsModal .rep-lv td:nth-child(4) { width: 74px !important; }\nhtml body #reportsModal .rep-lv th:nth-child(5), html body #reportsModal .rep-lv td:nth-child(5) { width: 66px !important; }\nhtml body #reportsModal .rep-lv th:nth-child(6), html body #reportsModal .rep-lv td:nth-child(6) { width: 104px !important; }\nhtml body #reportsModal .rep-sc th:nth-child(1), html body #reportsModal .rep-sc td:nth-child(1) { width: 24px !important; }\nhtml body #reportsModal .rep-sc th:nth-child(2), html body #reportsModal .rep-sc td:nth-child(2) { width: 24px !important; }\nhtml body #reportsModal .rep-sc th:nth-child(3), html body #reportsModal .rep-sc td:nth-child(3) { width: 104px !important; }\nhtml body #reportsModal .rep-sc th:nth-child(4), html body #reportsModal .rep-sc td:nth-child(4) { width: 50px !important; }\nhtml body #reportsModal .rep-sc th:nth-child(5), html body #reportsModal .rep-sc td:nth-child(5) { width: 46px !important; }\nhtml body #reportsModal .rep-sc th:nth-child(6), html body #reportsModal .rep-sc td:nth-child(6) { width: 84px !important; }\nhtml body #reportsModal .rep-sc th:nth-child(7), html body #reportsModal .rep-sc td:nth-child(7) { width: auto !important; }\nhtml body #reportsModal .rep-sig th:nth-child(1), html body #reportsModal .rep-sig td:nth-child(1) { width: 24px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(2), html body #reportsModal .rep-sig td:nth-child(2) { width: 108px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(3), html body #reportsModal .rep-sig td:nth-child(3) { width: 52px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(4), html body #reportsModal .rep-sig td:nth-child(4) { width: auto !important; }\nhtml body #reportsModal .rep-sig th:nth-child(5), html body #reportsModal .rep-sig td:nth-child(5) { width: 56px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(6), html body #reportsModal .rep-sig td:nth-child(6) { width: 92px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(7), html body #reportsModal .rep-sig td:nth-child(7) { width: 60px !important; }\n\nhtml body #reportsModal .rep-grid-rtl { direction: rtl; }\nhtml body #reportsModal .rep-find { position: static !important; flex: none; margin: 4px 0 14px !important; }\nhtml body #reportsModal .rep-cf-sub { text-align: center; font-size: 11px; color: var(--r-mu); margin: -2px 0 10px; }\nhtml body #reportsModal .rep-cf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 10px; direction: rtl; }\nhtml body #reportsModal .rep-cf-card { position: relative; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--r-bd); background: var(--r-bg); }\nhtml body #reportsModal .rep-cf-x { position: absolute !important; top: 6px; right: 8px; }\nhtml body #reportsModal .rep-cf-head { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin-bottom: 2px; }\nhtml body #reportsModal .rep-cf-k { font-size: 19px; font-weight: 800; }\nhtml body #reportsModal .rep-cf-tag { padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 800; background: rgba(52,211,153,.14); color: #34d399; }\nhtml body #reportsModal .rep-cf-str { font-size: 11px; color: #34d399; letter-spacing: 1px; }\nhtml body #reportsModal .rep-cf-eq { text-align: center; font-size: 10px; color: var(--r-mu); margin-bottom: 4px; }\nhtml body #reportsModal .rep-cf-row { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; border-top: 1px dashed var(--r-bd); }\nhtml body #reportsModal .rep-cf-l { flex: 0 0 76px; font-size: 10.5px; font-weight: 800; color: var(--r-mu); padding-top: 3px; text-align: right; }\nhtml body #reportsModal .rep-cf-chips { display: flex; flex-wrap: wrap; gap: 4px; direction: rtl; flex: 1; }\nhtml body #reportsModal .rep-cfc { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 99px; font-size: 11px; border: 1px solid var(--r-bd); white-space: nowrap; }\nhtml body #reportsModal .rep-cfc b { color: #34d399; } html body #reportsModal .rep-cfc em { font-style: normal; color: var(--r-mu); }\nhtml body #reportsModal .cf-wall { border-color: rgba(52,211,153,.38); background: rgba(52,211,153,.08); }\nhtml body #reportsModal .rep-sd { font-style: normal; font-size: 9.5px; font-weight: 800; padding: 0 6px; border-radius: 99px; }\nhtml body #reportsModal .rep-sd-c { color: #93c5fd; background: rgba(59,130,246,.18); } html body #reportsModal .rep-sd-p { color: #c4b5fd; background: rgba(139,92,246,.2); }\nhtml body #reportsModal .rep-goto { all: unset; cursor: pointer; display: block; margin: 6px auto 0; font-size: 11px; color: var(--r-ac); }\n";
var OI_PRIVATE_CSS14 = "\nhtml body #reportsModal .rep-sig th:nth-child(1), html body #reportsModal .rep-sig td:nth-child(1) { width: 24px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(2), html body #reportsModal .rep-sig td:nth-child(2) { width: 112px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(3), html body #reportsModal .rep-sig td:nth-child(3) { width: 56px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(4), html body #reportsModal .rep-sig td:nth-child(4) { width: auto !important; }\nhtml body #reportsModal .rep-sig th:nth-child(5), html body #reportsModal .rep-sig td:nth-child(5) { width: 58px !important; }\nhtml body #reportsModal .rep-sig th:nth-child(6), html body #reportsModal .rep-sig td:nth-child(6) { width: 104px !important; }\nhtml body #reportsModal .rep-top-star { color: #fbbf24; font-weight: 800; font-size: 11px; }\nhtml body #reportsModal .rep-card .rep-cf-sub { margin: 0 0 6px; }\n";
var OI_PRIVATE_CSS15 = "\nhtml body #reportsModal .rep-st-grow { color: #34d399; background: rgba(52,211,153,.15); }\nhtml body #reportsModal .rep-st-hold { color: #60a5fa; background: rgba(96,165,250,.15); }\nhtml body #reportsModal .rep-st-build { color: #94a3b8; background: rgba(148,163,184,.16); }\nhtml body #reportsModal .rep-dot-grow { background: #34d399; } html body #reportsModal .rep-dot-build { background: #94a3b8; }\nhtml body #reportsModal .rep-rng-l { font-size: 10.5px; color: #7c89a6; margin: 0 2px 0 6px; }\nhtml body #reportsModal .rep-rng { width: 58px !important; }\nhtml body .tw-legend { margin: 8px 0 0; font-size: 11.5px; color: #fbbf24; text-align: center; }\nhtml body .tw-legend-box { display: inline-block; width: 12px; height: 12px; border: 2px solid #f59e0b; border-radius: 3px; vertical-align: -2px; }\nhtml body td.tw-topd { position: relative; }\n.exp-rng-l { font-size: 11px; color: #94a3b8; margin: 0 4px; }\n.exp-rng { width: 60px !important; text-align: center; }\n";
var OI_PRIVATE_CSS16 = "\nhtml body #reportsModal .rep-top-star { color: #7dd3c8 !important; font-size: 10.5px !important; font-weight: 700 !important; }\nhtml body .tw-legend { color: #94a3b8 !important; font-size: 11.5px; }\nhtml body .tw-legend-star { color: #7dd3c8; }\nhtml body td.tw-topd { box-shadow: none !important; }\n";
var OI_PRIVATE_CSS17 = "\nhtml body #reportsModal .rep-tabs { display: flex; justify-content: center; gap: 6px; margin: 4px 0 14px; }\nhtml body #reportsModal .rep-tab { all: unset; cursor: pointer; padding: 7px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; color: var(--r-mu); border: 1px solid transparent; }\nhtml body #reportsModal .rep-tab.on { color: var(--r-tx); background: rgba(59,130,246,.14); border-color: rgba(59,130,246,.4); }\nhtml body #reportsModal .rep-lens-banner { text-align: center; font-size: 14px; margin: 0 0 12px; padding: 8px 12px; border-radius: 12px; background: rgba(59,130,246,.10); border: 1px solid rgba(59,130,246,.30); }\nhtml body #reportsModal .rep-lens-banner b { font-size: 16px; margin: 0 4px; }\nhtml body #reportsModal .rep-lens-banner .rep-goto { display: inline-block; margin: 0 14px; }\nhtml body #reportsModal .rep-pair-head { display: flex; justify-content: space-between; align-items: center; direction: rtl; padding: 8px 14px; margin-bottom: 10px; border-radius: 12px; background: var(--r-card); border: 1px solid var(--r-bd); font-weight: 800; font-size: 14px; }\nhtml body #reportsModal .rep-pair-k { font-size: 11px; color: var(--r-mu); font-weight: 600; direction: ltr; }\nhtml body #reportsModal .rep-pair-day { margin-bottom: 10px; padding: 10px 12px; border-radius: 14px; background: var(--r-card); border: 1px solid var(--r-bd); }\nhtml body #reportsModal .rep-pair-dl { text-align: center; font-weight: 800; font-size: 13px; margin-bottom: 6px; }\nhtml body #reportsModal .rep-pair-dl small { display: block; font-size: 10px; font-weight: 500; color: var(--r-mu); }\nhtml body #reportsModal .rep-pair-row { display: grid; grid-template-columns: 1fr 120px 1fr; direction: rtl; gap: 8px; align-items: center; padding: 5px 0; border-top: 1px dashed var(--r-bd); }\nhtml body #reportsModal .rep-pair-lab { text-align: center; font-size: 11px; font-weight: 800; color: var(--r-mu); }\nhtml body #reportsModal .rep-pc { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; font-size: 12px; }\nhtml body #reportsModal .rep-pc-k { font-size: 15px; direction: ltr; }\nhtml body #reportsModal .rep-pc-eq { font-size: 10px; color: var(--r-mu); direction: ltr; }\nhtml body #reportsModal .rep-pc-oi { color: var(--r-mu); }\nhtml body #reportsModal .rep-pc-d { color: #a7f3e8; font-weight: 700; }\nhtml body #reportsModal .rep-pc-none { text-align: center; color: var(--r-mu); }\n";
var OI_PRIVATE_CSS19 = "\n/* ===== رمز المجموع (دائرة ناعمة بعلامة +) ===== */\n.sum-ico { display:inline-block; width:1.15em; height:1.15em; vertical-align:-0.2em; background:currentColor; opacity:.92;\n  -webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3 3 8l9 5 9-5-9-5z'/%3E%3Cpath d='M3 12.5l9 5 9-5'/%3E%3Cpath d='M3 17l9 5 9-5'/%3E%3C/svg%3E\") center/contain no-repeat;\n  mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3 3 8l9 5 9-5-9-5z'/%3E%3Cpath d='M3 12.5l9 5 9-5'/%3E%3Cpath d='M3 17l9 5 9-5'/%3E%3C/svg%3E\") center/contain no-repeat; }\nhtml body #reportsModal .rep-card-title .sum-ico { width:1.1em; height:1.1em; margin-inline-end:4px; }\n/* ===== نجمة ذهبية في التقرير (الأعلى تزايدًا) ===== */\nhtml body #reportsModal .rep-top-star { color:#fbbf24 !important; font-size:13px !important; font-weight:800 !important; text-shadow:0 0 6px rgba(251,191,36,.45); }\n/* ===== جملة المراكز المفتوحة: أكبر وأوضح ===== */\nhtml body #reportsModal .rep-pos-title { display:flex; flex-direction:column; align-items:center; gap:2px; margin:18px 0 10px; padding:10px 12px; border-radius:12px; background:rgba(167,139,250,.10); border:1px solid rgba(167,139,250,.35); }\nhtml body #reportsModal .rep-pos-t1 { font-size:20px; font-weight:800; color:#e9e5ff; letter-spacing:0; }\nhtml body #reportsModal .rep-pos-t2 { font-size:14px; font-weight:600; color:#c4b5fd; }\n/* ===== ES بجانب SPX في الصندوق·المؤشر ===== */\nhtml body #reportsModal .rep-pc-es { font-size:11px; font-weight:800; color:#fbbf24; background:rgba(251,191,36,.12); border:1px solid rgba(251,191,36,.35); border-radius:999px; padding:1px 8px; direction:ltr; }\n";
var OI_PRIVATE_CSS20 = "\nhtml body #reportsModal .rep-pos-title { display:block; text-align:center; margin:14px 0 6px; padding:0; background:none; border:0; font-size:13px; font-weight:700; color:#e0e7ff; }\nhtml body #reportsModal .rep-pos-title small { font-size:11px; font-weight:500; color:#a5b4fc; margin-inline-start:6px; }\nhtml body #reportsModal .rep-pc-eq { color:#cbd5e1; font-weight:600; direction:ltr; }\nhtml body #reportsModal .chip-lv { color:#cbd5e1 !important; background:rgba(148,163,184,.10) !important; border-color:rgba(148,163,184,.26) !important; }\n.tw-mv { display:block; margin-top:2px; font-size:10px; font-weight:800; line-height:1.1; white-space:nowrap; }\n.tw-mv-up { color:#34d399 !important; }\n.tw-mv-dn { color:#fb7185 !important; }\n.tw-mv-eq { color:#94a3b8; }\n.rk-under { display:block; margin-top:2px; line-height:1; }\n/* شارات الترتيب في جدول الأيام: هادئة وصغيرة */\n.twk { display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; font-size:9.5px; font-weight:700; line-height:1; vertical-align:middle; box-sizing:border-box; }\n.twk-s1,.twk-s2,.twk-s3,.twk-s4 { border-radius:50%; color:#1e1b4b; }\n.twk-s1 { background:#a5b4fc; } .twk-s2 { background:#b8c2fd; } .twk-s3 { background:#cdd5fe; } .twk-s4 { background:#e0e7ff; }\n.twk-d2,.twk-d3,.twk-d4 { border-radius:4px; color:#fcd34d; background:rgba(251,191,36,.10); border:1px solid rgba(251,191,36,.5); }\n.twk-d3 { border-color:rgba(251,191,36,.38); } .twk-d4 { border-color:rgba(251,191,36,.26); }\n.tawafuq-oi .tw-tot { background:rgba(99,102,241,.08); color:#e0e7ff; text-align:center; font-weight:600; font-size:12px; padding:4px 6px; min-width:58px; }\n.tawafuq-oi .tw-tot-th { color:#a5b4fc; background:rgba(99,102,241,.12); font-weight:600; text-align:center; }\n.tawafuq-oi .tw-stack { max-width:100%; }\n";
var OI_PRIVATE_CSS21 = "\n/* ===== رمز مجموع الأوبن (أعمدة) ===== */\n.oi-ico { display:inline-block; width:1.15em; height:1.15em; vertical-align:-0.2em; background:currentColor; opacity:.92;\n  -webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='M6 19v-6M12 19V5M18 19v-9'/%3E%3C/svg%3E\") center/contain no-repeat;\n  mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='M6 19v-6M12 19V5M18 19v-9'/%3E%3C/svg%3E\") center/contain no-repeat; }\n/* ===== شارات المستوى بلون عمود اليوم (جمعة/أسبوع · OPX · نهاية الشهر) ===== */\nhtml body #reportsModal .chip-lv.chip-k-fri { color:#93c5fd !important; background:rgba(59,130,246,.14) !important; border-color:rgba(59,130,246,.40) !important; }\nhtml body #reportsModal .chip-lv.chip-k-opx { color:#c4b5fd !important; background:rgba(124,58,237,.16) !important; border-color:rgba(124,58,237,.42) !important; }\nhtml body #reportsModal .chip-lv.chip-k-eom { color:#5eead4 !important; background:rgba(20,184,166,.14) !important; border-color:rgba(20,184,166,.40) !important; }\n";
var OI_PRIVATE_CSS22 = "\n/* ترتيب التزايد 2-4 في جدول الأيام: رقم هادئ بلا إطار ولا ذهبي — منسجم مع رمادي القمم والقيعان */\n.twk-d2,.twk-d3,.twk-d4 { width:auto; height:auto; min-width:9px; margin-inline-end:3px; border:0 !important; border-radius:0; background:none !important; color:#9aa8c2 !important; font-size:10px; font-weight:600; }\n.twk-d3 { opacity:.82; } .twk-d4 { opacity:.66; }\n.tw-mv-eq { color:#94a3b8 !important; font-weight:600; }\nhtml body #reportsModal .rep-both-title { text-align:center; margin:16px 0 6px; font-size:13px; font-weight:700; color:#e0e7ff; }\nhtml body #reportsModal table.rep-both td, html body #reportsModal table.rep-both th { text-align:center; }\n";
var OI_PRIVATE_CSS23 = "\n/* ===== طيّ أقسام التقرير ===== */\ndetails.rep-fold > summary.rep-fold-sum { cursor:pointer; list-style:none; text-align:center; font-weight:700; font-size:13px; color:#e0e7ff; padding:8px 10px; border-radius:10px; background:rgba(99,102,241,.10); border:1px solid rgba(99,102,241,.28); user-select:none; }\ndetails.rep-fold > summary.rep-fold-sum::-webkit-details-marker { display:none; }\ndetails.rep-fold > summary.rep-fold-sum::before { content:\"▸\"; display:inline-block; margin-inline-end:8px; color:#a5b4fc; transition:transform .15s; }\ndetails.rep-fold[open] > summary.rep-fold-sum::before { transform:rotate(90deg); }\ndetails.rep-fold > summary small { font-size:11px; font-weight:500; color:#a5b4fc; margin-inline-start:6px; }\ndetails.rep-fold[open] > summary.rep-fold-sum { margin-bottom:10px; }\ndetails.rep-far-card > summary.rep-fold-sum { margin:0; }\n/* ترتيب بين قوسين */\n.tw-rkp, .rk-par { color:#9aa8c2; font-weight:600; font-size:.88em; }\n";
var OI_PRIVATE_CSS24 = "\n/* مربع الأيام الحر: أصغر من أزرار Days */\nhtml body .app .controls .chip-row input.days-free-input,\nhtml body .app .controls input.days-free-input {\n  width: 22px !important; min-width: 22px !important; max-width: 22px !important;\n  height: 22px !important; min-height: 22px !important; max-height: 22px !important;\n  flex: 0 0 22px !important; font-size: 10px !important; border-radius: 6px !important; text-align: center !important;\n  margin: 0 0 0 4px !important; padding: 0 !important; opacity: .92;\n}\nhtml body .app .controls input.days-free-input::-webkit-outer-spin-button,\nhtml body .app .controls input.days-free-input::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; display: none !important; }\n/* أعمدة التزايد والنمو والمجموع: الترتيب (1-4) بجانب الرقم، والعمود بعرض مناسب (يتّسع تلقائيًا لأطول رقم) */\nhtml body table.oi:not(.x3-table):not(.series-oi) th.delta, html body table.oi:not(.x3-table):not(.series-oi) td.delta,\nhtml body table.oi:not(.x3-table):not(.series-oi) th.growth, html body table.oi:not(.x3-table):not(.series-oi) td.growth,\nhtml body table.oi:not(.x3-table):not(.series-oi) th.sigma, html body table.oi:not(.x3-table):not(.series-oi) td.sigma {\n  width: auto !important; min-width: 68px !important; max-width: none !important;\n  white-space: nowrap !important; padding-left: 4px !important; padding-right: 4px !important;\n}\n.rk-par { display: inline; margin-inline-start: 3px; font-size: 9.5px; font-weight: 600; opacity: .85; }\n.tw-rkp { font-size: .8em; }\n";
var OI_PRIVATE_CSS25 = "\nhtml body #reportsModal .rep-bottom-folds { margin-top: 18px; padding-top: 12px; border-top: 1px dashed rgba(148,163,184,.30); display: flex; flex-direction: column; gap: 10px; }\nhtml body #reportsModal .rep-bottom-folds > details { margin: 0; }\nhtml body .app .controls input.days-free-input:hover { border-color: #4b5878 !important; }\n";
var OI_PRIVATE_CSS26 = "\n/* ===== مربع الأيام الحر: أسهم تظهر عند التمرير ===== */\n.days-free-wrap { position: relative; display: inline-flex; align-self: center; margin: 0 6px; height: 28px; }\n.days-free-wrap .dfw-arrows { position: absolute; top: 3px; bottom: 3px; right: 4px; width: 12px; display: flex; flex-direction: column; opacity: 0; transition: opacity .12s; }\n.days-free-wrap:hover .dfw-arrows, .days-free-wrap:focus-within .dfw-arrows { opacity: 1; }\n.days-free-wrap .dfw-btn { flex: 1; border: 0; background: transparent; color: #94a3b8; font-size: 7px; line-height: 1; padding: 0; cursor: pointer; }\n.days-free-wrap .dfw-btn:hover { color: #f1f5f9; }\n\n/* ===== التقرير: تنسيق هادئ، يمين → يسار، ألوان أقل ===== */\nhtml body #reportsModal #repResult, html body #reportsModal .rep-body { direction: rtl; text-align: right; }\nhtml body #reportsModal .rep-card { background: rgba(15,23,42,.38) !important; border: 1px solid rgba(148,163,184,.16) !important; border-radius: 14px !important; padding: 14px 16px !important; box-shadow: none !important; margin: 0 !important; }\nhtml body #reportsModal .rep-spacer { height: 14px !important; }\nhtml body #reportsModal .rep-grid { gap: 14px !important; align-items: start; }\nhtml body #reportsModal .rep-card-title, html body #reportsModal .rep-card-title.center { text-align: right !important; font-size: 14px !important; font-weight: 700 !important; color: #e2e8f0 !important; letter-spacing: 0 !important; margin: 0 0 12px !important; padding: 0 0 9px !important; border-bottom: 1px solid rgba(148,163,184,.16) !important; background: none !important; }\nhtml body #reportsModal .rep-sub { text-align: right !important; font-size: 12px !important; font-weight: 700 !important; letter-spacing: 0 !important; color: #cbd5e1 !important; margin: 12px 0 6px !important; background: none !important; border: 0 !important; padding: 0 !important; }\nhtml body #reportsModal .rep-sub::before { content: \"\"; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-inline-end: 7px; background: #94a3b8; }\nhtml body #reportsModal .rep-sub.c::before { background: #7aa7d9; }\nhtml body #reportsModal .rep-sub.p::before { background: #d98f9f; }\nhtml body #reportsModal .rep-table { width: 100%; border-collapse: collapse !important; border-spacing: 0 !important; background: none !important; margin: 0 0 4px !important; }\nhtml body #reportsModal .rep-table th { background: none !important; color: #94a3b8 !important; font-size: 11px !important; font-weight: 600 !important; padding: 6px 8px !important; border: 0 !important; border-bottom: 1px solid rgba(148,163,184,.22) !important; text-align: center; white-space: nowrap; }\nhtml body #reportsModal .rep-table td { background: none !important; padding: 8px 8px !important; border: 0 !important; border-bottom: 1px solid rgba(148,163,184,.09) !important; font-variant-numeric: tabular-nums; color: #e2e8f0; text-align: center; line-height: 1.5; }\nhtml body #reportsModal .rep-table tr:last-child td { border-bottom: 0 !important; }\nhtml body #reportsModal .rep-table tbody tr:nth-child(even) td { background: none !important; }\nhtml body #reportsModal .rep-table td:first-child { text-align: right; }\nhtml body #reportsModal .rep-table tr.rep-grp th { border-bottom: 1px solid rgba(148,163,184,.14) !important; color: #cbd5e1 !important; font-size: 12px !important; }\nhtml body #reportsModal .rep-tbl-scroll { overflow-x: auto; }\nhtml body #reportsModal .rep-opx td.rep-opx-n { text-align: right; white-space: nowrap; }\nhtml body #reportsModal .rep-opx td.rep-opx-n small { display: block; font-size: 10.5px; color: #94a3b8; font-weight: 500; margin-top: 1px; }\n/* شارات الأسباب: رمادية موحّدة (لا ألوان إلا لجمعة/OPX/الشهر) */\nhtml body #reportsModal .chip-reason, html body #reportsModal .chip-d, html body #reportsModal .chip-g, html body #reportsModal .chip-s { background: rgba(148,163,184,.10) !important; color: #cbd5e1 !important; border: 1px solid rgba(148,163,184,.22) !important; border-radius: 8px !important; font-weight: 600 !important; padding: 2px 8px !important; }\nhtml body #reportsModal .rep-st { background: none !important; color: #cbd5e1 !important; border: 1px solid rgba(148,163,184,.25) !important; border-radius: 8px !important; font-weight: 600 !important; }\nhtml body #reportsModal .rep-st-new, html body #reportsModal .rep-st-grow { color: #e2e8f0 !important; }\nhtml body #reportsModal .rep-insight, html body #reportsModal .rep-insight-soft { background: rgba(15,23,42,.38) !important; border: 1px solid rgba(148,163,184,.16) !important; border-radius: 14px !important; box-shadow: none !important; text-align: right !important; padding: 14px 16px !important; }\nhtml body #reportsModal .rep-insight-title { font-size: 12px !important; color: #94a3b8 !important; font-weight: 600 !important; margin-bottom: 6px !important; text-align: right !important; }\nhtml body #reportsModal .rep-insight-main { font-size: 15px !important; font-weight: 700 !important; color: #f1f5f9 !important; text-align: right !important; line-height: 1.7; }\nhtml body #reportsModal .rep-insight-meta { font-size: 11.5px !important; color: #94a3b8 !important; margin-top: 8px !important; text-align: right !important; }\nhtml body #reportsModal .rep-note, html body #reportsModal .rep-legend { font-size: 11.5px !important; color: #94a3b8 !important; line-height: 1.8 !important; text-align: right !important; margin: 8px 2px 0 !important; background: none !important; border: 0 !important; }\nhtml body #reportsModal .rep-both-title { text-align: right !important; font-size: 13px !important; color: #e2e8f0 !important; font-weight: 700 !important; margin: 16px 2px 8px !important; }\nhtml body #reportsModal .rep-cf-grid { gap: 12px !important; }\nhtml body #reportsModal .rep-cf-row { gap: 8px; align-items: baseline; }\nhtml body #reportsModal .rep-cf-l { color: #94a3b8 !important; font-size: 11.5px !important; font-weight: 600; min-width: 74px; text-align: right; }\nhtml body #reportsModal .rep-find { margin: 0 0 14px !important; }\nhtml body #reportsModal details.rep-fold > summary.rep-fold-sum { text-align: right; background: rgba(15,23,42,.38) !important; border: 1px solid rgba(148,163,184,.16) !important; color: #e2e8f0 !important; }\nhtml body #reportsModal details.rep-fold > summary.rep-fold-sum::before { color: #94a3b8; }\nhtml body #reportsModal .rep-bottom-folds { margin-top: 20px; }\n";
var OI_PRIVATE_CSS27 = "\nhtml body #reportsModal .rep-sec-h { text-align: right; font-size: 15px; font-weight: 800; color: #f1f5f9; letter-spacing: .02em; margin: 22px 2px 10px; direction: ltr; text-align: right; }\nhtml body #reportsModal .rep-dl.up, html body #reportsModal small.rep-dl.up { color: #34d399 !important; }\nhtml body #reportsModal .rep-dl.dn, html body #reportsModal small.rep-dl.dn { color: #fb7185 !important; }\nhtml body #reportsModal .rep-dl { font-size: 11px; font-weight: 700; margin-inline-start: 6px; }\nhtml body #reportsModal .mv-up { color: #34d399 !important; font-weight: 700; }\nhtml body #reportsModal .mv-down { color: #fb7185 !important; font-weight: 700; }\nhtml body #reportsModal .rep-path { color: #cbd5e1; font-size: 12px; direction: ltr; white-space: nowrap; }\nhtml body #reportsModal .rep-both-card { margin-top: 14px !important; }\n";
var OI_PRIVATE_CSS28 = "\n/* مسافات بين كل الشرائح (لا التصاق) */\nhtml body #reportsModal .rep-card, html body #reportsModal details.rep-fold, html body #reportsModal .rep-insight { margin: 0 0 16px !important; }\nhtml body #reportsModal .rep-grid { gap: 16px !important; margin-bottom: 16px; }\nhtml body #reportsModal .rep-grid > .rep-card, html body #reportsModal .rep-grid > details { margin: 0 !important; }\nhtml body #reportsModal .rep-bottom-folds > details { margin: 0 !important; }\nhtml body #reportsModal .rep-bottom-folds { gap: 16px !important; }\n/* التزايد والنمو بجانب بعض داخل بطاقة الجهة */\nhtml body #reportsModal .rep-dg-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; direction: rtl; align-items: start; }\nhtml body #reportsModal .rep-dg-col { min-width: 0; overflow-x: auto; }\nhtml body #reportsModal .rep-dg-col .rep-table th, html body #reportsModal .rep-dg-col .rep-table td { padding: 6px 5px !important; font-size: 12px; }\n@media (max-width: 760px) { html body #reportsModal .rep-dg-grid { grid-template-columns: 1fr; } }\n/* رقم المقابل: يسار → يمين دائمًا */\nhtml body #reportsModal .rep-eq { direction: ltr !important; unicode-bidi: isolate !important; display: block; text-align: center; white-space: nowrap; font-size: 11px; color: #94a3b8; font-weight: 500; }\n/* ترتيب المستويات: كل صف واضح، وما في «لماذا» يتبع سترايكه */\nhtml body #reportsModal .rep-sc td { vertical-align: top !important; padding: 12px 8px !important; border-bottom: 1px solid rgba(148,163,184,.28) !important; }\nhtml body #reportsModal .rep-sc td:nth-child(3) .rep-sk { font-size: 15px; font-weight: 800; display: block; }\nhtml body #reportsModal .rep-sc td.rep-days-cell { white-space: nowrap; min-width: 110px; }\nhtml body #reportsModal .rep-sc .rep-nd { display: block; width: max-content; max-width: none; margin: 0 auto 4px !important; padding: 3px 10px !important; border-radius: 8px !important; white-space: nowrap !important; line-height: 1.5; }\nhtml body #reportsModal .rep-sc td.rep-reasons { text-align: right !important; vertical-align: top !important; }\nhtml body #reportsModal .rep-sc td.rep-reasons .chip-reason { display: inline-flex; align-items: center; margin: 0 0 6px 6px; white-space: nowrap; }\nhtml body #reportsModal .rep-sc tr.rep-top-row td { background: rgba(148,163,184,.06) !important; }\n";
var OI_PRIVATE_CSS29 = "\n/* × لحذف عمود تاريخ من القياس */\nth.has-colx { position: relative; }\n.col-x { position: absolute; top: 2px; inset-inline-end: 3px; border: 0; background: none; color: #94a3b8; font-size: 11px; line-height: 1; cursor: pointer; opacity: .5; padding: 0 2px; z-index: 2; }\nth.has-colx:hover .col-x { opacity: 1; }\n.col-x:hover { color: #fb7185; }\n.col-x-bar { margin: 4px 0 8px; text-align: center; }\n.col-x-reset { border: 1px solid rgba(148,163,184,.4); background: rgba(148,163,184,.12); color: inherit; border-radius: 99px; padding: 3px 14px; font-size: 12px; cursor: pointer; }\nhtml body #reportsModal .rep-dayl { font-size: 11.5px; color: #94a3b8; text-align: right; }\n/* ترتيب المستويات: صف واضح، «لماذا» تتبع سترايكها */\nhtml body #reportsModal .rep-sc { table-layout: auto !important; }\nhtml body #reportsModal .rep-sc td.rep-reasons { display: table-cell !important; text-align: right !important; vertical-align: top !important; }\nhtml body #reportsModal .rep-why { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; direction: rtl; }\nhtml body #reportsModal .rep-sc .chip-reason { white-space: normal !important; text-align: right; max-width: 100%; border-radius: 8px !important; line-height: 1.5; margin: 0 !important; }\nhtml body #reportsModal .rep-sc td.rep-days-cell { display: table-cell !important; white-space: nowrap !important; width: 1%; min-width: 0 !important; vertical-align: top !important; }\nhtml body #reportsModal .rep-sc .rep-nd { display: block !important; width: max-content !important; margin: 0 auto 4px !important; padding: 3px 9px !important; border-radius: 8px !important; line-height: 1.4; white-space: nowrap !important; }\nhtml body #reportsModal .rep-sc td:nth-child(3) .rep-sk { font-size: 13px !important; font-weight: 700 !important; }\nhtml body #reportsModal .rep-sc tr.rep-top-row td, html body #reportsModal .rep-top-row td { background: none !important; }\n";
var OI_PRIVATE_CSS30 = "\n.rep-tv-pop { position: fixed; inset: 0; z-index: 99999; background: rgba(2,6,23,.62); display: flex; align-items: center; justify-content: center; }\n.rep-tv-box { width: min(460px, 92vw); max-height: 90vh; overflow: auto; background: #0f172a; border: 1px solid rgba(148,163,184,.25); border-radius: 14px; padding: 16px 18px; color: #e2e8f0; display: flex; flex-direction: column; gap: 8px; }\n.rep-tv-l { font-size: 12px; color: #94a3b8; margin-top: 4px; }\n.rep-tv-sel { background: #1f2535; color: #f1f5f9; border: 1px solid #2d3548; border-radius: 8px; padding: 6px 8px; }\n.rep-tv-checks { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; }\n.rep-tv-out { width: 100%; box-sizing: border-box; background: #0b1220; color: #cbd5e1; border: 1px solid #2d3548; border-radius: 8px; padding: 8px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; direction: ltr; text-align: left; }\n.rep-tv-act { display: flex; gap: 8px; justify-content: flex-start; margin-top: 6px; }\nhtml body #reportsModal .rep-boxes td.rep-bx-k { font-weight: 700; }\n";
var OI_PRIVATE_CSS31 = "\n#archDateRow { display: flex !important; flex-direction: column !important; gap: 10px !important; align-items: stretch !important; }\n.arch-week { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid rgba(148,163,184,.2); border-radius: 12px; }\n.arch-week-title { width: 100%; font-size: 12px; font-weight: 700; color: #94a3b8; text-align: right; }\n.arch-date-chip.arch-k-fri .d-top { color: #93c5fd; } .arch-date-chip.arch-k-opx .d-top { color: #c4b5fd; } .arch-date-chip.arch-k-eom .d-top { color: #5eead4; }\nhtml body #reportsModal .rep-boxes th.rep-bx-sep, html body #reportsModal .rep-boxes td.rep-bx-sep { border-inline-start: 2px solid rgba(148,163,184,.3) !important; }\n";
var OI_PRIVATE_CSS32 = "\n/* شريط أزرار التقرير */\nhtml body #reportsModal .rep-actions { direction: rtl; display: flex; align-items: center; gap: 12px; justify-content: flex-start; }\n.rep-seg { display: inline-flex; direction: rtl; border: 1px solid rgba(148,163,184,.28); border-radius: 12px; overflow: hidden; background: rgba(15,23,42,.45); }\n.rep-seg-btn { border: 0; background: transparent; color: #e2e8f0; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }\n.rep-seg-btn + .rep-seg-btn { border-inline-start: 1px solid rgba(148,163,184,.25); }\n.rep-seg-btn:hover { background: rgba(148,163,184,.14); }\n/* نافذة TradingView */\n.tv-pop { position: fixed; inset: 0; z-index: 99999; background: rgba(2,6,23,.66); display: flex; align-items: center; justify-content: center; }\n.tv-box { width: min(780px, 94vw); max-height: 90vh; display: flex; flex-direction: column; background: #0f172a; border: 1px solid rgba(148,163,184,.22); border-radius: 18px; color: #e2e8f0; box-shadow: 0 24px 60px rgba(0,0,0,.5); }\n.tv-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 22px 12px; border-bottom: 1px solid rgba(148,163,184,.14); }\n.tv-title { font-size: 17px; font-weight: 800; }\n.tv-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }\n.tv-x { border: 0; background: none; color: #94a3b8; font-size: 22px; line-height: 1; cursor: pointer; }\n.tv-x:hover { color: #f1f5f9; }\n.tv-body { padding: 14px 22px; overflow: auto; display: flex; flex-direction: column; gap: 14px; }\n.tv-lab { font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 8px; }\n.tv-lab small { font-weight: 500; }\n.tv-chips { display: flex; flex-wrap: wrap; gap: 8px; }\n.tv-chip { border: 1px solid rgba(148,163,184,.25); background: rgba(148,163,184,.08); color: #cbd5e1; padding: 6px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }\n.tv-chip:hover { background: rgba(148,163,184,.16); }\n.tv-chip.on { background: rgba(99,102,241,.22); border-color: rgba(129,140,248,.6); color: #e0e7ff; }\n.tv-chip-ro { cursor: default; font-size: 12px; padding: 4px 10px; }\n.tv-levels { display: flex; flex-direction: column; gap: 12px; max-height: 300px; overflow: auto; padding: 10px; border: 1px solid rgba(148,163,184,.14); border-radius: 12px; background: rgba(2,6,23,.35); }\n.tv-grp-h { font-size: 12px; font-weight: 800; color: #cbd5e1; margin-bottom: 6px; }\n.tv-lv { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border: 1px solid rgba(148,163,184,.22); border-radius: 9px; background: rgba(148,163,184,.07); font-size: 12px; }\n.tv-lv i { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; }\n.tv-lv.tv-t-P i { background: #7aa7d9; } .tv-lv.tv-t-T i { background: #d98f9f; } .tv-lv.tv-t-D i { background: #e5b84b; } .tv-lv.tv-t-S i { background: #a78bfa; }\n.tv-lv b { font-size: 13px; } .tv-lv em { font-style: normal; color: #94a3b8; }\n.tv-lx { border: 0; background: none; color: #94a3b8; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 3px; }\n.tv-lx:hover { color: #fb7185; }\n.tv-restore { margin-inline-start: 10px; border: 0; background: none; color: #93c5fd; font-size: 12px; cursor: pointer; }\n.tv-empty { color: #94a3b8; font-size: 13px; padding: 8px; text-align: center; }\n.tv-foot { display: flex; gap: 10px; justify-content: flex-start; padding: 12px 22px 18px; border-top: 1px solid rgba(148,163,184,.14); direction: rtl; }\n/* قبل وبعد */\n.ba-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 12px; direction: rtl; }\n.ba-chip { display: inline-flex; flex-direction: column; align-items: center; border: 1px solid rgba(148,163,184,.25); background: rgba(148,163,184,.08); color: #cbd5e1; padding: 4px 12px; border-radius: 10px; cursor: pointer; font-family: inherit; }\n.ba-chip small { font-size: 10px; color: #94a3b8; } .ba-chip.active { background: rgba(99,102,241,.22); border-color: rgba(129,140,248,.6); color: #e0e7ff; }\n.ba-up { color: #34d399; font-weight: 700; } .ba-dn { color: #fb7185; font-weight: 700; }\n";
var OI_PRIVATE_CSS33 = "\n/* شريط أزرار التقرير: في المنتصف */\nhtml body #reportsModal .rep-actions { justify-content: center !important; }\n/* نافذة TradingView: أكبر، نص في المنتصف، بلا شريط تمرير ظاهر */\n.tv-box { position: relative; width: min(1120px, 96vw) !important; max-height: 92vh !important; text-align: center; }\n.tv-box * { text-align: center; }\n.tv-head { display: block !important; padding: 22px 28px 10px !important; border-bottom: 0 !important; }\n.tv-title { font-size: 20px !important; }\n.tv-x { position: absolute; top: 12px; left: 16px; width: 34px; height: 34px; border-radius: 50%; background: rgba(148,163,184,.12); }\n.tv-body { padding: 8px 28px 14px !important; scrollbar-width: none; -ms-overflow-style: none; }\n.tv-body::-webkit-scrollbar, .tv-cards::-webkit-scrollbar { display: none; }\n.tv-sec { padding: 12px 0; border-top: 1px solid rgba(148,163,184,.12); }\n.tv-chips { justify-content: center; }\n.tv-chip { padding: 8px 18px !important; border-radius: 12px !important; }\n.tv-sk { display: inline-flex; align-items: center; gap: 8px; padding: 4px 6px 4px 10px; border: 1px solid rgba(148,163,184,.25); border-radius: 10px; background: rgba(148,163,184,.08); font-size: 13px; }\n.tv-sk b { font-size: 12px; color: #cbd5e1; }\n.tv-sk-in { width: 64px; background: #0b1220; color: #e2e8f0; border: 1px solid rgba(148,163,184,.3); border-radius: 7px; padding: 4px 6px; font-size: 13px; text-align: center; font-family: inherit; }\n.tv-sk-in:focus { outline: none; border-color: rgba(129,140,248,.7); }\n.tv-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; max-height: 340px; overflow: auto; scrollbar-width: none; padding: 4px; }\n.tv-card { border: 1px solid rgba(148,163,184,.18); border-radius: 14px; background: rgba(2,6,23,.35); padding: 12px 12px 8px; }\n.tv-card-h { font-size: 15px; font-weight: 800; color: #f1f5f9; margin-bottom: 8px; }\n.tv-card-h span, .tv-sec-h span { font-size: 11px; color: #94a3b8; font-weight: 600; margin-inline-start: 4px; }\n.tv-secbox { margin: 0 0 10px; padding-top: 8px; border-top: 1px dashed rgba(148,163,184,.18); }\n.tv-sec-h { font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px; }\n.tv-lv { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border: 1px solid rgba(148,163,184,.22); border-radius: 9px; background: rgba(148,163,184,.07); font-size: 12px; }\n.tv-lv::before { content: \"\"; width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; }\n.tv-lv.tv-t-P::before { background: #7aa7d9; } .tv-lv.tv-t-T::before { background: #d98f9f; } .tv-lv.tv-t-D::before { background: #e5b84b; } .tv-lv.tv-t-R::before { background: #c9a86a; } .tv-lv.tv-t-S::before { background: #a78bfa; }\n.tv-mv.up { color: #34d399; font-style: normal; font-weight: 700; } .tv-mv.dn { color: #fb7185; font-style: normal; font-weight: 700; }\n.tv-foot { display: flex !important; justify-content: center !important; padding: 14px 28px 22px !important; border-top: 0 !important; }\n.tv-copy { display: inline-flex; align-items: center; gap: 10px; padding: 13px 44px; border-radius: 16px; border: 1px solid rgba(165,180,252,.55); background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; font-size: 15px; font-weight: 800; font-family: inherit; cursor: pointer; box-shadow: 0 10px 26px rgba(99,102,241,.38); transition: transform .12s, box-shadow .12s; }\n.tv-copy:hover { transform: translateY(-1px); box-shadow: 0 14px 32px rgba(99,102,241,.5); }\n.tv-copy em { font-style: normal; font-weight: 600; opacity: .85; }\n/* الأرشيف: من اليمين لليسار */\n#archiveModal .archive-panel, #archiveModal #archDateRow, #archiveModal .arch-week, #archiveModal .archive-toolbar-center { direction: rtl; }\n#archiveModal .arch-week { justify-content: flex-start; }\n/* قبل وبعد */\n.ba-table th.strike { vertical-align: middle; }\n";
var OI_PRIVATE_CSS34 = "\n.tv-star { color: #fbbf24; font-style: normal; font-size: 15px; line-height: 1; margin-inline-end: 2px; }\n.tv-lv.tv-t-D::before { display: none; }\n.tv-sk { gap: 10px !important; padding: 5px 10px !important; }\n.tv-pre { display: inline-flex; gap: 4px; }\n.tv-pre button { border: 1px solid rgba(148,163,184,.25); background: rgba(148,163,184,.08); color: #94a3b8; border-radius: 7px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; }\n.tv-pre button:hover { color: #e2e8f0; } .tv-pre button.on { background: rgba(99,102,241,.25); border-color: rgba(129,140,248,.6); color: #e0e7ff; }\n.ba-table td.ba-dcell { color: #5eead4; font-weight: 600; white-space: nowrap; min-width: 70px; }\n.ba-table .ba-star { color: #fbbf24; font-size: 14px; }\n";
var OI_PRIVATE_CSS35 = "\n/* ===== نافذة TradingView: تطوير جمالي ===== */\n.tv-box { width: min(1320px, 97vw) !important; max-height: 94vh !important; border-radius: 22px !important; background: linear-gradient(180deg, #111a30 0%, #0c1426 100%) !important; box-shadow: 0 30px 80px rgba(0,0,0,.55) !important; }\n.tv-head { padding: 26px 32px 6px !important; }\n.tv-title { font-size: 24px !important; letter-spacing: .01em; }\n.tv-sub { font-size: 13px !important; margin-top: 6px !important; }\n.tv-body { padding: 10px 32px 18px !important; gap: 6px !important; }\n.tv-sec { padding: 16px 0 !important; }\n.tv-lab { font-size: 13px !important; margin-bottom: 12px !important; letter-spacing: .02em; }\n.tv-chip { padding: 10px 22px !important; font-size: 14px !important; border-radius: 14px !important; transition: background .12s, transform .1s; }\n.tv-chip:hover { transform: translateY(-1px); }\n.tv-chip.on { background: linear-gradient(135deg, rgba(99,102,241,.35), rgba(139,92,246,.3)) !important; border-color: rgba(165,180,252,.7) !important; color: #fff !important; box-shadow: 0 4px 14px rgba(99,102,241,.25); }\n.tv-ranks { margin-top: 12px; align-items: center; }\n.tv-rk-lab { font-size: 12px; color: #94a3b8; margin-inline-end: 6px; }\n.tv-sk { padding: 8px 14px !important; border-radius: 14px !important; }\n.tv-sk-in { width: 76px !important; font-size: 14px !important; padding: 6px 8px !important; }\n.tv-cards { grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)) !important; gap: 18px !important; max-height: 54vh !important; padding: 6px !important; }\n.tv-card { border-radius: 18px !important; padding: 16px 16px 8px !important; background: linear-gradient(180deg, rgba(30,41,70,.55), rgba(8,13,28,.55)) !important; border: 1px solid rgba(148,163,184,.2) !important; }\n.tv-card-h { font-size: 18px !important; padding-bottom: 10px; margin-bottom: 12px !important; border-bottom: 1px solid rgba(148,163,184,.16); }\n.tv-secbox { border-top: 0 !important; padding-top: 4px !important; margin-bottom: 14px !important; }\n.tv-sec-h { font-size: 13px !important; color: #cbd5e1 !important; margin-bottom: 10px !important; }\n.tv-lvgrid { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px !important; }\n.tv-lv { display: grid !important; grid-template-columns: 26px 1fr 26px; align-items: center; gap: 8px !important; padding: 9px 10px !important; border-radius: 14px !important; background: rgba(148,163,184,.08) !important; border: 1px solid rgba(148,163,184,.18) !important; border-inline-start: 4px solid #94a3b8 !important; transition: background .12s, border-color .12s; }\n.tv-lv:hover { background: rgba(148,163,184,.14) !important; }\n.tv-lv::before { display: none !important; }\n.tv-lv.tv-t-P { border-inline-start-color: #7aa7d9 !important; } .tv-lv.tv-t-T { border-inline-start-color: #d98f9f !important; }\n.tv-lv.tv-t-D { border-inline-start-color: #e5b84b !important; } .tv-lv.tv-t-R { border-inline-start-color: #c9a86a !important; } .tv-lv.tv-t-S { border-inline-start-color: #a78bfa !important; }\n.tv-lv-tag { display: flex; justify-content: center; align-items: center; min-height: 26px; }\n.tv-lv-main { display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1.2; }\n.tv-lv-main b { font-size: 17px !important; color: #f8fafc; }\n.tv-lv-main small { font-size: 11px; color: #94a3b8; }\n.tv-star { font-size: 20px !important; color: #fbbf24 !important; text-shadow: 0 0 8px rgba(251,191,36,.45); }\n.tv-rk { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-style: normal; font-weight: 800; font-size: 13px; color: #fde9b8; background: rgba(201,168,106,.2); border: 1px solid rgba(201,168,106,.55); }\n.tv-mv { font-style: normal; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; }\n.tv-mv.up { background: rgba(52,211,153,.14); color: #34d399; } .tv-mv.dn { background: rgba(251,113,133,.14); color: #fb7185; }\n.tv-lx { width: 26px !important; height: 26px; border-radius: 50%; background: rgba(148,163,184,.1) !important; display: flex; align-items: center; justify-content: center; font-size: 15px !important; padding: 0 !important; }\n.tv-lx:hover { background: rgba(251,113,133,.22) !important; color: #fb7185 !important; }\n.tv-copy { padding: 15px 56px !important; font-size: 16px !important; border-radius: 18px !important; }\n";
var OI_PRIVATE_CSS18 = "\nhtml body #reportsModal .rep-tabs { direction: rtl; }\nhtml body .tw-legend-star { color: #fbbf24 !important; }\nhtml body #reportsModal .rep-ratio-stat { margin-top: 2px; font-size: 11px; color: var(--r-mu); }\nhtml body #reportsModal .rep-pair-ok { color: #34d399; font-weight: 800; font-size: 14px; margin-inline-start: 4px; }\nhtml body #reportsModal .rep-pair-match { background: rgba(52,211,153,.06); border-radius: 10px; }\n";
var OI_PRIVATE_CSS36 = "\n/* ===== نافذة TradingView: شرائح كبيرة مثل نافذتي التقرير والإكسل، واختيار ناعم ===== */\nhtml body .tv-pop { --tv-bg:#0b1220; --tv-card:rgba(15,23,42,.5); --tv-bd:rgba(148,163,184,.16); --tv-tx:#e2e8f0; --tv-mu:#94a3b8; --tv-ac:#60a5fa; --tv-chip:rgba(148,163,184,.06); --tv-sel:rgba(148,163,184,.13); --tv-selbd:rgba(148,163,184,.36); --tv-field:#1a2332; --tv-fbd:#2a3548; background: rgba(2,6,23,.74) !important; }\nhtml[data-theme=\"light\"] body .tv-pop { --tv-bg:#f4f6fb; --tv-card:#ffffff; --tv-bd:#dbe2ef; --tv-tx:#1e293b; --tv-mu:#64748b; --tv-ac:#3b82f6; --tv-chip:rgba(15,23,42,.04); --tv-sel:rgba(15,23,42,.07); --tv-selbd:rgba(15,23,42,.22); --tv-field:#eef2f9; --tv-fbd:#d5deee; background: rgba(15,23,42,.45) !important; }\nhtml body .tv-pop .tv-box { width: min(980px, 94vw) !important; max-height: 90vh !important; background: var(--tv-bg) !important; border: 1px solid var(--tv-bd) !important; border-radius: 18px !important; box-shadow: 0 24px 60px rgba(0,0,0,.55) !important; color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-box * { text-align: right; }\nhtml body .tv-pop .tv-head, html body .tv-pop .tv-title, html body .tv-pop .tv-foot { text-align: center !important; }\nhtml body .tv-pop .tv-head { padding: 16px 24px 6px !important; }\nhtml body .tv-pop .tv-title { font-size: 17px !important; font-weight: 800 !important; letter-spacing: .02em !important; color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-x { top: 12px !important; left: 14px !important; width: 28px !important; height: 28px !important; font-size: 18px !important; background: var(--tv-chip) !important; border: 1px solid var(--tv-bd) !important; color: var(--tv-mu) !important; border-radius: 50% !important; }\nhtml body .tv-pop .tv-body { padding: 2px 24px 8px !important; gap: 0 !important; }\nhtml body .tv-pop .tv-sec { padding: 10px 0 !important; border-top: 0 !important; }\nhtml body .tv-pop .tv-lab { font-size: 12px !important; font-weight: 700 !important; color: var(--tv-mu) !important; margin: 0 4px 8px !important; letter-spacing: 0 !important; }\nhtml body .tv-pop .tv-lab small { font-size: 11px !important; font-weight: 500 !important; opacity: .85; }\n/* شرائح كبيرة (مثل شرائح الأشهر) */\nhtml body .tv-pop .tv-strips { display: flex !important; flex-direction: column; gap: 8px; }\nhtml body .tv-pop .tv-strip { display: flex !important; align-items: center; gap: 14px; padding: 8px 14px; min-height: 46px; border: 1px solid var(--tv-bd); border-radius: 14px; background: var(--tv-card); }\nhtml body .tv-pop .tv-strip-lab { flex: 0 0 auto; min-width: 104px; font-size: 12px; font-weight: 700; color: var(--tv-mu); }\nhtml body .tv-pop .tv-strip-in { display: flex !important; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 7px; flex: 1; }\nhtml body .tv-pop .tv-sym-name { flex: 0 0 76px; height: 32px; position: relative; background: transparent !important; border: 0 !important; color: var(--tv-mu) !important; font-size: 14px; font-weight: 800; letter-spacing: .03em; font-family: inherit; cursor: pointer; text-align: center !important; }\nhtml body .tv-pop .tv-sym.on { background: var(--tv-sel); border-color: var(--tv-selbd); }\nhtml body .tv-pop .tv-sym.on .tv-sym-name { color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-sym.on .tv-sym-name::after { content: \"\"; position: absolute; bottom: 0; left: 50%; width: 18px; height: 2px; margin-left: -9px; border-radius: 2px; background: var(--tv-ac); opacity: .75; }\nhtml body .tv-pop .tv-sym:not(.on) .tv-sym-ctl { opacity: .45; }\nhtml body .tv-pop .tv-pre { display: inline-flex; gap: 6px; }\n/* شرائح صغيرة بتحديد ناعم */\nhtml body .tv-pop .tv-chips { gap: 7px !important; }\nhtml body .tv-pop .tv-chip, html body .tv-pop .tv-mini { position: relative; display: inline-flex !important; align-items: center; justify-content: center; height: 30px; padding: 0 14px !important; font-size: 12.5px !important; font-weight: 600 !important; border-radius: 10px !important; background: var(--tv-chip) !important; border: 1px solid var(--tv-bd) !important; color: var(--tv-mu) !important; box-shadow: none !important; transform: none !important; font-family: inherit; cursor: pointer; text-align: center !important; }\nhtml body .tv-pop .tv-mini { height: 26px; padding: 0 11px !important; font-size: 11.5px !important; border-radius: 8px !important; }\nhtml body .tv-pop .tv-chip:hover, html body .tv-pop .tv-mini:hover { background: var(--tv-sel) !important; color: var(--tv-tx) !important; transform: none !important; }\nhtml body .tv-pop .tv-chip.on, html body .tv-pop .tv-mini.on { background: var(--tv-sel) !important; border-color: var(--tv-selbd) !important; color: var(--tv-tx) !important; box-shadow: none !important; }\nhtml body .tv-pop .tv-chip.on::after, html body .tv-pop .tv-mini.on::after { content: \"\"; position: absolute; bottom: 2px; left: 50%; width: 14px; height: 2px; margin-left: -7px; border-radius: 2px; background: var(--tv-ac); opacity: .75; }\nhtml body .tv-pop .tv-sk-in { width: 58px !important; height: 26px; font-size: 12.5px !important; padding: 0 6px !important; border-radius: 8px !important; background: var(--tv-field) !important; border: 1px solid var(--tv-fbd) !important; color: var(--tv-tx) !important; text-align: center !important; }\n/* المستويات: شريحة لكل رمز، الصفوف من اليمين لليسار */\nhtml body .tv-pop .tv-cards { display: flex !important; flex-direction: column; gap: 10px !important; max-height: 44vh !important; padding: 2px !important; }\nhtml body .tv-pop .tv-card { display: grid !important; grid-template-columns: 78px 1fr; column-gap: 12px; align-items: start; padding: 10px 14px !important; border-radius: 14px !important; background: var(--tv-card) !important; border: 1px solid var(--tv-bd) !important; }\nhtml body .tv-pop .tv-card-h { grid-column: 1; grid-row: 1 / span 12; font-size: 15px !important; font-weight: 800 !important; color: var(--tv-tx) !important; padding: 4px 0 0 !important; margin: 0 !important; border: 0 !important; }\nhtml body .tv-pop .tv-secbox { grid-column: 2; display: flex !important; align-items: flex-start; gap: 12px; padding: 7px 0 !important; margin: 0 !important; border-top: 1px dashed var(--tv-bd); }\nhtml body .tv-pop .tv-card-h + .tv-secbox { border-top: 0; }\nhtml body .tv-pop .tv-sec-h { flex: 0 0 108px; font-size: 11.5px !important; font-weight: 700 !important; color: var(--tv-mu) !important; margin: 0 !important; padding-top: 7px; }\nhtml body .tv-pop .tv-lvgrid { display: flex !important; flex-wrap: wrap; justify-content: flex-start; gap: 7px !important; flex: 1; }\nhtml body .tv-pop .tv-lv { display: inline-flex !important; align-items: center; gap: 8px !important; height: 34px; padding: 0 8px 0 6px !important; border-radius: 10px !important; background: var(--tv-chip) !important; border: 1px solid var(--tv-bd) !important; border-inline-start-width: 3px !important; }\nhtml body .tv-pop .tv-lv-tag { display: inline-flex !important; align-items: center; min-height: 0 !important; }\nhtml body .tv-pop .tv-lv-main { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 7px !important; }\nhtml body .tv-pop .tv-lv-main b { font-size: 14px !important; color: var(--tv-tx) !important; }\nhtml body .tv-pop .tv-lv-main small { font-size: 10.5px !important; color: var(--tv-mu) !important; }\nhtml body .tv-pop .tv-star { font-size: 15px !important; text-shadow: none !important; }\nhtml body .tv-pop .tv-rk { width: 20px !important; height: 20px !important; font-size: 11px !important; }\nhtml body .tv-pop .tv-mv { font-size: 10px !important; padding: 0 6px !important; }\nhtml body .tv-pop .tv-lx { width: 20px !important; height: 20px !important; font-size: 13px !important; color: var(--tv-mu) !important; }\nhtml body .tv-pop .tv-restore { font-size: 11px !important; color: var(--tv-mu) !important; background: transparent !important; border: 1px solid var(--tv-bd) !important; border-radius: 8px !important; padding: 1px 9px !important; margin-inline-start: 8px; cursor: pointer; font-family: inherit; }\nhtml body .tv-pop .tv-empty { font-size: 12px !important; color: var(--tv-mu) !important; padding: 16px 0 !important; }\nhtml body .tv-pop .tv-foot { padding: 10px 24px 16px !important; border-top: 1px solid var(--tv-bd) !important; }\nhtml body .tv-pop .tv-copy { padding: 9px 30px !important; font-size: 13.5px !important; border-radius: 12px !important; border: 0 !important; background: linear-gradient(135deg, #7c3aed, #8b5cf6 55%, #a78bfa) !important; box-shadow: 0 0 0 1px rgba(167,139,250,.3), 0 6px 18px rgba(124,58,237,.38) !important; }\n\n/* قائمة الشركات المنسدلة */\nhtml body .tv-pop .tv-more { margin-top: 8px; }\nhtml body .tv-pop .tv-more-btn { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 8px 14px; border: 1px solid var(--tv-bd); border-radius: 14px; background: var(--tv-card); color: var(--tv-tx); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; text-align: right; }\nhtml body .tv-pop .tv-more-btn:hover { background: var(--tv-sel); }\nhtml body .tv-pop .tv-more-t { flex: 0 0 auto; }\nhtml body .tv-pop .tv-badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--tv-sel); border: 1px solid var(--tv-selbd); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }\nhtml body .tv-pop .tv-more-sel { flex: 1; font-size: 11.5px; font-weight: 500; color: var(--tv-mu); direction: ltr; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\nhtml body .tv-pop .tv-caret { margin-inline-start: auto; font-style: normal; font-size: 15px; color: var(--tv-mu); transition: transform .15s; }\nhtml body .tv-pop .tv-more-btn.open .tv-caret { transform: rotate(180deg); }\nhtml body .tv-pop .tv-more-body { margin-top: 8px; padding: 10px 12px; border: 1px solid var(--tv-bd); border-radius: 14px; background: var(--tv-card); }\nhtml body .tv-pop .tv-comp-chips { display: flex !important; flex-wrap: wrap; justify-content: flex-start; margin-bottom: 8px; }\nhtml body .tv-pop .tv-comp-chips .tv-chip { height: 28px; padding: 0 11px !important; font-size: 12px !important; direction: ltr; }\n\n/* التزايد الفعلي */\nhtml body .ag-note { font-size: 11.5px; color: #94a3b8; margin: 2px 8px 10px; text-align: right; }\nhtml body .ag-table .ag-up { color: #22c55e; font-weight: 800; }\nhtml body .ag-table .ag-dn { color: #f87171; font-weight: 800; }\nhtml body .ag-table .ag-z { color: #64748b; }\nhtml[data-theme=\"light\"] body .ag-table .ag-up { color: #16a34a; }\nhtml[data-theme=\"light\"] body .ag-table .ag-dn { color: #dc2626; }\nhtml[data-theme=\"light\"] body .ag-note { color: #64748b; }\n";
function injectPrivateUI() {
  try {
    var old = document.getElementById("oiPrivateCss");
    if (old) old.remove();
    var st = document.createElement("style");
    st.id = "oiPrivateCss";
    st.textContent = OI_PRIVATE_CSS + OI_PRIVATE_CSS2 + OI_PRIVATE_CSS3 + OI_PRIVATE_CSS4 + OI_PRIVATE_CSS5 + OI_PRIVATE_CSS6 + OI_PRIVATE_CSS7 + OI_PRIVATE_CSS8 + OI_PRIVATE_CSS9 + OI_PRIVATE_CSS10 + OI_PRIVATE_CSS11 + OI_PRIVATE_CSS12 + OI_PRIVATE_CSS13 + OI_PRIVATE_CSS14 + OI_PRIVATE_CSS15 + OI_PRIVATE_CSS16 + OI_PRIVATE_CSS17 + OI_PRIVATE_CSS18 + OI_PRIVATE_CSS19 + OI_PRIVATE_CSS20 + OI_PRIVATE_CSS21 + OI_PRIVATE_CSS22 + OI_PRIVATE_CSS23 + OI_PRIVATE_CSS24 + OI_PRIVATE_CSS25 + OI_PRIVATE_CSS26 + OI_PRIVATE_CSS27 + OI_PRIVATE_CSS28 + OI_PRIVATE_CSS29 + OI_PRIVATE_CSS30 + OI_PRIVATE_CSS31 + OI_PRIVATE_CSS32 + OI_PRIVATE_CSS33 + OI_PRIVATE_CSS34 + OI_PRIVATE_CSS35 + OI_PRIVATE_CSS36;
    document.head.appendChild(st);
    var rh = document.querySelector("#reportsModal .map-head");
    if (rh && !document.getElementById("reportsClose")) {
      var cb = document.createElement("button");
      cb.id = "reportsClose"; cb.className = "btn"; cb.type = "button"; cb.textContent = "إغلاق";
      cb.onclick = function () { try { closeReports(); } catch (e) {} };
      rh.appendChild(cb);
    }
    ensureRepFind();
    var a = document.getElementById("seriesBtn"), b = document.getElementById("tawafuqBtn");
    if (a && b && !(a.parentNode && a.parentNode.classList.contains("series-pill"))) {
      var pill = document.createElement("div");
      pill.className = "series-pill";
      a.parentNode.insertBefore(pill, a);
      pill.appendChild(a);
      pill.appendChild(b);
    }
  } catch (e) { console.warn("injectPrivateUI", e); }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectPrivateUI);
else injectPrivateUI();
