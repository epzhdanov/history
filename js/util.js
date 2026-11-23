// Мелкие помощники: DOM, хранилище, форматирование.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Создаёт элемент. Текст всегда вставляется как текст (без innerHTML),
 * поэтому ответы AI и Википедии не могут подсунуть разметку.
 *   h("button", { class: "btn", onclick: fn, "aria-label": "x" }, "Текст", child)
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Иконки: контурные, 24x24, цвет берётся из currentColor.
const ICONS = {
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5c0-.5 0-.9-.1-1.3l2-1.5-2-3.4-2.3.9c-.7-.6-1.4-1-2.2-1.3L14.4 3h-4l-.4 2.4c-.8.3-1.6.7-2.2 1.3l-2.3-.9-2 3.4 2 1.5c-.1.4-.1.8-.1 1.3s0 .9.1 1.3l-2 1.5 2 3.4 2.3-.9c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.6-.7 2.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.3Z",
  locate: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2v3M12 19v3M2 12h3M19 12h3M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z",
  pin: "M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 4.800-6.5 11-6.5 11Zm0-8.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5Z",
  play: "M7 4.500v15l12.500-7.500L7 4.500Z",
  pause: "M7 4.500h3.500v15H7zM13.500 4.500H17v15h-3.500z",
  next: "M5 5v14l10-7L5 5ZM17 5h2.500v14H17z",
  replay: "M4 12a8 8 0 1 0 2.600-5.900M4 4v4.500h4.500",
  mic: "M12 15a3.500 3.500 0 0 0 3.500-3.500v-5a3.500 3.500 0 0 0-7 0v5A3.500 3.500 0 0 0 12 15Zm-6.500-3.500a6.500 6.500 0 0 0 13 0M12 18v3.500M8.500 21.500h7",
  send: "M4 12 20 4.500l-5 15.500-3.500-6.500L4 12Zm7.500 1.500L20 4.500",
  close: "M6 6l12 12M18 6 6 18",
  back: "M14.500 5.500 8 12l6.500 6.500",
  volume: "M4 9.500v5h3.500L12 18.500v-13L7.500 9.500H4ZM15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11",
  mute: "M4 9.500v5h3.500L12 18.500v-13L7.500 9.500H4ZM16 9.500l5 5M21 9.500l-5 5",
  text: "M5 6.500h14M5 11h14M5 15.500h9",
  search: "M10.500 4a6.500 6.500 0 1 0 0 13 6.500 6.500 0 0 0 0-13ZM20 20l-4.800-4.800",
  route: "M5.500 20v-8.500a4 4 0 0 1 4-4H19M15.500 4l3.500 3.500-3.500 3.500",
  expand: "M6.500 9.500 12 15l5.500-5.500",
  external: "M10 5H5.500v13.500H19V14M14 5h5v5M19 5l-8 8",
  check: "M5 12.500 10 17.500 19.500 7",
  plus: "M12 5v14M5 12h14",
  key: "M12.500 8a4.500 4.500 0 1 1-9 0 4.500 4.500 0 0 1 9 0ZM11.200 11.200 20 20M17 17l2.500-2.500M14.200 14.200l2-2",
  eye: "M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12Zm9.500 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  stop: "M6.500 6.500h11v11h-11z",
  sparkle: "M12 3.500l1.800 4.700 4.700 1.800-4.700 1.800L12 16.500l-1.800-4.700-4.700-1.800 4.700-1.800L12 3.500ZM18.500 15.500l.800 2.200 2.200.800-2.200.800-.800 2.200-.800-2.200-2.200-.800 2.200-.800.800-2.200Z",
};
const FILLED = new Set(["play", "pause", "next", "stop"]);

export function icon(name, size = 22) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ICONS[name] || "");
  if (FILLED.has(name)) {
    path.setAttribute("fill", "currentColor");
  } else {
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.800");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
  }
  svg.append(path);
  return svg;
}

// localStorage с JSON и защитой от приватного режима.
const PREFIX = "history.";
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* приватный режим или переполнение - живём без сохранения */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* то же */
    }
  },
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** Выполняет задачи с ограничением одновременных запросов. Ошибки не роняют остальные. */
export async function pool(tasks, limit = 4) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** fetch с таймаутом, который уважает внешний signal. */
export async function fetchJSON(url, { signal, timeout = 12000, ...init } = {}) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export const isAbort = (e) => e?.name === "AbortError" || e?.name === "APIUserAbortError" || e?.code === "aborted";

let toastTimer;
export function toast(message, ms = 3200) {
  let el = $("#toast");
  if (!el) {
    el = h("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/** Убирает разметку, которую модель могла добавить вопреки просьбе. */
export function plain(text) {
  return String(text ?? "")
    .replace(/\*\*|__|^#{1,6}\s+|`/gm, "")
    .replace(/^\s*[*•]\s+/gm, "")
    .replace(/[—–]/g, "-");
}

/** Последнее JSON-значение в тексте (на случай, если модель добавила слова вокруг). */
export function lastJSON(text) {
  const src = String(text || "");
  try {
    return JSON.parse(src);
  } catch {
    /* ищем ниже */
  }
  let found;
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "{" && src[i] !== "[") continue;
    let depth = 0;
    let inStr = false;
    for (let j = i; j < src.length; j++) {
      const ch = src[j];
      if (inStr) {
        if (ch === "\\") j++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) {
          try {
            found = JSON.parse(src.slice(i, j + 1));
            i = j;
          } catch {
            /* не JSON, идём дальше */
          }
          break;
        }
      }
    }
  }
  if (found === undefined) throw new SyntaxError("no json");
  return found;
}
