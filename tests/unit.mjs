// Проверки чистой логики (без браузера): node tests/unit.mjs
import assert from "node:assert/strict";
import { dist, bearing, measure, pointAlong, sampleLine, project } from "../js/geo.js";
import { SentenceBuffer, splitSentences } from "../js/speech.js";
import { trimArticle, wikisFor, addPages, finalize, displayName } from "../js/places.js";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log("ok -", name);
};

// ---- geo ----
const rossio = { lat: 38.7139, lon: -9.1394 };
const comercio = { lat: 38.7076, lon: -9.1365 };

test("расстояние Росиу - Праса-ду-Комерсиу около 745 м", () => {
  const d = dist(rossio, comercio);
  assert.ok(d > 700 && d < 790, String(d));
});

test("азимут: на юг чуть к востоку", () => {
  const b = bearing(rossio, comercio);
  assert.ok(b > 150 && b < 180, String(b));
});

// Маршрут строго на север длиной ~1 км.
const north = [
  { lat: 38.7, lon: -9.14 },
  { lat: 38.7045, lon: -9.14 },
  { lat: 38.709, lon: -9.14 },
];

test("длина и точка на маршруте", () => {
  const m = measure(north);
  assert.ok(Math.abs(m.total - 1000.8) < 5, String(m.total));
  const mid = pointAlong(north, m.total / 2, m);
  assert.ok(Math.abs(mid.lat - 38.7045) < 1e-4);
  assert.equal(sampleLine(north, 250, m).length, 6);
});

test("идём на север: запад слева, восток справа", () => {
  const west = project({ lat: 38.703, lon: -9.1406 }, north);
  const east = project({ lat: 38.703, lon: -9.1394 }, north);
  assert.equal(west.side, "left");
  assert.equal(east.side, "right");
  assert.ok(Math.abs(west.offset - 52) < 4, String(west.offset));
  assert.ok(Math.abs(west.along - 333.6) < 6, String(west.along));
});

test("точка прямо на пути и точки за концами маршрута", () => {
  assert.equal(project({ lat: 38.705, lon: -9.14003 }, north).side, "on");
  const behind = project({ lat: 38.6995, lon: -9.1402 }, north);
  assert.equal(behind.beforeStart, true);
  assert.equal(behind.afterEnd, false);
  const beyond = project({ lat: 38.7095, lon: -9.1398 }, north);
  assert.equal(beyond.afterEnd, true);
});

test("идём на восток: север слева, юг справа", () => {
  const east = [
    { lat: 38.7, lon: -9.14 },
    { lat: 38.7, lon: -9.13 },
  ];
  assert.equal(project({ lat: 38.7005, lon: -9.135 }, east).side, "left");
  assert.equal(project({ lat: 38.6995, lon: -9.135 }, east).side, "right");
});

test("поворот под прямым углом: сторона считается по местному направлению", () => {
  const turn = [
    { lat: 38.7, lon: -9.14 },
    { lat: 38.703, lon: -9.14 },
    { lat: 38.703, lon: -9.135 },
  ];
  // Вторая часть идёт на восток, точка севернее неё: слева.
  assert.equal(project({ lat: 38.7036, lon: -9.137 }, turn).side, "left");
  // Точка южнее второй части и восточнее первой: справа.
  assert.equal(project({ lat: 38.7024, lon: -9.137 }, turn).side, "right");
});

// ---- предложения ----
test("деление на предложения, абзацы, сокращения и инициалы", () => {
  const s = splitSentences("Это случилось в 1755 году. Землетрясение! А что потом?\n\nКороль Жозе I. уехал. Домой он не вернулся…");
  assert.deepEqual(
    s.map((x) => x.text),
    ["Это случилось в 1755 году.", "Землетрясение!", "А что потом?", "Король Жозе I. уехал.", "Домой он не вернулся…"]
  );
  assert.equal(s[2].br, true);
  assert.equal(s[0].br, false);
});

test("десятичные числа и кавычки не рвут предложение", () => {
  const s = splitSentences('Башня высотой 45.5 метра. Он сказал: «Стой!» И все замерли. Mr. Smith arrived at 5 p.m. sharp.');
  assert.equal(s[0].text, "Башня высотой 45.5 метра.");
  assert.equal(s[1].text, "Он сказал: «Стой!»");
  assert.equal(s[2].text, "И все замерли.");
  assert.ok(s[3].text.startsWith("Mr. Smith"));
});

test("потоковая подача по одному символу даёт тот же результат", () => {
  const text = "Первое предложение. Второе, подлиннее, с запятыми! Третье?\n\nЧетвёртое в новом абзаце.";
  const got = [];
  const b = new SentenceBuffer((t, br) => got.push({ text: t, br }));
  for (const ch of text) b.push(ch);
  b.flush();
  assert.deepEqual(got, splitSentences(text));
  assert.equal(got.length, 4);
  assert.equal(got[2].br, true);
});

// ---- места ----
test("языки Википедии по стране", () => {
  assert.deepEqual(wikisFor("pt", "ru"), ["pt", "en", "ru"]);
  assert.deepEqual(wikisFor("es", "en"), ["es", "ca", "en"]);
  assert.deepEqual(wikisFor("", "ru"), ["en", "ru"]);
  assert.deepEqual(wikisFor("RU", "ru"), ["ru", "en"]);
});

test("слияние статей из разных Википедий по объекту Викиданных", () => {
  const map = new Map();
  const page = (title, q, lat, lon, length) => ({ pageid: Math.random(), title, length, coordinates: [{ lat, lon, globe: "earth" }], pageprops: { wikibase_item: q } });
  addPages(map, "pt", [page("Convento do Carmo (Lisboa)", "Q1", 38.7122, -9.14, 9000), page("Portugal", "Q45", 38.7139, -9.1394, 180000)], "near");
  addPages(map, "ru", [page("Монастырь кармелитов (Лиссабон)", "Q1", 38.7122, -9.14, 4000)], "near");
  addPages(map, "en", [page("Carmo Convent", "Q1", 38.7122, -9.14, 7000), page("Far away", "Q9", 38.8, -9.14, 5000)], "notable");
  map.get("Q45").descs.pt = "país da Europa";
  const places = finalize(map, rossio, 500, "ru");
  assert.equal(places.length, 2);
  assert.equal(places[0].id, "Q1");
  assert.equal(displayName(places[0], "ru"), "Монастырь кармелитов");
  assert.equal(Object.keys(places[0].titles).length, 3);
  assert.equal(places[1].broad, true);
  assert.ok(places[0].dist > 150 && places[0].dist < 250);
});

test("обрезка статьи оставляет вступление и исторические разделы", () => {
  const filler = "текст ".repeat(400);
  const article = `Вступление о месте.\n\n\n== Архитектура ==\n${filler}\n\n\n== История ==\nВ 1755 году случилось землетрясение. ${filler}\n\n\n== Примечания ==\nсноски ${filler}`;
  const cut = trimArticle(article, 3000);
  assert.ok(cut.length <= 3200, String(cut.length));
  assert.ok(cut.startsWith("Вступление о месте."));
  assert.ok(cut.includes("## История"));
  assert.ok(cut.includes("землетрясение"));
  assert.ok(!cut.includes("Примечания"));
  assert.equal(trimArticle("короткий текст", 3000), "короткий текст");
  // Короткая статья остаётся целой, но без сносок.
  const small = trimArticle("Вступление.\n\n\n== История ==\nБыло дело.\n\n\n== Ссылки ==\nсайт", 3000);
  assert.equal(small, "Вступление.\n\n## История\nБыло дело.");
});

console.log(`\n${passed} проверок пройдено`);
