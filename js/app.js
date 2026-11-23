// Точка входа: язык, два экрана (карта и истории) и переходы между ними.

import { setLang, detectLang, t } from "./i18n.js";
import { store } from "./util.js";
import { mountHome } from "./home.js";
import { mountSession } from "./session.js";
import { voicesReady } from "./speech.js";

// Геолокация и микрофон работают только по https.
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if (location.protocol === "http:" && !local) {
  location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
}

setLang(store.get("lang", detectLang()));
document.title = t("app.title");

const root = document.getElementById("app");
history.replaceState(null, "");

const session = mountSession(root, {
  onExit: () => {
    if (history.state?.view === "session") history.back();
    else home.show();
  },
});

const home = mountHome(root, {
  onGenerate: (cfg) => {
    home.hide();
    window.scrollTo(0, 0);
    session.start(cfg);
    history.pushState({ view: "session" }, "");
  },
});

// Кнопка "назад" на телефоне возвращает к карте, а не закрывает приложение.
window.addEventListener("popstate", () => {
  if (session.active) session.stop();
  home.show();
});

voicesReady();
