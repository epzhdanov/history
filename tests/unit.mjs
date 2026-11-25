// Проверки чистой логики (без браузера): node tests/unit.mjs
import assert from "node:assert/strict";
import { dist, bearing, measure, pointAlong, sampleLine, project } from "../js/geo.js";
import { SentenceBuffer, splitSentences } from "../js/speech.js";
import { lastJSON, plain } from "../js/util.js";
import { trimArticle, wikisFor, addPages, finalize, displayName, settleCoords } from "../js/places.js";
import { nextCut, joinText, marksFor, readWav, wavHeader, pcmToWav, elevenError, geminiError, recover, PROVIDERS } from "../js/tts.js";
import { better, ROUGH_M, isRough } from "../js/location.js";
import { parsePlatform } from "../js/platform.js";
import { geoAdvice } from "../js/geohelp.js";
import { setLang } from "../js/i18n.js";

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

test("подразделы наследуют важность раздела, служебные разделы выпадают целиком", () => {
  const filler = "текст ".repeat(300);
  const article = `Вступление.\n\n\n== Descrição ==\n${filler}\n\n\n== História ==\n\n\n=== Construção ===\nСтроили долго. ${filler}\n\n\n== Sources ==\n\n\n=== Books ===\nкнига ${filler}`;
  const cut = trimArticle(article, 2500);
  assert.ok(cut.includes("## Construção"), cut.slice(0, 200));
  assert.ok(cut.includes("Строили долго"));
  assert.ok(!cut.includes("Books") && !cut.includes("книга"));
});

test("из расходящихся координат выбирается точка, с которой согласны другие Википедии", () => {
  const p = settleCoords({ lat: 38.71282, lon: -9.13891, coords: { pt: { lat: 38.71282, lon: -9.13891 }, en: { lat: 38.71361, lon: -9.13778 }, ru: { lat: 38.7136, lon: -9.1378 } } });
  assert.ok(Math.abs(p.lat - 38.7136) < 0.0001 && Math.abs(p.lon + 9.1378) < 0.0001, JSON.stringify([p.lat, p.lon]));
  const two = settleCoords({ lat: 1, lon: 1, coords: { pt: { lat: 1, lon: 1 }, en: { lat: 2, lon: 2 } } });
  assert.equal(two.lat, 1);
});

test("JSON достаётся из ответа, даже если вокруг него слова или черновик", () => {
  assert.deepEqual(lastJSON('{"a":1}'), { a: 1 });
  assert.deepEqual(lastJSON('Вот ответ:\n{"stories":[{"title":"Скобка } в \\"строке\\""}]}\nГотово.'), { stories: [{ title: 'Скобка } в "строке"' }] });
  assert.deepEqual(lastJSON('Черновик {"x":1} и итог {"x":2}'), { x: 2 });
  assert.throws(() => lastJSON("никакого json"));
});

test("разметка и длинные тире убираются из текста", () => {
  assert.equal(plain("**Жирный** текст \u2014 и `код`"), "Жирный текст - и код");
  assert.equal(plain("- Привет, - сказал он."), "- Привет, - сказал он.");
});

// ---- нейросетевой голос: нарезка текста на отрывки ----
const sent = (n, len = 80, br = false) => Array.from({ length: n }, (_, i) => ({ text: `${i}`.padEnd(len, "я"), tag: i, br: br && i % 3 === 2 }));
const EL = PROVIDERS.eleven.plan;
const GM = PROVIDERS.gemini.plan;

/** Режет готовый текст так же, как это делает "читалка": возвращает длины отрывков в предложениях. */
function cutAll(items, plan, quick) {
  const out = [];
  let from = 0;
  while (from < items.length) {
    const to = nextCut(items, from, { index: out.length, ended: true, starving: false, quick, plan });
    assert.ok(to > from, `отрывок должен продвигаться: ${from} -> ${to}`);
    out.push(to - from);
    from = to;
  }
  return out;
}

test("первый отрывок короткий, чтобы рассказ начался сразу", () => {
  const items = sent(20);
  assert.equal(nextCut(items, 0, { index: 0, ended: false, starving: true, quick: true, plan: EL }), 1);
  // Совсем короткое первое предложение ждёт следующего, но не бесконечно.
  const tiny = [{ text: "Привет!", tag: 0, br: false }];
  assert.equal(nextCut(tiny, 0, { index: 0, ended: false, starving: true, quick: true, plan: EL }), -1);
  assert.equal(nextCut(tiny, 0, { index: 0, ended: false, starving: true, quick: true, plan: EL, force: true }), 1);
  assert.equal(nextCut(tiny, 0, { index: 0, ended: true, starving: true, quick: true, plan: EL }), 1);
  assert.equal(nextCut([...tiny, ...sent(3)], 0, { index: 0, ended: false, starving: true, quick: true, plan: EL }), 2);
});

test("пока текст пишется, отрывок ждёт нужной длины, но не даёт звуку кончиться", () => {
  const items = sent(2); // около 160 знаков
  assert.equal(nextCut(items, 0, { index: 1, ended: false, starving: false, quick: true, plan: EL }), -1);
  assert.equal(nextCut(items, 0, { index: 1, ended: false, starving: true, quick: true, plan: EL }), 2);
  assert.equal(nextCut(sent(1), 0, { index: 1, ended: false, starving: true, quick: true, plan: EL }), -1, "меньше минимума не берём");
  assert.equal(nextCut(items, 0, { index: 1, ended: true, starving: false, quick: true, plan: EL }), 2, "конец текста забирает остаток");
  // Текста чуть больше нормы, а звука в запасе хватает: ждём, вдруг рассказ вот-вот кончится.
  const more = sent(4, 70); // около 280 знаков при норме 240
  assert.equal(nextCut(more, 0, { index: 1, ended: false, starving: false, quick: true, plan: EL }), -1);
  assert.equal(nextCut(more, 0, { index: 1, ended: true, starving: false, quick: true, plan: EL }), 4, "кончился: уходит одним запросом");
  assert.equal(nextCut(more, 0, { index: 1, ended: false, starving: true, quick: true, plan: EL }), 3, "звук кончается: режем по норме");
  assert.equal(nextCut(sent(6), 0, { index: 1, ended: false, starving: false, quick: true, plan: EL }), 3, "текста уже много: режем по норме");
});

test("готовый текст делится на ровные отрывки без хвостиков", () => {
  const story = sent(21); // около 1700 знаков, обычная история
  const eleven = cutAll(story, EL, false);
  assert.equal(eleven.reduce((a, b) => a + b, 0), 21);
  assert.ok(eleven.every((n) => n >= 2), JSON.stringify(eleven));
  const gemini = cutAll(story, GM, false);
  assert.deepEqual(gemini.length, 2, JSON.stringify(gemini));
  assert.ok(Math.abs(gemini[0] - gemini[1]) <= 2, JSON.stringify(gemini));
  // С коротким началом у Gemini получается три запроса на историю, не больше.
  assert.ok(cutAll(story, GM, true).length <= 3);
  // Короткий текст (вопрос, ответ) уходит одним запросом.
  assert.deepEqual(cutAll(sent(3), GM, false), [3]);
});

test("отрывок старается закончиться на границе абзаца", () => {
  const items = sent(12, 80, true); // абзацы по три предложения
  const to = nextCut(items, 0, { index: 0, ended: false, starving: false, quick: false, plan: EL });
  assert.equal(to, 3);
  assert.equal(joinText(items, 0, 4).split("\n\n").length, 2);
});

test("очень длинное предложение не зацикливает нарезку", () => {
  const items = [{ text: "я".repeat(5000), tag: 0, br: false }, ...sent(3)];
  assert.deepEqual(cutAll(items, EL, false)[0], 1);
});

test("метки предложений внутри отрывка идут по порядку от нуля", () => {
  const items = sent(4);
  const m = marksFor(items, 1, 4);
  assert.deepEqual(m.map((x) => x.tag), [1, 2, 3]);
  assert.equal(m[0].at, 0);
  assert.ok(m[1].at > 0.3 && m[1].at < 0.36 && m[2].at > m[1].at && m[2].at < 1);
});

// ---- нейросетевой голос: звук и ошибки ----
test("сырой звук от Gemini заворачивается в WAV с верной длительностью", () => {
  const pcm = new Uint8Array(48000); // секунда: 24 кГц, 16 бит, моно
  const raw = pcmToWav([pcm], "audio/L16;codec=pcm;rate=24000");
  assert.equal(raw.dur, 1);
  const file = new Uint8Array(44 + pcm.length);
  file.set(wavHeader(pcm.length, 24000, 1));
  const w = readWav(file);
  assert.deepEqual([w.rate, w.channels, w.bits, w.offset, w.length], [24000, 1, 16, 44, 48000]);
  // Готовый WAV (так отвечает обычный запрос) и два куска подряд.
  assert.equal(pcmToWav([file], "audio/wav").dur, 1);
  assert.equal(pcmToWav([file, file], "audio/wav").dur, 2);
  // Заголовок с незаполненной длиной: звук идёт до конца файла.
  const open = file.slice();
  new DataView(open.buffer).setUint32(40, 0, true);
  assert.equal(readWav(open).length, 48000);
  assert.equal(readWav(new Uint8Array(100)), null);
});

test("ответы сервисов об ошибках разбираются по смыслу", () => {
  const e = (status, detail) => elevenError(status, { detail }).kind;
  assert.equal(e(401, { type: "authentication_error", code: "unauthorized", message: "Invalid API key", status: "invalid_api_key" }), "auth");
  assert.equal(e(401, { status: "missing_permissions", message: "The API key you used is missing the permission text_to_speech" }), "permission");
  assert.equal(e(401, { status: "quota_exceeded", message: "This request exceeds your quota." }), "credit");
  assert.equal(e(402, { status: "payment_required", message: "Free users cannot use library voices via the API." }), "voice");
  assert.equal(e(404, { status: "voice_not_found", message: "A voice with that id was not found." }), "voice");
  assert.equal(e(400, { status: "model_not_found", message: "Model eleven_v4 was not found" }), "model");
  assert.equal(e(429, { status: "too_many_concurrent_requests", message: "Too many concurrent requests" }), "rate");
  assert.equal(elevenError(422, { detail: [{ loc: ["body", "previous_text"], msg: "extra fields not permitted", type: "value_error" }] }).kind, "request");
  assert.equal(elevenError(503, null, "upstream").kind, "server");

  const g = (status, error) => geminiError(status, { error });
  assert.equal(g(400, { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] }).kind, "auth");
  assert.equal(g(404, { message: "models/gemini-9 is not found for API version v1beta", status: "NOT_FOUND" }).kind, "model");
  assert.equal(g(400, { message: "Invalid JSON payload received. Unknown name \"speech_metadata\"", status: "INVALID_ARGUMENT" }).kind, "request");
  const day = g(429, { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel", quotaMetric: "generate_requests_per_model_per_day" }] }] });
  assert.equal(day.kind, "daily");
  const minute = g(429, { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }] }, { retryDelay: "17s" }] });
  assert.deepEqual([minute.kind, minute.retryAfter], ["rate", 17000]);
  assert.equal(g(400, { message: "User location is not supported for the API use.", status: "FAILED_PRECONDITION" }).kind, "permission");
});

test("после ошибки выбирается разумное продолжение", () => {
  const p = PROVIDERS.gemini;
  const rt = { model: 0, minimal: false, plainVoice: false };
  assert.equal(recover(p, rt, { kind: "auth" }, 1), -1);
  assert.equal(recover(p, rt, { kind: "request" }, 1), 0);
  assert.equal(rt.minimal, true, "сначала убираем необязательное");
  assert.equal(recover(p, rt, { kind: "daily" }, 2), 0);
  assert.equal(rt.model, 1, "суточный лимит: переходим на соседнюю модель");
  assert.equal(recover(p, rt, { kind: "daily" }, 3), -1, "моделей больше нет");
  assert.equal(recover(p, rt, { kind: "rate", retryAfter: 4000 }, 1), 4000);
  assert.equal(recover(p, rt, { kind: "rate", retryAfter: 60000 }, 1), -1, "минуту ждать не будем");
  assert.equal(recover(p, rt, { kind: "network" }, 1), 800);
  assert.equal(recover(p, rt, { kind: "server" }, 3), 3200, "сеть на улице пропадает: пробуем подольше");
  assert.equal(recover(p, rt, { kind: "server" }, 4), -1);
  assert.equal(recover(p, rt, { kind: "blocked" }, 3), -1);
  // Два запроса ушли одновременно и оба получили отказ: настройки переключаются один раз, а не дважды.
  const shared = { model: 0, minimal: false, plainVoice: false };
  const sentWith = { ...shared };
  assert.equal(recover(p, shared, { kind: "request" }, 1, sentWith), 0);
  assert.equal(recover(p, shared, { kind: "request" }, 1, sentWith), 0);
  assert.deepEqual(shared, { model: 0, minimal: true, plainVoice: false });
  const afterMin = { ...shared };
  assert.equal(recover(p, shared, { kind: "daily" }, 2, afterMin), 0);
  assert.equal(recover(p, shared, { kind: "daily" }, 2, afterMin), 0);
  assert.equal(shared.model, 1);
});

// ---- геолокация ----
test("свежий точный замер не затирается грубым, а устаревший заменяется", () => {
  const now = 1_000_000;
  const fine = { lat: 1, lon: 1, acc: 12, ts: now - 2000 };
  assert.equal(better(null, { acc: 5000 }, now), true);
  assert.equal(better(fine, { acc: 800 }, now), false);
  assert.equal(better(fine, { acc: 15 }, now), true);
  assert.equal(better({ ...fine, ts: now - 30000 }, { acc: 800 }, now), true);
  assert.equal(isRough({ acc: ROUGH_M + 1 }), true);
  assert.equal(isRough({ acc: 300 }), false);
});

test("телефон и браузер узнаются по строке браузера", () => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  assert.deepEqual(parsePlatform(`${ios} Version/18.1 Mobile/15E148 Safari/604.1`), { os: "ios", browser: "safari", standalone: false });
  assert.equal(parsePlatform(`${ios} CriOS/131.0 Mobile/15E148 Safari/604.1`).browser, "chrome");
  assert.equal(parsePlatform(`${ios} Mobile/15E148`).browser, "inapp", "встроенный браузер другого приложения");
  assert.equal(parsePlatform(`${ios} Mobile/15E148`, { standalone: true }).browser, "safari", "значок на экране Домой");
  assert.equal(parsePlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36").browser, "chrome");
  assert.equal(parsePlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36").browser, "inapp");
});

test("подсказка про геолокацию зависит от телефона и причины", () => {
  setLang("ru");
  const info = (status) => ({ status, slow: false, perm: "prompt", error: null });
  const safari = { os: "ios", browser: "safari", standalone: false };
  const denied = geoAdvice(info("denied"), safari);
  assert.equal(denied.steps.length, 4);
  assert.ok(denied.steps[1].includes("Сайты Safari") && denied.steps[2].includes("Настройки веб-сайта"));
  const chromeIos = geoAdvice(info("denied"), { os: "ios", browser: "chrome", standalone: false });
  assert.ok(chromeIos.steps[1].includes("«Chrome»") && chromeIos.steps.length === 3);
  const android = geoAdvice(info("denied"), { os: "android", browser: "chrome", standalone: false });
  assert.ok(android.steps[0].includes("Геоданные") && android.steps[1].includes("«Chrome»"));
  const inapp = geoAdvice(info("denied"), { os: "ios", browser: "inapp", standalone: false });
  assert.ok(inapp.inApp && inapp.steps[0].includes("Открыть в Safari"));
  const rough = geoAdvice(info("ok"), safari, { rough: true, acc: 4200 });
  assert.ok(rough.lead.includes("4,2 км") && rough.steps[0].includes("Точная геопозиция"));
  assert.equal(geoAdvice(info("timeout"), safari).steps.length, 3);
});

console.log(`\n${passed} проверок пройдено`);
