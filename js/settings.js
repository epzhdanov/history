// Окно настроек: ключ Claude, качество историй, вопросы, голос.

import { h, icon, store, clear } from "./util.js";
import { t, getLang } from "./i18n.js";
import { getKey, setKey, checkKey, errorText } from "./ai.js";
import { speaker, voicesFor, voicesReady } from "./speech.js";
import { openSheet, closeSheet } from "./sheet.js";
import { BUILD } from "./build.js";
import { PROVIDERS, GEMINI_VOICES, ttsChoice, setTtsChoice, ttsKey, setTtsKey, ttsModel, setTtsModel, ttsVoice, setTtsVoice, elevenVoices, loadElevenVoices, ttsErrorText } from "./tts.js";

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

const HOSTS = { eleven: "api.elevenlabs.io", gemini: "generativelanguage.googleapis.com" };

export const closeSettings = closeSheet;

/** Поле для ключа с кнопкой "показать". */
function keyField(id, value, placeholder) {
  const input = h("input", { id, type: "password", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", placeholder, value });
  const show = h("button", { class: "icon-btn ghost", type: "button", "aria-label": t("set.keyShow"), onclick: () => (input.type = input.type === "password" ? "text" : "password") }, icon("eye", 20));
  return { input, row: h("div", { class: "key-row" }, input, show) };
}

const setStatus = (el, kind, text) => {
  el.className = kind ? `set-status ${kind}` : "set-status";
  el.textContent = text;
};

export function openSettings({ focusKey = false, onClose } = {}) {
  const lang = getLang();
  let alive = true;
  const sheet = openSheet({
    title: t("set.title"),
    closeLabel: t("set.close"),
    id: "set-title",
    onClose: () => {
      alive = false;
      speaker.stop();
      onClose?.();
    },
  });

  // ----- Ключ Claude -----
  const key = keyField("set-key", getKey(), "sk-ant-…");
  const keyStatus = h("p", { class: "set-status", role: "status", "aria-live": "polite" });
  const saveBtn = h("button", { class: "btn primary", type: "button" }, t("set.keySave"));
  const delBtn = h("button", { class: "btn quiet", type: "button", hidden: !getKey() }, t("set.keyDelete"));

  saveBtn.addEventListener("click", async () => {
    const value = key.input.value.trim();
    if (!value) {
      setStatus(keyStatus, "bad", t("set.keyEmpty"));
      return key.input.focus();
    }
    setKey(value);
    delBtn.hidden = false;
    saveBtn.disabled = true;
    setStatus(keyStatus, "", t("set.keyChecking"));
    try {
      await checkKey();
      setStatus(keyStatus, "good", t("set.keyOk"));
    } catch (e) {
      setStatus(keyStatus, "bad", errorText(e));
    } finally {
      saveBtn.disabled = false;
    }
  });
  delBtn.addEventListener("click", () => {
    setKey("");
    key.input.value = "";
    delBtn.hidden = true;
    setStatus(keyStatus, "", t("set.keyDeleted"));
  });

  const keySection = h(
    "section",
    { class: "set-block" },
    h("h3", null, t("set.keyTitle")),
    h("p", { class: "muted" }, t("set.keyNote")),
    h("label", { class: "field", for: "set-key" }, h("span", null, t("set.keyLabel"))),
    key.row,
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
  let voiceRun = 0;

  /** Проба голоса: произносит фразу и пишет рядом, что получилось. */
  async function sample(status, btn) {
    if (btn) btn.disabled = true;
    const cloud = !!PROVIDERS[ttsChoice()] && !!ttsKey(ttsChoice());
    setStatus(status, "", cloud ? t("set.ttsChecking") : "");
    const res = await speaker.sample(t("set.voiceSample"), { lang, rate: prefs.rate });
    if (btn) btn.disabled = false;
    if (!alive || !status.isConnected) return;
    if (res.ok) setStatus(status, res.cloud ? "good" : "", res.cloud ? t("set.ttsOk") : "");
    else setStatus(status, "bad", res.error ? ttsErrorText(res.error) : t("s.ttsBroken"));
  }

  function elevenOptions(sel) {
    clear(sel);
    const saved = store.get(`tts.voice.eleven.${lang}`, "");
    sel.append(h("option", { value: "" }, t("set.voiceAuto")));
    for (const v of elevenVoices(lang)) {
      const g = v.gender === "female" ? ` (${t("voice.f")})` : v.gender === "male" ? ` (${t("voice.m")})` : "";
      sel.append(h("option", { value: v.id, selected: v.id === saved }, `${v.name}${g}`));
    }
  }

  const renderVoice = () => {
    const my = ++voiceRun;
    clear(voiceBox);
    const choice = ttsChoice();
    const p = PROVIDERS[choice] || null;

    const who = h("div", { class: "choice-list", role: "radiogroup", "aria-label": t("set.voiceWho") });
    for (const id of ["eleven", "gemini", "system"]) {
      const on = choice === id;
      who.append(
        h(
          "button",
          {
            class: "choice" + (on ? " on" : ""),
            type: "button",
            role: "radio",
            "aria-checked": String(on),
            "data-voice": id,
            onclick: () => {
              speaker.stop();
              setTtsChoice(id);
              speaker.reset();
              renderVoice();
            },
          },
          h("strong", null, id === "system" ? t("set.voice.system") : PROVIDERS[id].name),
          h("span", null, t(`set.voice.${id}Note`))
        )
      );
    }
    voiceBox.append(h("p", { class: "field" }, t("set.voiceWho")), who);

    if (p) {
      // Ключ сервиса
      const k = keyField("set-tts-key", ttsKey(p.id), "");
      const status = h("p", { class: "set-status", role: "status", "aria-live": "polite" }, ttsKey(p.id) ? "" : t("set.ttsNeedKey"));
      const save = h("button", { class: "btn primary", type: "button", id: "set-tts-save" }, icon("volume", 18), t("set.ttsSave"));
      const del = h("button", { class: "btn quiet", type: "button", hidden: !ttsKey(p.id) }, t("set.keyDelete"));
      save.addEventListener("click", async () => {
        const value = k.input.value.trim();
        if (!value) {
          setStatus(status, "bad", t("set.keyEmpty"));
          return k.input.focus();
        }
        setTtsKey(p.id, value);
        speaker.reset();
        del.hidden = false;
        const done = sample(status, save); // запускаем прямо в обработчике нажатия: иначе телефон не даст звук
        if (p.id === "eleven") loadElevenVoices().then(() => alive && my === voiceRun && voiceSel && elevenOptions(voiceSel));
        await done;
      });
      del.addEventListener("click", () => {
        speaker.stop();
        setTtsKey(p.id, "");
        speaker.reset();
        renderVoice();
      });
      voiceBox.append(
        h("label", { class: "field", for: "set-tts-key" }, h("span", null, t("set.ttsKey", { name: p.name }))),
        k.row,
        h("ol", { class: "steps muted" }, h("li", null, t(`set.${p.id}.how1`)), h("li", null, t(`set.${p.id}.how2`))),
        h("p", { class: "muted small" }, t("set.ttsKeyNote", { host: HOSTS[p.id] })),
        h("div", { class: "btn-row" }, save, del),
        status
      );

      // Голос и модель
      const voiceSel = h("select", { id: "set-voice", onchange: () => setTtsVoice(p, lang, voiceSel.value) });
      if (p.id === "gemini") {
        const cur = ttsVoice(p, lang);
        for (const [name, kind, g] of GEMINI_VOICES) voiceSel.append(h("option", { value: name, selected: name === cur }, `${name}: ${t(`gv.${kind}`)}, ${t(`voice.${g}`)}`));
      } else {
        elevenOptions(voiceSel);
        loadElevenVoices().then(() => alive && my === voiceRun && elevenOptions(voiceSel));
      }
      const modelSel = h("select", { id: "set-tts-model", onchange: () => setTtsModel(p, modelSel.value) });
      for (const m of p.models) modelSel.append(h("option", { value: m, selected: m === ttsModel(p) }, t(`set.model.${m}`)));
      voiceBox.append(h("label", { class: "field", for: "set-voice" }, h("span", null, t("set.voicePick"))), voiceSel, h("label", { class: "field", for: "set-tts-model" }, h("span", null, t("set.ttsModel"))), modelSel);
    } else if (!speaker.sys.supported) {
      voiceBox.append(h("p", { class: "muted" }, t("set.voiceUnsupported")));
    } else {
      const voices = voicesFor(lang);
      if (!voices.length) voiceBox.append(h("p", { class: "muted" }, t("set.voiceNone")));
      const sel = h("select", { id: "set-voice", onchange: () => store.set(`voice.${lang}`, sel.value) });
      sel.append(h("option", { value: "" }, t("set.voiceAuto")));
      const saved = store.get(`voice.${lang}`, "");
      for (const v of voices) sel.append(h("option", { value: v.voiceURI, selected: v.voiceURI === saved }, `${v.name} (${v.lang})`));
      voiceBox.append(h("label", { class: "field", for: "set-voice" }, h("span", null, t("set.voicePick"))), sel);
    }

    // Общее для любого голоса: скорость, проба, автопереход
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
    const testStatus = h("p", { class: "set-status", role: "status", "aria-live": "polite" });
    const testBtn = h("button", { class: "btn", type: "button", id: "set-voice-test", onclick: () => sample(testStatus, testBtn) }, icon("volume", 18), t("set.voiceTest"));
    voiceBox.append(
      h("label", { class: "field range-head", for: "set-rate" }, h("span", null, t("set.rate")), rateVal),
      rate,
      h("div", { class: "btn-row" }, testBtn),
      testStatus,
      h("label", { class: "check", for: "set-auto" }, auto, h("span", null, t("set.autoNext")))
    );
  };
  renderVoice();
  voicesReady().then(() => alive && ttsChoice() === "system" && renderVoice());

  sheet.body.append(
    keySection,
    h("section", { class: "set-block", id: "set-voice-block" }, h("h3", null, t("set.voice")), voiceBox),
    h("section", { class: "set-block" }, h("h3", null, t("set.quality")), quality),
    h("section", { class: "set-block" }, h("h3", null, t("set.quiz")), quizSelect("kids"), quizSelect("adult")),
    h("p", { class: "muted about" }, t("set.about")),
    h("p", { class: "muted build" }, t("set.build", { v: BUILD }))
  );
  if (focusKey) requestAnimationFrame(() => key.input.focus());
}
