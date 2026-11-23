// Экран историй: план, рассказ (голосом и текстом), вопросы после историй, разговор со слушателем.

import { h, icon, clear, toast, sleep, plain, clamp, store } from "./util.js";
import { t, fmtDist, compassWord } from "./i18n.js";
import { MapView } from "./mapview.js";
import { onLocation } from "./location.js";
import { fetchArticle } from "./places.js";
import { walkMinutes } from "./route.js";
import { planStories, tellStory, makeQuiz, checkAnswer, answer, errorText, isAborted } from "./ai.js";
import { speaker, listener, SentenceBuffer } from "./speech.js";
import { prefs } from "./settings.js";

// Слов в минуту при чтении вслух (русские слова длиннее, детям читаем медленнее).
const WPM = { ru: { adult: 125, kids: 105 }, en: { adult: 150, kids: 125 } };
const ORDINALS = { ru: ["Первый вариант", "Второй", "Третий", "Четвёртый"], en: ["First option", "Second", "Third", "Fourth"] };

/** Сколько историй и какой длины уложится в заданные минуты. */
export function budget({ ui, audience, voice, minutes }) {
  const kids = audience === "kids";
  const wpm = WPM[ui === "en" ? "en" : "ru"][kids ? "kids" : "adult"] * (voice || kids ? 1 : 1.3);
  const count = clamp(Math.round(minutes / (kids ? 1.5 : 2.2)), 1, kids ? 12 : 10);
  return { total: minutes * wpm, count, min: kids ? 60 : 100, max: kids ? 190 : 430 };
}

const wordsEach = (b, n) => clamp(Math.round(b.total / Math.max(1, n) / 10) * 10, b.min, b.max);

class Session {
  constructor(root, cfg, onExit) {
    this.cfg = cfg;
    this.onExit = onExit;
    this.ui = cfg.ui;
    this.kids = cfg.audience === "kids";
    this.voiceOn = !!cfg.voice && speaker.supported;
    this.rate = prefs.rate * (this.kids ? 0.93 : 1);
    this.quizMode = prefs.quiz(cfg.audience);
    this.budget = budget(cfg);
    this.ctx = { ui: cfg.ui, audience: cfg.audience, voice: this.voiceOn, mode: cfg.mode, area: cfg.area, center: cfg.center, radius: cfg.radius, route: cfg.route, places: cfg.places, minors: cfg.minors, wikis: cfg.wikis };
    this.stories = [];
    this.cursor = -1;
    this.turn = 0;
    this.chat = [];
    this.ac = new AbortController();
    this.dead = false;
    this.waiting = null; // открытый вопрос, на который ждём ответ
    this.resume = null; // рассказ, прерванный вопросом слушателя
    this.narrating = null;
    this.touchedAt = 0;
    this.el = {};
    this.build(root);

    speaker.onState = () => this.updPlay();
    speaker.onBroken = () => {
      this.voiceOn = false;
      this.ctx.voice = false;
      this.updVoiceBtn();
      toast(t("s.ttsBroken"));
    };
    this.offLocation = onLocation(({ pos }) => {
      this.you = pos;
      this.map?.setYou(pos, pos?.acc);
    });
    this.onVisibility = () => {
      if (document.hidden) {
        if (speaker.active && speaker.state !== "paused") speaker.pause();
      } else this.lockScreen();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.lockScreen();
  }

  // ---------- Экран ----------

  build(root) {
    const { cfg } = this;
    const a = cfg.area;
    const title = cfg.mode === "route" ? cfg.route?.destName || t("route.dest") : a?.road || a?.quarter || a?.city || t("app.title");
    this.el.counter = h("span", { class: "s-counter" });
    this.el.voiceBtn = h("button", { type: "button", class: "icon-btn ghost", onclick: () => this.toggleVoice() });
    this.el.mapBtn = h("button", { type: "button", class: "icon-btn ghost", "aria-label": t("s.showMap"), "aria-pressed": "false", onclick: () => this.toggleMap() }, icon("pin"));
    const head = h(
      "header",
      { class: "s-top" },
      h("button", { type: "button", class: "icon-btn ghost", "aria-label": t("s.back"), onclick: () => this.exit() }, icon("back")),
      h("div", { class: "s-title" }, h("strong", null, title), this.el.counter),
      this.el.voiceBtn,
      this.el.mapBtn
    );
    this.el.mapEl = h("div", { class: "map" });
    this.el.mapWrap = h("div", { class: "s-map", hidden: true }, this.el.mapEl);
    this.el.status = h("div", { class: "s-status", role: "status", "aria-live": "polite" });
    this.el.feed = h("div", { class: "s-feed" }, this.el.status);

    this.el.playBtn = h("button", { type: "button", class: "play-btn", onclick: () => this.togglePlay() });
    this.el.skipBtn = h("button", { type: "button", class: "icon-btn skip", "aria-label": t("s.skipStory"), hidden: true, onclick: () => this.skip() }, icon("next", 20));
    this.el.input = h("input", { type: "text", id: "ask", placeholder: t("s.ask"), "aria-label": t("s.ask"), autocomplete: "off", enterkeyhint: "send", maxlength: "400" });
    this.el.micBtn = listener.supported ? h("button", { type: "button", class: "icon-btn mic", "aria-label": t("s.mic"), "aria-pressed": "false", onclick: () => this.toggleMic() }, icon("mic")) : null;
    const form = h(
      "form",
      {
        class: "ask",
        onsubmit: (e) => {
          e.preventDefault();
          this.submit(this.el.input.value);
        },
      },
      this.el.micBtn,
      this.el.input,
      h("button", { type: "submit", class: "icon-btn solid", "aria-label": t("s.send") }, icon("send", 20))
    );
    const bar = h("footer", { class: "s-bar" }, this.el.playBtn, this.el.skipBtn, form);

    this.view = h("section", { class: "view session", id: "session" }, head, this.el.mapWrap, this.el.feed, bar);
    const touched = () => (this.touchedAt = Date.now());
    this.el.feed.addEventListener("touchmove", touched, { passive: true });
    this.el.feed.addEventListener("wheel", touched, { passive: true });
    root.append(this.view);
    this.updVoiceBtn();
    this.updPlay();
  }

  setStatus(kind, text, actions = []) {
    const box = this.el.status;
    clear(box);
    box.className = "s-status" + (kind ? ` ${kind}` : "");
    box.hidden = !kind;
    if (!kind) return;
    if (kind === "busy") box.append(h("p", { class: "dots" }, text), h("div", { class: "ghost-lines", "aria-hidden": "true" }, h("i"), h("i"), h("i")));
    else box.append(h("p", null, text));
    if (actions.length) box.append(h("div", { class: "btn-row" }, actions));
    this.el.feed.append(box);
  }

  updCounter() {
    this.el.counter.textContent = this.stories.length && this.cursor >= 0 ? t("s.counter", { i: this.cursor + 1, n: this.stories.length }) : "";
    this.el.skipBtn.hidden = this.cursor < 0;
  }

  /** Пропустить текущую историю: к следующей или к финалу. */
  skip() {
    if (this.cursor < 0) return;
    if (this.cursor < this.stories.length - 1) return this.present(this.cursor + 1);
    speaker.stop();
    this.endWaiting();
    this.resume = null;
    this.finish();
  }

  updVoiceBtn() {
    const b = this.el.voiceBtn;
    clear(b);
    b.append(icon(this.voiceOn ? "volume" : "mute"));
    b.setAttribute("aria-label", t(this.voiceOn ? "s.voiceOff" : "s.voiceOn"));
    b.setAttribute("aria-pressed", String(this.voiceOn));
    b.hidden = !speaker.supported;
    this.view.dataset.voice = this.voiceOn ? "on" : "off";
  }

  updPlay() {
    const b = this.el.playBtn;
    if (!b) return;
    const playing = speaker.state === "speaking" || speaker.state === "waiting";
    clear(b);
    b.append(icon(playing ? "pause" : "play", 26));
    b.setAttribute("aria-label", t(playing ? "s.pause" : speaker.state === "paused" ? "s.resume" : "s.play"));
    b.classList.toggle("on", playing);
    b.hidden = !speaker.supported;
  }

  async lockScreen() {
    // Не даём экрану погаснуть: с погасшим экраном телефон обрывает речь.
    try {
      if (this.dead || !("wakeLock" in navigator) || document.hidden) return;
      this.wake = await navigator.wakeLock.request("screen");
    } catch {
      /* нет так нет */
    }
  }

  // ---------- Карта историй ----------

  toggleMap() {
    const show = this.el.mapWrap.hidden;
    this.el.mapWrap.hidden = !show;
    this.el.mapBtn.setAttribute("aria-pressed", String(show));
    this.el.mapBtn.setAttribute("aria-label", t(show ? "s.hideMap" : "s.showMap"));
    if (!show) return;
    if (!this.map) {
      this.map = new MapView(this.el.mapEl, { center: this.cfg.center, zoom: 16 });
      if (this.cfg.route) this.map.setRoute(this.cfg.route.coords, this.cfg.route.dest, { fit: false });
    }
    this.map.refresh();
    this.updMap(true);
  }

  updMap(fit) {
    if (!this.map) return;
    this.map.setYou(this.you || this.cfg.center, this.you?.acc);
    this.map.setStories(this.stories, {
      active: this.cursor,
      onTap: (i) => {
        const s = this.stories[i];
        if (s?.el) s.el.root.scrollIntoView({ behavior: "smooth", block: "start" });
        else this.present(i);
      },
    });
    if (fit) this.map.fitPoints([this.cfg.center, ...this.stories.map((s) => s.place), this.cfg.route?.dest]);
  }

  // ---------- План ----------

  async run() {
    this.setStatus("busy", t("s.planning"));
    try {
      const plan = await planStories(this.ctx, { count: this.budget.count, topics: this.cfg.topics, interest: this.cfg.interest, told: [] }, this.ac.signal);
      if (this.dead) return;
      if (!plan.length) {
        speaker.stop();
        return this.setStatus("note", t("s.nothing"), [h("button", { type: "button", class: "btn primary", onclick: () => this.exit() }, t("s.home"))]);
      }
      this.addStories(plan);
      this.setStatus(null);
      if (this.voiceOn) await speaker.whenIdle();
      if (this.dead) return;
      this.muteHint();
      this.present(0);
    } catch (e) {
      if (this.dead || isAborted(e)) return;
      speaker.stop();
      this.setStatus("bad", errorText(e), [h("button", { type: "button", class: "btn primary", onclick: () => this.run() }, t("s.retry")), h("button", { type: "button", class: "btn", onclick: () => this.exit() }, t("s.home"))]);
    }
  }

  /** На iPhone синтезатор молчит в беззвучном режиме: один раз подсказываем. */
  muteHint() {
    if (!this.voiceOn || store.get("muteHintShown", false)) return;
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    store.set("muteHintShown", true);
    toast(t("s.muteHint"), 6000);
  }

  addStories(plan) {
    const words = wordsEach(this.budget, plan.length);
    for (const p of plan) {
      this.stories.push({
        idx: this.stories.length,
        place: p.place,
        also: p.also || [],
        title: plain(p.title),
        idea: p.idea,
        words,
        status: "idle",
        sentences: [],
        shown: 0,
        heard: -1,
        text: "",
        sources: [],
        listeners: new Set(),
        promise: null,
        quiz: null,
        quizPromise: null,
        quizDone: false,
        finished: false,
        el: null,
      });
    }
    this.updCounter();
    this.updMap(true);
  }

  // ---------- Написание истории ----------

  generate(s) {
    if (!s || s.promise) return s?.promise;
    const { signal } = this.ac;
    const notify = () => {
      for (const fn of [...s.listeners]) fn();
    };
    s.status = "loading";
    s.promise = (async () => {
      const subjects = [s.place, ...s.also.filter((x) => x && x.kind === "article")].slice(0, 2);
      const chars = subjects.length > 1 ? 5000 : 8000;
      const arts = await Promise.all(subjects.map((p) => fetchArticle(p, this.ui, signal, chars).catch(() => null)));
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      s.sources = arts.map((art, i) => art && { ...art, name: subjects[i].name }).filter(Boolean);
      s.status = "streaming";
      notify();
      const buf = new SentenceBuffer((text, br) => {
        const clean = plain(text).trim();
        if (!clean) return;
        s.sentences.push({ text: clean, br });
        notify();
      });
      const told = this.stories.slice(0, s.idx).map((x) => ({ title: x.title }));
      await tellStory(this.ctx, { story: s, index: s.idx, total: this.stories.length, words: s.words, told, sources: s.sources, extras: s.also.filter(Boolean) }, (delta) => buf.push(delta), signal);
      buf.flush();
      if (!s.sentences.length) throw new Error("empty story");
      s.text = s.sentences.map((x) => x.text).join(" ");
      s.status = "done";
      if (this.quizMode !== "off") {
        s.quizPromise = makeQuiz({ ui: this.ui, audience: this.cfg.audience, voice: this.voiceOn, kind: this.quizKind(s.idx), title: s.title, text: s.text }, signal).catch(() => null);
      }
      notify();
      // Следующую историю пишем заранее, пока звучит эта.
      if (!this.dead && s.idx === this.cursor) this.generate(this.stories[s.idx + 1]);
    })().catch((e) => {
      s.status = "error";
      s.error = e;
      notify();
    });
    return s.promise;
  }

  quizKind(idx) {
    if (this.quizMode === "choice" || this.quizMode === "open") return this.quizMode;
    return idx % 2 === 0 ? "choice" : "open";
  }

  // ---------- Карточка истории ----------

  whereLabel(p) {
    if (this.cfg.mode === "route") {
      if (p.behind) return t("pos.behind");
      if (p.beyond) return t("pos.atEnd");
      if (p.atStart) return t("pos.atStart");
      if (p.atEnd) return t("pos.atEnd");
      return `${t("pos.along", { dist: fmtDist(p.along) })}, ${t(`pos.${p.side}`)}`;
    }
    if (p.dist < 25) return t("pos.here");
    if (this.kids) return t("pos.walk", { min: walkMinutes(p.dist) });
    return `${fmtDist(p.dist)} ${compassWord(p.bearing)}`;
  }

  renderStory(s) {
    if (s.el) return;
    const el = {};
    el.text = h("div", { class: "story-text" });
    el.busy = h("p", { class: "story-busy dots" }, t("s.writing"));
    el.actions = h("div", { class: "story-actions", hidden: true });
    el.sources = h("p", { class: "story-sources", hidden: true });
    el.quiz = h("div", { class: "quiz", hidden: true });
    el.talk = h("div", { class: "talk" });
    el.next = h("div", { class: "story-next", hidden: true });
    const thumb = s.place.thumb ? h("img", { class: "story-thumb", src: s.place.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null;
    thumb?.addEventListener("error", () => thumb.remove());
    el.root = h(
      "article",
      { class: "story", "data-idx": String(s.idx) },
      h("div", { class: "plaque story-plaque" }, h("span", { class: "plaque-num" }, String(s.idx + 1)), h("div", { class: "plaque-main" }, h("strong", { class: "plaque-name" }, s.place.name), h("span", { class: "plaque-sub" }, this.whereLabel(s.place)))),
      h("h2", { class: "story-title" }, s.title),
      thumb,
      el.text,
      el.busy,
      el.actions,
      el.sources,
      el.quiz,
      el.talk,
      el.next
    );
    s.el = el;
    this.el.feed.append(el.root);
    const paint = () => this.paint(s);
    s.listeners.add(paint);
    paint();
  }

  /** Дорисовывает новые предложения и состояние карточки. */
  paint(s) {
    const el = s.el;
    if (!el) return;
    while (s.shown < s.sentences.length) {
      const sent = s.sentences[s.shown];
      if (!el.p || el.breakNext) {
        el.p = h("p");
        el.text.append(el.p);
        el.breakNext = false;
      }
      const k = s.shown;
      const span = h("span", { class: "sent", "data-k": String(k) }, `${sent.text} `);
      el.p.append(span);
      if (sent.br) el.breakNext = true;
      s.shown++;
    }
    if (s.status === "loading" || s.status === "streaming") {
      el.busy.hidden = s.sentences.length > 0;
      el.root.classList.toggle("streaming", s.status === "streaming");
      return;
    }
    el.root.classList.remove("streaming");
    el.busy.hidden = true;
    if (s.status === "error" && !el.failed) {
      el.failed = true;
      if (isAborted(s.error)) return;
      el.text.append(
        h(
          "div",
          { class: "note bad" },
          h("p", null, `${t("s.storyFailed")} ${errorText(s.error)}`),
          h(
            "div",
            { class: "btn-row" },
            h("button", { type: "button", class: "btn", onclick: () => this.retryStory(s) }, t("s.retry")),
            s.idx < this.stories.length - 1 ? h("button", { type: "button", class: "btn", onclick: () => this.present(s.idx + 1) }, t("s.next")) : null
          )
        )
      );
    }
    if (s.status === "done" && !el.done) {
      el.done = true;
      clear(el.actions);
      el.actions.hidden = false;
      if (speaker.supported) el.actions.append(h("button", { type: "button", class: "chip-btn", onclick: () => this.listen(s) }, icon("volume", 18), t(this.voiceOn ? "s.replay" : "s.play")));
      el.actions.append(h("button", { type: "button", class: "chip-btn", onclick: () => this.ask(t("s.moreAsk"), t("s.more"), s) }, icon("sparkle", 18), t("s.more")));
      clear(el.sources);
      el.sources.hidden = false;
      if (s.sources.length) {
        el.sources.append(`${t(s.sources.length > 1 ? "s.sources" : "s.source")}: `);
        s.sources.forEach((src, i) => {
          if (i) el.sources.append(", ");
          el.sources.append(h("a", { href: src.url, target: "_blank", rel: "noopener" }, `${t("s.wikipedia")} (${src.lang}), ${src.title}`));
        });
      } else el.sources.append(t("s.noSource"));
    }
  }

  retryStory(s) {
    const { el } = s;
    Object.assign(s, { status: "idle", sentences: [], shown: 0, heard: -1, text: "", sources: [], promise: null, error: null, quiz: null, quizPromise: null, quizDone: false, finished: false });
    s.listeners.clear();
    el?.root.remove();
    s.el = null;
    this.present(s.idx);
  }

  highlight(s, k) {
    const el = s.el;
    if (!el) return;
    el.now?.classList.remove("now");
    el.now = null;
    if (k == null || k < 0) return;
    s.heard = Math.max(s.heard, k);
    const span = el.text.querySelector(`.sent[data-k="${k}"]`);
    if (!span) return;
    span.classList.add("now");
    el.now = span;
    if (Date.now() - this.touchedAt < 4000) return;
    const r = span.getBoundingClientRect();
    const feed = this.el.feed.getBoundingClientRect();
    if (r.bottom > feed.bottom - 40 || r.top < feed.top + 20) span.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- Рассказ ----------

  /** Показывает историю i и ведёт её до конца: текст, голос, вопрос, переход дальше. */
  present(i) {
    const s = this.stories[i];
    if (!s) return this.finish();
    speaker.stop();
    listener.cancel();
    this.endWaiting();
    this.resume = null;
    this.cursor = i;
    this.setStatus(null);
    this.el.end?.remove();
    this.el.end = null;
    for (const x of this.stories) if (x.el && x !== s) x.el.next.hidden = true;
    this.renderStory(s);
    this.updCounter();
    this.updMap(false);
    this.scrollTo(s.el.root, "start");
    this.generate(s);
    if (s.status === "done") this.generate(this.stories[i + 1]);
    return this.tell(s, 0);
  }

  async tell(s, from, force = false) {
    const my = ++this.turn;
    await this.narrate(s, from, force);
    if (my !== this.turn || this.dead) return;
    await s.promise;
    if (my !== this.turn || this.dead) return;
    if (s.status !== "done") return;
    await this.afterStory(s, my);
  }

  /** Читает историю вслух с предложения from (если голос включён) и ждёт конца чтения или написания. */
  async narrate(s, from, force = false) {
    const useVoice = (this.voiceOn || force) && speaker.supported;
    this.narrating = s;
    let reading = null;
    let k = from;
    if (useVoice) reading = speaker.open({ lang: this.ui, rate: this.rate, onChunk: (tag) => this.highlight(s, tag) });
    const push = () => {
      if (!reading) return;
      while (k < s.sentences.length) {
        reading.add(s.sentences[k].text, k);
        k++;
      }
      if (s.status === "done" || s.status === "error") reading.end();
    };
    s.listeners.add(push);
    push();
    let result = "finished";
    if (reading) result = await reading.done;
    else await s.promise;
    s.listeners.delete(push);
    if (this.narrating === s) this.narrating = null;
    this.highlight(s, -1);
    return result;
  }

  async afterStory(s, my) {
    s.finished = true;
    if (this.quizMode !== "off" && !s.quizDone && s.quizPromise) {
      const q = await s.quizPromise;
      if (my !== this.turn || this.dead) return;
      if (q) return this.showQuiz(s, q);
    }
    return this.proceed(s, my);
  }

  /** Что дальше после истории (и вопроса): следующая история сама, кнопка "дальше" или финал. */
  async proceed(s, my) {
    const last = s.idx >= this.stories.length - 1;
    if (last) return this.finish(my);
    clear(s.el.next);
    s.el.next.hidden = false;
    s.el.next.append(h("button", { type: "button", class: "btn primary wide", onclick: () => this.present(s.idx + 1) }, t("s.next"), icon("next", 18)));
    if (this.voiceOn && prefs.autoNext) {
      await sleep(900);
      if (my !== this.turn || this.dead) return;
      this.present(s.idx + 1);
    }
  }

  /** Послушать историю ещё раз (или впервые, если был выбран текст). */
  async listen(s) {
    this.resume = null;
    ++this.turn;
    await this.narrate(s, 0, true);
  }

  togglePlay() {
    if (speaker.state === "speaking" || speaker.state === "waiting") return speaker.pause();
    if (speaker.state === "paused") return speaker.resume();
    if (this.resume) return this.resumeStory();
    const s = this.stories[this.cursor];
    if (s?.sentences.length) this.listen(s);
  }

  toggleVoice() {
    this.voiceOn = !this.voiceOn;
    this.ctx.voice = this.voiceOn;
    this.updVoiceBtn();
    if (!this.voiceOn) speaker.stop();
    else this.lockScreen();
  }

  resumeStory(quiet = false) {
    const r = this.resume;
    if (!r) return;
    this.resume = null;
    r.button?.remove();
    this.cursor = r.s.idx;
    if (!quiet) this.scrollTo(r.s.el.text.querySelector(`.sent[data-k="${r.from}"]`) || r.s.el.root, "center");
    return this.tell(r.s, r.from);
  }

  // ---------- Вопрос после истории ----------

  showQuiz(s, q) {
    s.quiz = q;
    const box = s.el.quiz;
    clear(box);
    box.hidden = false;
    box.className = "quiz";
    box.append(h("p", { class: "quiz-label" }, t(this.kids ? "q.titleKids" : "q.title")), h("p", { class: "quiz-q" }, q.question));
    let spoken = q.question;
    if (q.kind === "choice") {
      const opts = h("div", { class: "quiz-opts" });
      q.options.forEach((text, i) => opts.append(h("button", { type: "button", class: "opt", "data-i": String(i), onclick: () => this.answerQuiz(s, i) }, h("span", { class: "opt-mark", "aria-hidden": "true" }, String.fromCharCode(65 + i)), h("span", null, text))));
      box.append(opts);
      const ord = ORDINALS[this.ui === "en" ? "en" : "ru"];
      spoken += " " + q.options.map((text, i) => `${ord[i] || ""}: ${text}.`).join(" ");
    } else {
      this.waiting = { story: s };
      this.el.input.placeholder = t("q.placeholder");
      box.append(h("p", { class: "hint" }, t("q.openHint")));
    }
    box.append(h("button", { type: "button", class: "link-btn", onclick: () => this.skipQuiz(s) }, t("q.skip")));
    this.scrollTo(box, "center");
    if (this.voiceOn) speaker.say(spoken, { lang: this.ui, rate: this.rate });
  }

  endWaiting() {
    this.waiting = null;
    this.el.input.placeholder = t("s.ask");
  }

  skipQuiz(s) {
    if (s.quizDone) return;
    s.quizDone = true;
    s.el.quiz.hidden = true;
    this.endWaiting();
    speaker.stop();
    if (s.idx === this.cursor) this.proceed(s, ++this.turn);
  }

  async answerQuiz(s, value) {
    const q = s.quiz;
    if (!q || s.quizDone) return;
    const my = ++this.turn;
    s.quizDone = true;
    speaker.stop();
    this.endWaiting();
    const box = s.el.quiz;
    box.querySelector(".link-btn")?.remove();
    box.querySelector(".hint")?.remove();
    let verdict;
    let reply;
    if (q.kind === "choice") {
      verdict = value === q.correct ? "right" : "wrong";
      reply = verdict === "right" ? q.rightReply : q.wrongReply;
      for (const b of box.querySelectorAll(".opt")) {
        const i = Number(b.dataset.i);
        b.disabled = true;
        if (i === q.correct) b.classList.add("right");
        else if (i === value) b.classList.add("wrong");
      }
    } else {
      box.append(h("p", { class: "quiz-mine" }, h("span", null, `${t("q.yourAnswer")}: `), String(value)));
      const wait = h("p", { class: "hint dots" }, t("q.checking"));
      box.append(wait);
      try {
        const res = await checkAnswer({ ui: this.ui, audience: this.cfg.audience, voice: this.voiceOn, question: q.question, expected: q.expected, answer: String(value), text: s.text }, this.ac.signal);
        verdict = res.verdict;
        reply = res.reply;
      } catch (e) {
        if (isAborted(e) || this.dead) return;
        verdict = "partly";
        reply = q.expected;
      }
      wait.remove();
      if (this.dead) return;
    }
    reply = plain(reply || "") || t(`q.${verdict}`);
    box.classList.add(verdict);
    box.append(h("p", { class: `quiz-reply ${verdict}` }, reply));
    this.scrollTo(box, "center");
    if (my !== this.turn) return;
    if (this.voiceOn && reply) await speaker.say(reply, { lang: this.ui, rate: this.rate });
    if (my !== this.turn || this.dead) return;
    if (s.idx === this.cursor) this.proceed(s, my);
  }

  // ---------- Разговор ----------

  submit(raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    this.el.input.value = "";
    this.el.input.blur();
    if (this.waiting) return this.answerQuiz(this.waiting.story, text);
    this.ask(text);
  }

  toggleMic() {
    if (listener.listening) return listener.stop();
    const wasSpeaking = speaker.state === "speaking" || speaker.state === "waiting";
    if (wasSpeaking) speaker.pause();
    const btn = this.el.micBtn;
    const input = this.el.input;
    const before = input.placeholder;
    const done = () => {
      btn.setAttribute("aria-pressed", "false");
      btn.classList.remove("on");
      input.placeholder = before;
    };
    btn.setAttribute("aria-pressed", "true");
    btn.classList.add("on");
    input.value = "";
    input.placeholder = t("s.listening");
    listener.start({
      lang: this.ui,
      onPartial: (text) => (input.value = text),
      onDone: (text) => {
        done();
        if (text) return this.submit(text);
        input.value = "";
        toast(t("s.micNothing"));
        if (wasSpeaking) speaker.resume();
      },
      onError: (code) => {
        done();
        input.value = "";
        toast(t(code === "denied" ? "s.micDenied" : "s.micNothing"));
        if (wasSpeaking) speaker.resume();
      },
    });
  }

  /** Вопрос слушателя: text уходит Claude, shown показывается в ленте. */
  async ask(text, shown = text, about = null) {
    const my = ++this.turn;
    const cur = about || this.stories[this.cursor] || null;
    // Запоминаем, где прервали рассказ, чтобы потом к нему вернуться.
    const cut = this.narrating;
    if (cut && !cut.finished && (speaker.active || cut.status !== "done")) {
      this.resume?.button?.remove();
      this.resume = { s: cut, from: Math.max(0, cut.heard) };
    }
    speaker.stop();
    const talk = cur?.el?.talk || this.el.feed;
    const bubble = h("div", { class: "bubble ai" }, h("span", { class: "dots" }, t("s.thinking")));
    talk.append(h("div", { class: "bubble me" }, shown), bubble);
    this.scrollTo(bubble, "center");
    this.chat.push({ role: "user", content: text });

    const reading = this.voiceOn ? speaker.open({ lang: this.ui, rate: this.rate }) : null;
    let started = false;
    let para = null;
    const buf = new SentenceBuffer((sent, br) => {
      const clean = plain(sent).trim();
      if (!clean) return;
      if (!started) {
        clear(bubble);
        started = true;
      }
      if (!para) {
        para = h("p");
        bubble.append(para);
      }
      para.append(`${clean} `);
      if (br) para = null;
      reading?.add(clean, null);
    });
    try {
      const storyText = cur ? cur.text || cur.sentences.map((x) => x.text).join(" ") : "";
      const full = await answer(this.ctx, { story: cur, storyText, sources: cur?.sources }, this.chat.slice(-9), (delta) => buf.push(delta), this.ac.signal);
      buf.flush();
      reading?.end();
      this.chat.push({ role: "assistant", content: full });
    } catch (e) {
      reading?.end();
      this.chat.pop();
      if (isAborted(e) || this.dead) return;
      clear(bubble);
      bubble.classList.add("bad");
      bubble.textContent = errorText(e);
      return;
    }
    if (reading) await reading.done;
    if (my !== this.turn || this.dead) return;
    if (this.resume && !this.voiceOn) {
      // Без голоса возвращаться некуда: текст и так на экране, просто ведём историю дальше.
      return this.resumeStory(true);
    }
    if (this.resume) {
      const btn = h("button", { type: "button", class: "btn primary wide", onclick: () => this.resumeStory() }, icon("play", 16), t("s.continueStory"));
      this.resume.button = btn;
      talk.append(btn);
      if (this.voiceOn && prefs.autoNext) {
        await sleep(1300);
        if (my !== this.turn || this.dead) return;
        this.resumeStory();
      }
    }
  }

  // ---------- Финал ----------

  async finish(my = ++this.turn) {
    if (this.el.end) return;
    this.el.end = h(
      "div",
      { class: "s-end" },
      h("h2", null, t("s.endTitle")),
      h("p", null, t("s.endText")),
      h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn primary", onclick: () => this.more() }, icon("sparkle", 18), t("s.moreStories")), h("button", { type: "button", class: "btn", onclick: () => this.exit() }, t("s.home")))
    );
    this.el.feed.append(this.el.end);
    if (this.voiceOn) {
      await sleep(500);
      if (my !== this.turn || this.dead) return;
      speaker.say(`${t("s.endTitle")}.`, { lang: this.ui, rate: this.rate });
    }
  }

  async more() {
    const my = ++this.turn;
    speaker.stop();
    this.el.end?.remove();
    this.el.end = null;
    this.setStatus("busy", t("s.planning"));
    this.scrollTo(this.el.status, "center");
    try {
      const told = this.stories.map((s) => ({ title: s.title, place: s.place.name }));
      const used = new Set(this.stories.map((s) => s.place.ref));
      const plan = (await planStories(this.ctx, { count: this.budget.count, topics: this.cfg.topics, interest: this.cfg.interest, told }, this.ac.signal)).filter((p) => !used.has(p.place.ref));
      if (my !== this.turn || this.dead) return;
      this.setStatus(null);
      if (!plan.length) {
        toast(t("s.noMore"));
        return this.finish();
      }
      const first = this.stories.length;
      this.addStories(plan);
      this.present(first);
    } catch (e) {
      if (isAborted(e) || this.dead) return;
      this.setStatus("bad", errorText(e), [h("button", { type: "button", class: "btn primary", onclick: () => this.more() }, t("s.retry"))]);
    }
  }

  // ---------- Служебное ----------

  scrollTo(node, block) {
    if (!node) return;
    requestAnimationFrame(() => {
      try {
        node.scrollIntoView({ behavior: "smooth", block });
      } catch {
        /* старые браузеры */
      }
    });
  }

  exit() {
    this.destroy();
    this.onExit?.();
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.turn++;
    this.ac.abort();
    speaker.stop();
    speaker.onState = null;
    speaker.onBroken = null;
    listener.cancel();
    this.offLocation?.();
    document.removeEventListener("visibilitychange", this.onVisibility);
    try {
      this.wake?.release();
    } catch {
      /* ничего */
    }
    this.view.remove();
  }
}

export function mountSession(root, { onExit }) {
  let current = null;
  return {
    start(cfg) {
      current?.destroy();
      current = new Session(root, cfg, () => {
        current = null;
        onExit();
      });
      current.run();
    },
    stop() {
      current?.destroy();
      current = null;
    },
    get active() {
      return !!current;
    },
  };
}
