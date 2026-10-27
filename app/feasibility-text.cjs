// Locale-sensitive sentences built from a verdict. feasibility.cjs stays free
// of wording and returns pure data; this module supplies the prose.
const locales = require("./locales.cjs");

const FALLBACK = "en";

const TEXT = {
  zh: {
    impossible: "不可行：{why}。请放宽条件。",
    unknown: "无法预估",
    hitRate: "命中率约 {pct}%，凑齐 {target} 个候选需扫约 {seeds} 个种子",
    unitSec: "{n} 秒",
    unitMin: "{n} 分钟",
    unitHour: "{n} 小时",
    fast: "很快，约 {time} 可凑齐 {target} 个候选。",
    normal: "约 {time} 可凑齐 {target} 个候选。",
    slow: "条件很严：约 {time} 才能凑齐 {target} 个候选，建议放宽一项。",
    confirmAsk: "{advice}\n\n当前只扫 {count} 个种子，按这个条件预计命中不到 {target} 个。\n\n继续扫描吗？",
  },
  en: {
    impossible: "Not feasible: {why}. Please relax the filters.",
    unknown: "Cannot estimate",
    hitRate: "Hit rate about {pct}%; reaching {target} candidates needs about {seeds} seeds",
    unitSec: "{n} s",
    unitMin: "{n} min",
    unitHour: "{n} h",
    fast: "Fast: about {time} to reach {target} candidates.",
    normal: "About {time} to reach {target} candidates.",
    slow: "Very strict: about {time} to reach {target} candidates. Consider relaxing one filter.",
    confirmAsk: "{advice}\n\nThis scan only covers {count} seeds and is unlikely to reach {target} hits.\n\nContinue anyway?",
  },
};

function makeT(lang) {
  const active = locales.normalizeLang(lang);
  return (key, vars) => {
    const text = TEXT[active][key] ?? TEXT[FALLBACK][key] ?? key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
  };
}

function formatDuration(t, sec) {
  if (sec < 60) return t("unitSec", { n: Math.round(sec) });
  if (sec < 3600) return t("unitMin", { n: (sec / 60).toFixed(1) });
  return t("unitHour", { n: (sec / 3600).toFixed(1) });
}

// One-line summary of a verdict for the API payload and the pre-scan prompt.
function describeVerdict(verdict, lang) {
  const t = makeT(lang);
  if (!verdict) return t("unknown");
  if (verdict.impossible) {
    return t("impossible", { why: locales.whyText(verdict.reasonKey, lang) || verdict.reason });
  }
  const pct = (100 * verdict.rate).toFixed(verdict.rate < 0.01 ? 3 : 1);
  return t("hitRate", {
    pct,
    target: verdict.targetHits,
    seeds: verdict.expectedSeeds.toLocaleString(locales.normalizeLang(lang) === "zh" ? "zh-CN" : "en-US"),
  });
}

// Full advisory sentence, used in the confirmation dialog.
function adviceFor(verdict, lang) {
  const t = makeT(lang);
  if (!verdict) return t("unknown");
  if (verdict.impossible) return describeVerdict(verdict, lang);
  const time = formatDuration(t, verdict.expectedSeconds);
  const target = verdict.targetHits;
  if (verdict.expectedSeconds < 60) return t("fast", { time, target });
  if (verdict.expectedSeconds < 3600) return t("normal", { time, target });
  return t("slow", { time, target });
}

// Confirmation text for a scan that is too short to reach the target hits.
function confirmText(verdict, count, lang) {
  const t = makeT(lang);
  return t("confirmAsk", {
    advice: adviceFor(verdict, lang),
    count,
    target: Math.ceil(verdict.targetHits / 4),
  });
}

module.exports = { makeT, describeVerdict, adviceFor, confirmText, formatDuration };
