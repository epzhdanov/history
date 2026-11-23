"""Проверка интерфейса в мобильном браузере с подставной сетью.

Запуск:  python3 tests/e2e.py            (все сценарии)
         python3 tests/e2e.py home kids  (только выбранные)
Снимки экрана складываются в tests/shots/.
"""
import functools
import http.server
import json
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

    def __init__(self, browser, *, key=True, store=None, geo=ROSSIO, locale="ru-RU", grant=True, tts_ms=2):
        self.claude = mocks.Claude()
        self.errors = []
        self.ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            locale=locale,
            geolocation={"latitude": geo[0], "longitude": geo[1], "accuracy": 12} if geo else None,
            permissions=["geolocation"] if grant else [],
        )
        mocks.install(self.ctx, self.claude)
        items = dict(store or {})
        if key:
            items.setdefault("apiKey", "sk-ant-test-0000000000000000")
        seed = "".join(f"localStorage.getItem('history.{k}') === null && localStorage.setItem('history.{k}', {json.dumps(json.dumps(v))});" for k, v in items.items())
        self.ctx.add_init_script(mocks.FAKE_SPEECH + f"window.__ttsMs = {tts_ms};" + f"try {{ {seed} }} catch (e) {{}}")
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

    def verify(self):
        bad = [e for e in self.errors if "favicon" not in e]
        assert not self.claude.problems, f"нарушения в запросах: {self.claude.problems}"
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
def denied(browser):
    """Нет доступа к геолокации: подсказка и выбор точки на карте."""
    app = App(browser, geo=None, grant=False)
    page = app.open()
    expect(page.locator(".plaque.warn")).to_contain_text("Нет доступа к геолокации", timeout=8000)
    app.shot("17-denied")
    page.get_by_role("button", name="Выбрать точку на карте").click()
    expect(page.locator(".pick-banner")).to_be_visible()
    box = page.locator("#map").bounding_box()
    page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    expect(page.locator(".plaque.here .plaque-link")).to_have_text("Вернуться ко мне", timeout=8000)
    assert not [e for e in app.errors if "favicon" not in e], app.errors
    app.close()


def run(names):
    srv = serve()
    failed = []
    with sync_playwright() as p:
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
