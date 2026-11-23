// Геометрия на местности: расстояния, направления, положение точки относительно маршрута.
// Точки везде в виде { lat, lon }.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Расстояние между точками в метрах (формула гаверсинуса). */
export function dist(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Азимут из a в b, градусы 0..360 (0 = север, 90 = восток). */
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Локальные метры относительно origin: x на восток, y на север. Точно на расстояниях до десятков км. */
function toXY(p, origin) {
  return {
    x: rad(p.lon - origin.lon) * R * Math.cos(rad(origin.lat)),
    y: rad(p.lat - origin.lat) * R,
  };
}

function fromXY(q, origin) {
  return {
    lat: origin.lat + deg(q.y / R),
    lon: origin.lon + deg(q.x / (R * Math.cos(rad(origin.lat)))),
  };
}

/** Длины сегментов и накопленное расстояние вдоль ломаной. */
export function measure(line) {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
  return { cum, total: cum[cum.length - 1] || 0 };
}

/** Точка на ломаной на расстоянии d метров от начала. */
export function pointAlong(line, d, m = measure(line)) {
  if (!line.length) return null;
  if (d <= 0) return line[0];
  if (d >= m.total) return line[line.length - 1];
  let i = 1;
  while (i < m.cum.length - 1 && m.cum[i] < d) i++;
  const seg = m.cum[i] - m.cum[i - 1];
  const k = seg > 0 ? (d - m.cum[i - 1]) / seg : 0;
  return {
    lat: line[i - 1].lat + (line[i].lat - line[i - 1].lat) * k,
    lon: line[i - 1].lon + (line[i].lon - line[i - 1].lon) * k,
  };
}

/** Точки вдоль ломаной через каждые step метров, включая начало и конец. */
export function sampleLine(line, step, m = measure(line)) {
  const out = [];
  if (!line.length) return out;
  const n = Math.max(1, Math.ceil(m.total / step));
  for (let i = 0; i <= n; i++) out.push(pointAlong(line, (m.total * i) / n, m));
  return out;
}

/**
 * Проекция точки на маршрут.
 * Возвращает: offset (метры от маршрута), along (метры от начала), side ("left" | "right" | "on"),
 * а также beforeStart / afterEnd, если точка лежит за концами маршрута.
 */
export function project(p, line, m = measure(line)) {
  if (line.length < 2) return { offset: line.length ? dist(p, line[0]) : Infinity, along: 0, side: "on", beforeStart: false, afterEnd: false };
  const pp = toXY(p, p);
  let best = { d2: Infinity, i: 0, k: 0 };
  for (let i = 1; i < line.length; i++) {
    const a = toXY(line[i - 1], p);
    const b = toXY(line[i], p);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    let k = len2 > 0 ? ((pp.x - a.x) * vx + (pp.y - a.y) * vy) / len2 : 0;
    k = Math.max(0, Math.min(1, k));
    const cx = a.x + vx * k;
    const cy = a.y + vy * k;
    const d2 = (pp.x - cx) ** 2 + (pp.y - cy) ** 2;
    if (d2 < best.d2) best = { d2, i, k };
  }
  const along = m.cum[best.i - 1] + (m.cum[best.i] - m.cum[best.i - 1]) * best.k;
  const offset = Math.sqrt(best.d2);

  // Направление движения берём по отрезку в 30 метров вокруг проекции: так сторона
  // не скачет на мелких изгибах и перекрёстках.
  const a = toXY(pointAlong(line, Math.max(0, along - 15), m), p);
  const b = toXY(pointAlong(line, Math.min(m.total, along + 15), m), p);
  const cross = (b.x - a.x) * (pp.y - a.y) - (b.y - a.y) * (pp.x - a.x);
  const side = offset < 12 ? "on" : cross > 0 ? "left" : "right";

  // Точка "позади старта" или "за финишем": проекция упёрлась в конец, а сама точка лежит дальше него.
  const first = toXY(line[0], p);
  const firstDir = toXY(pointAlong(line, Math.min(m.total, 20), m), p);
  const last = toXY(line[line.length - 1], p);
  const lastDir = toXY(pointAlong(line, Math.max(0, m.total - 20), m), p);
  const beforeStart = along < 1 && (pp.x - first.x) * (firstDir.x - first.x) + (pp.y - first.y) * (firstDir.y - first.y) < 0;
  const afterEnd = along > m.total - 1 && (pp.x - last.x) * (last.x - lastDir.x) + (pp.y - last.y) * (last.y - lastDir.y) > 0;

  return { offset, along, side, beforeStart, afterEnd };
}

/** Центр и радиус круга, накрывающего все точки (для подгонки карты и поиска). */
export function bounds(points) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

export { toXY, fromXY };
