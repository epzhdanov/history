// Нейросетевой голос. Текст озвучивает модель (ElevenLabs или Google Gemini), а звук играет обычный <audio>:
// так рассказ слышно и в беззвучном режиме, и с погашенным экраном.
//
// Устроено так же, как системная "читалка" в speech.js: open() возвращает чтение, в которое
// по мере написания добавляются предложения. Здесь предложения собираются в отрывки,
// каждый отрывок - один запрос к сервису и один звуковой файл.

import { store, sleep, clamp } from "./util.js";
import { t } from "./i18n.js";

// ---------- Сервисы ----------

export const PROVIDERS = {
  eleven: {
    id: "eleven",
    name: "ElevenLabs",
    models: ["eleven_v4", "eleven_v4_turbo"],
    spare: ["eleven_multilingual_v2"], // если основные модели ключу недоступны
    defaultVoice: "JBFqnCBsd6RMkjVDRZzb", // George, рассказчик из стандартного набора
    // Короткое начало ради быстрого старта, потом отрывки всё длиннее.
    plan: { ramp: [240, 480, 720], min: 120, lead: 7, max: 2400, ahead: 2, single: 320 },
    frugal: false,
    timeout: 30000,
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    models: ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"],
    spare: [],
    defaultVoice: "Sulafat",
    // У Google счёт идёт на запросы в сутки, поэтому отрывки крупные и запросов мало.
    plan: { ramp: [900, 1300], min: 220, lead: 14, max: 2400, ahead: 1, single: 500 },
    frugal: true,
    timeout: 45000,
  },
};

/** Голоса Gemini: имя, характер (по документации Google), пол. Первые подходят рассказчику лучше всего. */
export const GEMINI_VOICES = [
  ["Sulafat", "warm", "f"],
  ["Achird", "friendly", "m"],
  ["Vindemiatrix", "gentle", "f"],
  ["Charon", "informative", "m"],
  ["Aoede", "breezy", "f"],
  ["Puck", "upbeat", "m"],
  ["Achernar", "soft", "f"],
  ["Algenib", "gravelly", "m"],
  ["Algieba", "smooth", "m"],
  ["Alnilam", "firm", "m"],
  ["Autonoe", "bright", "f"],
  ["Callirrhoe", "easygoing", "f"],
  ["Despina", "smooth", "f"],
  ["Enceladus", "breathy", "m"],
  ["Erinome", "clear", "f"],
  ["Fenrir", "excitable", "m"],
  ["Gacrux", "mature", "f"],
  ["Iapetus", "clear", "m"],
  ["Kore", "firm", "f"],
  ["Laomedeia", "upbeat", "f"],
  ["Leda", "youthful", "f"],
  ["Orus", "firm", "m"],
  ["Pulcherrima", "forward", "f"],
  ["Rasalgethi", "informative", "m"],
  ["Sadachbia", "lively", "m"],
  ["Sadaltager", "knowledgeable", "m"],
  ["Schedar", "even", "m"],
  ["Umbriel", "easygoing", "m"],
  ["Zephyr", "bright", "f"],
  ["Zubenelgenubi", "casual", "m"],
];

// Короткая подсказка модели, как читать. Google советует не писать сюда длинных инструкций.
const STYLE = { adult: "engaging storyteller, natural and calm", kids: "warm, lively storyteller for a young child, unhurried" };

// ---------- Настройки ----------

const runtime = {}; // что выяснилось по ходу работы: какая модель и какой вид запроса проходят

export function resetTts(id) {
  if (id) delete runtime[id];
  else for (const k of Object.keys(runtime)) delete runtime[k];
}

export const ttsKey = (id) => String(store.get(`tts.key.${id}`, "") || "").trim();

export function setTtsKey(id, key) {
  const v = String(key || "").trim();
  if (v) store.set(`tts.key.${id}`, v);
  else store.del(`tts.key.${id}`);
  resetTts(id);
}

/** Что выбрано в настройках: "system", "eleven" или "gemini". */
export function ttsChoice() {
  const id = store.get("tts.provider", "system");
  return PROVIDERS[id] ? id : "system";
}

export function setTtsChoice(id) {
  store.set("tts.provider", PROVIDERS[id] ? id : "system");
}

/** Выбранный сервис, если он готов к работе (есть ключ), иначе null. */
export function ttsProvider() {
  const p = PROVIDERS[ttsChoice()];
  return p && ttsKey(p.id) ? p : null;
}

export function ttsModel(p) {
  const m = store.get(`tts.model.${p.id}`, p.models[0]);
  return p.models.includes(m) ? m : p.models[0];
}

export function setTtsModel(p, model) {
  store.set(`tts.model.${p.id}`, model);
  resetTts(p.id);
}

/** Порядок, в котором пробуем модели: выбранная, потом остальные, потом запасные. */
export function modelChain(p) {
  const chosen = ttsModel(p);
  return [chosen, ...p.models.filter((m) => m !== chosen), ...p.spare];
}

function elevenScore(v, lang) {
  let s = 0;
  if (v.langs?.includes(lang)) s += 8;
  if (v.own) s += 4;
  if (v.use === "narrative_story") s += 3;
  else if (v.use === "informative_educational") s += 1;
  return s;
}

/** Голоса ElevenLabs из последнего загруженного списка, лучшие для языка сверху. */
export function elevenVoices(lang) {
  const list = store.get("tts.voices.eleven", []);
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => elevenScore(b, lang) - elevenScore(a, lang) || String(a.name).localeCompare(String(b.name)));
}

export function ttsVoice(p, lang) {
  const saved = store.get(`tts.voice.${p.id}.${lang}`, "");
  if (p.id === "gemini") return GEMINI_VOICES.some((v) => v[0] === saved) ? saved : p.defaultVoice;
  if (saved) return saved;
  const best = elevenVoices(lang)[0];
  return best && elevenScore(best, lang) > 0 ? best.id : p.defaultVoice;
}

export function setTtsVoice(p, lang, voice) {
  if (voice) store.set(`tts.voice.${p.id}.${lang}`, voice);
  else store.del(`tts.voice.${p.id}.${lang}`);
  resetTts(p.id);
}

/** Загружает список голосов ElevenLabs: с ключом - все голоса человека, без ключа - стандартный набор. */
export async function loadElevenVoices() {
  const key = ttsKey("eleven");
  let list = null;
  for (const headers of key ? [{ "xi-api-key": key }, null] : [null]) {
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", headers ? { headers } : {});
      if (!res.ok) continue;
      const j = await res.json();
      if (Array.isArray(j?.voices) && j.voices.length) {
        list = j.voices;
        break;
      }
    } catch {
      /* пробуем следующий способ */
    }
  }
  if (!list) return elevenVoices("ru");
  const out = list
    .map((v) => ({
      id: String(v.voice_id || ""),
      name: String(v.name || "").slice(0, 80),
      gender: String(v.labels?.gender || ""),
      use: String(v.labels?.use_case || ""),
      langs: [...new Set((Array.isArray(v.verified_languages) ? v.verified_languages : []).map((l) => l?.language).filter(Boolean))],
      own: !!v.category && v.category !== "premade",
    }))
    .filter((v) => v.id && v.name);
  store.set("tts.voices.eleven", out);
  return out;
}

// ---------- Ошибки ----------

export class TtsError extends Error {
  constructor(kind, { status = 0, detail = "", retryAfter = 0, provider = "" } = {}) {
    super(detail || kind);
    this.name = "TtsError";
    this.kind = kind; // auth | permission | credit | rate | daily | model | voice | request | blocked | network | server | timeout | audio | aborted
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
    this.provider = provider;
  }
}

export function elevenError(status, body, raw = "") {
  const d = body?.detail;
  const one = Array.isArray(d) ? d[0] : d;
  const obj = one && typeof one === "object" ? one : {};
  const codes = [obj.status, obj.code, obj.type].filter(Boolean).join(" ");
  const msg = String(obj.message || obj.msg || (typeof one === "string" ? one : "") || raw || "").slice(0, 300);
  const has = (re) => re.test(codes) || re.test(msg);
  let kind = "request";
  if (status === 401 || status === 403) {
    if (has(/missing_permission|unusual_activity/i)) kind = "permission";
    else if (has(/quota|credit|payment|subscription|upgrade/i)) kind = has(/voice/i) ? "voice" : "credit";
    else kind = status === 401 ? "auth" : "permission";
  } else if (status === 402) kind = has(/voice/i) ? "voice" : "credit";
  else if (status === 404) kind = has(/model/i) ? "model" : "voice";
  else if (status === 429) kind = "rate";
  else if (status >= 500) kind = "server";
  else if (has(/quota|credit/i)) kind = "credit";
  else if (has(/model/i)) kind = "model";
  else if (has(/voice_not_found|voice.+(not found|does not exist)|invalid.+voice/i)) kind = "voice";
  return new TtsError(kind, { status, detail: msg, provider: "eleven" });
}

export function geminiError(status, body, raw = "") {
  const e = body?.error && typeof body.error === "object" ? body.error : {};
  const msg = String(e.message || raw || "").slice(0, 300);
  const details = Array.isArray(e.details) ? e.details : [];
  const reason = details.map((d) => d?.reason).filter(Boolean).join(" ");
  const quota = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations : []).map((v) => `${v?.quotaId || ""} ${v?.quotaMetric || ""}`)).join(" ");
  const delay = details.map((d) => d?.retryDelay).find(Boolean);
  const retryAfter = delay ? Math.ceil(parseFloat(delay) * 1000) || 0 : 0;
  let kind = "request";
  if (status === 401 || /API_KEY_INVALID|API key not valid|API key expired/i.test(`${reason} ${msg}`)) kind = "auth";
  else if (status === 403) kind = "permission";
  else if (status === 404) kind = "model";
  else if (status === 429) kind = /per.?day|daily/i.test(`${quota} ${msg}`) ? "daily" : "rate";
  else if (status >= 500) kind = "server";
  else if (/FAILED_PRECONDITION/.test(String(e.status || ""))) kind = "permission"; // например, страна не поддерживается или нужна оплата
  else if (/is not found|not supported for|unknown model|unsupported model/i.test(msg)) kind = "model";
  return new TtsError(kind, { status, detail: msg, retryAfter, provider: "gemini" });
}

/** Сообщение для человека. */
export function ttsErrorText(err) {
  const name = PROVIDERS[err?.provider]?.name || t("tts.service");
  const detail = String(err?.detail || "").trim();
  const key = { auth: "tts.err.auth", permission: "tts.err.permission", credit: "tts.err.credit", rate: "tts.err.rate", daily: "tts.err.daily", network: "tts.err.network", timeout: "tts.err.network" }[err?.kind] || "tts.err.other";
  const text = t(key, { name });
  const showDetail = detail && !["auth", "rate", "daily", "network", "timeout"].includes(err?.kind);
  return showDetail ? `${text} (${detail})` : text;
}

/**
 * Что делать после ошибки: вернуть паузу перед повтором в миллисекундах или -1, если повторять бессмысленно.
 * Попутно запоминает в rt, на какую модель или вид запроса перейти.
 *   used - с какими настройками ушёл неудачный запрос. Запросы идут по два сразу, и если сосед
 *          уже переключил модель или вид запроса, второй раз переключать не нужно: просто повторяем.
 */
export function recover(p, rt, err, tries, used = rt) {
  const chain = modelChain(p);
  const moved = rt.model !== used.model || rt.minimal !== used.minimal || rt.plainVoice !== used.plainVoice;
  const nextModel = (reset) => {
    if (rt.model + 1 >= chain.length) return -1;
    rt.model++;
    if (reset) rt.minimal = false;
    return 0;
  };
  switch (err.kind) {
    case "auth":
    case "permission":
    case "credit":
    case "aborted":
      return -1;
    case "model":
    case "daily":
      return moved ? 0 : nextModel(false);
    case "voice":
      if (moved) return 0;
      if (rt.plainVoice) return -1;
      rt.plainVoice = true;
      return 0;
    case "request":
      if (moved) return 0;
      // Сервис не принял запрос: сначала убираем всё необязательное, потом пробуем другую модель.
      if (!rt.minimal) {
        rt.minimal = true;
        return 0;
      }
      return nextModel(true);
    case "rate": {
      if (tries > 3) return -1;
      const wait = err.retryAfter || 1500 * tries;
      return wait <= 20000 ? wait : -1;
    }
    case "blocked":
    case "audio":
      return tries <= 2 ? 700 : -1;
    default:
      // Сеть на улице часто пропадает на несколько секунд: лучше короткая пауза, чем переход на голос телефона.
      return tries <= 3 ? 800 * 2 ** (tries - 1) : -1;
  }
}

// ---------- Звук ----------

function b64bytes(b64) {
  const bin = atob(String(b64).replace(/[\r\n\s]/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const tag4 = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/** Разбор WAV: где лежит звук и в каком он формате. null, если это не WAV. */
export function readWav(bytes) {
  if (!bytes || bytes.length < 44 || tag4(bytes, 0) !== "RIFF" || tag4(bytes, 8) !== "WAVE") return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= bytes.length) {
    const id = tag4(bytes, pos);
    let size = dv.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = { channels: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    } else if (id === "data") {
      // У потоковых WAV длина бывает не заполнена: тогда звук идёт до конца файла.
      if (size === 0 || body + size > bytes.length) size = bytes.length - body;
      return fmt ? { ...fmt, offset: body, length: size } : null;
    }
    pos = body + size + (size % 2);
  }
  return null;
}

/** Заголовок WAV для "сырого" звука (16 бит, без сжатия). */
export function wavHeader(length, rate = 24000, channels = 1) {
  const b = new Uint8Array(44);
  const dv = new DataView(b.buffer);
  const put = (i, s) => {
    for (let k = 0; k < 4; k++) b[i + k] = s.charCodeAt(k);
  };
  put(0, "RIFF");
  dv.setUint32(4, 36 + length, true);
  put(8, "WAVE");
  put(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  put(36, "data");
  dv.setUint32(40, length, true);
  return b;
}

/** Куски звука от Gemini (WAV или сырой PCM) превращает в один WAV: { parts, dur }. */
export function pcmToWav(chunks, mime = "") {
  let rate = Number(/rate=(\d+)/i.exec(mime)?.[1]) || 24000;
  let channels = 1;
  const pcm = [];
  let length = 0;
  for (const bytes of chunks) {
    const w = readWav(bytes);
    if (w) {
      if (w.bits !== 16) return null;
      rate = w.rate || rate;
      channels = w.channels || channels;
      pcm.push(bytes.subarray(w.offset, w.offset + w.length));
      length += w.length;
    } else {
      pcm.push(bytes);
      length += bytes.length;
    }
  }
  if (!length) return null;
  return { parts: [wavHeader(length, rate, channels), ...pcm], dur: length / (rate * channels * 2) };
}

let silence = null;
function silenceUrl() {
  if (!silence) {
    // Секунда тишины: ею "будим" звук по нажатию и держим страницу живой в фоне.
    const n = 8000;
    const pcm = new Uint8Array(n * 2);
    silence = URL.createObjectURL(new Blob([wavHeader(pcm.length, 8000, 1), pcm], { type: "audio/wav" }));
  }
  return silence;
}

// ---------- Запросы к сервисам ----------

async function httpError(res, p) {
  let raw = "";
  let body = null;
  try {
    raw = await res.text();
    body = JSON.parse(raw);
  } catch {
    /* не JSON */
  }
  return p.id === "eleven" ? elevenError(res.status, body, raw) : geminiError(res.status, body, raw);
}

async function callEleven(p, rt, req, signal) {
  const model = modelChain(p)[rt.model] || p.models[0];
  const voice = rt.plainVoice ? p.defaultVoice : req.voice || p.defaultVoice;
  const body = { text: req.text, model_id: model };
  if (!rt.minimal) {
    if (model !== "eleven_multilingual_v2") body.language_code = req.lang;
    if (req.prev) body.previous_text = req.prev;
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": ttsKey(p.id), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await httpError(res, p);
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 256) throw new TtsError("audio", { detail: "empty audio", provider: p.id });
  const type = (res.headers.get("content-type") || "").split(";")[0].trim();
  return { blob: new Blob([buf], { type: type.startsWith("audio/") ? type : "audio/mpeg" }), dur: 0 };
}

async function callGemini(p, rt, req, signal) {
  const model = modelChain(p)[rt.model] || p.models[0];
  const voice = req.voice || p.defaultVoice;
  const part = { text: req.text };
  let voiceConfig = { voice };
  if (rt.minimal) {
    // Прежний вид запроса: голос во вложенном поле, без подсказки о манере чтения.
    voiceConfig = { prebuiltVoiceConfig: { voiceName: voice } };
  } else {
    part.speech_metadata = { style: req.kids ? STYLE.kids : STYLE.adult };
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": ttsKey(p.id), "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [part] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig } } }),
    signal,
  });
  if (!res.ok) throw await httpError(res, p);
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const audio = (cand?.content?.parts || []).map((x) => x?.inlineData || x?.inline_data).filter((x) => x?.data);
  if (!audio.length) {
    const why = data?.promptFeedback?.blockReason || cand?.finishReason || "no audio";
    throw new TtsError("blocked", { detail: String(why), provider: p.id });
  }
  const chunks = audio.map((x) => b64bytes(x.data));
  const mime = String(audio[0].mimeType || audio[0].mime_type || "");
  // Обычный ответ - готовый WAV; при потоковой выдаче приходит "сырой" звук, ему дописываем заголовок.
  const raw = !mime || /l16|pcm/i.test(mime);
  if (raw || chunks.every((c) => readWav(c))) {
    const wav = pcmToWav(chunks, mime);
    if (wav) return { blob: new Blob(wav.parts, { type: "audio/wav" }), dur: wav.dur };
  }
  if (raw || !/^audio\//.test(mime)) throw new TtsError("audio", { detail: `unexpected audio: ${mime || "unknown"}`, provider: p.id });
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), dur: 0 };
}

/**
 * Озвучивает текст: { blob, dur }. Сам повторяет запрос после временных сбоев,
 * а если сервис не принял модель или вид запроса, пробует запасной вариант и запоминает его.
 *   req: { text, lang, kids, voice, prev }
 */
export async function synthesize(p, req, signal) {
  const rt = (runtime[p.id] ||= { model: 0, minimal: false, plainVoice: false });
  for (let tries = 1; ; tries++) {
    if (signal?.aborted) throw new TtsError("aborted");
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, p.timeout);
    const used = { ...rt };
    try {
      return await (p.id === "eleven" ? callEleven(p, rt, req, ctl.signal) : callGemini(p, rt, req, ctl.signal));
    } catch (e) {
      if (signal?.aborted) throw new TtsError("aborted");
      const err = e instanceof TtsError ? e : new TtsError(timedOut ? "timeout" : "network", { detail: String(e?.message || e), provider: p.id });
      const wait = tries >= 8 ? -1 : recover(p, rt, err, tries, used);
      if (wait < 0) throw err;
      if (wait) await sleep(wait);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

// ---------- Нарезка текста на отрывки ----------

const clean = (text) =>
  String(text ?? "")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const size = (items, from, to) => {
  let n = 0;
  for (let i = from; i < to; i++) n += items[i].text.length + 1;
  return n;
};

/** Текст отрывка: предложения через пробел, абзацы через пустую строку. */
export function joinText(items, from, to) {
  let s = "";
  for (let i = from; i < to; i++) s += items[i].text + (i + 1 < to ? (items[i].br ? "\n\n" : " ") : "");
  return s;
}

/**
 * Где закончить следующий отрывок. Возвращает номер предложения, на котором он кончается
 * (не включая), или -1, если пока рано: текста мало, а торопиться некуда.
 *   index    - какой это отрывок по счёту
 *   ended    - текст дописан до конца
 *   starving - звук вот-вот кончится, ждать нельзя
 *   quick    - первый отрывок делаем коротким, чтобы рассказ начался сразу
 *   force    - больше не ждать ещё одного предложения для первого отрывка
 */
export function nextCut(items, from, { index, ended, starving, quick, plan, force = false }) {
  const n = items.length;
  if (from >= n) return -1;

  if (quick && index === 0) {
    // Одно предложение; если оно совсем короткое ("Привет!"), прихватываем следующее.
    let to = from + 1;
    while (to < n && size(items, from, to) < 40 && size(items, from, to + 1) <= 260) to++;
    if (to >= n && !ended && !force && size(items, from, to) < 40) return -1;
    return to;
  }

  const step = Math.max(0, index - (quick ? 1 : 0));
  const target = plan.ramp[Math.min(step, plan.ramp.length - 1)];
  const total = size(items, from, n);

  if (total < target) {
    if (ended) return n;
    return starving && total >= plan.min ? n : -1;
  }
  if (ended && total <= target * 1.35) return n;
  // Текст ещё пишется, а звука в запасе хватает: не режем. Вдруг рассказ вот-вот кончится,
  // и хвостик не придётся озвучивать отдельным запросом.
  if (!ended && !starving && total < target * 1.35) return -1;

  // Текста больше, чем на один отрывок. Если конец известен, делим поровну, иначе берём сколько положено.
  const goal = ended ? total / Math.ceil(total / target) : target;
  let acc = 0;
  let best = -1;
  let bestScore = Infinity;
  for (let i = from; i < n; i++) {
    acc += items[i].text.length + 1;
    if (acc > plan.max && best >= 0) break;
    // Чем ближе к цели, тем лучше; конец абзаца ценится выше обычной границы предложений.
    const score = Math.abs(acc - goal) - (items[i].br ? goal * 0.2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i + 1;
    }
    if (acc > goal * 1.5) break;
  }
  return best < 0 ? from + 1 : best;
}

/** Когда начинается каждое предложение отрывка, в долях его длительности. */
export function marksFor(items, from, to) {
  const w = [];
  let sum = 0;
  for (let i = from; i < to; i++) {
    const x = items[i].text.length + 14 + (items[i].br ? 18 : 0);
    w.push(x);
    sum += x;
  }
  const out = [];
  let acc = 0;
  for (let i = from; i < to; i++) {
    out.push({ tag: items[i].tag, at: sum ? acc / sum : 0 });
    acc += w[i - from];
  }
  return out;
}

// ---------- Чтение вслух ----------

const CHARS_PER_SEC = 14;
const PARALLEL = 2;

/**
 * "Читалка" с нейросетевым голосом. Тот же набор действий, что у системной:
 * open/say/stop/pause/resume/whenIdle, состояния idle | speaking | waiting | paused.
 * Результат чтения: "finished" | "stopped" | "failed" (тогда rest() отдаёт то, что не прозвучало).
 */
export class CloudSpeaker {
  constructor() {
    this.cur = null;
    this.playing = null;
    this.paused = false;
    this.state = "idle";
    this.onState = null;
    this.onBlocked = null;
    this.lastError = null;
    this.el = null;
    this.unlocked = false;
    this.unlocking = null; // идёт "пробуждение" звука по нажатию: пока оно не закончилось, проигрыватель не трогаем
    this.cache = new Map(); // заранее озвученные начала следующих историй
    this.keepUntil = 0;
    this.kicked = false;
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => this.quiet());
  }

  get ready() {
    return typeof Audio !== "undefined" && !!ttsProvider();
  }

  get active() {
    return !!this.cur;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.onState?.(s);
  }

  audio() {
    if (this.el) return this.el;
    const a = new Audio();
    a.preload = "auto";
    a.setAttribute("playsinline", "");
    a.addEventListener("ended", () => this.onEnded());
    a.addEventListener("error", () => this.onMediaError());
    a.addEventListener("timeupdate", () => this.onTime());
    a.addEventListener("pause", () => this.onPauseEvent());
    a.addEventListener("play", () => this.onPlayEvent());
    this.el = a;
    return a;
  }

  /**
   * Вызывается из обработчика нажатия: без этого телефон не даст включить звук позже, после ответа сети.
   * Телефон запоминает разрешение за проигрывателем, только когда звук по нажатию действительно пошёл,
   * поэтому играем секунду тишины и до её начала проигрыватель ничем другим не занимаем.
   */
  unlock() {
    if (this.unlocked || this.unlocking || this.playing || typeof Audio === "undefined") return;
    const a = this.audio();
    try {
      a.loop = false;
      a.src = silenceUrl();
      const p = a.play();
      if (!p?.then) {
        this.unlocked = true;
        return;
      }
      const settle = () => {
        if (this.unlocking !== mine) return;
        this.unlocking = null;
        if (this.cur) this.pump();
      };
      const mine = (this.unlocking = p
        .then(
          () => (this.unlocked = true),
          () => {}
        )
        .then(settle));
      setTimeout(settle, 1500); // если телефон так и не ответил, не ждём его вечно
    } catch {
      /* попробуем при следующем нажатии */
    }
  }

  /** Играть нечего. В фоне держим тишину, чтобы телефон не усыпил страницу посреди рассказа. */
  quiet() {
    const a = this.el;
    if (!a || this.playing || this.unlocking) return;
    const hidden = typeof document !== "undefined" && document.hidden;
    const keep = hidden && !this.paused && (!!this.cur || Date.now() < this.keepUntil);
    if (keep) {
      if (a.loop && !a.paused) return;
      try {
        a.loop = true;
        a.src = silenceUrl();
        a.play()?.catch?.(() => {});
      } catch {
        /* не дали - значит, рассказ продолжится, когда человек вернётся */
      }
    } else if (a.loop) {
      a.loop = false;
      try {
        a.pause();
      } catch {
        /* ничего */
      }
    }
  }

  context(p, opts = {}) {
    const lang = opts.lang === "en" ? "en" : "ru";
    return { provider: p, lang, kids: !!opts.kids, voice: p ? ttsVoice(p, lang) : "" };
  }

  keyOf(c, text) {
    return `${c.provider.id}|${c.voice}|${c.kids ? 1 : 0}|${text}`;
  }

  /**
   * Начинает новое чтение, прервав предыдущее.
   *   opts: { lang: "ru" | "en", rate, kids, onChunk(tag) }
   * Возвращает: add(sentence, tag, paragraphBreakAfter), end(), done, rest().
   */
  open(opts = {}) {
    this.halt("stopped");
    const p = ttsProvider();
    const r = { ...this.context(p, opts), opts, items: [], segs: [], planned: 0, play: 0, ended: false, whole: null, quick: true, force: false, firstTimer: null, rest: [], ac: new AbortController() };
    r.done = new Promise((resolve) => (r.resolve = resolve));
    this.cur = r;
    this.paused = false;
    this.lastError = null;
    this.unlock();
    this.setState("waiting");
    if (!p) {
      // Сервис выключили или убрали ключ: сразу отдаём всё системному голосу.
      queueMicrotask(() => {
        if (this.cur !== r) return;
        this.lastError = new TtsError("auth");
        r.rest = r.items.slice();
        this.finish("failed");
      });
    }
    return {
      add: (sentence, tag, br) => {
        if (this.cur !== r) return;
        const text = clean(sentence);
        if (!text) return;
        r.items.push({ text, tag, br: !!br });
        this.kick();
      },
      end: () => {
        if (this.cur !== r) return;
        r.ended = true;
        this.kick();
      },
      done: r.done,
      rest: () => r.rest,
    };
  }

  /** Заранее озвучивает начало готового текста (следующей истории), чтобы она началась без паузы. */
  prepare(list, opts = {}) {
    const p = ttsProvider();
    if (!p || !Array.isArray(list)) return;
    const items = list.map((x) => ({ text: clean(x?.text), br: !!x?.br })).filter((x) => x.text);
    const end = nextCut(items, 0, { index: 0, ended: true, starving: false, quick: false, plan: p.plan });
    if (end <= 0) return;
    const c = this.context(p, opts);
    const text = joinText(items, 0, end);
    const key = this.keyOf(c, text);
    if (this.cache.has(key)) return;
    const ctl = new AbortController();
    const promise = synthesize(p, { text, lang: c.lang, kids: c.kids, voice: c.voice }, ctl.signal);
    promise.catch(() => {
      if (this.cache.get(key)?.promise === promise) this.cache.delete(key);
    });
    this.cache.set(key, { promise, ctl });
    while (this.cache.size > 3) {
      const [k, v] = this.cache.entries().next().value;
      v.ctl.abort();
      this.cache.delete(k);
    }
  }

  say(text, opts, split) {
    const reading = this.open(opts);
    for (const s of split(text)) reading.add(s.text, null, s.br);
    reading.end();
    return reading.done;
  }

  kick() {
    if (this.kicked) return;
    this.kicked = true;
    // Не сразу, а в конце текущего шага: так пачка предложений, пришедшая разом, режется как целое.
    queueMicrotask(() => this.pump());
  }

  /** Сколько секунд звука ещё в запасе (играет, готово или уже запрошено). */
  buffered(r) {
    const rate = r.opts.rate || 1;
    let s = 0;
    for (let i = r.play; i < r.segs.length; i++) {
      const seg = r.segs[i];
      if (seg.state === "fail") break;
      let d = seg.dur || seg.est;
      if (seg === this.playing && this.el) {
        const total = Number.isFinite(this.el.duration) && this.el.duration > 0 ? this.el.duration : d;
        d = Math.max(0, total - this.el.currentTime);
      }
      s += d / rate;
    }
    return s;
  }

  cut(r) {
    const plan = r.provider.plan;
    if (r.whole === null) {
      if (!r.items.length) return;
      r.whole = r.ended; // весь текст известен заранее (готовая история, вопрос, ответ), а не пишется на ходу
      if (r.whole) {
        // Короткий первый отрывок не нужен, если текст и так короткий или его начало уже озвучено заранее.
        const end = nextCut(r.items, 0, { index: 0, ended: true, starving: false, quick: false, plan });
        if (size(r.items, 0, r.items.length) <= plan.single || (end > 0 && this.cache.has(this.keyOf(r, joinText(r.items, 0, end))))) r.quick = false;
      }
    }
    while (r.planned < r.items.length) {
      const starving = this.buffered(r) < plan.lead;
      const end = nextCut(r.items, r.planned, { index: r.segs.length, ended: r.ended, starving, quick: r.quick, plan, force: r.force });
      if (end < 0) break;
      const prev = r.segs[r.segs.length - 1];
      const text = joinText(r.items, r.planned, end);
      r.segs.push({ from: r.planned, to: end, text, prev: prev ? prev.text.slice(-240) : "", marks: marksFor(r.items, r.planned, end), est: text.length / CHARS_PER_SEC, dur: 0, state: "new", url: null, err: null, mark: -1, stalls: 0 });
      r.planned = end;
    }
    // Первое предложение слишком короткое: ждём второе, но недолго.
    if (!r.segs.length && r.items.length && !r.firstTimer) {
      r.firstTimer = setTimeout(() => {
        r.force = true;
        if (this.cur === r) this.pump();
      }, 500);
    }
  }

  fetchAhead(r) {
    let loading = r.segs.filter((s) => s.state === "load").length;
    const last = Math.min(r.segs.length - 1, r.play + r.provider.plan.ahead);
    for (let i = r.play; i <= last && loading < PARALLEL; i++) {
      if (r.segs[i].state !== "new") continue;
      loading++;
      this.load(r, r.segs[i]);
    }
  }

  async load(r, seg) {
    seg.state = "load";
    const key = this.keyOf(r, seg.text);
    try {
      let out = null;
      const hit = this.cache.get(key);
      if (hit) {
        this.cache.delete(key);
        out = await hit.promise.catch(() => null);
      }
      if (this.cur !== r) return;
      if (!out) out = await synthesize(r.provider, { text: seg.text, lang: r.lang, kids: r.kids, voice: r.voice, prev: seg.prev }, r.ac.signal);
      if (this.cur !== r) return;
      seg.url = URL.createObjectURL(out.blob);
      seg.dur = out.dur || 0;
      seg.state = "ready";
    } catch (e) {
      if (this.cur !== r || e?.kind === "aborted") return;
      seg.state = "fail";
      seg.err = e instanceof TtsError ? e : new TtsError("network", { detail: String(e?.message || e), provider: r.provider.id });
    }
    this.pump();
  }

  pump() {
    this.kicked = false;
    const r = this.cur;
    if (!r || !r.provider) return;
    this.cut(r);
    this.fetchAhead(r);
    if (this.paused || this.playing || this.unlocking) return;
    const seg = r.segs[r.play];
    if (!seg) {
      if (r.ended && r.planned >= r.items.length) return this.finish("finished");
      this.setState("waiting");
      return this.quiet();
    }
    if (seg.state === "ready") return this.start(r, seg);
    if (seg.state === "fail") return this.fail(r, seg);
    this.setState("waiting");
    this.quiet();
  }

  start(r, seg) {
    const a = this.audio();
    this.playing = seg;
    seg.mark = -1;
    seg.stalls = 0;
    a.loop = false;
    a.src = seg.url;
    const rate = clamp(r.opts.rate || 1, 0.5, 2);
    a.defaultPlaybackRate = rate;
    a.playbackRate = rate;
    this.setState("speaking");
    this.mark(r, seg, 0);
    let p;
    try {
      p = a.play();
    } catch (e) {
      return this.refused(seg, e);
    }
    p?.then?.(
      () => (this.unlocked = true),
      (e) => this.refused(seg, e)
    );
    this.guard();
  }

  refused(seg, e) {
    if (this.playing !== seg || e?.name === "AbortError") return;
    if (e?.name === "NotAllowedError") {
      // Браузер ждёт нажатия: встаём на паузу, кнопка "слушать" запустит звук.
      this.paused = true;
      this.setState("paused");
      this.onBlocked?.();
      return;
    }
    this.broken(seg, new TtsError("audio", { detail: String(e?.message || e), provider: this.cur?.provider?.id || "" }));
  }

  /** Звук стоит на месте дольше десяти секунд, хотя паузы нет: считаем, что проигрывание сломалось. */
  guard() {
    clearTimeout(this.guardTimer);
    const seg = this.playing;
    const a = this.el;
    if (!seg || !a) return;
    const at = a.currentTime;
    this.guardTimer = setTimeout(() => {
      if (this.playing !== seg || this.paused) return;
      if (a.currentTime === at && !a.ended) {
        if (++seg.stalls >= 2) return this.broken(seg, new TtsError("audio", { detail: "playback stalled", provider: this.cur?.provider?.id || "" }));
        try {
          a.play()?.catch?.(() => {});
        } catch {
          /* ничего */
        }
      } else seg.stalls = 0;
      this.guard();
    }, 5000);
  }

  broken(seg, err) {
    if (this.playing === seg) {
      this.playing = null;
      clearTimeout(this.guardTimer);
      try {
        this.el.pause();
      } catch {
        /* ничего */
      }
    }
    seg.state = "fail";
    seg.err = err;
    this.pump();
  }

  mark(r, seg, k) {
    if (k === seg.mark || !seg.marks[k]) return;
    seg.mark = k;
    try {
      r.opts.onChunk?.(seg.marks[k].tag);
    } catch {
      /* подсветка не должна ломать чтение */
    }
  }

  onTime() {
    const seg = this.playing;
    const r = this.cur;
    if (!seg || !r) return;
    const a = this.el;
    const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : seg.dur || seg.est;
    const f = total > 0 ? a.currentTime / total : 0;
    let k = Math.max(0, seg.mark);
    while (k + 1 < seg.marks.length && f >= seg.marks[k + 1].at) k++;
    this.mark(r, seg, k);
  }

  onEnded() {
    const seg = this.playing;
    const r = this.cur;
    if (!seg || !r) return; // это была тишина
    clearTimeout(this.guardTimer);
    this.playing = null;
    this.release(seg);
    r.play++;
    this.pump();
  }

  onMediaError() {
    const seg = this.playing;
    if (!seg) return;
    this.broken(seg, new TtsError("audio", { detail: `media error ${this.el?.error?.code || ""}`.trim(), provider: this.cur?.provider?.id || "" }));
  }

  /** Звук остановил сам телефон (звонок, наушники, кнопка на экране блокировки): показываем паузу. */
  onPauseEvent() {
    const a = this.el;
    if (!this.playing || this.paused || !a.paused || a.ended) return;
    this.paused = true;
    clearTimeout(this.guardTimer);
    this.setState("paused");
  }

  onPlayEvent() {
    if (!this.playing || !this.paused || this.el.paused) return;
    this.paused = false;
    this.setState("speaking");
    this.guard();
  }

  release(seg) {
    if (!seg.url) return;
    URL.revokeObjectURL(seg.url);
    seg.url = null;
  }

  fail(r, seg) {
    this.lastError = seg.err;
    // Всё, что не прозвучало: с того предложения, на котором оборвалось.
    r.rest = r.items.slice(seg.from + Math.max(0, seg.mark));
    this.finish("failed");
  }

  finish(result) {
    const r = this.cur;
    if (!r) return;
    const wasPlaying = !!this.playing;
    this.cur = null;
    this.playing = null;
    this.paused = false;
    clearTimeout(this.guardTimer);
    clearTimeout(r.firstTimer);
    r.ac.abort();
    for (const s of r.segs) this.release(s);
    if (wasPlaying) {
      try {
        this.el.pause();
      } catch {
        /* ничего */
      }
    }
    clearTimeout(this.keepTimer);
    if (result === "finished") {
      // Между историями возможна пауза в несколько секунд: в фоне не даём странице уснуть.
      this.keepUntil = Date.now() + 20000;
      this.keepTimer = setTimeout(() => this.quiet(), 20500);
    } else this.keepUntil = 0;
    this.setState("idle");
    this.quiet();
    r.resolve(result);
  }

  halt(result) {
    if (this.cur) this.finish(result);
    else {
      this.keepUntil = 0;
      this.quiet();
    }
  }

  stop() {
    this.halt("stopped");
  }

  pause() {
    if (!this.cur || this.paused) return;
    this.paused = true;
    clearTimeout(this.guardTimer);
    if (this.playing) {
      try {
        this.el.pause();
      } catch {
        /* ничего */
      }
    }
    this.setState("paused");
    this.quiet();
  }

  resume() {
    if (!this.cur || !this.paused) return;
    this.paused = false;
    const seg = this.playing;
    if (!seg) {
      this.setState("waiting");
      return this.pump();
    }
    this.setState("speaking");
    let p;
    try {
      p = this.el.play();
    } catch (e) {
      return this.refused(seg, e);
    }
    p?.then?.(
      () => (this.unlocked = true),
      (e) => this.refused(seg, e)
    );
    this.guard();
  }

  whenIdle() {
    return this.cur ? this.cur.done : Promise.resolve("finished");
  }
}
