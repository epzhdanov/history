// Главный экран: карта, точка и радиус, темы от AI, запуск историй.

import { h, icon, store, debounce, toast, clear } from "./util.js";
import { t, getLang, setLang, fmtDist } from "./i18n.js";
import { MapView } from "./mapview.js";
import { startLocation, retryLocation, onLocation, lastKnown, isRough, setReloadGuard } from "./location.js";
import { openGeoHelp } from "./geohelp.js";
import { loadNearby, enrich, loadMinors, reverseGeocode, searchPlaces, describe, wikisFor } from "./places.js";
import { fetchRoute, loadAlongRoute, loadMinorsAlongRoute, walkMinutes } from "./route.js";
import { hasKey, suggestTopics, errorText, isAborted } from "./ai.js";
import { openSettings, prefs } from "./settings.js";
import { speaker } from "./speech.js";
import { dist } from "./geo.js";

const RADII = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
const CORRIDORS = [50, 100, 150, 200, 300, 500];
const MINUTES = [1, 2, 3, 5, 7, 10, 15, 20, 30];
const MAX_CANDIDATES = 36;
const MAX_MINORS = 40;

const newData = () => ({
  key: "",
  center: null,
  state: "idle", // idle | loading | ready | error
  places: [],
  cands: [],
  minors: [],
  topics: [],
  topicsState: "idle", // idle | loading | ready | empty | error | nokey
  topicsKey: "",
  topicsError: "",
  selected: new Set(),
});

/** Лучшие места для AI: самые интересные плюс несколько ближайших, чтобы не упустить то, что прямо перед глазами. */
function pickCandidates(places, n, nearestKey = "dist") {
  const top = places.slice(0, Math.max(0, n - 8));
  const seen = new Set(top);
  const nearest = [...places].filter((p) => !seen.has(p) && !p.broad).sort((a, b) => a[nearestKey] - b[nearestKey]);
  return [...top, ...nearest.slice(0, n - top.length)];
}

export function mountHome(root, { onGenerate }) {
  const S = {
    ui: getLang(),
    audience: store.get("audience", "adult"),
    voice: store.get("voiceMode", true),
    tab: "nearby",
    radiusIdx: store.get("radiusIdx", 3),
    corridorIdx: store.get("corridorIdx", 1),
    minutesIdx: store.get("minutesIdx", 3),
    gps: null,
    gpsStatus: "idle",
    gpsSlow: false,
    gpsSilent: false,
    manual: null,
    area: null,
    wikis: ["en"],
    dest: null,
    route: null,
    routeState: "idle", // idle | loading | ready
    interest: "",
    picking: false,
    results: null,
    searching: false,
    whereResults: null,
    whereSearching: false,
    active: true,
  };
  const data = { nearby: newData(), route: newData() };
  const ac = { nearby: null, route: null, topics: null, search: null, where: null };
  const el = {};

  // Примерная геопозиция (точность в километрах) для поиска "что рядом" не годится.
  const usable = () => (S.gps && !isRough(S.gps) ? S.gps : null);
  const center = () => S.manual || usable();
  // Место не определилось: человеку нужно дать указать его самому. Раз показав поиск места,
  // не прячем его при повторных попытках, иначе поле исчезало бы прямо во время набора.
  const stuck = () => {
    if (center()) return (S.wasStuck = false);
    if (S.gpsSlow || !["idle", "asking"].includes(S.gpsStatus)) S.wasStuck = true;
    return !!S.wasStuck;
  };
  const radius = () => RADII[S.radiusIdx];
  const corridor = () => CORRIDORS[S.corridorIdx];

  // ---------- Каркас ----------
  const mapEl = h("div", { class: "map", id: "map" });
  const top = h("header", { class: "topbar" });
  const tools = h("div", { class: "map-tools" });
  const plaque = h("div", { class: "plaque here", role: "status", "aria-live": "polite" });
  const pickBanner = h("div", { class: "pick-banner", hidden: true });
  const panel = h("div", { class: "panel" });
  const ctaBar = h("div", { class: "cta-bar" });
  const view = h("section", { class: "view home", id: "home" }, h("div", { class: "map-wrap" }, mapEl, top, tools, pickBanner, plaque), panel, ctaBar);
  root.append(view);

  const start = lastKnown();
  const map = new MapView(mapEl, { ...(start ? { center: start, zoom: 15 } : {}), pad: { top: 66, bottom: 44, side: 14 } });

  map.onClick((p) => {
    if (stuck()) return setManual(p);
    if (S.tab === "route") return setDest({ ...p, name: "" });
    if (S.picking) setManual(p);
  });
  map.onHold((p) => {
    if (S.tab === "route" && center()) return setDest({ ...p, name: "" });
    // Долгое нажатие легко сделать случайно, поэтому говорим вслух, что точка теперь выбрана вручную.
    const hadGps = !!usable();
    setManual(p);
    if (hadGps) toast(t("home.manualSet"), 5000);
  });

  // ---------- Мелкие строительные блоки ----------
  function seg(options, value, onPick, label, cls = "") {
    const wrap = h("div", { class: `seg ${cls}`.trim(), role: "group", "aria-label": label });
    const btns = options.map(([id, text, ic]) => [
      id,
      h(
        "button",
        {
          type: "button",
          class: "seg-btn",
          "aria-pressed": String(id === value),
          onclick: () => {
            set(id);
            onPick(id);
          },
        },
        ic ? icon(ic, 18) : null,
        h("span", null, text)
      ),
    ]);
    function set(v) {
      for (const [id, b] of btns) b.setAttribute("aria-pressed", String(id === v));
    }
    wrap.append(...btns.map((x) => x[1]));
    return { el: wrap, set };
  }

  function slider({ id, label, values, index, format, onInput, onChange }) {
    const out = h("output", { class: "range-val", for: id }, format(values[index]));
    const input = h("input", { id, type: "range", min: "0", max: String(values.length - 1), step: "1", value: String(index), "aria-valuetext": format(values[index]) });
    const paint = () => input.style.setProperty("--p", `${(Number(input.value) / (values.length - 1)) * 100}%`);
    paint();
    input.addEventListener("input", () => {
      const i = Number(input.value);
      out.textContent = format(values[i]);
      input.setAttribute("aria-valuetext", format(values[i]));
      paint();
      onInput?.(i);
    });
    input.addEventListener("change", () => onChange?.(Number(input.value)));
    return { el: h("div", { class: "slider" }, h("label", { class: "range-head", for: id }, h("span", null, label), out), input) };
  }

  // ---------- Верх карты ----------
  function buildTop() {
    clear(top);
    const langBtn = (code) =>
      h("button", { type: "button", class: "lang-btn", "aria-pressed": String(S.ui === code), "aria-label": code === "ru" ? "Русский" : "English", onclick: () => setUi(code) }, code.toUpperCase());
    top.append(
      h("h1", { class: "brand" }, t("app.title")),
      h("div", { class: "lang", role: "group", "aria-label": t("set.lang") }, langBtn("ru"), langBtn("en")),
      h("button", { type: "button", class: "icon-btn", "aria-label": t("set.title"), onclick: () => openSettings({ onClose: afterSettings }) }, icon("settings"))
    );
    clear(tools);
    el.pickBtn = h("button", { type: "button", class: "icon-btn", "aria-label": t("home.pick"), "aria-pressed": String(S.picking), onclick: () => setPicking(!S.picking) }, icon("pin"));
    tools.append(
      h(
        "button",
        {
          type: "button",
          class: "icon-btn",
          "aria-label": t("home.locate"),
          onclick: () => {
            if (S.manual) return clearManual();
            if (S.gpsStatus === "denied") return openHelp();
            if (usable()) updMap(true);
            startLocation();
          },
        },
        icon("locate")
      ),
      el.pickBtn
    );
  }

  function updPicking() {
    const self = stuck();
    el.pickBtn?.setAttribute("aria-pressed", String(S.picking));
    map.setPicking(S.picking || self || S.tab === "route");
    pickBanner.hidden = !(S.picking || self);
    pickBanner.textContent = self ? t("home.pickSelf") : S.picking ? t("home.pickHint") : "";
  }

  function setPicking(on) {
    S.picking = on && S.tab === "nearby";
    updPicking();
  }

  function openHelp() {
    openGeoHelp({ onPick: pickManually });
  }

  /** Человек хочет указать место сам: если места ещё нет, ведём к поиску по названию, иначе включаем выбор на карте. */
  function pickManually() {
    if (center()) return setPicking(true);
    updWhere();
    const input = el.whereBox?.querySelector("input");
    el.whereBox?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
  }

  // ---------- Табличка "где я" ----------
  function plaqueActions(...buttons) {
    return h(
      "div",
      { class: "plaque-actions" },
      buttons.filter(Boolean).map(([label, fn, alt]) => h("button", { type: "button", class: alt ? "plaque-btn alt" : "plaque-btn", onclick: fn }, label))
    );
  }

  function updPlaque() {
    clear(plaque);
    plaque.classList.remove("warn");
    const c = center();
    if (!c) {
      const st = S.gpsStatus;
      const say = (text, warn, ...buttons) => {
        plaque.classList.toggle("warn", warn);
        plaque.append(h("span", { class: "plaque-text" }, text), plaqueActions(...buttons));
      };
      const pick = [t("home.geoPick"), pickManually, true];
      if (S.gps && isRough(S.gps)) say(t("home.geoRough", { dist: fmtDist(S.gps.acc) }), true, [t("home.geoFix"), openHelp], pick);
      else if (st === "denied") say(t(S.gpsSilent ? "home.geoDeniedSilent" : "home.geoDenied"), true, [t("home.geoHow"), openHelp], pick);
      else if (st === "unavailable" || st === "timeout") say(t("home.geoFailed"), true, [t("home.geoAgain"), () => retryLocation()], pick, [t("home.geoWhat"), openHelp, true]);
      else if (st === "insecure") say(t("home.geoInsecure"), true, pick);
      else if (st === "unsupported") say(t("home.geoUnsupported"), true, pick);
      else if (S.gpsSlow) say(t("home.geoSlow"), false, [t("home.geoAgain"), () => retryLocation()], pick, [t("home.geoWhat"), openHelp, true]);
      else plaque.append(h("span", { class: "plaque-text" }, h("span", { class: "dots" }, t("home.locating"))));
      return;
    }
    const name = S.area?.road || S.area?.quarter || S.area?.city || t("home.unknownPlace");
    const sub = S.area ? [S.area.road ? S.area.quarter : "", S.area.city].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i && x !== name).join(", ") : "";
    plaque.append(h("strong", { class: "plaque-name" }, name));
    if (sub) plaque.append(h("span", { class: "plaque-sub" }, sub));
    if (S.manual) {
      plaque.append(h("button", { type: "button", class: "plaque-link", onclick: clearManual }, t("home.backToMe")));
    } else if (S.gps?.acc > 60) {
      plaque.append(h("span", { class: "plaque-sub" }, t("home.accuracy", { m: Math.round(S.gps.acc / 10) * 10 })));
    }
  }

  // ---------- "Где вы сейчас": поиск места по названию, когда телефон его не определил ----------
  function updWhere() {
    const box = el.whereBox;
    if (!box) return;
    const show = stuck();
    box.hidden = !show;
    updPicking();
    if (!show) {
      if (box.firstChild) clear(box);
      S.whereResults = null;
      return;
    }
    // Поле ввода не пересоздаём, пока человек в нём печатает.
    let form = box.querySelector("form");
    if (!form) {
      const input = h("input", { type: "search", id: "where-q", placeholder: t("where.placeholder"), autocomplete: "off", enterkeyhint: "search", "aria-label": t("where.placeholder") });
      form = h(
        "form",
        {
          class: "search",
          onsubmit: (e) => {
            e.preventDefault();
            searchWhere(input.value.trim());
            input.blur();
          },
        },
        input,
        h("button", { type: "submit", class: "icon-btn solid", "aria-label": t("route.search") }, icon("search", 20))
      );
      box.append(h("h2", { class: "where-title" }, t("where.label")), form, h("div", { class: "where-out" }));
    }
    const out = box.querySelector(".where-out");
    clear(out);
    if (S.whereSearching) out.append(h("p", { class: "hint dots" }, t("where.searching")));
    else if (S.whereResults && !S.whereResults.length) out.append(h("p", { class: "hint" }, t("route.notFound")));
    else if (S.whereResults?.length) {
      const list = h("ul", { class: "results" });
      for (const r of S.whereResults) {
        list.append(h("li", null, h("button", { type: "button", onclick: () => setManual({ lat: r.lat, lon: r.lon }) }, h("strong", null, r.name), h("span", null, r.detail))));
      }
      out.append(list);
    } else out.append(h("p", { class: "hint" }, t("where.hint")));
  }

  async function searchWhere(q) {
    if (!q) return;
    ac.where?.abort();
    const ctl = (ac.where = new AbortController());
    S.whereSearching = true;
    S.whereResults = null;
    updWhere();
    try {
      S.whereResults = (await searchPlaces(q, S.gps || lastKnown(), S.ui, ctl.signal)).slice(0, 5);
    } catch {
      if (ctl.signal.aborted) return;
      S.whereResults = [];
    }
    S.whereSearching = false;
    updWhere();
  }

  // ---------- Панель ----------
  function buildPanel() {
    clear(panel);
    el.tabs = seg(
      [
        ["nearby", t("tab.nearby"), "locate"],
        ["route", t("tab.route"), "route"],
      ],
      S.tab,
      setTab,
      t("tab.nearby"),
      "tabs"
    );
    el.whereBox = h("div", { class: "where-box", hidden: true });
    el.routeBox = h("div", { class: "route-box" });
    el.aud = seg(
      [
        ["adult", t("aud.adult")],
        ["kids", t("aud.kids")],
      ],
      S.audience,
      setAudience,
      t("aud.label")
    );
    el.mode = seg(
      [
        ["voice", t("mode.voice")],
        ["text", t("mode.text")],
      ],
      S.voice ? "voice" : "text",
      (v) => {
        S.voice = v === "voice";
        store.set("voiceMode", S.voice);
      },
      t("mode.label")
    );
    el.radius = slider({
      id: "radius",
      label: t("radius.label"),
      values: RADII,
      index: S.radiusIdx,
      format: fmtDist,
      onInput: (i) => {
        S.radiusIdx = i;
        if (center()) map.setArea(center(), radius(), { manual: !!S.manual, fit: true });
      },
      onChange: (i) => {
        store.set("radiusIdx", i);
        scheduleRefresh();
      },
    });
    el.corridor = slider({
      id: "corridor",
      label: t("corridor.label"),
      values: CORRIDORS,
      index: S.corridorIdx,
      format: fmtDist,
      onInput: (i) => (S.corridorIdx = i),
      onChange: (i) => {
        store.set("corridorIdx", i);
        scheduleRefresh();
      },
    });
    el.minutes = slider({
      id: "minutes",
      label: t("minutes.label"),
      values: MINUTES,
      index: S.minutesIdx,
      format: (n) => t("minutes.value", { n }),
      onInput: (i) => (S.minutesIdx = i),
      onChange: (i) => store.set("minutesIdx", i),
    });
    el.topics = h("div", { class: "topics" });
    panel.append(el.whereBox, el.tabs.el, el.routeBox, h("div", { class: "duo" }, el.aud.el, el.mode.el), h("div", { class: "duo" }, el.radius.el, el.corridor.el, el.minutes.el), el.topics);
    updWhere();
    updTabParts();
    updRouteBox();
    updTopics();
  }

  function updTabParts() {
    const route = S.tab === "route";
    el.routeBox.hidden = !route;
    el.radius.el.hidden = route;
    el.corridor.el.hidden = !route;
    if (el.pickBtn) el.pickBtn.hidden = route;
    view.dataset.tab = S.tab;
  }

  // ---------- Маршрут: поиск и сводка ----------
  function updRouteBox() {
    const box = el.routeBox;
    clear(box);
    if (S.dest) {
      const line = S.routeState === "loading" || !S.route ? h("span", { class: "dots" }, t("route.building")) : t("route.summary", { dist: fmtDist(S.route.distance), min: walkMinutes(S.route.distance) }) + (S.route.exact ? "" : `, ${t("route.straight")}`);
      box.append(
        h(
          "div",
          { class: "route-sum" },
          h("span", { class: "route-flag" }, icon("route", 20)),
          h("div", { class: "route-text" }, h("strong", null, S.dest.name || t("route.dest")), h("span", null, line)),
          h("button", { type: "button", class: "icon-btn ghost", "aria-label": t("route.clear"), onclick: clearDest }, icon("close", 20))
        )
      );
      return;
    }
    const input = h("input", { type: "search", id: "dest-q", placeholder: t("route.placeholder"), autocomplete: "off", enterkeyhint: "search", "aria-label": t("route.placeholder") });
    const form = h(
      "form",
      {
        class: "search",
        onsubmit: (e) => {
          e.preventDefault();
          search(input.value.trim());
          input.blur();
        },
      },
      input,
      h("button", { type: "submit", class: "icon-btn solid", "aria-label": t("route.search") }, icon("search", 20))
    );
    box.append(form);
    if (S.searching) box.append(h("p", { class: "hint dots" }, t("route.building")));
    else if (S.results && !S.results.length) box.append(h("p", { class: "hint" }, t("route.notFound")));
    else if (S.results?.length) {
      const list = h("ul", { class: "results" });
      for (const r of S.results) {
        const far = center() ? fmtDist(dist(center(), r)) : "";
        list.append(h("li", null, h("button", { type: "button", onclick: () => setDest({ lat: r.lat, lon: r.lon, name: r.name }) }, h("strong", null, r.name), h("span", null, [far, r.detail].filter(Boolean).join(", ")))));
      }
      box.append(list);
    } else box.append(h("p", { class: "hint" }, t("route.orMap")));
  }

  async function search(q) {
    if (!q) return;
    ac.search?.abort();
    const ctl = (ac.search = new AbortController());
    S.searching = true;
    S.results = null;
    updRouteBox();
    try {
      S.results = (await searchPlaces(q, center(), S.ui, ctl.signal)).slice(0, 5);
    } catch {
      if (ctl.signal.aborted) return;
      S.results = [];
    }
    S.searching = false;
    updRouteBox();
  }

  function setDest(dest) {
    const c = center();
    if (!c) return toast(t("cta.needLocation"));
    const far = dist(c, dest);
    if (far > 25000) return toast(t("route.tooFar", { dist: fmtDist(far) }));
    if (far < 15) return;
    S.dest = dest;
    S.results = null;
    S.route = null;
    if (!dest.name) {
      reverseGeocode(dest, S.ui)
        .then((a) => {
          if (S.dest === dest && a?.label) {
            dest.name = a.label;
            updRouteBox();
          }
        })
        .catch(() => {});
    }
    refreshRoute(true);
  }

  function clearDest() {
    ac.route?.abort();
    S.dest = null;
    S.route = null;
    S.routeState = "idle";
    data.route = newData();
    updRouteBox();
    updTopics();
    updCTA();
    updMap(false);
  }

  // ---------- Темы ----------
  function updTopics() {
    const box = el.topics;
    if (!box) return;
    clear(box);
    const d = data[S.tab];
    const count =
      d.state === "ready" && d.places.length
        ? t(S.tab === "route" ? "places.foundRoute" : "places.found", { n: d.places.length })
        : d.state === "loading"
          ? h("span", { class: "dots" }, t("places.searching"))
          : "";
    box.append(h("div", { class: "topics-head" }, h("h2", null, t("topics.label")), count ? h("span", { class: "count" }, count) : null));

    if (!center()) return void box.append(h("p", { class: "hint" }, t("topics.needPlace")));
    if (S.tab === "route" && !S.dest) return void box.append(h("p", { class: "hint" }, t("home.pickDestHint")));
    if (d.state === "error") {
      return void box.append(h("div", { class: "note bad" }, h("p", null, t("places.failed")), h("button", { type: "button", class: "btn", onclick: () => refresh(true) }, t("places.retry"))));
    }
    if (d.state === "ready" && !d.cands.length) return void box.append(h("p", { class: "note" }, t(S.tab === "route" ? "places.noneRoute" : "places.none")));

    if (!hasKey()) {
      box.append(
        h("div", { class: "note key" }, h("p", null, t("key.need")), h("button", { type: "button", class: "btn primary", onclick: () => openSettings({ focusKey: true, onClose: afterSettings }) }, icon("key", 18), t("key.add")))
      );
      return;
    }

    if (d.state === "loading" || d.topicsState === "loading" || (d.state === "ready" && d.topicsState === "idle")) {
      box.append(h("p", { class: "hint dots" }, t("topics.loading")), h("div", { class: "topic-list", "aria-hidden": "true" }, h("div", { class: "topic ghost" }), h("div", { class: "topic ghost" }), h("div", { class: "topic ghost" })));
    } else if (d.topicsState === "error") {
      box.append(h("div", { class: "note bad" }, h("p", null, `${t("topics.failed")} ${d.topicsError}`), h("button", { type: "button", class: "btn", onclick: () => loadTopics(S.tab, true) }, t("topics.retry"))));
    } else if (d.topics.length) {
      const list = h("div", { class: "topic-list" });
      d.topics.forEach((topic, i) => {
        const on = d.selected.has(i);
        list.append(
          h(
            "button",
            {
              type: "button",
              class: "topic",
              "aria-pressed": String(on),
              onclick: (e) => {
                if (d.selected.has(i)) d.selected.delete(i);
                else d.selected.add(i);
                e.currentTarget.setAttribute("aria-pressed", String(d.selected.has(i)));
              },
            },
            h("span", { class: "topic-emoji", "aria-hidden": "true" }, topic.emoji || "•"),
            h("span", { class: "topic-text" }, h("strong", null, topic.title), topic.hint ? h("span", null, topic.hint) : null),
            h("span", { class: "topic-check", "aria-hidden": "true" }, icon("check", 18))
          )
        );
      });
      box.append(list, h("p", { class: "hint" }, t("topics.hint")));
    }

    const own = h("input", { type: "text", id: "interest", value: S.interest, placeholder: t("topics.custom"), "aria-label": t("topics.customLabel"), maxlength: "140", enterkeyhint: "done", oninput: () => (S.interest = own.value) });
    own.addEventListener("keydown", (e) => e.key === "Enter" && own.blur());
    box.append(h("div", { class: "own" }, icon("plus", 18), own));
  }

  // ---------- Кнопка запуска ----------
  function buildCTA() {
    clear(ctaBar);
    el.cta = h("button", { type: "button", class: "cta", onclick: generate }, h("span", { class: "cta-label" }, t("cta.generate")));
    ctaBar.append(el.cta);
    updCTA();
  }

  function updCTA() {
    if (!el.cta) return;
    const d = data[S.tab];
    const busy = d.state === "loading" || (S.tab === "route" && S.routeState === "loading");
    el.cta.classList.toggle("busy", busy);
    el.cta.disabled = busy;
  }

  // ---------- Карта ----------
  function updMap(fit) {
    const c = center();
    const d = data[S.tab];
    map.setYou(S.gps, S.gps?.acc);
    if (S.tab === "nearby") {
      map.setRoute(null, null);
      if (c) map.setArea(c, radius(), { manual: !!S.manual, fit });
      else map.clearArea();
    } else {
      if (c) map.setArea(c, 0, { manual: !!S.manual, fit: false });
      map.setRoute(S.route?.coords, S.dest, { fit: fit && !!S.route });
      if (fit && !S.route && c) map.panTo(c, 16);
    }
    map.setPlaces(d.places.slice(0, 60), { minors: d.minors });
  }

  // ---------- Загрузка мест ----------
  function decorate(d) {
    d.cands.forEach((p, i) => (p.ref = `P${i + 1}`));
    d.minors.forEach((m, i) => (m.ref = `M${i + 1}`));
    for (const p of d.places) p.descText = describe(p, S.ui);
  }

  const scheduleRefresh = debounce(() => refresh(false), 450);

  function refresh(force) {
    if (S.tab === "route") return refreshRoute(force);
    return refreshNearby(force);
  }

  async function refreshNearby(force) {
    const c = center();
    if (!c) return;
    const d = data.nearby;
    const key = [c.lat.toFixed(5), c.lon.toFixed(5), radius(), S.ui].join("|");
    if (!force && d.key === key && d.state !== "error") return;
    ac.nearby?.abort();
    ac.topics?.abort();
    const ctl = (ac.nearby = new AbortController());
    Object.assign(d, newData(), { key, center: { lat: c.lat, lon: c.lon, acc: S.manual ? 0 : c.acc || 0 }, state: "loading" });
    updTopics();
    updCTA();
    updMap(false);
    try {
      const res = await loadNearby({ center: c, radius: radius(), ui: S.ui, signal: ctl.signal });
      if (ctl.signal.aborted) return;
      S.area = res.area;
      S.wikis = res.wikis;
      d.places = res.places;
      d.cands = pickCandidates(res.places, MAX_CANDIDATES);
      d.state = "ready";
      decorate(d);
      updPlaque();
      updMap(false);
      updTopics();
      updCTA();
      // Пока грузились места, телефон мог уточнить положение: тогда ищем заново, не тратя запрос на темы.
      if (recentre()) return;
      if (!d.cands.length) return;

      // Мелкие объекты догружаются сами по себе и не задерживают темы.
      if (radius() <= 2000) {
        loadMinors({ center: c, radius: radius(), exclude: new Set(res.places.map((p) => p.qid).filter(Boolean)), ui: S.ui, wikis: res.wikis, signal: ctl.signal })
          .then((minors) => {
            if (ctl.signal.aborted) return;
            d.minors = minors.slice(0, MAX_MINORS);
            decorate(d);
            if (S.tab === "nearby") updMap(false);
          })
          .catch(() => {});
      }
      await enrich(d.cands, S.ui, ctl.signal);
      if (ctl.signal.aborted) return;
      decorate(d);
      updMap(false);
      loadTopics("nearby");
    } catch (e) {
      if (ctl.signal.aborted) return;
      d.state = "error";
      updTopics();
      updCTA();
    }
  }

  async function refreshRoute(force) {
    const c = center();
    if (!c || !S.dest) return;
    const d = data.route;
    const key = [c.lat.toFixed(5), c.lon.toFixed(5), S.dest.lat.toFixed(5), S.dest.lon.toFixed(5), corridor(), S.ui].join("|");
    if (!force && d.key === key && d.state !== "error") return;
    ac.route?.abort();
    ac.topics?.abort();
    const ctl = (ac.route = new AbortController());
    Object.assign(d, newData(), { key, center: { lat: c.lat, lon: c.lon }, state: "loading" });
    const sameRoute = S.route && S.route.key === key.split("|").slice(0, 4).join("|");
    if (!sameRoute) {
      S.route = null;
      S.routeState = "loading";
    }
    updRouteBox();
    updTopics();
    updCTA();
    updMap(false);
    try {
      if (!sameRoute) {
        const route = await fetchRoute(c, S.dest, ctl.signal);
        if (ctl.signal.aborted) return;
        route.key = key.split("|").slice(0, 4).join("|");
        route.from = { lat: c.lat, lon: c.lon };
        S.route = route;
        S.routeState = "ready";
        updRouteBox();
        updMap(true);
      }
      const area = await reverseGeocode(c, S.ui, ctl.signal).catch(() => S.area);
      if (ctl.signal.aborted) return;
      S.area = area || S.area;
      S.wikis = wikisFor(S.area?.cc, S.ui);
      updPlaque();
      const res = await loadAlongRoute({ route: S.route, corridor: corridor(), wikis: S.wikis, ui: S.ui, signal: ctl.signal });
      if (ctl.signal.aborted) return;
      d.places = res.places;
      d.cands = pickCandidates(res.places, MAX_CANDIDATES, "offset").sort((a, b) => a.along - b.along);
      d.state = "ready";
      decorate(d);
      updMap(false);
      updTopics();
      updCTA();
      if (!d.cands.length) return;

      loadMinorsAlongRoute({ route: S.route, corridor: corridor(), exclude: new Set(res.places.map((p) => p.qid).filter(Boolean)), ui: S.ui, wikis: S.wikis, samples: res.samples, reach: res.reach, signal: ctl.signal })
        .then((minors) => {
          if (ctl.signal.aborted) return;
          d.minors = minors.slice(0, MAX_MINORS);
          decorate(d);
          if (S.tab === "route") updMap(false);
        })
        .catch(() => {});
      await enrich(d.cands, S.ui, ctl.signal);
      if (ctl.signal.aborted) return;
      decorate(d);
      updMap(false);
      loadTopics("route");
    } catch (e) {
      if (ctl.signal.aborted) return;
      d.state = "error";
      S.routeState = S.route ? "ready" : "idle";
      updRouteBox();
      updTopics();
      updCTA();
    }
  }

  function buildCtx(tab) {
    const d = data[tab];
    return {
      ui: S.ui,
      audience: S.audience,
      voice: S.voice,
      mode: tab,
      area: S.area,
      center: { ...center() },
      radius: tab === "route" ? corridor() : radius(),
      route: tab === "route" && S.route ? { distance: S.route.distance, duration: S.route.duration, streets: S.route.streets, coords: S.route.coords, exact: S.route.exact, destName: S.dest?.name || "", dest: S.dest } : null,
      places: d.cands,
      minors: d.minors,
      wikis: S.wikis,
    };
  }

  async function loadTopics(tab, force) {
    const d = data[tab];
    if (d.state !== "ready" || !d.cands.length) return;
    if (!hasKey()) {
      d.topicsState = "nokey";
      return updTopics();
    }
    const key = `${d.key}|${S.audience}`;
    if (!force && d.topicsKey === key && (d.topicsState === "ready" || d.topicsState === "loading")) return;
    ac.topics?.abort();
    const ctl = (ac.topics = new AbortController());
    Object.assign(d, { topicsKey: key, topicsState: "loading", topics: [], selected: new Set(), topicsError: "" });
    if (tab === S.tab) updTopics();
    try {
      const topics = await suggestTopics(buildCtx(tab), ctl.signal);
      if (ctl.signal.aborted) return;
      d.topics = topics;
      d.topicsState = topics.length ? "ready" : "empty";
    } catch (e) {
      if (isAborted(e) || ctl.signal.aborted) return;
      d.topicsState = "error";
      d.topicsError = errorText(e);
    }
    if (tab === S.tab) updTopics();
  }

  const scheduleTopics = debounce(() => loadTopics(S.tab), 500);

  // ---------- Действия ----------
  function setTab(tab) {
    S.tab = tab;
    setPicking(false);
    updTabParts();
    updRouteBox();
    updTopics();
    updCTA();
    updMap(true);
    refresh(false);
    if (data[tab].state === "ready") loadTopics(tab);
  }

  function setAudience(a) {
    S.audience = a;
    store.set("audience", a);
    document.body.dataset.aud = a;
    for (const d of Object.values(data)) if (d.topicsState !== "loading") d.topicsState = d.state === "ready" ? "idle" : d.topicsState;
    updTopics();
    scheduleTopics();
  }

  function setUi(lang) {
    if (lang === S.ui) return;
    S.ui = lang;
    setLang(lang);
    store.set("lang", lang);
    document.title = t("app.title");
    S.area = null;
    S.results = null;
    data.nearby = newData();
    data.route = newData();
    S.route = null;
    S.routeState = S.dest ? "loading" : "idle";
    buildTop();
    buildPanel();
    buildCTA();
    setPicking(false);
    updPlaque();
    updMap(false);
    refresh(true);
  }

  function setManual(p) {
    S.manual = { lat: p.lat, lon: p.lon };
    S.whereResults = null;
    setPicking(false);
    S.area = null;
    updPlaque();
    updWhere();
    updMap(true);
    refresh(true);
  }

  function clearManual() {
    S.manual = null;
    S.area = null;
    updPlaque();
    updWhere();
    if (usable()) {
      updMap(true);
      refresh(true);
    } else {
      map.clearArea();
      updTopics();
      startLocation();
    }
  }

  function afterSettings() {
    updTopics();
    updCTA();
    for (const tab of ["nearby", "route"]) {
      const d = data[tab];
      if (hasKey() && d.state === "ready" && ["nokey", "idle", "error"].includes(d.topicsState)) loadTopics(tab, true);
    }
  }

  function generate() {
    const tab = S.tab;
    const d = data[tab];
    if (!center()) {
      toast(t("cta.needLocation"));
      return pickManually();
    }
    if (tab === "route" && !S.route) return toast(t("route.needDest"));
    if (!hasKey()) return openSettings({ focusKey: true, onClose: afterSettings });
    if (d.state === "loading") return;
    if (d.state === "error" || d.state === "idle") return refresh(true);
    if (!d.cands.length) return toast(t(tab === "route" ? "places.noneRoute" : "places.none"));
    if (S.voice && speaker.supported) {
      // Звук включаем сразу, в обработчике нажатия: позже, после ответа сети, телефон уже не разрешит.
      // Заодно говорим короткую фразу как отклик (кроме сервисов, где на счету каждый запрос).
      if (speaker.frugal) speaker.unlock();
      else speaker.say(t(S.audience === "kids" ? "say.startKids" : "say.start"), { lang: S.ui, rate: prefs.rate, kids: S.audience === "kids" });
    }
    onGenerate({
      ...buildCtx(tab),
      minutes: MINUTES[S.minutesIdx],
      topics: [...d.selected].sort().map((i) => d.topics[i]).filter(Boolean),
      interest: S.interest.trim(),
    });
  }

  // ---------- Геолокация ----------
  let settle = null; // короткое ожидание более точного замера перед первой загрузкой мест

  /**
   * Места загружены вокруг прежнего или грубого замера, а человек на самом деле в другой точке:
   * тогда ищем заново. Возвращает true, если новый поиск назначен.
   */
  function recentre() {
    if (!S.active || S.manual) return false;
    const pos = usable();
    const d = data[S.tab];
    // Пока человек выбирает темы или пишет свой интерес, список под рукой не меняем.
    if (!pos || d.selected.size || S.interest.trim() || d.state === "loading") return false;
    if (S.tab === "nearby") {
      if (!d.center) return false;
      const moved = dist(d.center, pos);
      const walked = moved > Math.max(60, radius() * 0.4) && pos.acc < 120;
      const sharper = (d.center.acc || 0) > 150 && pos.acc < d.center.acc * 0.5 && moved > Math.max(40, pos.acc);
      if (!walked && !sharper) return false;
      map.setArea(pos, radius(), { fit: false });
      scheduleRefresh();
      return true;
    }
    if (S.route?.from && dist(S.route.from, pos) > 120 && pos.acc < 120) {
      scheduleRefresh();
      return true;
    }
    return false;
  }

  onLocation(({ pos, status, slow, silent }) => {
    const had = !!center();
    S.gpsStatus = status;
    S.gpsSlow = slow;
    S.gpsSilent = silent;
    if (pos) S.gps = pos;
    map.setYou(S.gps, S.gps?.acc);
    if (S.manual) return updPlaque();
    const c = center();
    if (!c) {
      // Места нет или оно слишком грубое: говорим, что случилось, и даём указать место самому.
      if (S.gps && !S.roughShown) {
        S.roughShown = true;
        map.showCircle(S.gps, S.gps.acc);
      }
      updPlaque();
      updWhere();
      updTopics();
      return;
    }
    if (!had) {
      updPlaque();
      updWhere();
      updMap(true);
      clearTimeout(settle);
      settle = null;
      // Первый замер бывает грубым (по сети). Даём телефону пару секунд на уточнение, чтобы не искать места дважды.
      if (c.acc <= 150) return refresh(false);
      settle = setTimeout(() => {
        settle = null;
        refresh(false);
      }, 2500);
      return;
    }
    if (settle) {
      if (c.acc > 150) return;
      clearTimeout(settle);
      settle = null;
      updMap(true);
      return refresh(false);
    }
    recentre();
  });

  // ---------- Запуск ----------
  // Вернувшись из настроек телефона с открытым доступом, страница перезагружается сама, но только пока терять нечего:
  // место не выбрано вручную, истории не идут, в поиске места ничего не набрано.
  setReloadGuard(() => S.active && !S.manual && !el.whereBox?.querySelector("input")?.value);
  // Высота таблички нужна стилям: над ней должны оставаться подпись карты и кнопки.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => view.style.setProperty("--plaque-h", `${plaque.offsetHeight}px`)).observe(plaque);
  }
  document.body.dataset.aud = S.audience;
  buildTop();
  buildPanel();
  buildCTA();
  updPlaque();
  startLocation();

  return {
    show() {
      S.active = true;
      view.hidden = false;
      map.refresh();
      updTopics();
      updCTA();
    },
    hide() {
      S.active = false;
      view.hidden = true;
    },
  };
}
