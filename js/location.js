// Геолокация: одно наблюдение за положением на всё приложение.
//
// Телефоны отвечают по-разному: GPS в помещении молчит, сеть отвечает быстро, но грубо,
// а доступ может быть закрыт сразу в трёх местах (телефон, браузер, сайт). Поэтому:
//   1. сразу просим быстрый грубый замер и одновременно точное наблюдение;
//   2. берём лучшее из пришедшего и уточняем по мере поступления;
//   3. если точное наблюдение не отвечает, держим грубое;
//   4. запоминаем, что именно ответил телефон, чтобы показать человеку, что включить.

import { store } from "./util.js";

const geo = typeof navigator !== "undefined" ? navigator.geolocation : null;
const listeners = new Set();

const FINE = { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 };
const COARSE = { enableHighAccuracy: false, maximumAge: 20000, timeout: 12000 };

/** Грубее этого телефон отдаёт "примерную геопозицию": искать по ней, что рядом, бессмысленно. */
export const ROUGH_M = 1500;
const SLOW_MS = 12000;
const GIVE_UP_MS = 45000;

let last = null; // { lat, lon, acc, ts }
let status = "idle"; // idle | asking | ok | denied | unavailable | timeout | insecure | unsupported
let slow = false; // долго нет ответа, хотя отказа тоже нет
let perm = "unknown"; // granted | prompt | denied | unknown
let lastError = null; // { code, message, source }
let silent = false; // телефон отказал сразу, не показав человеку вопроса
let fineId = null;
let coarseId = null;
let run = 0; // номер запуска: ответы прежних запусков не учитываем
let attempts = 0;
let startedAt = 0;
let fineFailed = false;
let coarseFailed = false;
let slowTimer = null;
let giveUpTimer = null;
let permWatch = null;
let mayReload = () => true;

/** Приложение сообщает, можно ли сейчас перезагрузить страницу саму по себе (нельзя, если человек уже чем-то занят). */
export function setReloadGuard(fn) {
  mayReload = fn;
}

export const isRough = (p) => !!p && p.acc > ROUGH_M;

function snapshot() {
  return { pos: last, status, slow, rough: isRough(last), perm, silent: status === "denied" && silent };
}

function emit() {
  const snap = snapshot();
  for (const fn of [...listeners]) {
    try {
      fn(snap);
    } catch {
      /* слушатель не должен ломать остальных */
    }
  }
}

function clearWatches() {
  for (const id of [fineId, coarseId]) {
    if (id == null) continue;
    try {
      geo.clearWatch(id);
    } catch {
      /* ничего */
    }
  }
  fineId = coarseId = null;
  clearTimeout(slowTimer);
  clearTimeout(giveUpTimer);
}

/** Принять замер или нет. Свежий точный замер не затираем более грубым. */
export function better(prev, next, now = Date.now()) {
  if (!prev) return true;
  if (now - prev.ts > 20000) return true;
  return next.acc <= prev.acc * 1.5 + 10;
}

function onPos(my, g) {
  if (my !== run) return;
  const c = g?.coords;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
  const next = { lat: c.latitude, lon: c.longitude, acc: Number.isFinite(c.accuracy) && c.accuracy > 0 ? c.accuracy : 0, ts: Date.now() };
  if (!better(last, next)) return;
  last = next;
  status = "ok";
  slow = false;
  lastError = null;
  clearTimeout(slowTimer);
  clearTimeout(giveUpTimer);
  if (!isRough(last)) store.set("lastPos", { lat: last.lat, lon: last.lon });
  try {
    sessionStorage.removeItem("history.geoReloads");
  } catch {
    /* ничего */
  }
  emit();
}

function onErr(my, source, e) {
  if (my !== run) return;
  lastError = { code: e?.code || 0, message: String(e?.message || ""), source };
  if (e?.code === 1) {
    // Доступ закрыт: ждать больше нечего. Отказ быстрее, чем человек успел бы прочитать вопрос,
    // значит, вопроса не было: доступ выключен в настройках.
    silent = Date.now() - startedAt < 1500;
    perm = "denied";
    clearWatches();
    status = "denied";
    slow = false;
    return emit();
  }
  if (source === "fine") {
    fineFailed = true;
    // Точное наблюдение молчит (в помещении это обычное дело): держим рядом грубое.
    if (coarseId == null) {
      try {
        coarseId = geo.watchPosition(
          (g) => onPos(my, g),
          (err) => onErr(my, "coarse", err),
          COARSE
        );
      } catch {
        coarseFailed = true;
      }
    }
  } else {
    coarseFailed = true;
  }
  if (last) return; // положение уже есть, временная ошибка не важна
  if (fineFailed && coarseFailed) {
    status = e?.code === 3 ? "timeout" : "unavailable";
    slow = false;
    clearTimeout(slowTimer);
    clearTimeout(giveUpTimer);
    emit();
  }
}

async function watchPermission(my) {
  try {
    if (!navigator.permissions?.query) return;
    const st = await navigator.permissions.query({ name: "geolocation" });
    if (my !== run) return;
    perm = st.state;
    if (permWatch !== st) {
      permWatch = st;
      st.onchange = () => {
        perm = st.state;
        // Доступ открыли в настройках сайта, пока страница была на экране: пробуем сразу.
        if (st.state === "granted" && status !== "ok") startLocation();
        else emit();
      };
    }
    if (status === "asking" && slow) emit();
  } catch {
    /* браузер не умеет отвечать про разрешения - обойдёмся */
  }
}

/** Запускает (или перезапускает) определение положения. */
export function startLocation() {
  if (!geo) {
    status = "unsupported";
    return emit();
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    status = "insecure";
    return emit();
  }
  const my = ++run;
  attempts++;
  startedAt = Date.now();
  clearWatches();
  fineFailed = coarseFailed = false;
  slow = false;
  silent = false;
  lastError = null;
  status = last ? "ok" : "asking";
  emit();
  watchPermission(my);
  try {
    geo.getCurrentPosition(
      (g) => onPos(my, g),
      (e) => onErr(my, "coarse", e),
      COARSE
    );
    fineId = geo.watchPosition(
      (g) => onPos(my, g),
      (e) => onErr(my, "fine", e),
      FINE
    );
  } catch (e) {
    lastError = { code: 0, message: String(e?.message || e), source: "start" };
    status = "unavailable";
    return emit();
  }
  if (last) return;
  slowTimer = setTimeout(() => {
    if (my !== run || status !== "asking") return;
    slow = true;
    emit();
  }, SLOW_MS);
  giveUpTimer = setTimeout(() => {
    // Пока браузер ждёт ответа человека на свой запрос, сдаваться рано.
    if (my !== run || status !== "asking" || perm === "prompt") return;
    status = "timeout";
    slow = false;
    emit();
  }, GIVE_UP_MS);
}

/**
 * Повторная попытка по просьбе человека. После отказа браузер (особенно на iPhone)
 * не спросит заново, пока страница не перезагрузится, поэтому в этом случае перезагружаем.
 */
export function retryLocation() {
  if (status === "denied" && typeof location !== "undefined") {
    try {
      sessionStorage.setItem("history.geoReloads", "0");
    } catch {
      /* ничего */
    }
    return location.reload();
  }
  startLocation();
}

// Человек вернулся на страницу (например, из настроек телефона): пробуем ещё раз сами.
function onReturn() {
  if (typeof document === "undefined" || document.hidden || !run) return;
  if (Date.now() - startedAt < 3000) return;
  if (status === "denied") return void recheckDenied();
  if (status === "unavailable" || status === "timeout") return startLocation();
  if (status === "ok" && last && Date.now() - last.ts > 90000) startLocation(); // после долгого сна наблюдение могло заглохнуть
}

async function recheckDenied() {
  let state = "unknown";
  try {
    state = (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    /* не знаем - не трогаем */
  }
  if (status !== "denied" || state === "denied" || state === "unknown") return;
  let free = false;
  try {
    free = !!mayReload();
  } catch {
    /* сомневаемся - не трогаем */
  }
  if (!free) return;
  // Запрет сняли, но эта страница его уже запомнила. Перезагрузка лечит; чтобы не зациклиться, не больше двух раз подряд.
  let n = 0;
  try {
    n = Number(sessionStorage.getItem("history.geoReloads") || 0);
    sessionStorage.setItem("history.geoReloads", String(n + 1));
  } catch {
    n = 99;
  }
  if (n < 2) location.reload();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("pageshow", (e) => e.persisted && onReturn());
}

export function onLocation(fn) {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export const currentPos = () => last;
export const locationStatus = () => status;
export const lastKnown = () => store.get("lastPos", null);

/** Всё, что известно о геолокации: для подсказки человеку и для разбора, если что-то не так. */
export function locationInfo() {
  return {
    status,
    slow,
    silent: status === "denied" && silent,
    perm,
    error: lastError,
    acc: last ? Math.round(last.acc) : null,
    age: last ? Math.round((Date.now() - last.ts) / 1000) : null,
    attempts,
    supported: !!geo,
    secure: typeof window === "undefined" ? null : window.isSecureContext !== false,
  };
}
