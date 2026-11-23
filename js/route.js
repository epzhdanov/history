// Пеший маршрут и места вдоль него: что будет слева и справа по пути.

import { fetchJSON, pool } from "./util.js";
import { dist, measure, sampleLine, project } from "./geo.js";
import { wikiNearest, addPages, wikidataNear, describeMinors, nameAll, placeFame, settleCoords } from "./places.js";

const WALK_SPEED = 1.25; // м/с, спокойный шаг

/** Пеший маршрут по улицам (OSRM, сервер сообщества OpenStreetMap). Если сервер недоступен, идём по прямой. */
export async function fetchRoute(a, b, signal) {
  try {
    const pair = `${a.lon.toFixed(6)},${a.lat.toFixed(6)};${b.lon.toFixed(6)},${b.lat.toFixed(6)}`;
    const j = await fetchJSON(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${pair}?overview=full&geometries=geojson&steps=true`, {
      signal,
      timeout: 9000,
    });
    const r = j.routes?.[0];
    if (j.code !== "Ok" || !r?.geometry?.coordinates?.length) throw new Error("no route");
    const coords = r.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
    // Маршрут начинается от ближайшей дороги; добавляем точные начало и конец.
    if (dist(a, coords[0]) > 3) coords.unshift({ lat: a.lat, lon: a.lon });
    if (dist(b, coords[coords.length - 1]) > 3) coords.push({ lat: b.lat, lon: b.lon });
    const m = measure(coords);
    return { coords, distance: m.total, duration: Math.max(r.duration || 0, m.total / WALK_SPEED), streets: streets(r.legs?.[0]?.steps || []), exact: true };
  } catch (e) {
    if (signal?.aborted) throw e;
    const d = dist(a, b);
    return { coords: [a, b], distance: d, duration: d / WALK_SPEED, streets: [], exact: false };
  }
}

/** Улицы по порядку, с длиной отрезка по каждой. */
function streets(steps) {
  const out = [];
  for (const s of steps) {
    if (!s.name || !(s.distance > 0)) continue;
    const last = out[out.length - 1];
    if (last && last.name === s.name) last.distance += s.distance;
    else out.push({ name: s.name, distance: s.distance });
  }
  return out.filter((s) => s.distance >= 30).map((s) => ({ name: s.name, distance: Math.round(s.distance) }));
}

export const walkMinutes = (meters) => Math.max(1, Math.round(meters / WALK_SPEED / 60));

/**
 * Места в полосе вдоль маршрута. Для каждого считаем, через сколько метров оно будет,
 * с какой стороны и как далеко от пути.
 */
export async function loadAlongRoute({ route, corridor, wikis, ui, signal }) {
  const line = route.coords;
  const m = measure(line);
  const step = Math.max(220, m.total / 10);
  const samples = sampleLine(line, step, m);
  const reach = Math.ceil(Math.sqrt(corridor ** 2 + (step / 2) ** 2)) + 25;

  const tasks = [];
  for (const w of wikis) for (const pt of samples) tasks.push(() => wikiNearest(w, pt, reach, signal).then((pages) => ({ w, pages })));
  const res = await pool(tasks, 6);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  if (res.length && res.every((r) => !r.ok)) throw res[0].error || new Error("places failed");

  const map = new Map();
  for (const r of res) if (r.ok) addPages(map, r.value.w, r.value.pages, "near");

  const places = [];
  for (const p of map.values()) {
    settleCoords(p);
    const pr = project(p, line, m);
    if (pr.offset > corridor + 10) continue;
    Object.assign(p, { along: pr.along, side: pr.side, offset: pr.offset, atStart: pr.along < 25, atEnd: pr.along > m.total - 25, behind: pr.beforeStart && pr.offset > 25, beyond: pr.afterEnd && pr.offset > 25 });
    p.dist = pr.along;
    p.score = placeFame(p) + 0.5 * (1 - Math.min(1, pr.offset / Math.max(corridor, 1)));
    places.push(p);
  }
  places.sort((a, b) => b.score - a.score);
  nameAll(places, ui);
  return { places, samples, reach };
}

/** Мелкие объекты из Викиданных вдоль маршрута (лавки, статуи, фонтаны). */
export async function loadMinorsAlongRoute({ route, corridor, exclude, ui, wikis, samples, reach, signal, limit = 60 }) {
  const line = route.coords;
  const m = measure(line);
  const pts = samples.length > 8 ? samples.filter((_, i) => i % Math.ceil(samples.length / 8) === 0) : samples;
  const res = await pool(pts.map((pt) => () => wikidataNear(pt, Math.min(reach * (samples.length / pts.length), 900), signal)), 3);
  const seen = new Map();
  for (const r of res) {
    if (!r.ok) continue;
    for (const it of r.value) if (!exclude.has(it.qid) && !seen.has(it.qid)) seen.set(it.qid, it);
  }
  const width = Math.min(corridor, 120);
  const near = [];
  for (const it of seen.values()) {
    const pr = project(it, line, m);
    if (pr.offset > width) continue;
    near.push({ ...it, along: pr.along, side: pr.side, offset: pr.offset, dist: pr.along, atStart: pr.along < 25, atEnd: pr.along > m.total - 25, behind: pr.beforeStart && pr.offset > 25, beyond: pr.afterEnd && pr.offset > 25 });
  }
  near.sort((a, b) => a.offset - b.offset);
  const langs = [...new Set([ui, "en", ...wikis])];
  const minors = await describeMinors(near.slice(0, limit), langs, signal);
  return minors.sort((a, b) => a.along - b.along);
}
