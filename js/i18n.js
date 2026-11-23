// Тексты интерфейса на двух языках. Язык интерфейса = язык историй.

const STR = {
  "app.title": { ru: "Истории рядом", en: "Stories Nearby" },
  "app.tagline": { ru: "Что здесь было до нас", en: "What happened right here" },

  // Главный экран
  "home.locating": { ru: "Определяю, где вы", en: "Finding where you are" },
  "home.locate": { ru: "Показать, где я", en: "Show where I am" },
  "home.pick": { ru: "Выбрать точку на карте", en: "Pick a point on the map" },
  "home.pickHint": { ru: "Нажмите на карту в нужном месте", en: "Tap the map where you want to look" },
  "home.pickDestHint": { ru: "Нажмите на карту там, куда идёте", en: "Tap the map where you are heading" },
  "home.manual": { ru: "Точка выбрана вручную", en: "Point picked by hand" },
  "home.backToMe": { ru: "Вернуться ко мне", en: "Back to me" },
  "home.geoDenied": {
    ru: "Нет доступа к геолокации. Разрешите его в настройках браузера или выберите точку на карте.",
    en: "No access to your location. Allow it in the browser settings or pick a point on the map.",
  },
  "home.geoFailed": {
    ru: "Не получилось определить место. Попробуйте ещё раз или выберите точку на карте.",
    en: "Could not find your location. Try again or pick a point on the map.",
  },
  "home.geoInsecure": {
    ru: "Геолокация работает только по защищённому адресу https.",
    en: "Location only works over a secure https address.",
  },
  "home.accuracy": { ru: "точность около {m} м", en: "accurate to about {m} m" },
  "home.unknownPlace": { ru: "Место на карте", en: "Point on the map" },

  "tab.nearby": { ru: "Рядом со мной", en: "Around me" },
  "tab.route": { ru: "Иду в…", en: "Walking to…" },

  "aud.label": { ru: "Для кого", en: "For whom" },
  "aud.adult": { ru: "Взрослым", en: "Adults" },
  "aud.kids": { ru: "Детям 6-7", en: "Kids 6-7" },
  "mode.label": { ru: "Как", en: "How" },
  "mode.voice": { ru: "Голосом", en: "Out loud" },
  "mode.text": { ru: "Текстом", en: "As text" },

  "radius.label": { ru: "Радиус", en: "Radius" },
  "corridor.label": { ru: "По сторонам", en: "To the sides" },
  "minutes.label": { ru: "Рассказ на", en: "Talk for" },
  "minutes.value": { ru: "{n} мин", en: "{n} min" },

  "topics.label": { ru: "О чём рассказать", en: "What to tell you about" },
  "topics.loading": { ru: "Смотрю, что здесь интересного", en: "Looking at what is interesting here" },
  "topics.hint": {
    ru: "Выберите темы или оставьте как есть, тогда подберу самое интересное.",
    en: "Pick topics or leave them alone and I will choose the best ones.",
  },
  "topics.retry": { ru: "Предложить темы ещё раз", en: "Suggest topics again" },
  "topics.needPlace": { ru: "Темы появятся, как только станет понятно, где вы.", en: "Topics will appear once your location is known." },
  "topics.failed": { ru: "Темы не загрузились.", en: "Topics did not load." },
  "topics.custom": { ru: "Свой интерес: пираты, мосты, короли…", en: "Your own interest: pirates, bridges, kings…" },
  "topics.customLabel": { ru: "Свой интерес", en: "Your own interest" },

  "places.searching": { ru: "Ищу места вокруг", en: "Looking for places around" },
  "places.found": { ru: "Мест рядом: {n}", en: "Places nearby: {n}" },
  "places.foundRoute": { ru: "Мест вдоль пути: {n}", en: "Places along the way: {n}" },
  "places.none": {
    ru: "В этом радиусе ничего примечательного не нашлось. Увеличьте радиус.",
    en: "Nothing notable within this radius. Try a larger one.",
  },
  "places.noneRoute": {
    ru: "Вдоль этого пути ничего примечательного не нашлось. Попробуйте смотреть шире.",
    en: "Nothing notable along this way. Try looking wider.",
  },
  "places.failed": {
    ru: "Не получилось загрузить места. Проверьте интернет.",
    en: "Could not load places. Check your connection.",
  },
  "places.retry": { ru: "Повторить", en: "Try again" },

  "route.placeholder": { ru: "Куда идём? Адрес или название", en: "Where to? Address or place name" },
  "route.search": { ru: "Найти", en: "Search" },
  "route.orMap": { ru: "или нажмите на карту", en: "or tap the map" },
  "route.summary": { ru: "{dist}, около {min} мин пешком", en: "{dist}, about {min} min on foot" },
  "route.straight": { ru: "по прямой", en: "as the crow flies" },
  "route.clear": { ru: "Сбросить маршрут", en: "Clear the route" },
  "route.notFound": { ru: "Ничего не нашлось. Попробуйте другое название.", en: "Nothing found. Try another name." },
  "route.building": { ru: "Строю маршрут", en: "Building the route" },
  "route.needDest": { ru: "Сначала выберите, куда идёте", en: "First choose where you are heading" },
  "route.tooFar": { ru: "Слишком далеко для прогулки: {dist}", en: "Too far for a walk: {dist}" },
  "route.dest": { ru: "Куда идём", en: "Destination" },

  "cta.generate": { ru: "Сгенерировать истории", en: "Generate stories" },
  "cta.needLocation": { ru: "Сначала нужно место на карте", en: "A point on the map is needed first" },

  "key.need": {
    ru: "Истории пишет Claude. Чтобы он заработал, один раз добавьте свой API-ключ.",
    en: "Stories are written by Claude. Add your API key once to switch it on.",
  },
  "key.add": { ru: "Добавить ключ", en: "Add the key" },

  // Экран историй
  "s.back": { ru: "Назад", en: "Back" },
  "s.planning": { ru: "Подбираю истории", en: "Picking the stories" },
  "s.writing": { ru: "Пишу историю", en: "Writing the story" },
  "s.thinking": { ru: "Думаю над ответом", en: "Thinking about the answer" },
  "s.counter": { ru: "История {i} из {n}", en: "Story {i} of {n}" },
  "s.next": { ru: "Следующая история", en: "Next story" },
  "s.more": { ru: "Расскажи подробнее", en: "Tell me more" },
  "s.moreAsk": {
    ru: "Расскажи об этом месте ещё одну историю или любопытную подробность, которой не было в рассказе.",
    en: "Tell me one more story or a curious detail about this place that was not in the story.",
  },
  "s.replay": { ru: "Послушать ещё раз", en: "Listen again" },
  "s.play": { ru: "Слушать", en: "Listen" },
  "s.pause": { ru: "Пауза", en: "Pause" },
  "s.resume": { ru: "Продолжить", en: "Resume" },
  "s.skip": { ru: "Дальше", en: "Skip" },
  "s.ask": { ru: "Спросите что-нибудь", en: "Ask anything" },
  "s.send": { ru: "Отправить", en: "Send" },
  "s.mic": { ru: "Спросить голосом", en: "Ask by voice" },
  "s.listening": { ru: "Слушаю", en: "Listening" },
  "s.micDenied": { ru: "Нет доступа к микрофону. Напишите вопрос текстом.", en: "No microphone access. Type the question instead." },
  "s.micNothing": { ru: "Ничего не расслышал. Попробуйте ещё раз.", en: "I did not catch that. Try again." },
  "s.voiceOn": { ru: "Включить голос", en: "Turn the voice on" },
  "s.voiceOff": { ru: "Выключить голос", en: "Turn the voice off" },
  "s.source": { ru: "Источник", en: "Source" },
  "s.sources": { ru: "Источники", en: "Sources" },
  "s.wikipedia": { ru: "Википедия", en: "Wikipedia" },
  "s.noSource": {
    ru: "Статьи об этом месте не нашлось, рассказ основан на общих знаниях Claude.",
    en: "No article was found for this place, so the story rests on what Claude knows in general.",
  },
  "s.endTitle": { ru: "На этом пока всё", en: "That is all for now" },
  "s.endText": { ru: "Можно послушать ещё истории об этих местах или вернуться к карте.", en: "You can hear more stories about these places or go back to the map." },
  "s.moreStories": { ru: "Ещё истории", en: "More stories" },
  "s.home": { ru: "К карте", en: "Back to the map" },
  "s.noMore": { ru: "Больше историй здесь не нашлось.", en: "No more stories were found here." },
  "s.storyFailed": { ru: "Историю написать не получилось.", en: "The story could not be written." },
  "s.map": { ru: "Карта", en: "Map" },
  "s.nothing": {
    ru: "Здесь не нашлось мест, о которых есть что рассказать. Попробуйте увеличить радиус.",
    en: "No places with a story to tell were found here. Try a larger radius.",
  },
  "s.retry": { ru: "Попробовать ещё раз", en: "Try again" },
  "s.you": { ru: "Вы", en: "You" },
  "s.showMap": { ru: "Показать карту", en: "Show the map" },
  "s.hideMap": { ru: "Скрыть карту", en: "Hide the map" },
  "s.continueStory": { ru: "Вернуться к рассказу", en: "Back to the story" },
  "s.muteHint": {
    ru: "Если не слышно, прибавьте громкость и выключите беззвучный режим.",
    en: "If you hear nothing, turn the volume up and switch silent mode off.",
  },
  "s.skipStory": { ru: "Пропустить историю", en: "Skip this story" },
  "s.ttsBroken": {
    ru: "Голос на этом устройстве не запустился. Показываю текстом.",
    en: "The voice did not start on this device. Showing text instead.",
  },

  // Положение места
  "pos.near": { ru: "{dist} {dir}", en: "{dist} {dir}" },
  "pos.here": { ru: "вы рядом", en: "you are right here" },
  "pos.walk": { ru: "{min} мин пешком", en: "{min} min on foot" },
  "pos.left": { ru: "слева", en: "on the left" },
  "pos.right": { ru: "справа", en: "on the right" },
  "pos.on": { ru: "прямо по пути", en: "right on the way" },
  "pos.along": { ru: "через {dist}", en: "in {dist}" },
  "pos.atStart": { ru: "в самом начале", en: "right at the start" },
  "pos.behind": { ru: "в самом начале, у вас за спиной", en: "right at the start, behind you" },
  "pos.atEnd": { ru: "в конце пути", en: "at the end of the way" },

  // Вопросы
  "q.title": { ru: "Вопрос", en: "Question" },
  "q.titleKids": { ru: "А теперь вопрос", en: "Now a question" },
  "q.answer": { ru: "Ответить", en: "Answer" },
  "q.placeholder": { ru: "Ваш ответ", en: "Your answer" },
  "q.voice": { ru: "Ответить голосом", en: "Answer by voice" },
  "q.checking": { ru: "Проверяю ответ", en: "Checking the answer" },
  "q.skip": { ru: "Пропустить вопрос", en: "Skip the question" },
  "q.openHint": { ru: "Ответьте голосом или напишите внизу", en: "Answer by voice or type below" },
  "q.yourAnswer": { ru: "Ваш ответ", en: "Your answer" },
  "q.right": { ru: "Верно", en: "Correct" },
  "q.partly": { ru: "Почти", en: "Almost" },
  "q.wrong": { ru: "Не совсем", en: "Not quite" },

  // Настройки
  "set.title": { ru: "Настройки", en: "Settings" },
  "set.close": { ru: "Закрыть", en: "Close" },
  "set.lang": { ru: "Язык", en: "Language" },
  "set.keyTitle": { ru: "Ключ Claude", en: "Claude key" },
  "set.keyNote": {
    ru: "Ключ хранится только в этом браузере и отправляется только в api.anthropic.com.",
    en: "The key is kept only in this browser and is sent only to api.anthropic.com.",
  },
  "set.keyLabel": { ru: "API-ключ Anthropic", en: "Anthropic API key" },
  "set.keyHow1": { ru: "Откройте platform.claude.com, раздел API Keys.", en: "Open platform.claude.com and go to API Keys." },
  "set.keyHow2": { ru: "Нажмите Create Key, скопируйте ключ и вставьте сюда.", en: "Press Create Key, copy the key and paste it here." },
  "set.keySave": { ru: "Сохранить и проверить", en: "Save and check" },
  "set.keyChecking": { ru: "Проверяю ключ", en: "Checking the key" },
  "set.keyOk": { ru: "Ключ работает", en: "The key works" },
  "set.keySaved": { ru: "Ключ сохранён", en: "Key saved" },
  "set.keyDelete": { ru: "Удалить ключ", en: "Delete the key" },
  "set.keyDeleted": { ru: "Ключ удалён", en: "Key deleted" },
  "set.keyEmpty": { ru: "Вставьте ключ", en: "Paste the key" },
  "set.keyShow": { ru: "Показать ключ", en: "Show the key" },
  "set.quality": { ru: "Кто пишет истории", en: "Who writes the stories" },
  "set.q.fast": { ru: "Быстро", en: "Fast" },
  "set.q.fastNote": { ru: "Claude Haiku: почти сразу и дешевле всего", en: "Claude Haiku: almost instant and the cheapest" },
  "set.q.balanced": { ru: "Баланс", en: "Balanced" },
  "set.q.balancedNote": { ru: "Claude Sonnet: живой рассказ без долгого ожидания", en: "Claude Sonnet: lively stories without a long wait" },
  "set.q.best": { ru: "Максимум", en: "Best" },
  "set.q.bestNote": { ru: "Claude Opus: самый тонкий рассказчик, но медленнее и дороже", en: "Claude Opus: the finest storyteller, slower and costlier" },
  "set.quiz": { ru: "Вопросы после историй", en: "Questions after stories" },
  "set.quizKids": { ru: "Детям", en: "For kids" },
  "set.quizAdult": { ru: "Взрослым", en: "For adults" },
  "set.quiz.mixed": { ru: "Вперемешку", en: "Mixed" },
  "set.quiz.choice": { ru: "Квиз с вариантами", en: "Quiz with options" },
  "set.quiz.open": { ru: "Открытый вопрос", en: "Open question" },
  "set.quiz.off": { ru: "Не задавать", en: "None" },
  "set.voice": { ru: "Голос", en: "Voice" },
  "set.voicePick": { ru: "Чей голос", en: "Which voice" },
  "set.voiceAuto": { ru: "Выбрать автоматически", en: "Choose automatically" },
  "set.voiceNone": {
    ru: "На этом устройстве нет голоса для этого языка. Его можно добавить в настройках телефона.",
    en: "This device has no voice for this language. You can add one in the phone settings.",
  },
  "set.voiceUnsupported": { ru: "Этот браузер не умеет говорить вслух.", en: "This browser cannot speak out loud." },
  "set.rate": { ru: "Скорость речи", en: "Speaking speed" },
  "set.voiceTest": { ru: "Проверить голос", en: "Test the voice" },
  "set.voiceSample": {
    ru: "Привет! Я расскажу истории о местах, которые вас окружают.",
    en: "Hello! I will tell you stories about the places around you.",
  },
  "set.autoNext": { ru: "После истории сразу начинать следующую", en: "Start the next story right after the previous one" },
  "set.about": {
    ru: "Места берутся из Википедии, Викиданных и OpenStreetMap. Истории по этим источникам пишет Claude. Он старается не выдумывать, но может ошибаться, поэтому под каждой историей есть ссылка на источник.",
    en: "Places come from Wikipedia, Wikidata and OpenStreetMap. Claude writes the stories from those sources. It tries not to make things up but can be wrong, so every story links to its source.",
  },

  // Ошибки AI
  "err.noKey": { ru: "Нужен ключ Claude. Добавьте его в настройках.", en: "A Claude key is needed. Add it in the settings." },
  "err.auth": { ru: "Ключ Claude не подошёл. Проверьте его в настройках.", en: "The Claude key was rejected. Check it in the settings." },
  "err.permission": { ru: "У этого ключа нет доступа к модели.", en: "This key has no access to the model." },
  "err.credit": {
    ru: "На счёте Claude закончились деньги. Пополните баланс на platform.claude.com.",
    en: "The Claude account is out of credit. Top it up at platform.claude.com.",
  },
  "err.rate": { ru: "Слишком много запросов. Подождите минуту и попробуйте снова.", en: "Too many requests. Wait a minute and try again." },
  "err.overloaded": { ru: "Claude сейчас перегружен. Попробуйте ещё раз чуть позже.", en: "Claude is overloaded right now. Try again in a moment." },
  "err.network": { ru: "Нет связи с Claude. Проверьте интернет.", en: "Cannot reach Claude. Check your connection." },
  "err.refusal": { ru: "Claude отказался отвечать на этот запрос.", en: "Claude declined this request." },
  "err.badAnswer": { ru: "Claude ответил непонятно. Попробуйте ещё раз.", en: "Claude gave an unusable answer. Try again." },
  "err.unknown": { ru: "Что-то пошло не так: {msg}", en: "Something went wrong: {msg}" },

  // Фразы, которые произносятся сразу, пока готовятся истории
  "say.start": { ru: "Секунду, подбираю истории.", en: "One moment, picking the stories." },
  "say.startKids": { ru: "Секундочку, ищу самое интересное!", en: "One second, looking for the best bits!" },
};

const PLURAL_RU = {
  story: ["история", "истории", "историй"],
};

let lang = "ru";

export function setLang(l) {
  lang = l === "en" ? "en" : "ru";
  document.documentElement.lang = lang;
}

export const getLang = () => lang;

export function t(key, vars) {
  const entry = STR[key];
  let s = entry ? entry[lang] ?? entry.ru : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function pluralRu(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function countStories(n) {
  return lang === "ru" ? `${n} ${pluralRu(n, PLURAL_RU.story)}` : `${n} ${n === 1 ? "story" : "stories"}`;
}

export function fmtDist(m) {
  if (m < 950) {
    const r = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
    return lang === "ru" ? `${r} м` : `${r} m`;
  }
  const km = m / 1000;
  const v = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return lang === "ru" ? `${v.replace(".", ",")} км` : `${v} km`;
}

const COMPASS = {
  ru: ["к северу", "к северо-востоку", "к востоку", "к юго-востоку", "к югу", "к юго-западу", "к западу", "к северо-западу"],
  en: ["to the north", "to the northeast", "to the east", "to the southeast", "to the south", "to the southwest", "to the west", "to the northwest"],
};

export function compassWord(deg) {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS[lang][i];
}

export function detectLang() {
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("ru") || nav.startsWith("uk") || nav.startsWith("be") ? "ru" : "en";
}
