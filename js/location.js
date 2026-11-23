// Геолокация: одно наблюдение за положением на всё приложение.

import { store } from "./util.js";

const listeners = new Set();
let watchId = null;
let last = null; // { lat, lon, acc, ts }
let status = "idle"; // idle | asking | ok | denied | failed | insecure | unsupported

function emit() {
  for (const fn of listeners) {
    try {
      fn({ pos: last, status });
    } catch {
      /* слушатель не должен ломать остальных */
    }
  }
}

function onPos(g) {
  const { latitude, longitude, accuracy } = g.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  last = { lat: latitude, lon: longitude, acc: accuracy || 0, ts: Date.now() };
  status = "ok";
  store.set("lastPos", { lat: latitude, lon: longitude });
  emit();
}

function onErr(e) {
  // Если положение уже есть, временная ошибка не важна.
  if (last && e.code !== 1) return;
  status = e.code === 1 ? "denied" : "failed";
  emit();
}

/** Запускает (или перезапускает) определение положения. */
export function startLocation() {
  if (!("geolocation" in navigator)) {
    status = "unsupported";
    return emit();
  }
  if (!window.isSecureContext) {
    status = "insecure";
    return emit();
  }
  if (status !== "ok") {
    status = "asking";
    emit();
  }
  const opts = { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 };
  navigator.geolocation.getCurrentPosition(onPos, onErr, opts);
  if (watchId == null) {
    try {
      watchId = navigator.geolocation.watchPosition(onPos, onErr, opts);
    } catch {
      watchId = null;
    }
  }
}

export function onLocation(fn) {
  listeners.add(fn);
  fn({ pos: last, status });
  return () => listeners.delete(fn);
}

export const currentPos = () => last;
export const locationStatus = () => status;
export const lastKnown = () => store.get("lastPos", null);
