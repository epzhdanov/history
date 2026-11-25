"""Проверка интерфейса в мобильном браузере с подставной сетью.

Запуск:  python3 tests/e2e.py            (все сценарии)
         python3 tests/e2e.py home kids  (только выбранные)
Снимки экрана складываются в tests/shots/.
"""
import functools
import http.server
import json
import os
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

import mocks

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tests" / "shots"
PORT = 8765
BASE = f"http://localhost:{PORT}/"
CHROME = "/usr/bin/google-chrome"
ROSSIO = (38.7139, -9.1394)
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class App:
    """Одна вкладка с приложением и подставным Claude."""

    def __init__(self, browser, *, key=True, store=None, geo=ROSSIO, locale="ru-RU", grant=True, tts_ms=2, ua=None, fake_geo=None, voice=None):
        self.claude = mocks.Claude()
        self.tts = mocks.Tts()
        self.errors = []
        self.ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale=locale,
            geolocation={"latitude": geo[0], "longitude": geo[1], "accuracy": 12} if geo else None,
            permissions=["geolocation"] if grant else [],
            **({"user_agent": ua} if ua else {}),
        )
        mocks.install(self.ctx, self.claude, self.tts)
        items = dict(store or {})
        if key:
            items.setdefault("apiKey", "sk-ant-test-0000000000000000")
        if voice:  # нейросетевой голос: "eleven" или "gemini"
            items.setdefault("tts.provider", voice)
            items.setdefault(f"tts.key.{voice}", mocks.ELEVEN_KEY if voice == "eleven" else mocks.GEMINI_KEY)
        seed = "".join(f"localStorage.getItem('history.{k}') === null && localStorage.setItem('history.{k}', {json.dumps(json.dumps(v))});" for k, v in items.items())
        if fake_geo is not None:  # подставной ответ телефона вместо настоящей геолокации браузера
            seed += f"localStorage.getItem('__geo') === null && localStorage.setItem('__geo', {json.dumps(json.dumps(fake_geo))});"
        self.ctx.add_init_script(f"try {{ {seed} }} catch (e) {{}}" + mocks.FAKE_GEO + mocks.AUDIO_SPY + mocks.FAKE_SPEECH + f"window.__ttsMs = {tts_ms};")
        self.page = self.ctx.new_page()
        self.page.on("console", lambda m: self.errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        self.page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))

    def open(self):
        self.page.goto(BASE)
        self.page.wait_for_selector(".panel")
        return self.page

    def shot(self, name, full=False):
        SHOTS.mkdir(parents=True, exist_ok=True)
        self.page.wait_for_timeout(350)
        self.page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)

    def spoken(self):
        return self.page.evaluate("window.__spoken")

    def kinds(self):
        return [c["kind"] for c in self.claude.calls]

    def close(self):
        self.ctx.close()

    def set_geo(self, spec):
        """Меняет ответ подставной геолокации на ходу (как будто человек что-то включил в телефоне)."""
        self.page.evaluate("s => localStorage.setItem('__geo', JSON.stringify(s))", spec)

    def wait_until(self, cond, timeout=8000, what="условие"):
        """Ждёт, пока условие на стороне теста (например, пришёл запрос к подставному сервису) станет верным."""
        t0 = time.time()
        while not cond():
            assert (time.time() - t0) * 1000 < timeout, f"не дождались: {what}"
            self.page.wait_for_timeout(50)

    def audio(self):
        """Состояние проигрывателя нейросетевого голоса."""
        return self.page.evaluate("() => { const a = (window.__audios || [])[0]; return a ? { paused: a.paused, time: a.currentTime, rate: a.playbackRate, loop: a.loop, n: window.__audios.length } : null; }")

    def verify(self, allow=()):
        bad = [e for e in self.errors if "favicon" not in e and not any(a in e for a in allow)]
        assert not self.claude.problems, f"нарушения в запросах: {self.claude.problems}"
        assert not self.tts.problems, f"нарушения в запросах к сервису голоса: {self.tts.problems}"
        assert not bad, f"ошибки в консоли: {bad}"


SCENARIOS = {}


def scenario(fn):
    SCENARIOS[fn.__name__] = fn
    return fn


@scenario
def home(browser):
    """Главный экран: место, найденные места, темы от AI."""
    app = App(browser)
    page = app.open()
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    expect(page.locator(".count")).to_contain_text("Мест рядом")
    assert "topics" in app.kinds()
    call = next(c for c in app.claude.calls if c["kind"] == "topics")
    assert call["model"] == "claude-haiku-5-5", call["model"]
    assert "P1 | " in call["user"] and "Search radius: 500 m" in call["user"], call["user"][:400]
    assert "Португалия" not in call["user"].split("<places>")[1].split("\n")[2], "слишком общая статья не должна идти первой"
    app.shot("01-home")
    app.shot("01-home-full", full=True)
    # Выбор темы
    page.locator(".topic").nth(0).click()
    expect(page.locator(".topic").nth(0)).to_have_attribute("aria-pressed", "true")
    # Радиус: меняем и ждём новый поиск и новые темы
    before = len([c for c in app.claude.calls if c["kind"] == "topics"])
    page.locator("#radius").evaluate("el => { el.value = 1; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }")
    expect(page.locator(".slider output").first).to_have_text("200 м")
    page.wait_for_function(f"() => true", timeout=1000)
    page.wait_for_timeout(1500)
    after = len([c for c in app.claude.calls if c["kind"] == "topics"])
    assert after == before + 1, (before, after)
    last = [c for c in app.claude.calls if c["kind"] == "topics"][-1]
    assert "Search radius: 200 m" in last["user"]
    app.verify()
    app.close()


@scenario
def nokey(browser):
    """Без ключа: места видны, вместо тем подсказка, кнопка открывает настройки."""
    app = App(browser, key=False)
    page = app.open()
    expect(page.locator(".note.key")).to_be_visible(timeout=8000)
    assert app.kinds() == []
    app.shot("02-nokey")
    page.locator(".cta").click()
    expect(page.locator(".sheet")).to_be_visible()
    app.shot("03-settings")
    page.locator("#set-key").fill("sk-ant-test-1111111111111111")
    page.get_by_role("button", name="Сохранить и проверить").click()
    expect(page.locator(".set-status.good")).to_have_text("Ключ работает", timeout=5000)
    assert app.kinds()[0] == "key"
    page.locator(".sheet-head .icon-btn").click()
    expect(page.locator(".sheet")).to_have_count(0)
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    app.verify()
    app.close()


def start_session(app, *, topics=4):
    page = app.page
    expect(page.locator(".topic:not(.ghost)")).to_have_count(topics, timeout=8000)
    page.locator(".cta").click()
    expect(page.locator("#session")).to_be_visible()
    return page


@scenario
def adult_voice(browser):
    """Взрослый режим с голосом: план, две истории подряд, финал, вопрос слушателя."""
    app = App(browser, tts_ms=5)
    page = app.open()
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    page.locator(".topic").nth(0).click()
    page.locator("#interest").fill("пираты")
    page.locator(".cta").click()
    expect(page.locator("#session")).to_be_visible()
    expect(page.locator(".story")).to_have_count(1, timeout=8000)
    expect(page.locator(".story .plaque-name").first).to_have_text("Росиу")
    expect(page.locator(".sent.now")).to_have_count(1, timeout=6000)
    app.shot("04-story-voice")
    expect(page.locator(".s-end")).to_be_visible(timeout=25000)
    expect(page.locator(".story")).to_have_count(2)
    expect(page.locator(".s-counter")).to_have_text("История 2 из 2")
    page.wait_for_function("() => window.__spoken.some(x => x.startsWith('На этом пока всё'))", timeout=6000)

    plan = next(c for c in app.claude.calls if c["kind"] == "plan")
    assert "Plan 2 stories" in plan["user"], plan["user"][-300:]
    assert "The listener picked these themes" in plan["user"] and "Землетрясение 1755 года" in plan["user"]
    assert '"пираты"' in plan["user"]
    assert plan["model"] == "claude-haiku-5-5" and plan["effort"] == "low", plan
    stories = [c for c in app.claude.calls if c["kind"] == "story"]
    assert len(stories) == 2, app.kinds()
    st = stories[0]
    assert st["model"] == "claude-sonnet-5-5" and st["thinking"] == {"type": "between_tools"} and st["effort"] == "medium", st
    assert "Write in Russian" in st["system"] and "speech synthesizer" in st["system"] and "curious adult" in st["system"]
    assert "Тестовый раздел об истории" in st["user"] and "Сноски" not in st["user"], "в источник должен попасть раздел истории, но не сноски"
    assert "story 1 of 2" in st["user"] and "story 2 of 2" in stories[1]["user"]
    assert "Already told on this walk" in stories[1]["user"]
    assert "quiz_choice" not in app.kinds() and "quiz_open" not in app.kinds(), "взрослым вопросы по умолчанию не задаются"

    spoken = app.spoken()
    assert spoken[0] == "Секунду, подбираю истории.", spoken[:2]
    i1 = next(i for i, x in enumerate(spoken) if x.startswith("Посмотрите на Росиу"))
    i2 = next(i for i, x in enumerate(spoken) if x.startswith("Посмотрите на") and i > i1)
    assert 0 < i1 < i2, spoken
    assert spoken[i1 + 1].startswith("Это тестовая история"), spoken[i1 : i1 + 3]
    assert not any("-" == x.strip() for x in spoken)
    assert "—" not in page.locator(".s-feed").inner_text()
    # Источник под историей
    expect(page.locator(".story-sources a").first).to_have_attribute("href", "https://pt.wikipedia.org/wiki/Pra%C3%A7a_D._Pedro_IV")
    app.shot("05-end", full=False)

    # Вопрос слушателя текстом
    page.locator("#ask").fill("А кто такой Педру Четвёртый?")
    page.locator(".ask button[type=submit]").click()
    expect(page.locator(".bubble.me")).to_have_text("А кто такой Педру Четвёртый?")
    expect(page.locator(".bubble.ai")).to_contain_text("Это тестовый ответ", timeout=6000)
    chat = next(c for c in app.claude.calls if c["kind"] == "chat")
    assert "<current_story" in chat["system"] and "<places>" in chat["system"]
    page.wait_for_function("() => window.__spoken.some(x => x.startsWith('Это тестовый ответ'))", timeout=6000)
    app.shot("06-chat")
    app.verify()
    app.close()


@scenario
def interrupt(browser):
    """Вопрос посреди рассказа: речь останавливается, после ответа рассказ продолжается с того же места."""
    app = App(browser, tts_ms=22)
    page = app.open()
    start_session(app)
    page.wait_for_function("() => window.__spoken.some(x => x.startsWith('Посмотрите на Росиу'))", timeout=12000)
    page.locator("#ask").fill("Подожди, а что это за колонна?")
    page.locator(".ask button[type=submit]").click()
    expect(page.locator(".bubble.ai")).to_contain_text("Это тестовый ответ", timeout=6000)
    # После ответа рассказ сам возвращается к прерванной фразе и доходит до конца.
    page.wait_for_function("() => window.__spoken.filter(x => x.startsWith('Последний абзац')).length >= 1", timeout=30000)
    spoken = app.spoken()
    ans = next(i for i, x in enumerate(spoken) if x.startswith("Это тестовый ответ"))
    assert any(x.startswith("Последний абзац") for x in spoken[ans:]), spoken
    assert not any(x.startswith("Последний абзац") for x in spoken[:ans]), "рассказ не должен был договорить до вопроса"
    assert len([c for c in app.claude.calls if c["kind"] == "story"]) <= 2
    # Пауза и продолжение кнопкой
    page.locator(".play-btn").click()
    app.verify()
    app.close()


@scenario
def kids_quiz(browser):
    """Детский режим: истории, квиз с вариантами, открытый вопрос с проверкой ответа."""
    app = App(browser, store={"audience": "kids", "minutesIdx": 2}, tts_ms=3)
    page = app.open()
    expect(page.locator("body")).to_have_attribute("data-aud", "kids")
    start_session(app)
    expect(page.locator(".story .sent").first).to_be_visible(timeout=8000)
    app.shot("07a-kids-story")
    expect(page.locator(".quiz .opt")).to_have_count(3, timeout=20000)
    app.shot("07-kids-quiz")
    page.wait_for_function("() => window.__spoken.some(x => x.includes('Первый вариант'))", timeout=6000)
    page.locator(".quiz .opt").nth(0).click()
    expect(page.locator(".quiz .opt.wrong")).to_have_count(1)
    expect(page.locator(".quiz .opt.right")).to_have_count(1)
    expect(page.locator(".quiz-reply.wrong")).to_contain_text("Не совсем")
    app.shot("08-kids-quiz-answered")
    # Вторая история и открытый вопрос
    expect(page.locator(".story")).to_have_count(2, timeout=15000)
    expect(page.locator(".story").nth(1).locator(".quiz-q")).to_have_text("О чём была эта история?", timeout=20000)
    expect(page.locator("#ask")).to_have_attribute("placeholder", "Ваш ответ")
    page.locator("#ask").fill("про проверку")
    page.locator(".ask button[type=submit]").click()
    expect(page.locator(".story").nth(1).locator(".quiz-reply.right")).to_contain_text("Точно", timeout=8000)
    expect(page.locator(".s-end")).to_be_visible(timeout=10000)
    expect(page.locator("#ask")).to_have_attribute("placeholder", "Спросите что-нибудь")
    app.shot("09-kids-open-answer")

    kinds = app.kinds()
    assert kinds.count("quiz_choice") == 1 and kinds.count("quiz_open") == 1 and kinds.count("check") == 1, kinds
    plan = next(c for c in app.claude.calls if c["kind"] == "plan")
    assert "child of 6-7" in plan["user"] and "Plan 2 stories" in plan["user"]
    assert "| Росиу (вокзал) [" in plan["user"], "одинаковые названия должны различаться уточнением"
    st = next(c for c in app.claude.calls if c["kind"] == "story")
    assert "A child of 6 or 7" in st["system"] and 'Speak to the child as "ты"' in st["system"]
    assert "no compass directions" in st["user"]
    quiz = next(c for c in app.claude.calls if c["kind"] == "quiz_choice")
    assert quiz["model"] == "claude-haiku-5-5" and quiz["thinking"] == {"type": "disabled"}, quiz
    check = next(c for c in app.claude.calls if c["kind"] == "check")
    assert 'The listener answered: "про проверку"' in check["user"]
    spoken = app.spoken()
    assert spoken[0] == "Секундочку, ищу самое интересное!"
    assert any(x.startswith("Не совсем") for x in spoken) and any(x.startswith("Точно") for x in spoken), spoken
    app.verify()
    app.close()


@scenario
def text_mode(browser):
    """Текстовый режим: без голоса, переход кнопкой, озвучка по желанию."""
    app = App(browser, store={"voiceMode": False})
    page = app.open()
    start_session(app)
    expect(page.locator(".story-next .btn")).to_be_visible(timeout=10000)
    assert app.spoken() == [], app.spoken()
    expect(page.locator(".story")).to_have_count(1)
    st = next(c for c in app.claude.calls if c["kind"] == "story")
    assert "read on a phone screen" in st["system"] and "speech synthesizer" not in st["system"]
    app.shot("10-text-mode")
    page.locator(".story-next .btn").click()
    expect(page.locator(".story")).to_have_count(2)
    expect(page.locator(".s-end")).to_be_visible(timeout=10000)
    # Послушать первую историю
    page.locator(".story").nth(0).locator(".chip-btn").nth(0).click()
    page.wait_for_function("() => window.__spoken.some(x => x.startsWith('Последний абзац'))", timeout=8000)
    # Расскажи подробнее
    page.locator(".story").nth(1).locator(".chip-btn").nth(1).click()
    expect(page.locator(".story").nth(1).locator(".bubble.me")).to_have_text("Расскажи подробнее")
    expect(page.locator(".story").nth(1).locator(".bubble.ai")).to_contain_text("Это тестовый ответ", timeout=6000)
    # Назад к карте
    page.locator(".s-top .icon-btn").first.click()
    expect(page.locator("#home")).to_be_visible()
    expect(page.locator("#session")).to_have_count(0)
    app.verify()
    app.close()


@scenario
def route(browser):
    """Маршрут: поиск точки назначения, места вдоль пути со сторонами, истории по порядку."""
    app = App(browser, tts_ms=2)
    page = app.open()
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    page.get_by_role("button", name="Иду в…").click()
    expect(page.locator("#dest-q")).to_be_visible()
    app.shot("11-route-empty")
    page.locator("#dest-q").fill("Praça do Comércio")
    page.locator(".route-box .search button").click()
    expect(page.locator(".results li")).to_have_count(2, timeout=5000)
    page.locator(".results button").first.click()
    expect(page.locator(".route-sum")).to_contain_text("мин пешком", timeout=8000)
    expect(page.locator(".route-sum strong")).to_have_text("Praça do Comércio")
    expect(page.locator(".count")).to_contain_text("Мест вдоль пути", timeout=8000)
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    app.shot("12-route")
    topics = [c for c in app.claude.calls if c["kind"] == "topics"][-1]
    assert "walks to Praça do Comércio" in topics["user"] and "Rua Augusta" in topics["user"], topics["user"][:300]
    assert "on the listener's LEFT" in topics["user"] or "on the listener's RIGHT" in topics["user"], topics["user"][:1200]
    page.locator(".cta").click()
    expect(page.locator(".story")).to_have_count(1, timeout=8000)
    sub = page.locator(".story .plaque-sub").first.inner_text()
    assert any(w in sub for w in ("слева", "справа", "прямо по пути", "в самом начале")), sub
    st = next(c for c in app.claude.calls if c["kind"] == "story")
    assert "when and on which side" in st["user"]
    # Карта историй
    page.locator(".s-top .icon-btn").nth(2).click()
    expect(page.locator(".s-map")).to_be_visible()
    expect(page.locator(".num-pin").first).to_be_visible()
    app.shot("13-route-story-map")
    expect(page.locator(".s-end")).to_be_visible(timeout=25000)
    along = [float(x) for x in page.evaluate("[...document.querySelectorAll('.story')].map(s => s.dataset.idx)")]
    assert along == sorted(along)
    app.verify()
    app.close()


@scenario
def english(browser):
    """Английский язык: интерфейс, темы и истории."""
    app = App(browser, tts_ms=2)
    page = app.open()
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    page.get_by_role("button", name="English").click()
    expect(page.locator(".cta")).to_have_text("Generate stories")
    expect(page.locator(".topic strong").first).to_have_text("Earthquake of 1755", timeout=8000)
    expect(page.locator("html")).to_have_attribute("lang", "en")
    app.shot("14-english")
    page.locator(".cta").click()
    expect(page.locator(".s-end")).to_be_visible(timeout=25000)
    st = next(c for c in app.claude.calls if c["kind"] == "story")
    assert "Write in English" in st["system"] and "вы" not in st["system"]
    page.wait_for_function("() => window.__spoken.some(x => x.startsWith('That is all for now'))", timeout=6000)
    spoken = app.spoken()
    assert spoken[0] == "One moment, picking the stories.", spoken[:1]
    assert page.evaluate("localStorage.getItem('history.lang')") == '"en"'
    app.shot("15-english-story")
    app.verify()
    app.close()


@scenario
def errors(browser):
    """Отказ ключа: понятное сообщение и повтор."""
    app = App(browser)
    page = app.open()
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    app.claude.fail_next = (401, {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}})
    page.locator(".cta").click()
    expect(page.locator(".s-status.bad")).to_contain_text("Ключ Claude не подошёл", timeout=8000)
    app.shot("16-error")
    page.get_by_role("button", name="Попробовать ещё раз").click()
    expect(page.locator(".story")).to_have_count(1, timeout=8000)
    bad = [e for e in app.errors if "401" not in e and "favicon" not in e]
    assert not bad, bad
    assert not app.claude.problems, app.claude.problems
    app.close()


@scenario
def api_changes(browser):
    """API перестал принимать необязательные настройки: приложение отправляет запрос без них и работает дальше."""
    app = App(browser, store={"audience": "kids", "minutesIdx": 0}, tts_ms=1)
    app.claude.reject = {"thinking", "effort", "format"}
    page = app.open()
    start_session(app)
    expect(page.locator(".quiz .opt")).to_have_count(3, timeout=20000)
    expect(page.locator(".story .sent").first).to_be_visible()
    assert {"thinking.type", "output_config.effort", "output_config.format"} <= set(app.claude.rejected), app.claude.rejected
    done = [c for c in app.claude.calls if c["kind"] in ("topics", "plan", "story", "quiz_choice")]
    assert {c["kind"] for c in done} == {"topics", "plan", "story", "quiz_choice"}, app.kinds()
    assert all(c["thinking"] is None and c["effort"] is None for c in done), [(c["kind"], c["thinking"], c["effort"]) for c in done]
    bad = [e for e in app.errors if "400" not in e and "favicon" not in e]
    assert not bad, bad
    assert not app.claude.problems, app.claude.problems
    app.close()


def fix(lat, lon, acc, after=50):
    return {"after": after, "lat": lat, "lon": lon, "acc": acc}


@scenario
def denied(browser):
    """Доступ к геолокации закрыт: понятная причина, шаги для этого телефона, место по названию, повторная проверка."""
    no = {"after": 30, "error": 1, "message": "User denied Geolocation"}
    app = App(browser, fake_geo={"coarse": no, "fine": no, "perm": "prompt"}, ua=IPHONE)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации", timeout=8000)
    expect(page.locator(".where-box")).to_be_visible()
    expect(page.locator(".pick-banner")).to_have_text("Нажмите на карту там, где стоите")
    app.shot("17-denied")
    app.shot("17-denied-full", full=True)

    # Подсказка: шаги именно для iPhone и Safari
    page.get_by_role("button", name="Как включить").click()
    expect(page.locator(".sheet")).to_be_visible()
    steps = page.locator(".geo-steps li")
    expect(steps).to_have_count(4)
    expect(steps.nth(0)).to_contain_text("Службы геолокации")
    expect(steps.nth(1)).to_contain_text("Сайты Safari")
    expect(steps.nth(2)).to_contain_text("Настройки веб-сайта")
    page.locator(".geo-diag summary").click()
    expect(page.locator(".geo-diag pre")).to_contain_text("status: denied")
    expect(page.locator(".geo-diag pre")).to_contain_text("error: 1 ")
    expect(page.locator(".geo-diag pre")).to_contain_text("platform: ios safari")
    app.shot("18-geo-help")

    # Место по названию
    page.get_by_role("button", name="Указать место самому").click()
    expect(page.locator(".sheet")).to_have_count(0)
    expect(page.locator("#where-q")).to_be_focused()
    page.locator("#where-q").fill("Rossio")
    page.locator(".where-box .search button").click()
    expect(page.locator(".where-box .results li").first).to_be_visible(timeout=5000)
    page.locator(".where-box .results button").first.click()
    expect(page.locator(".plaque.here .plaque-link")).to_have_text("Вернуться ко мне", timeout=8000)
    expect(page.locator(".where-box")).to_be_hidden()
    expect(page.locator(".pick-banner")).to_be_hidden()
    expect(page.locator(".topic:not(.ghost)").first).to_be_visible(timeout=8000)

    # Человек открыл доступ в настройках телефона и нажал "Проверить снова". На iPhone страница помнит отказ,
    # пока не перезагрузится, поэтому приложение перезагружает её само и после этого находит место.
    page.get_by_role("button", name="Вернуться ко мне").click()
    expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации")
    app.set_geo({"coarse": fix(*ROSSIO, 25), "fine": fix(*ROSSIO, 10, after=120), "perm": "granted"})
    page.get_by_role("button", name="Как включить").click()
    with page.expect_navigation():
        page.locator("#geo-retry").click()
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    expect(page.locator(".plaque.warn")).to_have_count(0)
    app.verify()
    app.close()


@scenario
def denied_return(browser):
    """Человек сходил в настройки телефона и вернулся: страница сама проверяет доступ заново, но не трогает начатую работу."""
    no = {"after": 30, "error": 1, "message": "User denied Geolocation"}
    good = {"coarse": fix(*ROSSIO, 25), "fine": fix(*ROSSIO, 10, after=120), "perm": "granted"}
    back = "() => document.dispatchEvent(new Event('visibilitychange'))"

    # Место уже выбрано вручную: возвращение на страницу ничего не перезагружает.
    app = App(browser, fake_geo={"coarse": no, "fine": no, "perm": "prompt"}, ua=IPHONE)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации", timeout=8000)
    box = page.locator("#map").bounding_box()
    page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    expect(page.locator(".plaque.here .plaque-link")).to_have_text("Вернуться ко мне", timeout=8000)
    page.evaluate("() => { window.__mark = 1; }")
    app.set_geo(good)
    page.wait_for_timeout(3200)
    page.evaluate(back)
    page.wait_for_timeout(1200)
    assert page.evaluate("() => window.__mark") == 1, "страница не должна перезагружаться, пока выбрано место вручную"
    app.close()

    # Терять нечего: страница перезагружается сама и находит место.
    app = App(browser, fake_geo={"coarse": no, "fine": no, "perm": "prompt"}, ua=IPHONE)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации", timeout=8000)
    app.set_geo(good)
    page.wait_for_timeout(3200)
    with page.expect_navigation():
        page.evaluate(back)
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    app.verify()
    app.close()


@scenario
def denied_then_allowed(browser):
    """Настоящий отказ браузера, потом доступ открыли в настройках. В Chrome место находится само, в Safari - после "Проверить снова"."""
    app = App(browser, geo=None, grant=False)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации", timeout=8000)
    assert app.kinds() == []
    app.ctx.grant_permissions(["geolocation"])
    app.ctx.set_geolocation({"latitude": ROSSIO[0], "longitude": ROSSIO[1], "accuracy": 10})
    if os.environ.get("E2E_BROWSER") == "webkit":
        # Движок Safari помнит отказ, пока страница не перезагрузится: тут помогает кнопка "Проверить снова".
        page.wait_for_timeout(1500)
        expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации")
        page.get_by_role("button", name="Как включить").click()
        with page.expect_navigation():
            page.locator("#geo-retry").click()
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    expect(page.locator(".where-box")).to_be_hidden()
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    app.verify()
    app.close()


@scenario
def denied_map_tap(browser):
    """Без геолокации место можно указать простым нажатием на карту, в том числе на вкладке маршрута."""
    app = App(browser, geo=None, grant=False, ua=ANDROID)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации", timeout=8000)
    page.get_by_role("button", name="Как включить").click()
    expect(page.locator(".geo-steps li").first).to_contain_text("Геоданные")
    expect(page.locator(".geo-steps li").nth(1)).to_contain_text("«Chrome»")
    page.locator(".sheet-head .icon-btn").click()
    page.get_by_role("button", name="Иду в…").click()
    box = page.locator("#map").bounding_box()
    page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    expect(page.locator(".plaque.here .plaque-link")).to_have_text("Вернуться ко мне", timeout=8000)
    expect(page.locator(".route-sum")).to_have_count(0)  # первое нажатие задало "где я", а не цель маршрута
    app.verify()
    app.close()


@scenario
def geo_refine(browser):
    """Сначала приходит грубый замер по сети, следом точный: места ищутся один раз, вокруг точного."""
    far = (ROSSIO[0] + 0.004, ROSSIO[1] + 0.003)  # около 500 м в сторону
    app = App(browser, fake_geo={"coarse": fix(*far, 900, after=80), "fine": fix(*ROSSIO, 14, after=900), "perm": "granted"})
    page = app.open()
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    page.wait_for_timeout(800)
    calls = page.evaluate("window.__geoCalls")
    assert calls[:2] == ["get:coarse", "watch:fine"], calls
    topics = [c for c in app.claude.calls if c["kind"] == "topics"]
    assert len(topics) == 1, f"темы должны запрашиваться один раз, а не для каждого замера: {len(topics)}"
    assert "P1 | " in topics[0]["user"]
    app.verify()
    app.close()


@scenario
def geo_coarse_only(browser):
    """Точное определение молчит (помещение): приложение работает по сетевому замеру и держит грубое наблюдение."""
    app = App(browser, fake_geo={"coarse": fix(*ROSSIO, 70, after=120), "fine": {"after": 400, "error": 3, "message": "Timeout expired"}, "perm": "granted"})
    page = app.open()
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    expect(page.locator(".plaque.here .plaque-sub").last).to_have_text("точность около 70 м")
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    page.wait_for_function("() => window.__geoCalls.includes('watch:coarse')", timeout=3000)
    expect(page.locator(".plaque.warn")).to_have_count(0)
    app.verify()
    app.close()


@scenario
def geo_rough(browser):
    """Телефон отдаёт только примерное место (выключена точная геопозиция): предупреждение и шаги, места не ищутся."""
    spec = {"coarse": fix(38.72, -9.15, 4200), "fine": fix(38.72, -9.15, 4200, after=150), "perm": "granted"}
    app = App(browser, fake_geo=spec, ua=IPHONE)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Место определено только примерно, с точностью 4,2 км", timeout=8000)
    expect(page.locator(".where-box")).to_be_visible()
    page.wait_for_timeout(700)
    assert app.kinds() == [], f"по примерному месту темы запрашивать не нужно: {app.kinds()}"
    app.shot("19-geo-rough")
    page.get_by_role("button", name="Как уточнить").click()
    expect(page.locator(".geo-lead")).to_contain_text("только примерное место")
    expect(page.locator(".geo-steps li").first).to_contain_text("«Сайты Safari»: включите «Точная геопозиция»")
    # Человек включил точную геопозицию: окно закрывается само, места находятся.
    app.set_geo({"coarse": fix(*ROSSIO, 20), "fine": fix(*ROSSIO, 9, after=100), "perm": "granted"})
    page.locator("#geo-retry").click()
    expect(page.locator(".sheet")).to_have_count(0, timeout=5000)
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    expect(page.locator(".where-box")).to_be_hidden()
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    app.verify()
    app.close()


@scenario
def geo_failed(browser):
    """Телефон не смог определить место: сообщение, повтор кнопкой, после починки всё находится."""
    bad = {"coarse": {"after": 60, "error": 2, "message": "Position unavailable"}, "fine": {"after": 120, "error": 3, "message": "Timeout expired"}, "perm": "granted"}
    app = App(browser, fake_geo=bad)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Телефон не смог определить место", timeout=8000)
    expect(page.locator(".where-box")).to_be_visible()
    app.shot("20-geo-failed")
    # Повторная попытка, которая тоже не удалась: поле поиска места и набранный в нём текст остаются на месте.
    page.locator("#where-q").fill("Praça do")
    page.get_by_role("button", name="Ещё раз").click()
    expect(page.locator(".plaque.warn")).to_contain_text("Телефон не смог определить место", timeout=8000)
    expect(page.locator("#where-q")).to_have_value("Praça do")
    app.set_geo({"coarse": fix(*ROSSIO, 30), "fine": fix(*ROSSIO, 10, after=100), "perm": "granted"})
    page.get_by_role("button", name="Ещё раз").click()
    expect(page.locator(".plaque.here .plaque-name")).to_have_text("Praça Dom Pedro IV", timeout=8000)
    expect(page.locator(".where-box")).to_be_hidden()
    app.verify()
    app.close()


@scenario
def geo_slow(browser):
    """Телефон молчит (запрос на доступ остался без ответа): через несколько секунд подсказка и возможность указать место."""
    app = App(browser, fake_geo={"coarse": None, "fine": None, "perm": "prompt"}, ua=IPHONE)
    app.page.clock.install()
    page = app.open()
    expect(page.locator(".plaque.here")).to_contain_text("Определяю, где вы")
    expect(page.locator(".where-box")).to_be_hidden()
    page.clock.fast_forward(13000)
    expect(page.locator(".plaque.here")).to_contain_text("Телефон пока не ответил, где вы", timeout=4000)
    expect(page.locator(".where-box")).to_be_visible()
    page.clock.fast_forward(60000)
    expect(page.locator(".plaque.here")).to_contain_text("Телефон пока не ответил, где вы")  # пока браузер ждёт ответа человека, не сдаёмся
    page.get_by_role("button", name="Что проверить").click()
    expect(page.locator(".geo-lead")).to_contain_text("выберите «Разрешить»")
    app.verify()
    app.close()


def story_text(page, i=0):
    return " ".join(page.locator(".story").nth(i).locator(".sent").all_inner_texts()).split()


@scenario
def voice_eleven(browser):
    """Нейросетевой голос ElevenLabs: быстрый старт, отрывки по порядку, вторая история готовится заранее, голос телефона молчит."""
    app = App(browser, voice="eleven")
    app.tts.per_char = 0.004
    page = app.open()
    start_session(app)
    expect(page.locator(".sent.now")).to_have_count(1, timeout=8000)
    assert app.audio() and app.audio()["rate"] == 1, app.audio()
    expect(page.locator(".s-end")).to_be_visible(timeout=40000)
    app.wait_until(lambda: app.tts.calls[-1]["text"] == "На этом пока всё.", what="прощальная фраза")
    page.wait_for_function("() => window.__audios[0].paused", timeout=8000)

    calls = app.tts.calls
    assert calls[0]["text"] == "Секунду, подбираю истории.", calls[0]
    assert calls[-1]["text"] == "На этом пока всё.", calls[-1]
    assert all(c["model"] == "eleven_v4" and c["lang"] == "ru" and c["voice"] == "JBFqnCBsd6RMkjVDRZzb" for c in calls), calls[:2]
    said = " ".join(c["text"] for c in calls[1:-1]).split()
    shown = story_text(page, 0) + story_text(page, 1)
    assert said == shown, f"прозвучать должно ровно то, что показано, и по порядку:\n{said[:30]}\n{shown[:30]}"
    first = next(c for c in calls if c["text"].startswith("Посмотрите на Росиу"))
    assert len(first["text"]) < 200 and first["prev"] is None, f"первый отрывок должен быть коротким: {first['text']!r}"
    assert calls[calls.index(first) + 1]["prev"], "следующим отрывкам передаётся предыдущий текст для ровной интонации"
    starts = [c for c in calls if c["text"].startswith("Посмотрите на")]
    assert len(starts) == 2, f"начало второй истории озвучивается один раз (заранее): {[c['text'][:30] for c in starts]}"
    assert len(starts[1]["text"]) > len(first["text"]), "заранее готовится отрывок побольше"
    assert app.spoken() == [], f"голос телефона должен молчать: {app.spoken()}"
    app.verify()
    app.close()


@scenario
def voice_gemini_kids(browser):
    """Голос Gemini в детском режиме: крупные отрывки (запросов мало), манера чтения для ребёнка, вопрос и ответ тоже вслух."""
    app = App(browser, voice="gemini", store={"audience": "kids", "minutesIdx": 2})
    app.tts.per_char = 0.002
    page = app.open()
    start_session(app)
    expect(page.locator(".quiz .opt")).to_have_count(3, timeout=25000)
    page.wait_for_function("() => true")
    page.wait_for_timeout(1200)
    calls = app.tts.calls
    assert calls and all(c["provider"] == "gemini" and c["model"] == "gemini-3.8-flash-tts" and c["voice"] == "Sulafat" and not c["legacy"] for c in calls), calls[:2]
    assert all("young child" in (c["style"] or "") for c in calls), calls[0]
    assert calls[0]["text"].startswith("Посмотри"), f"служебную фразу не озвучиваем, запросы на счету: {calls[0]['text'][:40]!r}"
    quiz = [c for c in calls if "Первый вариант" in c["text"]]
    assert len(quiz) == 1 and "Третий" in quiz[0]["text"], f"вопрос с вариантами читается вслух одним запросом: {[c['text'] for c in quiz]}"
    told = [c for c in calls if c not in quiz]
    assert len(told) <= 4, f"история (до трёх запросов) плюс заранее готовое начало следующей (один): {[len(c['text']) for c in told]}"
    page.locator(".quiz .opt").nth(0).click()
    expect(page.locator(".quiz-reply.wrong")).to_contain_text("Не совсем")
    page.wait_for_function("() => true")
    page.wait_for_timeout(600)
    assert any(c["text"].startswith("Не совсем") for c in app.tts.calls)
    assert app.spoken() == [], app.spoken()
    app.verify()
    app.close()


@scenario
def voice_pause(browser):
    """Пауза и продолжение с нейросетевым голосом: звук останавливается на месте и продолжается с него же."""
    app = App(browser, voice="eleven", store={"minutesIdx": 0})
    app.tts.per_char = 0.03
    page = app.open()
    start_session(app)
    page.wait_for_function("() => window.__audios && window.__audios[0] && !window.__audios[0].paused && window.__audios[0].currentTime > 0.4 && document.querySelector('.sent.now')", timeout=12000)
    page.locator(".play-btn").click()
    expect(page.locator(".play-btn")).to_have_attribute("aria-label", "Продолжить")
    a = app.audio()
    assert a["paused"], a
    page.wait_for_timeout(500)
    b = app.audio()
    assert b["paused"] and abs(b["time"] - a["time"]) < 0.05, (a, b)
    page.locator(".play-btn").click()
    expect(page.locator(".play-btn")).to_have_attribute("aria-label", "Пауза")
    page.wait_for_function(f"() => !window.__audios[0].paused && window.__audios[0].currentTime > {a['time'] + 0.2}", timeout=5000)
    # Скорость речи из настроек
    assert app.audio()["rate"] == 1
    app.verify()
    app.close()


@scenario
def voice_interrupt(browser):
    """Вопрос посреди рассказа с нейросетевым голосом: ответ звучит тем же голосом, потом рассказ продолжается с прерванного места."""
    app = App(browser, voice="eleven", store={"minutesIdx": 0})
    app.tts.per_char = 0.02
    page = app.open()
    start_session(app)
    page.wait_for_function("() => { const n = document.querySelector('.sent.now'); return n && Number(n.dataset.k) >= 2; }", timeout=20000)
    at = page.evaluate("() => Number(document.querySelector('.sent.now').dataset.k)")
    page.locator("#ask").fill("Подожди, а что это за колонна?")
    page.locator(".ask button[type=submit]").click()
    expect(page.locator(".bubble.ai")).to_contain_text("Это тестовый ответ", timeout=6000)
    app.tts.per_char = 0.002
    expect(page.locator(".s-end")).to_be_visible(timeout=40000)
    texts = [c["text"] for c in app.tts.calls]
    ans = next(i for i, x in enumerate(texts) if x.startswith("Это тестовый ответ"))
    sents = [x.strip() for x in page.locator(".story").nth(0).locator(".sent").all_inner_texts()]
    back = next((i for i, x in enumerate(texts) if i > ans and x.startswith(sents[at])), None)
    assert back is not None, f"после ответа рассказ должен продолжиться с предложения {at} ({sents[at][:30]!r}): {texts[ans:]}"
    after = " ".join(texts[back:])
    assert "Последний абзац" in after, after[:120]
    assert not any(x.startswith(sents[0]) for x in texts[ans:]), "рассказ не должен начинаться заново"
    assert app.spoken() == [], app.spoken()
    app.verify()
    app.close()


@scenario
def voice_fallback(browser):
    """Сервис голоса отказал посреди рассказа: понятное сообщение, остаток дочитывает голос телефона, без повторов и пропусков."""
    app = App(browser, voice="eleven", store={"minutesIdx": 0})
    app.tts.per_char = 0.003
    app.tts.fail_after = (3, 401, {"detail": {"status": "quota_exceeded", "message": "This request exceeds your quota."}})
    page = app.open()
    start_session(app)
    expect(page.locator(".toast.show")).to_contain_text("У ElevenLabs закончился запас символов или нужна оплата", timeout=20000)
    expect(page.locator(".toast.show")).to_contain_text("Дальше читает голос телефона")
    expect(page.locator(".s-end")).to_be_visible(timeout=30000)
    page.wait_for_function("() => window.__spoken.some(x => x.startsWith('На этом пока всё'))", timeout=8000)
    cloud = " ".join(c["text"] for c in app.tts.calls[1:]).split()
    phone = " ".join(x for x in app.spoken() if not x.startswith("На этом пока всё")).split()
    shown = story_text(page, 0)
    assert cloud and phone, (len(cloud), len(phone))
    assert cloud + phone == shown, f"вместе оба голоса должны прочитать историю ровно один раз:\n{cloud[-12:]}\n{phone[:12]}"
    app.verify(allow=("401",))
    app.close()


@scenario
def voice_bad_key(browser):
    """Ключ сервиса голоса не подошёл: рассказ сразу идёт голосом телефона, а сервис больше не дёргается."""
    app = App(browser, voice="gemini", store={"minutesIdx": 0, "tts.key.gemini": "wrong-key"})
    page = app.open()
    start_session(app)
    expect(page.locator(".toast.show")).to_contain_text("Ключ Google Gemini не подошёл. Дальше читает голос телефона", timeout=20000)
    expect(page.locator(".s-end")).to_be_visible(timeout=30000)
    assert app.tts.calls == []
    spoken = " ".join(app.spoken()).split()
    assert spoken[: len(story_text(page, 0))] == story_text(page, 0), spoken[:20]
    app.verify(allow=("400",))
    app.close()


@scenario
def voice_compat(browser):
    """Сервис не принял новые поля запроса и исчерпал суточный лимит основной модели: приложение подстраивается само."""
    app = App(browser, voice="gemini", store={"minutesIdx": 0})
    app.tts.reject_extras = True
    app.tts.daily = {"gemini-3.8-flash-tts"}
    page = app.open()
    start_session(app)
    expect(page.locator(".s-end")).to_be_visible(timeout=30000)
    calls = app.tts.calls
    assert calls and all(c["legacy"] and c["style"] is None and c["model"] == "gemini-3.8-flash-lite-tts" for c in calls), calls[:2]
    assert " ".join(c["text"] for c in calls).split() == story_text(page, 0)
    assert app.spoken() == [], app.spoken()
    app.verify(allow=("400", "429"))
    app.close()

    app = App(browser, voice="eleven", store={"minutesIdx": 0})
    app.tts.reject_extras = True
    page = app.open()
    start_session(app)
    expect(page.locator(".s-end")).to_be_visible(timeout=30000)
    assert app.tts.calls and all(c["minimal"] for c in app.tts.calls), app.tts.calls[:2]
    assert app.spoken() == [], app.spoken()
    app.verify(allow=("422",))
    app.close()


@scenario
def voice_settings(browser):
    """Настройки голоса: выбор сервиса, ключ с пробой голоса, список голосов, понятная ошибка при плохом ключе."""
    app = App(browser)
    page = app.open()
    expect(page.locator(".topic:not(.ghost)")).to_have_count(4, timeout=8000)
    page.get_by_role("button", name="Настройки").click()
    expect(page.locator(".choice[data-voice=system]")).to_have_attribute("aria-checked", "true")
    page.locator("#set-voice-test").click()
    page.wait_for_function("() => window.__spoken.some(x => x.startsWith('Привет!'))", timeout=5000)

    # ElevenLabs
    page.locator(".choice[data-voice=eleven]").click()
    expect(page.locator(".voice-box .set-status").first).to_contain_text("Пока читает голос телефона")
    page.locator("#set-tts-key").fill("not-a-key")
    page.locator("#set-tts-save").click()
    expect(page.locator(".voice-box .set-status.bad")).to_have_text("Ключ ElevenLabs не подошёл.", timeout=8000)
    page.locator("#set-tts-key").fill(mocks.ELEVEN_KEY)
    page.locator("#set-tts-save").click()
    expect(page.locator(".voice-box .set-status.good")).to_have_text("Работает. Так будут звучать истории.", timeout=8000)
    assert app.tts.calls[-1]["text"].startswith("Привет! Я расскажу истории"), app.tts.calls[-1]
    expect(page.locator("#set-voice option")).to_have_count(4, timeout=5000)
    expect(page.locator("#set-voice option").nth(1)).to_have_text("Алиса - тестовый русский голос (жен.)")  # голос, проверенный для русского, идёт первым
    page.locator("#set-voice").select_option("EXAVITQu4vr4xnSDxMaL")
    page.locator("#set-tts-model").select_option("eleven_v4_turbo")
    page.locator("#set-voice-test").click()
    page.wait_for_function("() => true")
    expect(page.locator(".voice-box .set-status.good").last).to_have_text("Работает. Так будут звучать истории.", timeout=8000)
    assert app.tts.calls[-1]["voice"] == "EXAVITQu4vr4xnSDxMaL" and app.tts.calls[-1]["model"] == "eleven_v4_turbo", app.tts.calls[-1]
    page.locator("#set-voice-block").evaluate("el => el.scrollIntoView({ block: 'start' })")
    app.shot("21-voice-settings")

    # Google Gemini
    page.locator(".choice[data-voice=gemini]").click()
    page.locator("#set-tts-key").fill(mocks.GEMINI_KEY)
    page.locator("#set-tts-save").click()
    expect(page.locator(".voice-box .set-status.good")).to_have_text("Работает. Так будут звучать истории.", timeout=8000)
    assert app.tts.calls[-1]["provider"] == "gemini" and app.tts.calls[-1]["voice"] == "Sulafat", app.tts.calls[-1]
    expect(page.locator("#set-voice option")).to_have_count(30)
    expect(page.locator("#set-voice option").first).to_have_text("Sulafat: тёплый, жен.")
    page.locator("#set-voice").select_option("Charon")
    page.locator("#set-voice-test").click()
    expect(page.locator(".voice-box .set-status.good").last).to_be_visible(timeout=8000)
    page.wait_for_function("() => true")
    assert app.tts.calls[-1]["voice"] == "Charon", app.tts.calls[-1]
    stored = page.evaluate("() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('history.tts.') && !k.includes('voices')))")
    assert json.loads(stored["history.tts.provider"]) == "gemini" and json.loads(stored["history.tts.voice.gemini.ru"]) == "Charon", stored
    app.verify(allow=("401",))
    app.close()


def run(names):
    srv = serve()
    failed = []
    with sync_playwright() as p:
        # По умолчанию Chrome; E2E_BROWSER=webkit запускает те же сценарии на движке Safari.
        if os.environ.get("E2E_BROWSER") == "webkit":
            browser = p.webkit.launch(headless=True)
        else:
            browser = p.chromium.launch(executable_path=CHROME, headless=True, args=["--no-sandbox"])
        for name in names:
            t0 = time.time()
            try:
                SCENARIOS[name](browser)
                print(f"ok   {name}  ({time.time() - t0:.1f} c)")
            except Exception as e:  # noqa: BLE001
                failed.append(name)
                print(f"FAIL {name}: {str(e)[:1500]}")
        browser.close()
    srv.shutdown()
    print(f"\n{len(names) - len(failed)} из {len(names)} сценариев прошли")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:] or list(SCENARIOS)))
