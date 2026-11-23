// Поиск мест вокруг точки: Википедия (местная, английская и язык интерфейса),
// Викиданные (мелкие объекты без статей) и Nominatim (адрес точки, поиск по названию).

import { fetchJSON, pool, clamp } from "./util.js";
import { dist, bearing } from "./geo.js";

// Какая Википедия лучше всего знает страну. Первым идёт основной язык.
const WIKI_BY_CC = {
  pt: ["pt"], br: ["pt"], ao: ["pt"], mz: ["pt"], cv: ["pt"],
  es: ["es", "ca"], ad: ["ca", "es"], mx: ["es"], ar: ["es"], cl: ["es"], co: ["es"], pe: ["es"], cu: ["es"], uy: ["es"],
  ec: ["es"], bo: ["es"], ve: ["es"], cr: ["es"], pa: ["es"], do: ["es"], gt: ["es"], py: ["es"],
  fr: ["fr"], mc: ["fr"], be: ["nl", "fr"], nl: ["nl"], lu: ["fr", "de"],
  de: ["de"], at: ["de"], ch: ["de", "fr"], li: ["de"],
  it: ["it"], va: ["it"], sm: ["it"], mt: ["en", "mt"],
  gb: ["en"], ie: ["en"], us: ["en"], ca: ["en", "fr"], au: ["en"], nz: ["en"],
  ru: ["ru"], by: ["ru", "be"], ua: ["uk", "ru"], kz: ["ru", "kk"], kg: ["ru"], uz: ["uz", "ru"],
  pl: ["pl"], cz: ["cs"], sk: ["sk"], hu: ["hu"], ro: ["ro"], md: ["ro", "ru"], bg: ["bg"],
  rs: ["sr"], hr: ["hr"], si: ["sl"], ba: ["bs", "hr"], me: ["sr"], mk: ["mk"], al: ["sq"],
  gr: ["el"], cy: ["el", "tr"], tr: ["tr"], ge: ["ka", "ru"], am: ["hy", "ru"], az: ["az", "ru"],
  il: ["he"], eg: ["ar"], ma: ["fr", "ar"], tn: ["fr", "ar"], dz: ["fr", "ar"], ae: ["ar"], sa: ["ar"], jo: ["ar"], lb: ["ar", "fr"],
  se: ["sv"], no: ["no"], dk: ["da"], fi: ["fi"], is: ["is"], ee: ["et"], lv: ["lv"], lt: ["lt"],
  jp: ["ja"], cn: ["zh"], tw: ["zh"], hk: ["zh"], kr: ["ko"], th: ["th"], vn: ["vi"], id: ["id"], my: ["ms"],
  ph: ["en", "tl"], in: ["en", "hi"], lk: ["en"], np: ["ne", "en"], kh: ["km", "en"],
  ir: ["fa"], pk: ["en", "ur"], za: ["en", "af"], ke: ["en"], tz: ["sw", "en"], ng: ["en"], gh: ["en"], et: ["en"],
};

/** Список Википедий для точки: местные, английская и язык интерфейса. */
export function wikisFor(cc, ui) {
  const list = [...(WIKI_BY_CC[(cc || "").toLowerCase()] || []), "en", ui];
  return [...new Set(list)].slice(0, 4);
}

function api(host, params, signal, timeout = 10000) {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  return fetchJSON(`https://${host}/w/api.php?${qs}`, { signal, timeout }).then((j) => {
    if (j.error) throw new Error(j.error.info || j.error.code || "wiki api error");
    return j;
  });
}

const PAGE_PROPS = {
  prop: "coordinates|pageprops|description|info|pageimages",
  ppprop: "wikibase_item",
  piprop: "thumbnail",
  pithumbsize: "240",
  pilimit: "50",
  colimit: "50",
};

/** До 50 ближайших статей с координатами. */
export async function wikiNearest(lang, c, radius, signal) {
  const j = await api(
    `${lang}.wikipedia.org`,
    {
      action: "query",
      generator: "geosearch",
      ggscoord: `${c.lat}|${c.lon}`,
      ggsradius: String(clamp(Math.round(radius), 10, 10000)),
      ggslimit: "50",
      ...PAGE_PROPS,
    },
    signal
  );
  return j.query?.pages || [];
}

/** До 50 самых известных статей в радиусе (по числу ссылок на них). */
async function wikiNotable(lang, c, radius, signal) {
  const j = await api(
    `${lang}.wikipedia.org`,
    {
      action: "query",
      generator: "search",
      gsrsearch: `nearcoord:${Math.round(radius)}m,${c.lat.toFixed(5)},${c.lon.toFixed(5)}`,
      gsrlimit: "50",
      gsrsort: "incoming_links_desc",
      gsrnamespace: "0",
      ...PAGE_PROPS,
    },
    signal
  );
  return (j.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** Складывает страницы из разных Википедий в один список мест (одно место = один объект Викиданных). */
export function addPages(map, lang, pages, source) {
  pages.forEach((page, rank) => {
    const co = page.coordinates?.[0];
    if (!co || (co.globe && co.globe !== "earth")) return;
    const qid = page.pageprops?.wikibase_item || null;
    const key = qid || `${lang}:${page.pageid}`;
    let p = map.get(key);
    if (!p) {
      p = { id: key, qid, lat: co.lat, lon: co.lon, titles: {}, labels: {}, descs: {}, lens: {}, thumb: null, linkRank: 999, intro: null, kind: "article" };
      map.set(key, p);
    }
    p.titles[lang] = page.title;
    if (page.description) p.descs[lang] = page.description;
    p.lens[lang] = page.length || 0;
    if (!p.thumb && page.thumbnail?.source) p.thumb = page.thumbnail.source;
    if (source === "notable") p.linkRank = Math.min(p.linkRank, rank);
  });
}

const BROAD_TITLE = /^(timeline|list of|history of|lista d|cronologia|história d|historia de|histoire d|geschichte d|список|хронология|история )/i;
const BROAD_DESC = ["country", "sovereign state", "capital of", "capital city", "city in", "país", "capital d", "страна", "государство", "столица", "wikimedia", "страница значений"];

function looksBroad(p) {
  const titles = Object.values(p.titles);
  if (titles.some((t) => BROAD_TITLE.test(t))) return true;
  const descs = Object.values(p.descs).map((d) => d.toLowerCase());
  return descs.some((d) => BROAD_DESC.some((w) => d.startsWith(w)));
}

/** Название для показа: на языке интерфейса, без уточнения в скобках. */
export function displayName(p, ui) {
  const raw = p.titles[ui] || p.labels[ui] || p.titles.en || p.labels.en || Object.values(p.titles)[0] || Object.values(p.labels)[0] || p.name || "";
  return raw.replace(/\s*\([^)]*\)\s*$/, "");
}

/** Местное название (как написано на табличках), если оно отличается от показанного. */
export function localName(p, ui, wikis) {
  const shown = displayName(p, ui);
  for (const w of wikis || []) {
    if (w === ui || w === "en") continue;
    const t = (p.titles[w] || "").replace(/\s*\([^)]*\)\s*$/, "");
    if (t && t !== shown) return t;
  }
  return "";
}

/** Если два места получили одно название (скажем, площадь и вокзал), возвращаем им уточнение из скобок. */
export function nameAll(places, ui) {
  const count = new Map();
  for (const p of places) {
    p.name = displayName(p, ui);
    count.set(p.name, (count.get(p.name) || 0) + 1);
  }
  for (const p of places) {
    if (count.get(p.name) < 2) continue;
    const full = p.titles[ui] || p.titles.en || Object.values(p.titles)[0];
    if (full && full !== p.name) p.name = full;
  }
  return places;
}

export const describe = (p, ui) => p.descs[ui] || p.descs.en || Object.values(p.descs)[0] || p.desc || "";

/** Известность места: длина статьи, число языков, число ссылок. Слишком общие статьи (страна, город) уходят вниз. */
export function placeFame(p) {
  const maxLen = Math.max(0, ...Object.values(p.lens));
  const nLangs = Object.keys(p.titles).length;
  p.broad = looksBroad(p);
  return Math.min(1, Math.log10(1 + maxLen) / 5) + 0.15 * (nLangs - 1) + (p.linkRank < 50 ? 0.5 * (1 - p.linkRank / 50) : 0) - (p.broad ? 0.9 : 0);
}

/** Считает расстояния и общий рейтинг места: известность плюс близость. */
export function finalize(map, center, radius, ui) {
  const out = [];
  for (const p of map.values()) {
    p.dist = dist(center, p);
    if (p.dist > radius * 1.03 + 15) continue;
    p.bearing = bearing(center, p);
    const closeness = 1 - Math.min(1, p.dist / Math.max(radius, 1));
    p.score = placeFame(p) + 0.6 * closeness;
    out.push(p);
  }
  out.sort((a, b) => b.score - a.score);
  return nameAll(out, ui);
}

// ---------- Адрес точки и поиск по названию (Nominatim) ----------

const areaCache = new Map();

export async function reverseGeocode(c, ui, signal) {
  const key = `${c.lat.toFixed(4)},${c.lon.toFixed(4)},${ui}`;
  if (areaCache.has(key)) return areaCache.get(key);
  const qs = new URLSearchParams({ format: "jsonv2", lat: c.lat, lon: c.lon, zoom: "17", addressdetails: "1", "accept-language": ui });
  const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?${qs}`, { signal, timeout: 5000 });
  const a = j.address || {};
  const city = a.city || a.town || a.municipality || a.village || a.county || "";
  const quarter = a.neighbourhood || a.quarter || a.suburb || a.city_district || "";
  const road = a.road || a.pedestrian || a.square || j.name || "";
  const area = {
    cc: (a.country_code || "").toLowerCase(),
    country: a.country || "",
    city,
    quarter,
    suburb: a.suburb || "",
    road,
    label: [road || quarter, city].filter(Boolean).join(", ") || j.display_name || "",
  };
  areaCache.set(key, area);
  return area;
}

export async function searchPlaces(q, near, ui, signal) {
  const params = { format: "jsonv2", q, limit: "6", "accept-language": ui };
  if (near) {
    const d = 0.25;
    params.viewbox = `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`;
  }
  const j = await fetchJSON(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`, { signal, timeout: 8000 });
  const rows = (Array.isArray(j) ? j : []).map((r) => ({
    lat: Number(r.lat),
    lon: Number(r.lon),
    name: r.name || (r.display_name || "").split(",")[0],
    detail: (r.display_name || "").split(",").slice(1, 4).join(",").trim(),
  }));
  if (near) rows.sort((a, b) => dist(near, a) - dist(near, b));
  return rows;
}

// ---------- Основной поиск вокруг точки ----------

export async function loadNearby({ center, radius, ui, signal }) {
  const area = await reverseGeocode(center, ui, signal).catch(() => null);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const wikis = wikisFor(area?.cc, ui);
  const tasks = [];
  for (const w of wikis) {
    tasks.push(() => wikiNearest(w, center, radius, signal).then((pages) => ({ w, pages, source: "near" })));
    if (radius >= 300) tasks.push(() => wikiNotable(w, center, radius, signal).then((pages) => ({ w, pages, source: "notable" })));
  }
  const res = await pool(tasks, 6);
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  if (res.every((r) => !r.ok)) throw res[0]?.error || new Error("places failed");
  const map = new Map();
  for (const r of res) if (r.ok) addPages(map, r.value.w, r.value.pages, r.value.source);
  const places = finalize(map, center, radius, ui);
  return { area, wikis, places };
}

// ---------- Дополнение: названия на языке интерфейса и вступления статей ----------

async function addLabels(places, ui, signal) {
  const need = places.filter((p) => p.qid && (!p.titles[ui] || !p.titles.en)).slice(0, 50);
  if (!need.length) return;
  const langs = [...new Set([ui, "en"])];
  const j = await api(
    "www.wikidata.org",
    {
      action: "wbgetentities",
      ids: need.map((p) => p.qid).join("|"),
      props: "labels|sitelinks",
      languages: langs.join("|"),
      sitefilter: langs.map((l) => `${l}wiki`).join("|"),
    },
    signal,
    8000
  );
  for (const p of need) {
    const e = j.entities?.[p.qid];
    if (!e) continue;
    for (const l of langs) {
      const link = e.sitelinks?.[`${l}wiki`]?.title;
      if (link && !p.titles[l]) {
        p.titles[l] = link;
        p.lens[l] = p.lens[l] || 0;
      }
      const label = e.labels?.[l]?.value;
      if (label) p.labels[l] = label;
    }
  }
}

async function addIntros(places, ui, signal) {
  const byLang = new Map();
  for (const p of places) {
    if (p.intro) continue;
    const lang = p.titles[ui] ? ui : p.titles.en ? "en" : Object.keys(p.titles)[0];
    if (!lang) continue;
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(p);
  }
  const tasks = [];
  for (const [lang, list] of byLang) {
    for (let i = 0; i < list.length; i += 20) {
      const chunk = list.slice(i, i + 20);
      tasks.push(async () => {
        const j = await api(
          `${lang}.wikipedia.org`,
          { action: "query", titles: chunk.map((p) => p.titles[lang]).join("|"), prop: "extracts", exintro: "1", explaintext: "1", exchars: "420", exlimit: "20", redirects: "1" },
          signal
        );
        const norm = new Map();
        for (const n of j.query?.normalized || []) norm.set(n.from, n.to);
        for (const r of j.query?.redirects || []) norm.set(r.from, r.to);
        const byTitle = new Map((j.query?.pages || []).map((pg) => [pg.title, pg]));
        for (const p of chunk) {
          let title = p.titles[lang];
          for (let k = 0; k < 3 && norm.has(title); k++) title = norm.get(title);
          const pg = byTitle.get(title);
          const text = (pg?.extract || "").replace(/\s+/g, " ").trim();
          if (text) p.intro = { lang, text };
        }
      });
    }
  }
  await pool(tasks, 4);
}

/** Догружает названия и вступления для лучших мест. Ошибки здесь не страшны: это улучшение, а не основа. */
export async function enrich(places, ui, signal, limit = 36) {
  const top = places.slice(0, limit);
  await addLabels(top, ui, signal).catch(() => {});
  nameAll(places, ui);
  await addIntros(top, ui, signal).catch(() => {});
  return places;
}

// ---------- Мелкие объекты из Викиданных: лавки, статуи, фонтаны, у которых нет статьи ----------

const MINOR_SKIP = ["hotel", "hostel", "guest house", "guesthouse", "apartment", "alojamento", "hospedagem", "отель", "гостиница", "хостел", "metro station", "станция метро", "estação de metro", "bus stop", "tram stop"];

export async function wikidataNear(c, radius, signal) {
  const j = await api(
    "www.wikidata.org",
    { action: "query", list: "geosearch", gscoord: `${c.lat}|${c.lon}`, gsradius: String(clamp(Math.round(radius), 10, 10000)), gslimit: "200" },
    signal,
    9000
  );
  return (j.query?.geosearch || []).map((g) => ({ qid: g.title, lat: g.lat, lon: g.lon }));
}

export async function describeMinors(items, langs, signal) {
  const out = [];
  const tasks = [];
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    tasks.push(async () => {
      const j = await api(
        "www.wikidata.org",
        { action: "wbgetentities", ids: chunk.map((x) => x.qid).join("|"), props: "labels|descriptions", languages: langs.join("|") },
        signal,
        9000
      );
      for (const it of chunk) {
        const e = j.entities?.[it.qid];
        if (!e) continue;
        const pick = (obj) => {
          for (const l of langs) if (obj?.[l]?.value) return obj[l].value;
          return "";
        };
        const name = pick(e.labels);
        const desc = pick(e.descriptions);
        if (!name || /^Q\d+$/.test(name)) continue;
        const low = `${name} ${desc}`.toLowerCase();
        if (MINOR_SKIP.some((w) => low.includes(w))) continue;
        out.push({ ...it, id: it.qid, name, desc, kind: "minor" });
      }
    });
  }
  await pool(tasks, 3);
  return out;
}

export async function loadMinors({ center, radius, exclude, ui, wikis, signal, limit = 60 }) {
  const near = await wikidataNear(center, Math.min(radius, 600), signal);
  const fresh = near
    .filter((x) => !exclude.has(x.qid))
    .map((x) => ({ ...x, dist: dist(center, x), bearing: bearing(center, x) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
  if (!fresh.length) return [];
  const langs = [...new Set([ui, "en", ...wikis])];
  const minors = await describeMinors(fresh, langs, signal);
  return minors.sort((a, b) => a.dist - b.dist);
}

// ---------- Текст статьи для истории ----------

const SKIP_SECTION = /refer|ligações|ver também|see also|external|bibliogra|notes\b|notas|примечани|ссылки|литература|см\. также|galeria|gallery|галерея|further reading|fontes|источники|enlaces|véase|voir aussi|liens|weblinks|einzelnachweise|siehe auch|note\b|collegamenti|voci correlate/i;
const STORY_SECTION = /hist|lend|legend|истори|легенд|curios|trivia|событи|event|origem|origin|происхожд|назван|etimolog|этимолог|toponím|toponim|anecd|mito|myth|geschichte|sage|storia|leggend|histoire|légende|incend|terramoto|earthquake|землетряс|guerra|war\b|войн|revol|револ/i;

/** Убирает из статьи служебные разделы (сноски, ссылки), а если она длиннее бюджета, оставляет вступление и самые "исторические" разделы. */
export function trimArticle(text, budget) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  const re = /^(={2,})\s*(.+?)\s*\1\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(clean))) marks.push({ at: m.index, end: re.lastIndex, title: m[2] });
  if (!marks.length) return clean.slice(0, budget);
  const intro = clean.slice(0, marks[0].at).trim();
  const sections = marks.map((mk, i) => ({
    title: mk.title,
    body: clean.slice(mk.end, i + 1 < marks.length ? marks[i + 1].at : clean.length).trim(),
    order: i,
  }));
  const usable = sections.filter((s) => s.body && !SKIP_SECTION.test(s.title));
  const render = (head, list) => [head, ...list.map((s) => `## ${s.title}\n${s.body}`)].filter(Boolean).join("\n\n");
  const whole = render(intro, usable);
  if (whole.length <= budget) return whole;

  const head = intro.slice(0, Math.floor(budget * 0.3));
  const ranked = [...usable.filter((s) => STORY_SECTION.test(s.title)), ...usable.filter((s) => !STORY_SECTION.test(s.title))];
  const chosen = [];
  let left = budget - head.length;
  for (const s of ranked) {
    if (left < 300) break;
    const piece = s.body.length > left ? s.body.slice(0, left) : s.body;
    chosen.push({ ...s, body: piece });
    left -= piece.length + s.title.length + 8;
  }
  chosen.sort((a, b) => a.order - b.order);
  return render(head, chosen);
}

/** Выбирает самую подробную статью о месте и возвращает её текст. */
export async function fetchArticle(p, ui, signal, budget = 8000) {
  const langs = Object.keys(p.titles);
  if (!langs.length) return null;
  const maxLen = Math.max(0, ...langs.map((l) => p.lens[l] || 0));
  let lang = langs.reduce((best, l) => ((p.lens[l] || 0) > (p.lens[best] || 0) ? l : best), langs[0]);
  if (p.titles[ui] && (p.lens[ui] || 0) >= maxLen * 0.6 && (p.lens[ui] || 0) > 0) lang = ui;
  const tryLang = async (l) => {
    const j = await api(
      `${l}.wikipedia.org`,
      { action: "query", titles: p.titles[l], prop: "extracts", explaintext: "1", exsectionformat: "wiki", exlimit: "1", redirects: "1" },
      signal,
      12000
    );
    const pg = j.query?.pages?.[0];
    const text = (pg?.extract || "").trim();
    if (!text) return null;
    const title = pg.title || p.titles[l];
    return {
      lang: l,
      title,
      url: `https://${l}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      text: trimArticle(text, budget),
    };
  };
  const order = [lang, ...langs.filter((l) => l !== lang).sort((a, b) => (p.lens[b] || 0) - (p.lens[a] || 0))];
  for (const l of order.slice(0, 3)) {
    try {
      const art = await tryLang(l);
      if (art && art.text.length > 200) return art;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return null;
}
