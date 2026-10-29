// Shared language table (background service worker, offscreen document, side panel).
//  code    : id we store; also used to match the speaker's language
//  whisper : language name passed to Whisper (only for languages with speak: true)
//  gt      : code for the translation endpoint
//  speak   : can be chosen as the language you speak
const LANGUAGES = [
  { code: 'en',    label: 'English',            flag: 'flags/us.png', whisper: 'english',    gt: 'en',    speak: true },
  { code: 'es',    label: 'Español',            flag: 'flags/mx.png', whisper: 'spanish',    gt: 'es',    speak: true },
  { code: 'fr',    label: 'Français',           flag: 'flags/fr.png', whisper: 'french',     gt: 'fr',    speak: true },
  { code: 'de',    label: 'Deutsch',            flag: 'flags/de.png', whisper: 'german',     gt: 'de',    speak: true },
  { code: 'it',    label: 'Italiano',           flag: 'flags/it.png', whisper: 'italian',    gt: 'it',    speak: true },
  { code: 'pt',    label: 'Português (Brasil)', flag: 'flags/br.png', whisper: 'portuguese', gt: 'pt',    speak: true },
  { code: 'ja',    label: '日本語',              flag: 'flags/jp.png', whisper: 'japanese',   gt: 'ja',    speak: true },
  { code: 'ko',    label: '한국어',              flag: 'flags/kr.png', whisper: 'korean',     gt: 'ko',    speak: true },
  { code: 'zh',    label: '中文（简体）',         flag: 'flags/cn.png', whisper: 'chinese',    gt: 'zh-CN', speak: true },
  { code: 'zh-TW', label: '中文（繁體）',         flag: 'flags/hk.png', whisper: 'chinese',    gt: 'zh-TW', speak: false }
];
