// На чём открыто приложение: от этого зависит, где человеку искать настройки геолокации.

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Telegram|TikTok|musical_ly|Snapchat|LinkedInApp|Twitter|VKClient|Viber|WhatsApp/i;

/** Разбор строки браузера. Вынесено отдельно, чтобы проверять на примерах. */
export function parsePlatform(ua, { touchMac = false, standalone = false } = {}) {
  const s = String(ua || "");
  const ios = /iPhone|iPad|iPod/.test(s) || touchMac;
  const android = /Android/.test(s);
  let browser = "other";
  if (ios) {
    if (/CriOS/.test(s)) browser = "chrome";
    else if (/FxiOS/.test(s)) browser = "firefox";
    else if (/EdgiOS/.test(s)) browser = "edge";
    else if (/YaBrowser/.test(s)) browser = "yandex";
    else if (/GSA\//.test(s)) browser = "google";
    // Встроенный браузер другого приложения: у него нет пометки Safari или есть имя приложения.
    else if (IN_APP.test(s) || !/Safari\//.test(s)) browser = "inapp";
    else browser = "safari";
  } else if (android) {
    if (IN_APP.test(s) || /; wv\)/.test(s)) browser = "inapp";
    else if (/SamsungBrowser/.test(s)) browser = "samsung";
    else if (/YaBrowser/.test(s)) browser = "yandex";
    else if (/Firefox/.test(s)) browser = "firefox";
    else if (/EdgA/.test(s)) browser = "edge";
    else if (/OPR\//.test(s)) browser = "opera";
    else if (/Chrome/.test(s)) browser = "chrome";
  } else if (/Edg\//.test(s)) browser = "edge";
  else if (/Firefox/.test(s)) browser = "firefox";
  else if (/Chrome/.test(s)) browser = "chrome";
  else if (/Safari/.test(s)) browser = "safari";
  // Значок на экране "Домой" на iPhone работает как Safari, даже если пометки Safari в строке нет.
  if (ios && standalone && browser === "inapp") browser = "safari";
  return { os: ios ? "ios" : android ? "android" : "desktop", browser, standalone };
}

export function platform() {
  if (typeof navigator === "undefined") return { os: "desktop", browser: "other", standalone: false };
  let standalone = false;
  try {
    standalone = navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    /* старый браузер */
  }
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return parsePlatform(navigator.userAgent, { touchMac, standalone });
}

const NAMES = { safari: "Safari", chrome: "Chrome", firefox: "Firefox", edge: "Edge", yandex: "Яндекс Браузер", samsung: "Samsung Internet", opera: "Opera", google: "Google" };

/** Название браузера, как оно написано в настройках телефона. */
export const browserName = (p) => NAMES[p.browser] || "";
