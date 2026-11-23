// Голос: чтение вслух (speechSynthesis) и распознавание речи (SpeechRecognition).
// Оба механизма встроены в браузер телефона и не требуют отдельного сервиса.

import { store } from "./util.js";

// ---------- Деление текста на предложения ----------

const ABBR = /(?:^|[\s(«"„'])(?:г|гг|в|вв|ул|пл|пер|св|им|т\.\s?е|т\.\s?д|т\.\s?п|др|проф|н\.\s?э|см|ок|мин|тыс|млн|млрд|руб|St|Mr|Mrs|Ms|Dr|Prof|vs|e\.g|i\.e|etc|No|Sr|Jr|Mt|approx)\.$/i;
const INITIAL = /(?:^|[\s(«"„'])[A-ZА-ЯЁ]\.$/;
const CLOSERS = "»\"”’')]";

/**
 * Принимает текст кусочками и отдаёт готовые предложения.
 *   onSentence(text, paragraphBreakAfter)
 */
export class SentenceBuffer {
  constructor(onSentence) {
    this.buf = "";
    this.onSentence = onSentence;
  }

  push(delta) {
    this.buf += delta;
    this.drain(false);
  }

  flush() {
    this.drain(true);
  }

  drain(final) {
    let from = 0;
    for (;;) {
      const cut = this.findCut(from, final);
      if (!cut) break;
      if (cut.skipTo) {
        from = cut.skipTo;
        continue;
      }
      const sentence = this.buf.slice(0, cut.end).trim();
      const gap = this.buf.slice(cut.end, cut.next);
      this.buf = this.buf.slice(cut.next);
      from = 0;
      if (sentence) this.onSentence(sentence, gap.includes("\n"));
    }
    if (final) {
      const rest = this.buf.trim();
      this.buf = "";
      if (rest) this.onSentence(rest, false);
    }
  }

  findCut(from, final) {
    const s = this.buf;
    for (let i = from; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\n") {
        let next = i;
        while (next < s.length && /\s/.test(s[next])) next++;
        if (next >= s.length && !final) return null;
        return { end: i, next };
      }
      if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
        let end = i + 1;
        while (end < s.length && (".!?…".includes(s[end]) || CLOSERS.includes(s[end]))) end++;
        if (end >= s.length) return final ? { end, next: end } : null;
        if (!/\s/.test(s[end])) {
          i = end - 1;
          continue;
        }
        let next = end;
        while (next < s.length && /\s/.test(s[next])) next++;
        if (next >= s.length && !final) return null;
        const head = s.slice(0, i + 1);
        if (ch === "." && (ABBR.test(head) || INITIAL.test(head))) return { skipTo: end };
        if (ch === "." && /\d\.$/.test(head) && /^\d/.test(s.slice(next))) return { skipTo: end };
        return { end, next };
      }
    }
    return null;
  }
}

/** Делит уже готовый текст на предложения: [{ text, br }]. */
export function splitSentences(text) {
  const out = [];
  const b = new SentenceBuffer((t, br) => out.push({ text: t, br }));
  b.push(text);
  b.flush();
  return out;
}

/** Слишком длинное предложение режем на части по запятым: синтезаторы срываются на длинных фразах. */
function utterances(sentence, max = 230) {
  if (sentence.length <= max) return [sentence];
  const parts = [];
  let rest = sentence;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "), window.lastIndexOf(" - "));
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    if (cut < 1) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

// ---------- Выбор голоса ----------

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|\bfred\b|junior|kathy|ralph/i;
const WEAK = /compact|eloquence|eddy|\bflo\b|grandma|grandpa|\breed\b|rocko|sandy|shelley/i;
const PREFERRED = {
  ru: ["milena", "katya", "yuri", "svetlana", "dmitry", "irina", "pavel"],
  en: ["samantha", "ava", "allison", "zoe", "evan", "susan", "daniel", "karen", "moira", "aria", "jenny", "guy"],
};
const LOCALE = { ru: "ru-RU", en: "en-US" };

function scoreVoice(v, lang) {
  const name = (v.name || "").toLowerCase();
  const locale = (v.lang || "").replace("_", "-").toLowerCase();
  if (!locale.startsWith(lang) || NOVELTY.test(name)) return -1;
  let s = 10;
  if (name.includes("premium")) s += 100;
  else if (name.includes("enhanced")) s += 80;
  else if (/natural|neural|online/.test(name)) s += 70;
  if (name.includes("siri")) s += 60;
  if (name.includes("google")) s += 40;
  if (PREFERRED[lang].some((p) => name.includes(p))) s += 30;
  if (locale === LOCALE[lang].toLowerCase()) s += 10;
  else if (lang === "en" && locale === "en-gb") s += 8;
  if (v.default) s += 5;
  if (WEAK.test(name)) s -= 25;
  return s;
}

export function voicesFor(lang) {
  if (!synth) return [];
  return synth
    .getVoices()
    .map((v) => ({ v, s: scoreVoice(v, lang) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
}

function pickVoice(lang) {
  const list = voicesFor(lang);
  const saved = store.get(`voice.${lang}`, "");
  return list.find((v) => v.voiceURI === saved) || list[0] || null;
}

/** Голоса на телефоне подгружаются не сразу: ждём их появления (но не дольше секунды с небольшим). */
export function voicesReady() {
  return new Promise((resolve) => {
    if (!synth) return resolve(false);
    if (synth.getVoices().length) return resolve(true);
    const done = () => resolve(synth.getVoices().length > 0);
    synth.addEventListener?.("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
}

// ---------- Чтение вслух ----------

class Reading {
  constructor(opts) {
    this.chunks = []; // { text, tag }
    this.pos = 0;
    this.ended = false;
    this.opts = opts;
    this.done = new Promise((resolve) => (this.resolve = resolve));
  }
}

/**
 * Одна "читалка" на всё приложение. В каждый момент звучит одно чтение (Reading),
 * в которое можно добавлять предложения по мере того, как их пишет Claude.
 */
export class Speaker {
  constructor() {
    this.supported = !!synth && typeof SpeechSynthesisUtterance !== "undefined";
    this.cur = null;
    this.paused = false;
    this.busy = false;
    this.token = 0;
    this.state = "idle"; // idle | speaking | waiting | paused
    this.onState = null;
    this.onBroken = null;
    this.failures = 0;
    this.unlocked = false;
    this.keep = null;
    this.timer = null;
    this.cancelledAt = 0;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.onState?.(s);
  }

  /** Вызывается из обработчика нажатия: без этого iPhone не разрешит говорить позже, после ответа сети. */
  unlock() {
    if (!this.supported || this.unlocked) return;
    this.unlocked = true;
    if (synth.speaking || synth.pending) return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      synth.speak(u);
    } catch {
      /* не страшно */
    }
  }

  /** Сброс синтезатора. Только когда он действительно что-то говорит: лишний cancel на телефонах глотает следующую фразу. */
  cancelSynth() {
    if (!this.supported) return;
    try {
      if (synth.speaking || synth.pending) {
        synth.cancel();
        this.cancelledAt = Date.now();
      }
    } catch {
      /* ничего */
    }
  }

  /**
   * Начинает новое чтение, прервав предыдущее.
   *   opts: { lang: "ru" | "en", rate, onChunk(tag) }
   * Возвращает объект: add(sentence, tag), end(), done (Promise<"finished" | "stopped" | "failed">).
   */
  open(opts) {
    this.halt("stopped");
    const r = new Reading(opts);
    this.cur = r;
    this.paused = false;
    this.setState("waiting");
    return {
      add: (sentence, tag) => {
        if (this.cur !== r) return;
        for (const text of utterances(sentence)) r.chunks.push({ text, tag });
        this.pump();
      },
      end: () => {
        if (this.cur !== r) return;
        r.ended = true;
        this.pump();
      },
      done: r.done,
    };
  }

  /** Произносит готовый текст целиком. */
  say(text, opts) {
    const reading = this.open(opts);
    for (const s of splitSentences(text)) reading.add(s.text, null);
    reading.end();
    return reading.done;
  }

  pump() {
    const r = this.cur;
    if (!r || this.paused || this.busy) return;
    // Сразу после сброса синтезатору нужна короткая передышка, иначе фраза теряется.
    const since = Date.now() - this.cancelledAt;
    if (since < 140) {
      clearTimeout(this.pumpTimer);
      this.pumpTimer = setTimeout(() => this.pump(), 150 - since);
      return;
    }
    if (r.pos >= r.chunks.length) {
      if (r.ended) this.finish("finished");
      else this.setState("waiting");
      return;
    }
    if (!this.supported) return this.finish("failed");
    // С погашенным экраном телефон говорить не даёт: встаём на паузу и ждём возвращения человека.
    if (typeof document !== "undefined" && document.hidden) {
      this.paused = true;
      return this.setState("paused");
    }

    const chunk = r.chunks[r.pos];
    const token = ++this.token;
    const lang = r.opts.lang === "en" ? "en" : "ru";
    const u = new SpeechSynthesisUtterance(chunk.text);
    const voice = pickVoice(lang);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = LOCALE[lang];
    }
    u.rate = r.opts.rate || 1;
    let started = false;

    const advance = (failed) => {
      if (token !== this.token) return;
      clearTimeout(this.timer);
      this.busy = false;
      if (failed) this.failures++;
      else this.failures = 0;
      if (this.failures >= 3) {
        this.onBroken?.();
        return this.finish("failed");
      }
      r.pos++;
      this.pump();
    };

    u.onstart = () => {
      if (token !== this.token) return;
      started = true;
      clearTimeout(this.timer);
      // Страховка на случай, если событие окончания не придёт (бывает на iPhone).
      this.timer = setTimeout(() => advance(false), Math.min(60000, 6000 + chunk.text.length * 220));
    };
    u.onend = () => advance(false);
    u.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      advance(true);
    };

    this.busy = true;
    this.unlocked = true;
    this.keep = u; // держим ссылку: иначе сборщик мусора может съесть событие окончания
    this.setState("speaking");
    try {
      r.opts.onChunk?.(chunk.tag);
    } catch {
      /* подсветка не должна ломать чтение */
    }
    try {
      synth.resume();
      synth.speak(u);
    } catch {
      return advance(true);
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (token !== this.token || started) return;
      // Синтезатор молчит: сбрасываем его и считаем попытку неудачной.
      this.cancelSynth();
      advance(true);
    }, 7000);
  }

  finish(result) {
    const r = this.cur;
    if (!r) return;
    this.cur = null;
    this.busy = false;
    this.paused = false;
    clearTimeout(this.timer);
    this.setState("idle");
    r.resolve(result);
  }

  halt(result) {
    this.token++;
    clearTimeout(this.timer);
    clearTimeout(this.pumpTimer);
    this.busy = false;
    this.cancelSynth();
    if (this.cur) this.finish(result);
  }

  stop() {
    this.halt("stopped");
  }

  /** Пауза: обрываем текущую фразу и при продолжении читаем её с начала (так надёжнее, чем системная пауза). */
  pause() {
    if (!this.cur || this.paused) return;
    this.paused = true;
    this.token++;
    this.busy = false;
    clearTimeout(this.timer);
    clearTimeout(this.pumpTimer);
    this.cancelSynth();
    this.setState("paused");
  }

  resume() {
    if (!this.cur || !this.paused) return;
    this.paused = false;
    this.setState("waiting");
    this.pump();
  }

  get active() {
    return !!this.cur;
  }

  /** Ждёт, пока договорит текущее чтение (если оно есть). */
  whenIdle() {
    return this.cur ? this.cur.done : Promise.resolve("finished");
  }
}

// ---------- Распознавание речи ----------

const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export class Listener {
  constructor() {
    this.supported = !!SR;
    this.rec = null;
    this.listening = false;
  }

  /**
   * Слушает одну реплику. Нужно вызывать прямо из обработчика нажатия.
   *   onPartial(text) - что слышно прямо сейчас
   *   onDone(text)    - итог (пустая строка, если ничего не расслышано)
   *   onError(code)   - "denied" | "failed"
   */
  start({ lang, onPartial, onDone, onError }) {
    if (!this.supported) return onError?.("failed");
    this.stop();
    const rec = new SR();
    this.rec = rec;
    rec.lang = LOCALE[lang === "en" ? "en" : "ru"];
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    let lastText = "";
    let finished = false;
    const finish = (fn) => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      this.listening = false;
      if (this.rec === rec) this.rec = null;
      fn();
    };
    const guard = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ничего */
      }
    }, 15000);

    rec.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      lastText = (finalText + " " + interim).trim();
      onPartial?.(lastText);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return finish(() => onDone?.(""));
      finish(() => onError?.(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : "failed"));
    };
    rec.onend = () => finish(() => onDone?.((finalText || lastText).trim()));
    try {
      rec.start();
      this.listening = true;
    } catch {
      finish(() => onError?.("failed"));
    }
  }

  stop() {
    if (!this.rec) return;
    try {
      this.rec.stop();
    } catch {
      /* ничего */
    }
  }

  cancel() {
    if (!this.rec) return;
    const rec = this.rec;
    this.rec = null;
    this.listening = false;
    try {
      rec.onresult = rec.onend = rec.onerror = null;
      rec.abort();
    } catch {
      /* ничего */
    }
  }
}

export const speaker = new Speaker();
export const listener = new Listener();
