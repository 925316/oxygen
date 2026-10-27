// Node-side access to the shared locale tables in public/locales.js, so the
// server and CLI do not carry a second copy of the geyser names.
const locales = require("../public/locales.js");

const DEFAULT_LANG = "zh";

function normalizeLang(lang) {
  const value = String(lang ?? "").toLowerCase();
  if (locales.SUPPORTED.includes(value)) return value;
  if (value.startsWith("zh")) return "zh";
  if (value) return "en";
  return DEFAULT_LANG;
}

function geyserName(type, lang) {
  const active = normalizeLang(lang);
  return locales.GEYSER_NAMES[active][type] ?? locales.GEYSER_NAMES.en[type] ?? type;
}

function blockName(block, lang) {
  const active = normalizeLang(lang);
  return locales.BLOCK_NAMES[active][block] ?? locales.BLOCK_NAMES.en[block] ?? block;
}

function rejectName(reason, lang) {
  const active = normalizeLang(lang);
  return locales.REJECT_NAMES[active][reason] ?? locales.REJECT_NAMES.en[reason] ?? reason;
}

function whyText(key, lang) {
  const active = normalizeLang(lang);
  return locales.WHY[active][key] ?? locales.WHY.en[key] ?? key;
}

module.exports = {
  normalizeLang, geyserName, blockName, rejectName, whyText,
  SUPPORTED: locales.SUPPORTED, DEFAULT_LANG,
};
