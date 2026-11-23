// Окно настроек: ключ Claude, качество историй, вопросы, голос.

import { h, icon, store, clear } from "./util.js";
import { t, getLang } from "./i18n.js";
import { getKey, setKey, checkKey, errorText } from "./ai.js";
import { speaker, voicesFor, voicesReady } from "./speech.js";

export const prefs = {
  get quality() {
    return store.get("quality", "balanced");
  },
  get rate() {
    return store.get("rate", 1);
  },
  get autoNext() {
    return store.get("autoNext", true);
  },
  quiz(audience) {
    return store.get(`quiz.${audience}`, audience === "kids" ? "mixed" : "off");
  },
};

let open = null;

export function closeSettings() {
  if (!open) return;
  speaker.stop();
  open.backdrop.remove();
  document.body.classList.remove("sheet-open");
  const { onClose, opener } = open;
  open = null;
  opener?.focus?.();
  onClose?.();
}

export function openSettings({ focusKey = false, onClose } = {}) {
  if (open) closeSettings();
  const opener = document.activeElement;
  const lang = getLang();

  // ----- Ключ -----
  const keyInput = h("input", {
    id: "set-key",
    type: "password",
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    placeholder: "sk-ant-…",
    value: getKey(),
  });
  const showBtn = h("button", { class: "icon-btn ghost", type: "button", "aria-label": t("set.keyShow"), onclick: () => (keyInput.type = keyInput.type === "password" ? "text" : "password") }, icon("eye", 20));
  const keyStatus = h("p", { class: "set-status", role: "status", "aria-live": "polite" });
  const saveBtn = h("button", { class: "btn primary", type: "button" }, t("set.keySave"));
  const delBtn = h("button", { class: "btn quiet", type: "button", hidden: !getKey() }, t("set.keyDelete"));

  saveBtn.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) {
      keyStatus.className = "set-status bad";
      keyStatus.textContent = t("set.keyEmpty");
      return keyInput.focus();
    }
    setKey(key);
    delBtn.hidden = false;
    saveBtn.disabled = true;
    keyStatus.className = "set-status";
    keyStatus.textContent = t("set.keyChecking");
    try {
      await checkKey();
      keyStatus.className = "set-status good";
      keyStatus.textContent = t("set.keyOk");
    } catch (e) {
      keyStatus.className = "set-status bad";
      keyStatus.textContent = errorText(e);
    } finally {
      saveBtn.disabled = false;
    }
  });
  delBtn.addEventListener("click", () => {
    setKey("");
    keyInput.value = "";
    delBtn.hidden = true;
    keyStatus.className = "set-status";
    keyStatus.textContent = t("set.keyDeleted");
  });

  const keySection = h(
    "section",
    { class: "set-block" },
    h("h3", null, t("set.keyTitle")),
    h("p", { class: "muted" }, t("set.keyNote")),
    h("label", { class: "field", for: "set-key" }, h("span", null, t("set.keyLabel"))),
    h("div", { class: "key-row" }, keyInput, showBtn),
    h("ol", { class: "steps muted" }, h("li", null, t("set.keyHow1")), h("li", null, t("set.keyHow2"))),
    h("div", { class: "btn-row" }, saveBtn, delBtn),
    keyStatus
  );

  // ----- Качество -----
  const quality = h("div", { class: "choice-list", role: "radiogroup", "aria-label": t("set.quality") });
  const renderQuality = () => {
    clear(quality);
    for (const id of ["fast", "balanced", "best"]) {
      const on = prefs.quality === id;
      quality.append(
        h(
          "button",
          {
            class: "choice" + (on ? " on" : ""),
            type: "button",
            role: "radio",
            "aria-checked": String(on),
            onclick: () => {
              store.set("quality", id);
              renderQuality();
            },
          },
          h("strong", null, t(`set.q.${id}`)),
          h("span", null, t(`set.q.${id}Note`))
        )
      );
    }
  };
  renderQuality();

  // ----- Вопросы -----
  const quizSelect = (audience) => {
    const sel = h("select", { id: `set-quiz-${audience}`, onchange: () => store.set(`quiz.${audience}`, sel.value) });
    for (const id of ["mixed", "choice", "open", "off"]) sel.append(h("option", { value: id, selected: prefs.quiz(audience) === id }, t(`set.quiz.${id}`)));
    return h("label", { class: "field inline", for: sel.id }, h("span", null, t(audience === "kids" ? "set.quizKids" : "set.quizAdult")), sel);
  };

  // ----- Голос -----
  const voiceBox = h("div", { class: "voice-box" });
  const renderVoice = () => {
    clear(voiceBox);
    if (!speaker.supported) return voiceBox.append(h("p", { class: "muted" }, t("set.voiceUnsupported")));
    const voices = voicesFor(lang);
    if (!voices.length) voiceBox.append(h("p", { class: "muted" }, t("set.voiceNone")));
    const sel = h("select", { id: "set-voice", onchange: () => store.set(`voice.${lang}`, sel.value) });
    sel.append(h("option", { value: "" }, t("set.voiceAuto")));
    const saved = store.get(`voice.${lang}`, "");
    for (const v of voices) sel.append(h("option", { value: v.voiceURI, selected: v.voiceURI === saved }, `${v.name} (${v.lang})`));
    const rateVal = h("output", { class: "range-val" }, `${prefs.rate.toFixed(2).replace(/0$/, "")}×`);
    const rate = h("input", {
      id: "set-rate",
      type: "range",
      min: "0.7",
      max: "1.3",
      step: "0.05",
      value: String(prefs.rate),
      oninput: () => {
        store.set("rate", Number(rate.value));
        rateVal.textContent = `${Number(rate.value).toFixed(2).replace(/0$/, "")}×`;
      },
    });
    const auto = h("input", { id: "set-auto", type: "checkbox", checked: prefs.autoNext, onchange: () => store.set("autoNext", auto.checked) });
    voiceBox.append(
      h("label", { class: "field", for: "set-voice" }, h("span", null, t("set.voicePick"))),
      sel,
      h("label", { class: "field range-head", for: "set-rate" }, h("span", null, t("set.rate")), rateVal),
      rate,
      h("div", { class: "btn-row" }, h("button", { class: "btn", type: "button", onclick: () => speaker.say(t("set.voiceSample"), { lang, rate: prefs.rate }) }, icon("volume", 18), t("set.voiceTest"))),
      h("label", { class: "check", for: "set-auto" }, auto, h("span", null, t("set.autoNext")))
    );
  };
  renderVoice();
  voicesReady().then(() => open && renderVoice());

  const sheet = h(
    "div",
    { class: "sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "set-title" },
    h("header", { class: "sheet-head" }, h("h2", { id: "set-title" }, t("set.title")), h("button", { class: "icon-btn ghost", type: "button", "aria-label": t("set.close"), onclick: closeSettings }, icon("close"))),
    h(
      "div",
      { class: "sheet-body" },
      keySection,
      h("section", { class: "set-block" }, h("h3", null, t("set.quality")), quality),
      h("section", { class: "set-block" }, h("h3", null, t("set.quiz")), quizSelect("kids"), quizSelect("adult")),
      h("section", { class: "set-block" }, h("h3", null, t("set.voice")), voiceBox),
      h("p", { class: "muted about" }, t("set.about"))
    )
  );
  const backdrop = h("div", { class: "sheet-backdrop", onclick: (e) => e.target === backdrop && closeSettings() }, sheet);
  backdrop.addEventListener("keydown", (e) => e.key === "Escape" && closeSettings());
  document.body.append(backdrop);
  document.body.classList.add("sheet-open");
  open = { backdrop, onClose, opener };
  requestAnimationFrame(() => {
    backdrop.classList.add("show");
    if (focusKey) keyInput.focus();
    else sheet.querySelector(".icon-btn")?.focus();
  });
}
