"""Подставные ответы внешних сервисов для проверки интерфейса без сети.

Все тексты здесь - заглушки для тестов, а не исторические сведения.
"""
import json
import math
import re
import struct
import zlib
from urllib.parse import urlparse, parse_qs

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-expose-headers": "*",
}

# Места вокруг площади Росиу в Лиссабоне: (qid, lat, lon, длина статьи, названия, описания)
PLACES = [
    ("Q1549270", 38.71390, -9.13944, 21000, {"pt": "Praça D. Pedro IV", "en": "Rossio", "ru": "Росиу"}, {"pt": "praça em Lisboa, Portugal", "en": "square in Lisbon", "ru": "площадь в Лиссабоне"}),
    ("Q1470414", 38.71222, -9.14000, 9400, {"pt": "Convento do Carmo (Lisboa)", "en": "Carmo Convent", "ru": "Монастырь кармелитов (Лиссабон)"}, {"pt": "antigo convento da Ordem dos Carmelitas em Lisboa", "en": "former convent in Lisbon", "ru": "бывший монастырь в Лиссабоне"}),
    ("Q1126338", 38.71214, -9.13939, 33000, {"pt": "Elevador de Santa Justa", "en": "Santa Justa Lift", "ru": "Элевадор-ди-Санта-Жушта"}, {"pt": "elevador em Lisboa", "en": "elevator in Lisbon", "ru": "лифт в Лиссабоне"}),
    ("Q2281554", 38.71472, -9.13861, 12000, {"pt": "Igreja de São Domingos (Lisboa)", "en": "Church of São Domingos", "ru": "Церковь Святого Доминика (Лиссабон)"}, {"pt": "igreja em Lisboa", "en": "church in Lisbon", "ru": "церковь в Лиссабоне"}),
    ("Q1548683", 38.71483, -9.13972, 14000, {"pt": "Teatro Nacional D. Maria II", "en": "D. Maria II National Theatre"}, {"pt": "teatro em Lisboa", "en": "theatre in Lisbon"}),
    ("Q1359606", 38.71417, -9.14111, 44000, {"pt": "Estação Ferroviária do Rossio", "en": "Rossio railway station", "ru": "Росиу (вокзал)"}, {"pt": "estação ferroviária em Lisboa", "en": "railway station in Lisbon", "ru": "вокзал в Лиссабоне"}),
    ("Q1549046", 38.71361, -9.13778, 8000, {"pt": "Praça da Figueira", "en": "Praça da Figueira", "ru": "Площадь Фигейра"}, {"pt": "praça em Lisboa", "en": "square in Lisbon", "ru": "площадь в Лиссабоне"}),
    ("Q45", 38.71395, -9.13950, 187000, {"pt": "Portugal", "en": "Portugal", "ru": "Португалия"}, {"pt": "país da Europa", "en": "country in southwestern Europe", "ru": "государство в Европе"}),
    ("Q2110262", 38.71050, -9.13700, 6000, {"pt": "Rua Augusta", "en": "Rua Augusta"}, {"pt": "rua de Lisboa", "en": "street in Lisbon"}),
    ("Q632682", 38.70842, -9.13683, 15000, {"pt": "Arco da Rua Augusta", "en": "Rua Augusta Arch", "ru": "Триумфальная арка (Лиссабон)"}, {"pt": "arco triunfal em Lisboa", "en": "triumphal arch in Lisbon", "ru": "триумфальная арка в Лиссабоне"}),
    ("Q1161108", 38.70750, -9.13639, 11000, {"pt": "Praça do Comércio", "en": "Praça do Comércio", "ru": "Праса-ду-Комерсиу"}, {"pt": "praça em Lisboa", "en": "square in Lisbon", "ru": "площадь в Лиссабоне"}),
]

MINORS = [
    ("Q126948184", 38.71402, -9.13905, {"pt": "Manteigaria Silva", "en": "Manteigaria Silva"}, {"pt": "loja histórica em Lisboa", "en": "historic shop in Lisbon"}),
    ("Q5150196", 38.71392, -9.13938, {"pt": "Estátua de D. Pedro IV", "en": "Column of Pedro IV", "ru": "Колонна Педру IV"}, {"pt": "monumento em Lisboa", "en": "monument in Lisbon", "ru": "памятник в Лиссабоне"}),
    ("Q111408514", 38.71380, -9.13990, {"en": "My Story Hotel Rossio"}, {"en": "hotel in Lisbon, Portugal"}),
    ("Q135967734", 38.71120, -9.13720, {"pt": "Casa das Velas Loreto", "en": "Casa das Velas Loreto"}, {"pt": "loja histórica em Lisboa", "en": "historic shop in Lisbon"}),
]


def dist(a, b):
    r = 6371000
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    s = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(s))


def png_tile():
    """Плитка 256x256: светлый фон с сеткой "улиц"."""
    w = h = 256
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            street = (x % 64 < 5) or (y % 64 < 5) or (abs((x - y) % 128) < 3)
            row += bytes((255, 255, 255) if street else (226, 233, 243))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


TILE = png_tile()


def thumb_png():
    w = h = 64
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            sky = y < 30
            row += bytes((150, 190, 235) if sky else (201, 168, 120) if (x // 8 + y // 8) % 2 else (188, 150, 104))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


THUMB = thumb_png()


def wiki_page(i, lang, place):
    qid, lat, lon, length, titles, descs = place
    return {
        "pageid": 1000 + i,
        "ns": 0,
        "title": titles[lang],
        "index": i,
        "coordinates": [{"lat": lat, "lon": lon, "primary": True, "globe": "earth"}],
        "pageprops": {"wikibase_item": qid},
        "description": descs.get(lang, ""),
        "descriptionsource": "central",
        "length": int(length * {"pt": 1.0, "en": 0.8, "ru": 0.5}.get(lang, 0.4)),
        "thumbnail": {"source": f"https://upload.wikimedia.org/wikipedia/commons/thumb/test/{qid}.png", "width": 240, "height": 180},
    }


ARTICLE = """{title} - тестовая статья для проверки приложения. Это вступление, в котором место коротко описано.


== Arquitectura ==
Тестовый раздел об архитектуре. {filler}


== História ==
Тестовый раздел об истории: здесь лежит материал, из которого рассказчик берёт сюжет. {filler}


== Referências ==
Сноски, которые в историю попадать не должны.
"""


def wikipedia(url):
    u = urlparse(url)
    lang = u.hostname.split(".")[0]
    q = {k: v[0] for k, v in parse_qs(u.query).items()}
    if q.get("generator") in ("geosearch", "search"):
        if q["generator"] == "geosearch":
            lat, lon = [float(x) for x in q["ggscoord"].split("|")]
            radius = float(q["ggsradius"])
        else:
            m = re.match(r"nearcoord:(\d+)m,([-\d.]+),([-\d.]+)", q["gsrsearch"])
            radius, lat, lon = float(m.group(1)), float(m.group(2)), float(m.group(3))
            assert q.get("gsrsort") == "incoming_links_desc"
        found = [p for p in PLACES if lang in p[4] and dist((lat, lon), (p[1], p[2])) <= radius]
        if q["generator"] == "search":
            found.sort(key=lambda p: -p[3])
        else:
            found.sort(key=lambda p: dist((lat, lon), (p[1], p[2])))
        pages = [wiki_page(i, lang, p) for i, p in enumerate(found)]
        return {"batchcomplete": True, "query": {"pages": pages}} if pages else {"batchcomplete": True}
    if q.get("prop") == "extracts":
        titles = q["titles"].split("|")
        pages = []
        for i, t in enumerate(titles):
            if q.get("exintro"):
                text = f"{t} - тестовое вступление статьи: что это за место и чем оно известно."
            else:
                text = ARTICLE.format(title=t, filler="Тестовый текст. " * 180)
            pages.append({"pageid": 2000 + i, "ns": 0, "title": t, "extract": text})
        return {"batchcomplete": True, "query": {"pages": pages}}
    return {"batchcomplete": True}


def wikidata(url):
    q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
    if q.get("list") == "geosearch":
        lat, lon = [float(x) for x in q["gscoord"].split("|")]
        radius = float(q["gsradius"])
        items = [(p[0], p[1], p[2]) for p in PLACES] + [(m[0], m[1], m[2]) for m in MINORS]
        out = [{"pageid": i, "ns": 0, "title": qid, "lat": la, "lon": lo, "dist": round(dist((lat, lon), (la, lo)), 1), "primary": True} for i, (qid, la, lo) in enumerate(items) if dist((lat, lon), (la, lo)) <= radius]
        return {"batchcomplete": True, "query": {"geosearch": out}}
    if q.get("action") == "wbgetentities":
        langs = q.get("languages", "en").split("|")
        ents = {}
        for qid in q["ids"].split("|"):
            e = {"type": "item", "id": qid}
            src = next((p for p in PLACES if p[0] == qid), None)
            if src:
                e["labels"] = {l: {"language": l, "value": re.sub(r"\s*\(.*\)$", "", src[4][l])} for l in langs if l in src[4]}
                e["sitelinks"] = {f"{l}wiki": {"site": f"{l}wiki", "title": src[4][l]} for l in langs if l in src[4]}
            m = next((m for m in MINORS if m[0] == qid), None)
            if m:
                e["labels"] = {l: {"language": l, "value": m[3][l]} for l in langs if l in m[3]}
                e["descriptions"] = {l: {"language": l, "value": m[4][l]} for l in langs if l in m[4]}
            ents[qid] = e
        return {"entities": ents, "success": 1}
    return {}


def nominatim(url):
    u = urlparse(url)
    q = {k: v[0] for k, v in parse_qs(u.query).items()}
    ru = q.get("accept-language", "ru") == "ru"
    if u.path.endswith("/reverse"):
        lat = float(q["lat"])
        south = lat < 38.7095
        return {
            "name": "Praça do Comércio" if south else "Praça Dom Pedro IV",
            "display_name": "Praça Dom Pedro IV, Santa Justa, Lisboa, Portugal",
            "address": {
                "road": "Praça do Comércio" if south else "Praça Dom Pedro IV",
                "neighbourhood": "Baixa" if south else "Santa Justa",
                "suburb": "Santa Maria Maior",
                "city": "Лиссабон" if ru else "Lisbon",
                "country": "Португалия" if ru else "Portugal",
                "country_code": "pt",
            },
        }
    return [
        {"lat": "38.7075", "lon": "-9.1364", "name": "Praça do Comércio", "display_name": "Praça do Comércio, Baixa, Santa Maria Maior, Lisboa, Portugal", "type": "square"},
        {"lat": "38.6916", "lon": "-9.2160", "name": "Torre de Belém", "display_name": "Torre de Belém, Belém, Lisboa, Portugal", "type": "attraction"},
    ]


def osrm(url):
    m = re.search(r"/foot/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)", url)
    lon1, lat1, lon2, lat2 = [float(x) for x in m.groups()]
    # Ломаная из трёх отрезков: чуть на восток, затем вдоль "Rua Augusta" на юг.
    pts = [[lon1, lat1], [lon1 + 0.0022, lat1 - 0.0006], [lon2 + 0.0004, lat2 + 0.0012], [lon2, lat2]]
    total = sum(dist((pts[i][1], pts[i][0]), (pts[i + 1][1], pts[i + 1][0])) for i in range(len(pts) - 1))
    return {
        "code": "Ok",
        "routes": [
            {
                "distance": round(total, 1),
                "duration": round(total / 1.24, 1),
                "geometry": {"type": "LineString", "coordinates": pts},
                "legs": [{"steps": [{"name": "", "distance": 20}, {"name": "Rua do Amparo", "distance": 210}, {"name": "Rua Augusta", "distance": 560}, {"name": "Rua Augusta", "distance": 80}]}],
            }
        ],
    }


# ---------- Claude ----------

STORY_RU = (
    "Посмотрите на {name}: это прямо перед вами. Это тестовая история, она нужна только для проверки приложения.\n\n"
    "Во втором абзаце рассказчик разворачивает сюжет. Здесь могло бы быть землетрясение 1755 года, но это заглушка! "
    "А что было дальше? Об этом в настоящей истории расскажет Claude.\n\n"
    "Последний абзац закрывает сюжет - и на этом тестовый рассказ заканчивается."
)
STORY_EN = (
    "Look at {name}: it is right in front of you. This is a test story used only to check the app.\n\n"
    "The second paragraph is where the plot would unfold. An earthquake could be here, but this is a placeholder! "
    "What happened next? The real story will be told by Claude.\n\n"
    "The last paragraph closes the plot, and that is the end of the test story."
)
CHAT_RU = "Это тестовый ответ на ваш вопрос. В настоящем приложении здесь ответит Claude.\n\nВторой абзац ответа."
CHAT_EN = "This is a test answer to your question. In the real app Claude answers here."


def sse(text, model, chunk=18):
    def ev(name, data):
        return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    out = ev("message_start", {"type": "message_start", "message": {"id": "msg_test", "type": "message", "role": "assistant", "model": model, "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 10, "output_tokens": 1}}})
    out += ev("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}})
    for i in range(0, len(text), chunk):
        out += ev("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text[i : i + chunk]}})
    out += ev("content_block_stop", {"type": "content_block_stop", "index": 0})
    out += ev("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 50}})
    out += ev("message_stop", {"type": "message_stop"})
    return out


def message(text, model):
    return {"id": "msg_test", "type": "message", "role": "assistant", "model": model, "content": [{"type": "text", "text": text}], "stop_reason": "end_turn", "stop_sequence": None, "usage": {"input_tokens": 10, "output_tokens": 20}}


class Claude:
    """Подставной Claude API. Заодно проверяет, что запросы соответствуют правилам API."""

    def __init__(self):
        self.calls = []
        self.problems = []
        self.fail_next = None

    def check(self, body, headers):
        model = body.get("model", "")
        p = self.problems
        if headers.get("anthropic-version") != "2026-10-21":
            p.append(f"anthropic-version: {headers.get('anthropic-version')}")
        if headers.get("anthropic-dangerous-direct-browser-access") != "true":
            p.append("нет заголовка прямого доступа из браузера")
        # SDK 1.13 передаёт ключ как "Authorization: Bearer ..." (раньше был x-api-key).
        if not (headers.get("x-api-key") or headers.get("authorization", "").startswith("Bearer sk-")):
            p.append("нет ключа в заголовках")
        for k in ("temperature", "top_p", "top_k"):
            if k in body:
                p.append(f"запрещённый параметр {k}")
        think = (body.get("thinking") or {}).get("type")
        effort = (body.get("output_config") or {}).get("effort")
        if model == "claude-sonnet-5-5" and think not in (None, "adaptive", "between_tools"):
            p.append(f"sonnet: thinking={think}")
        if model == "claude-haiku-5-5" and think not in (None, "adaptive", "disabled"):
            p.append(f"haiku: thinking={think}")
        if model == "claude-opus-5-5" and think not in (None, "adaptive"):
            p.append(f"opus: thinking={think}")
        if think in ("disabled", "between_tools") and effort in ("xhigh", "max"):
            p.append(f"thinking={think} с effort={effort}")
        if "tool_choice" in body:
            p.append("tool_choice не поддерживается")
        msgs = body.get("messages") or []
        if not msgs or msgs[0]["role"] != "user" or msgs[-1]["role"] != "user":
            p.append("сообщения должны начинаться и заканчиваться ролью user")
        for a, b in zip(msgs, msgs[1:]):
            if a["role"] == b["role"]:
                p.append("две реплики подряд от одной роли")
        fmt = (body.get("output_config") or {}).get("format")
        if fmt:
            self.check_schema(fmt.get("schema") or {}, "schema")

    def check_schema(self, s, path):
        if s.get("type") == "object":
            if s.get("additionalProperties") is not False:
                self.problems.append(f"{path}: additionalProperties должен быть false")
            if sorted(s.get("required", [])) != sorted(s.get("properties", {}).keys()):
                self.problems.append(f"{path}: не все поля обязательные")
            for k, v in s.get("properties", {}).items():
                self.check_schema(v, f"{path}.{k}")
        if s.get("type") == "array":
            self.check_schema(s.get("items", {}), f"{path}[]")
        for bad in ("maxItems", "minimum", "maximum", "minLength", "maxLength", "oneOf"):
            if bad in s:
                self.problems.append(f"{path}: неподдерживаемое ключевое слово {bad}")

    def respond(self, body, headers):
        self.check(body, headers)
        model = body.get("model", "")
        system = body.get("system") or ""
        user = body["messages"][-1]["content"]
        fmt = (body.get("output_config") or {}).get("format")
        kind = "key"
        en = "Write in English" in system or "in English" in system
        if body.get("stream"):
            kind = "chat" if "just interrupted" in system else "story"
        elif fmt:
            props = fmt["schema"]["properties"]
            kind = "topics" if "topics" in props else "plan" if "stories" in props else "quiz_choice" if "options" in props else "check" if "verdict" in props else "quiz_open"
        self.calls.append({"kind": kind, "model": model, "thinking": body.get("thinking"), "effort": (body.get("output_config") or {}).get("effort"), "max_tokens": body.get("max_tokens"), "system": system, "user": user, "messages": len(body["messages"])})

        if self.fail_next:
            status, payload = self.fail_next
            self.fail_next = None
            return status, "application/json", json.dumps(payload)

        refs = re.findall(r"^(P\d+) \| ([^|\[\n]+)", user, re.M)
        if kind == "story":
            name = (re.search(r"^Name: ([^\n(]+)", user, re.M) or [None, "место"])[1].strip()
            return 200, "text/event-stream", sse((STORY_EN if en else STORY_RU).format(name=name), model)
        if kind == "chat":
            return 200, "text/event-stream", sse(CHAT_EN if en else CHAT_RU, model)
        if kind == "topics":
            data = {
                "topics": [
                    {"emoji": "🌋", "title": "Earthquake of 1755" if en else "Землетрясение 1755 года", "hint": "The day the city fell" if en else "День, когда город рухнул", "places": [r for r, _ in refs[1:3]]},
                    {"emoji": "🛗", "title": "Lifts and funiculars" if en else "Лифты и фуникулёры", "hint": "How Lisbon beat its hills" if en else "Как Лиссабон победил холмы", "places": [r for r, _ in refs[2:3]]},
                    {"emoji": "👑", "title": "Kings on the square" if en else "Короли на площади", "hint": "Who stands on the column" if en else "Кто стоит на колонне", "places": [r for r, _ in refs[0:1]]},
                    {"emoji": "🚂", "title": "Station with horseshoes" if en else "Вокзал с подковами", "hint": "Trains under the hill" if en else "Поезда под холмом", "places": [r for r, _ in refs[3:5]]},
                    {"emoji": "❓", "title": "Bad theme", "hint": "no places", "places": ["P999"]},
                ]
            }
            return 200, "application/json", json.dumps(message(json.dumps(data, ensure_ascii=False), model))
        if kind == "plan":
            n = int((re.search(r"Plan (\d+) stor", user) or [0, 3])[1])
            told = set(re.findall(r"^- .+ \((.+)\)$", user, re.M))
            pick = [(r, name.strip()) for r, name in refs if name.strip() not in told and name.strip() not in ("Португалия", "Portugal")][:n]
            data = {"stories": [{"place": r, "also": ["M1"] if i == 0 and "M1 |" in user else [], "title": (f"Test story about {name}" if en else f"Тестовая история: {name}"), "idea": "Тестовая идея истории."} for i, (r, name) in enumerate(pick)]}
            return 200, "application/json", json.dumps(message(json.dumps(data, ensure_ascii=False), model))
        if kind == "quiz_choice":
            data = {"question": "What is this story for?" if en else "Для чего нужна эта история?", "options": ["For a test", "For a exam", "For nothing"] if en else ["Для красоты", "Для проверки приложения", "Для экзамена"], "correct": 0 if en else 1, "right_reply": "Yes, it is a test story." if en else "Да, это тестовая история для проверки.", "wrong_reply": "Not quite: it is a test story." if en else "Не совсем: история нужна для проверки приложения."}
            return 200, "application/json", json.dumps(message(json.dumps(data, ensure_ascii=False), model))
        if kind == "quiz_open":
            data = {"question": "What was the story about?" if en else "О чём была эта история?", "answer": "About a test." if en else "О проверке приложения."}
            return 200, "application/json", json.dumps(message(json.dumps(data, ensure_ascii=False), model))
        if kind == "check":
            data = {"verdict": "right", "reply": "Exactly, well done." if en else "Точно, отлично сказано."}
            return 200, "application/json", json.dumps(message(json.dumps(data, ensure_ascii=False), model))
        return 200, "application/json", json.dumps(message("ok", model))


def install(context, claude):
    """Перехватывает все внешние запросы страницы."""

    def handler(route, request):
        url = request.url
        host = urlparse(url).hostname or ""
        if host in ("localhost", "127.0.0.1"):
            return route.continue_()
        if request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        try:
            if host.endswith("basemaps.cartocdn.com"):
                return route.fulfill(status=200, headers={**CORS, "content-type": "image/png"}, body=TILE)
            if host == "upload.wikimedia.org":
                return route.fulfill(status=200, headers={**CORS, "content-type": "image/png"}, body=THUMB)
            if host.endswith("wikipedia.org"):
                return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(wikipedia(url), ensure_ascii=False))
            if host == "www.wikidata.org":
                return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(wikidata(url), ensure_ascii=False))
            if host == "nominatim.openstreetmap.org":
                return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(nominatim(url), ensure_ascii=False))
            if host == "routing.openstreetmap.de":
                return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(osrm(url)))
            if host == "api.anthropic.com":
                status, ctype, body = claude.respond(json.loads(request.post_data or "{}"), request.headers)
                return route.fulfill(status=status, headers={**CORS, "content-type": ctype, "request-id": "req_test"}, body=body)
        except Exception as e:  # noqa: BLE001
            claude.problems.append(f"ошибка заглушки для {url[:120]}: {e!r}")
            return route.fulfill(status=500, headers=CORS, body="mock error")
        claude.problems.append(f"неожиданный запрос: {url[:160]}")
        return route.abort()

    context.route("**/*", handler)


FAKE_SPEECH = r"""
(() => {
  const spoken = (window.__spoken = []);
  let queue = [], current = null, timer = null;
  class U { constructor(text) { this.text = text; this.lang = ""; this.rate = 1; this.volume = 1; this.voice = null; } }
  const voices = [
    { name: "Milena", lang: "ru-RU", voiceURI: "milena", default: true, localService: true },
    { name: "Samantha", lang: "en-US", voiceURI: "samantha", default: false, localService: true },
    { name: "Bad News", lang: "en-US", voiceURI: "badnews", default: false, localService: true },
  ];
  const next = () => {
    if (current || !queue.length) return;
    const u = (current = queue.shift());
    setTimeout(() => current === u && u.onstart && u.onstart({}), 4);
    timer = setTimeout(() => {
      if (current !== u) return;
      current = null;
      if (u.volume !== 0) spoken.push(u.text);
      u.onend && u.onend({});
      next();
    }, 30 + u.text.length * (window.__ttsMs ?? 2));
  };
  const synth = {
    get speaking() { return !!current; },
    get pending() { return queue.length > 0; },
    paused: false,
    getVoices: () => voices,
    speak(u) { queue.push(u); next(); },
    cancel() { clearTimeout(timer); const u = current; queue = []; current = null; window.__cancels = (window.__cancels || 0) + 1; if (u && u.onerror) setTimeout(() => u.onerror({ error: "interrupted" }), 0); },
    pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
  class FakeSR {
    start() {
      setTimeout(() => {
        const res = [{ transcript: window.__srText || "тестовый вопрос голосом" }];
        res.isFinal = true;
        this.onresult && this.onresult({ results: [res] });
        this.onend && this.onend();
      }, 120);
    }
    stop() {} abort() {}
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
})();
"""
