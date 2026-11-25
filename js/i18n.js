// Тексты интерфейса на двух языках. Язык интерфейса = язык историй.

const STR = {
  "app.title": { ru: "Истории рядом", en: "Stories Nearby" },
  "app.tagline": { ru: "Что здесь было до нас", en: "What happened right here" },

  // Главный экран
  "home.locating": { ru: "Определяю, где вы", en: "Finding where you are" },
  "home.locate": { ru: "Показать, где я", en: "Show where I am" },
  "home.pick": { ru: "Выбрать точку на карте", en: "Pick a point on the map" },
  "home.pickHint": { ru: "Нажмите на карту в нужном месте", en: "Tap the map where you want to look" },
  "home.pickSelf": { ru: "Нажмите на карту там, где стоите", en: "Tap the map where you are standing" },
  "home.pickDestHint": { ru: "Нажмите на карту там, куда идёте", en: "Tap the map where you are heading" },
  "home.manual": { ru: "Точка выбрана вручную", en: "Point picked by hand" },
  "home.backToMe": { ru: "Вернуться ко мне", en: "Back to me" },
  "home.geoDenied": { ru: "Нет доступа к геолокации", en: "No access to your location" },
  "home.geoFailed": { ru: "Телефон не смог определить место", en: "The phone could not find your location" },
  "home.geoSlow": { ru: "Телефон пока не ответил, где вы", en: "The phone has not reported your location yet" },
  "home.geoRough": { ru: "Место определено только примерно, с точностью {dist}", en: "Your location is only approximate, within {dist}" },
  "home.geoInsecure": {
    ru: "Геолокация работает только по защищённому адресу https.",
    en: "Location only works over a secure https address.",
  },
  "home.geoUnsupported": { ru: "Этот браузер не умеет определять место.", en: "This browser cannot find your location." },
  "home.geoHow": { ru: "Как включить", en: "How to allow" },
  "home.geoFix": { ru: "Как уточнить", en: "How to fix" },
  "home.geoWhat": { ru: "Что проверить", en: "What to check" },
  "home.geoAgain": { ru: "Ещё раз", en: "Try again" },
  "home.geoPick": { ru: "Указать место", en: "Set the place" },
  "home.manualSet": {
    ru: "Смотрю вокруг выбранной точки. Вернуться к себе можно кнопкой с прицелом.",
    en: "Looking around the picked point. The crosshair button brings you back to yourself.",
  },
  "home.accuracy": { ru: "точность около {m} м", en: "accurate to about {m} m" },
  "home.unknownPlace": { ru: "Место на карте", en: "Point on the map" },

  "where.label": { ru: "Где вы сейчас", en: "Where you are now" },
  "where.placeholder": { ru: "Адрес или название места", en: "Address or place name" },
  "where.hint": {
    ru: "Найдите место по названию или нажмите на карту там, где стоите.",
    en: "Find the place by name or tap the map where you are standing.",
  },
  "where.searching": { ru: "Ищу", en: "Searching" },

  // Подсказка про геолокацию
  "geo.title": { ru: "Геолокация", en: "Location" },
  "geo.lead.denied": {
    ru: "Сайту закрыт доступ к геолокации. Открыть его можно так:",
    en: "This site is not allowed to see your location. Here is how to allow it:",
  },
  "geo.lead.rough": {
    ru: "Телефон сообщает только примерное место, с точностью {dist}. Чтобы рассказать о том, что рядом, нужно точное.",
    en: "The phone reports only an approximate location, within {dist}. Telling you what is nearby needs a precise one.",
  },
  "geo.lead.failed": { ru: "Телефон не смог определить, где вы.", en: "The phone could not work out where you are." },
  "geo.lead.slow": {
    ru: "Телефон пока не ответил. Если на экране был запрос на доступ к геолокации, выберите «Разрешить».",
    en: "The phone has not answered yet. If a location request appeared on screen, choose Allow.",
  },
  "geo.lead.inapp": {
    ru: "Сайт открыт внутри другого приложения. Его встроенный браузер часто не отдаёт геолокацию.",
    en: "The site is open inside another app. Its built-in browser often withholds location.",
  },
  "geo.lead.ok": { ru: "Геолокация работает.", en: "Location is working." },
  "geo.yourBrowser": { ru: "ваш браузер", en: "your browser" },
  "geo.ios.services": {
    ru: "Откройте «Настройки» телефона → «Конфиденциальность и безопасность» → «Службы геолокации». Переключатель сверху должен быть включён.",
    en: "Open the phone's Settings → Privacy & Security → Location Services. The switch at the top must be on.",
  },
  "geo.ios.safariSites": { ru: "Сайты Safari", en: "Safari Websites" },
  "geo.ios.safari": {
    ru: "Там же в списке выберите «Сайты Safari» → «При использовании приложения» и включите «Точная геопозиция».",
    en: "In the list below choose Safari Websites → While Using the App and turn on Precise Location.",
  },
  "geo.ios.app": {
    ru: "Там же в списке выберите «{app}» → «При использовании приложения» и включите «Точная геопозиция».",
    en: "In the list below choose {app} → While Using the App and turn on Precise Location.",
  },
  "geo.ios.site": {
    ru: "Вернитесь в Safari. Если доступ всё ещё закрыт, нажмите значок слева в адресной строке → «Настройки веб-сайта» → «Геопозиция» → «Разрешить».",
    en: "Go back to Safari. If access is still closed, tap the icon at the left of the address bar → Website Settings → Location → Allow.",
  },
  "geo.ios.precise": {
    ru: "«Настройки» → «Конфиденциальность и безопасность» → «Службы геолокации» → «{app}»: включите «Точная геопозиция».",
    en: "Settings → Privacy & Security → Location Services → {app}: turn on Precise Location.",
  },
  "geo.android.site": {
    ru: "Нажмите значок слева от адреса сайта → «Разрешения» → «Геоданные» и включите доступ.",
    en: "Tap the icon to the left of the site address → Permissions → Location and allow it.",
  },
  "geo.android.app": {
    ru: "Если такого пункта нет: «Настройки» телефона → «Приложения» → «{app}» → «Разрешения» → «Местоположение» → «Разрешить только во время использования». Включите «Использовать точное местоположение».",
    en: "If that item is missing: the phone's Settings → Apps → {app} → Permissions → Location → Allow only while using the app. Turn on Use precise location.",
  },
  "geo.android.switch": {
    ru: "Проверьте, что в шторке быстрых настроек включено «Местоположение».",
    en: "Check that Location is on in the quick settings panel.",
  },
  "geo.android.precise": {
    ru: "«Настройки» → «Приложения» → «{app}» → «Разрешения» → «Местоположение»: включите «Использовать точное местоположение».",
    en: "Settings → Apps → {app} → Permissions → Location: turn on Use precise location.",
  },
  "geo.desktop.site": {
    ru: "Нажмите значок слева от адреса сайта и разрешите доступ к местоположению.",
    en: "Click the icon to the left of the site address and allow location access.",
  },
  "geo.desktop.os": {
    ru: "На Mac проверьте: «Системные настройки» → «Конфиденциальность и безопасность» → «Службы геолокации», браузер должен быть включён в списке.",
    en: "On a Mac check System Settings → Privacy & Security → Location Services: the browser must be switched on in the list.",
  },
  "geo.desktop.rough": {
    ru: "У компьютера без GPS место определяется по сети и часто неточно. Проще указать место самому.",
    en: "A computer without GPS finds its location from the network, often imprecisely. Setting the place yourself is easier.",
  },
  "geo.inapp.openIos": {
    ru: "Откройте меню этого окна (обычно «…» или значок «Поделиться») и выберите «Открыть в Safari».",
    en: "Open this window's menu (usually “…” or the Share icon) and choose Open in Safari.",
  },
  "geo.inapp.openAndroid": {
    ru: "Откройте меню этого окна (обычно «⋮») и выберите «Открыть в Chrome».",
    en: "Open this window's menu (usually “⋮”) and choose Open in Chrome.",
  },
  "geo.inapp.copy": {
    ru: "Или скопируйте адрес кнопкой ниже и вставьте его в браузере.",
    en: "Or copy the address with the button below and paste it into the browser.",
  },
  "geo.step.allow": {
    ru: "Когда появится запрос на доступ к геолокации, выберите «Разрешить».",
    en: "When the location request appears, choose Allow.",
  },
  "geo.step.retry": {
    ru: "Нажмите «Проверить снова». Когда появится запрос, выберите «Разрешить».",
    en: "Press Check again. When the request appears, choose Allow.",
  },
  "geo.step.back": { ru: "Вернитесь сюда и нажмите «Проверить снова».", en: "Come back here and press Check again." },
  "geo.fail.on": { ru: "Проверьте, что геолокация на телефоне включена.", en: "Check that location is switched on in the phone." },
  "geo.fail.sky": {
    ru: "Выйдите на улицу или подойдите к окну: в помещении сигнал слабый.",
    en: "Step outside or move to a window: the signal is weak indoors.",
  },
  "geo.fail.retry": {
    ru: "Нажмите «Проверить снова». Если не поможет, укажите место сами.",
    en: "Press Check again. If that does not help, set the place yourself.",
  },
  "geo.retry": { ru: "Проверить снова", en: "Check again" },
  "geo.pick": { ru: "Указать место самому", en: "Set the place yourself" },
  "geo.copy": { ru: "Скопировать адрес сайта", en: "Copy the site address" },
  "geo.copied": { ru: "Адрес скопирован", en: "Address copied" },
  "geo.copyFailed": { ru: "Скопировать не получилось", en: "Could not copy" },
  "geo.found": { ru: "Место определено", en: "Location found" },
  "geo.diag": { ru: "Что ответил телефон (для разбора)", en: "What the phone reported (for troubleshooting)" },
  "geo.diagCopy": { ru: "Скопировать", en: "Copy" },
  "geo.diagCopied": { ru: "Скопировано", en: "Copied" },

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
  "s.tapToPlay": { ru: "Нажмите кнопку «слушать», чтобы включить звук.", en: "Press the play button to turn the sound on." },
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
  "set.voiceWho": { ru: "Кто читает", en: "Who reads" },
  "set.voice.system": { ru: "Голос телефона", en: "The phone's voice" },
  "set.voice.systemNote": {
    ru: "Бесплатно и без ключа, но звучит механически.",
    en: "Free and needs no key, but sounds mechanical.",
  },
  "set.voice.elevenNote": {
    ru: "Самый выразительный рассказчик. Около 7 центов за минуту рассказа, первые 10 минут в месяц бесплатно.",
    en: "The most expressive narrator. About 7 cents per minute of storytelling; the first 10 minutes each month are free.",
  },
  "set.voice.geminiNote": {
    ru: "Живой голос примерно в пять раз дешевле. У Google есть суточный лимит запросов, на долгую прогулку его может не хватить.",
    en: "A lively voice at about a fifth of the price. Google caps requests per day, which may not cover a long walk.",
  },
  "set.ttsKey": { ru: "Ключ {name}", en: "{name} key" },
  "set.ttsKeyNote": {
    ru: "Ключ хранится только в этом браузере и отправляется только в {host}.",
    en: "The key is kept only in this browser and is sent only to {host}.",
  },
  "set.eleven.how1": {
    ru: "Откройте elevenlabs.io, войдите и выберите слева Developers, вкладка API Keys.",
    en: "Open elevenlabs.io, sign in and choose Developers on the left, then the API Keys tab.",
  },
  "set.eleven.how2": {
    ru: "Нажмите Create Key. Если включён Restrict Key, дайте доступ Text to Speech и Voices. Скопируйте ключ и вставьте сюда.",
    en: "Press Create Key. If Restrict Key is on, give access to Text to Speech and Voices. Copy the key and paste it here.",
  },
  "set.gemini.how1": {
    ru: "Откройте aistudio.google.com/apikey и войдите в Google.",
    en: "Open aistudio.google.com/apikey and sign in to Google.",
  },
  "set.gemini.how2": {
    ru: "Нажмите Create API key, скопируйте ключ и вставьте сюда. Для долгих прогулок там же включите оплату (Set up billing).",
    en: "Press Create API key, copy the key and paste it here. For long walks turn on billing there too (Set up billing).",
  },
  "set.ttsSave": { ru: "Сохранить и послушать", en: "Save and listen" },
  "set.ttsChecking": { ru: "Запрашиваю голос", en: "Asking for the voice" },
  "set.ttsOk": { ru: "Работает. Так будут звучать истории.", en: "It works. This is how the stories will sound." },
  "set.ttsNeedKey": {
    ru: "Вставьте ключ, и истории зазвучат этим голосом. Пока читает голос телефона.",
    en: "Paste a key and the stories will use this voice. Until then the phone's voice reads.",
  },
  "set.ttsModel": { ru: "Модель", en: "Model" },
  "set.model.eleven_v4": { ru: "Eleven v4: лучшее качество", en: "Eleven v4: best quality" },
  "set.model.eleven_v4_turbo": { ru: "Eleven v4 Turbo: быстрее и вдвое дешевле", en: "Eleven v4 Turbo: faster and half the price" },
  "set.model.gemini-3.8-flash-tts": { ru: "Gemini 3.8 Flash TTS: лучшее качество", en: "Gemini 3.8 Flash TTS: best quality" },
  "set.model.gemini-3.8-flash-lite-tts": { ru: "Gemini 3.8 Flash-Lite TTS: дешевле", en: "Gemini 3.8 Flash-Lite TTS: cheaper" },
  "set.voiceLoading": { ru: "Загружаю список голосов", en: "Loading the voice list" },
  "set.voicePick": { ru: "Чей голос", en: "Which voice" },
  "voice.f": { ru: "жен.", en: "female" },
  "voice.m": { ru: "муж.", en: "male" },
  "gv.warm": { ru: "тёплый", en: "warm" },
  "gv.friendly": { ru: "дружелюбный", en: "friendly" },
  "gv.gentle": { ru: "нежный", en: "gentle" },
  "gv.informative": { ru: "обстоятельный", en: "informative" },
  "gv.breezy": { ru: "лёгкий", en: "breezy" },
  "gv.upbeat": { ru: "бодрый", en: "upbeat" },
  "gv.soft": { ru: "мягкий", en: "soft" },
  "gv.gravelly": { ru: "с хрипотцой", en: "gravelly" },
  "gv.smooth": { ru: "плавный", en: "smooth" },
  "gv.firm": { ru: "твёрдый", en: "firm" },
  "gv.bright": { ru: "звонкий", en: "bright" },
  "gv.easygoing": { ru: "спокойный", en: "easy-going" },
  "gv.breathy": { ru: "с придыханием", en: "breathy" },
  "gv.clear": { ru: "чёткий", en: "clear" },
  "gv.excitable": { ru: "азартный", en: "excitable" },
  "gv.mature": { ru: "зрелый", en: "mature" },
  "gv.youthful": { ru: "юный", en: "youthful" },
  "gv.forward": { ru: "напористый", en: "forward" },
  "gv.lively": { ru: "живой", en: "lively" },
  "gv.knowledgeable": { ru: "знающий", en: "knowledgeable" },
  "gv.even": { ru: "ровный", en: "even" },
  "gv.casual": { ru: "непринуждённый", en: "casual" },

  // Нейросетевой голос: что пошло не так
  "tts.service": { ru: "Сервис голоса", en: "The voice service" },
  "tts.err.auth": { ru: "Ключ {name} не подошёл.", en: "The {name} key was rejected." },
  "tts.err.permission": { ru: "{name} не разрешил озвучку с этим ключом.", en: "{name} did not allow speech with this key." },
  "tts.err.credit": { ru: "У {name} закончился запас символов или нужна оплата.", en: "{name} is out of characters or needs payment." },
  "tts.err.rate": { ru: "{name} ограничил частоту запросов.", en: "{name} is limiting how often requests can be made." },
  "tts.err.daily": { ru: "Суточный лимит запросов {name} исчерпан.", en: "The daily request limit of {name} is used up." },
  "tts.err.network": { ru: "Нет связи с {name}.", en: "Cannot reach {name}." },
  "tts.err.other": { ru: "{name} не смог озвучить текст.", en: "{name} could not voice the text." },
  "tts.fallback": { ru: "Дальше читает голос телефона.", en: "The phone's voice takes over." },
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
  if (typeof document !== "undefined") document.documentElement.lang = lang;
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
