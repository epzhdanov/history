// Подсказка "почему не определяется место и что включить": шаги зависят от телефона и браузера.

import { h, toast } from "./util.js";
import { t, fmtDist } from "./i18n.js";
import { openSheet } from "./sheet.js";
import { locationInfo, currentPos, isRough, retryLocation, onLocation } from "./location.js";
import { platform, browserName } from "./platform.js";
import { BUILD } from "./build.js";

/**
 * Что сказать человеку. Возвращает { lead, steps: [...], inApp }.
 * Чистая функция: принимает то, что ответил телефон, и то, на чём открыт сайт.
 */
export function geoAdvice(info, p, { rough = false, acc = 0 } = {}) {
  const app = browserName(p);
  const inApp = p.browser === "inapp";
  const state = rough ? "rough" : info.status;

  if (inApp && state !== "ok") {
    return {
      inApp: true,
      lead: t("geo.lead.inapp"),
      steps: [t(p.os === "android" ? "geo.inapp.openAndroid" : "geo.inapp.openIos"), t("geo.inapp.copy"), t("geo.step.allow")],
    };
  }

  if (state === "denied") {
    let steps;
    if (p.os === "ios") {
      if (p.browser === "safari") steps = [t("geo.ios.services"), t("geo.ios.safari"), ...(p.standalone ? [] : [t("geo.ios.site")]), t("geo.step.retry")];
      else steps = [t("geo.ios.services"), t("geo.ios.app", { app: app || t("geo.yourBrowser") }), t("geo.step.retry")];
    } else if (p.os === "android") {
      steps = [t("geo.android.site"), t("geo.android.app", { app: app || t("geo.yourBrowser") }), t("geo.android.switch"), t("geo.step.retry")];
    } else {
      steps = [t("geo.desktop.site"), t("geo.desktop.os"), t("geo.step.retry")];
    }
    return { lead: t(info.silent ? "geo.lead.deniedSilent" : "geo.lead.denied"), steps };
  }

  if (state === "rough") {
    const lead = t("geo.lead.rough", { dist: fmtDist(acc) });
    if (p.os === "ios") return { lead, steps: [t("geo.ios.precise", { app: p.browser === "safari" ? t("geo.ios.safariSites") : app || t("geo.yourBrowser") }), t("geo.step.back")] };
    if (p.os === "android") return { lead, steps: [t("geo.android.precise", { app: app || t("geo.yourBrowser") }), t("geo.step.back")] };
    return { lead: `${lead} ${t("geo.desktop.rough")}`, steps: [] };
  }

  if (state === "insecure") return { lead: t("home.geoInsecure"), steps: [] };
  if (state === "unsupported") return { lead: t("home.geoUnsupported"), steps: [] };
  if (state === "ok") return { lead: t("geo.lead.ok"), steps: [] };

  // Долго нет ответа или телефон ответил, что определить место не может. Частая причина та же:
  // браузеру не разрешена геолокация, поэтому первым шагом идёт проверка доступа.
  const check =
    p.os === "ios"
      ? t("geo.ios.check", { app: p.browser === "safari" ? t("geo.ios.safariSites") : app || t("geo.yourBrowser") })
      : p.os === "android"
        ? t("geo.android.check", { app: app || t("geo.yourBrowser") })
        : t("geo.desktop.site");
  return {
    lead: t(state === "asking" || state === "idle" ? "geo.lead.slow" : "geo.lead.failed"),
    steps: [check, t("geo.fail.sky"), t("geo.fail.retry")],
  };
}

/** Короткая сводка для разбора: человек может скопировать её и прислать. */
export function geoReport(info, p) {
  const e = info.error;
  return [
    `build: ${BUILD}`,
    `status: ${info.status}${info.slow ? " (slow)" : ""}${info.silent ? " (no prompt)" : ""}`,
    `permission: ${info.perm}`,
    `error: ${e ? `${e.code} ${e.message} (${e.source})` : "-"}`,
    `accuracy: ${info.acc == null ? "-" : `${info.acc} m, ${info.age} s ago`}`,
    `attempts: ${info.attempts}`,
    `secure: ${info.secure ? "yes" : "no"}, supported: ${info.supported ? "yes" : "no"}`,
    `platform: ${p.os} ${p.browser}${p.standalone ? " standalone" : ""}`,
    `ua: ${typeof navigator === "undefined" ? "-" : navigator.userAgent}`,
  ].join("\n");
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Открывает подсказку. onPick - человек решил указать место на карте сам. */
export function openGeoHelp({ onPick } = {}) {
  const p = platform();
  let off = null;
  const sheet = openSheet({ title: t("geo.title"), closeLabel: t("set.close"), onClose: () => off?.() });

  const render = () => {
    const info = locationInfo();
    const pos = currentPos();
    const rough = info.status === "ok" && isRough(pos);
    const a = geoAdvice(info, p, { rough, acc: pos?.acc || 0 });
    const box = sheet.body;
    while (box.firstChild) box.removeChild(box.firstChild);
    box.append(h("p", { class: "geo-lead" }, a.lead));
    if (a.steps.length) box.append(h("ol", { class: "steps geo-steps" }, a.steps.map((s) => h("li", null, s))));

    const row = h("div", { class: "btn-row" });
    if (a.inApp) {
      row.append(
        h(
          "button",
          {
            class: "btn primary",
            type: "button",
            onclick: async () => toast(t((await copy(`${location.origin}${location.pathname}`)) ? "geo.copied" : "geo.copyFailed")),
          },
          t("geo.copy")
        )
      );
    }
    if (info.status !== "ok" || rough) {
      row.append(h("button", { class: a.inApp ? "btn" : "btn primary", type: "button", id: "geo-retry", onclick: () => retryLocation() }, t("geo.retry")));
    }
    row.append(
      h(
        "button",
        {
          class: "btn",
          type: "button",
          id: "geo-pick",
          onclick: () => {
            sheet.close();
            onPick?.();
          },
        },
        t("geo.pick")
      )
    );
    box.append(row);

    const report = geoReport(info, p);
    box.append(
      h(
        "details",
        { class: "geo-diag" },
        h("summary", null, t("geo.diag")),
        h("pre", null, report),
        h("button", { class: "btn", type: "button", onclick: async () => toast(t((await copy(report)) ? "geo.diagCopied" : "geo.copyFailed")) }, t("geo.diagCopy"))
      )
    );
  };

  // Пока окно открыто, следим за геолокацией: как только место нашлось, окно само закрывается.
  let first = true;
  off = onLocation(({ pos, status }) => {
    if (first) {
      first = false;
      return render();
    }
    if (status === "ok" && pos && !isRough(pos)) {
      toast(t("geo.found"));
      return sheet.close();
    }
    render();
  });
}
