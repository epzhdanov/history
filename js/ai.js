// Обращения к Claude. Ключ пользователя хранится в этом браузере и уходит только в api.anthropic.com.

import Anthropic from "../vendor/claude.js";
import { store, lastJSON } from "./util.js";
import { t } from "./i18n.js";
import { SCHEMAS, topicsPrompt, planPrompt, storySystem, storyUser, quizPrompt, checkPrompt, chatSystem } from "./prompts.js";

const MODEL = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };

// Кто пишет истории и кто делает служебную работу (темы, план, вопросы).
const TIERS = {
  fast: { story: "haiku", util: "haiku" },
  balanced: { story: "sonnet", util: "haiku" },
  best: { story: "opus", util: "sonnet" },
};

// Настройки размышлений под каждую модель. На этих моделях нельзя задавать temperature,
// а размышления выключаются по-разному (см. документацию Claude API, раздел Thinking):
//   Haiku 5.5  - thinking: disabled;  Sonnet 5.5 - thinking: between_tools;  Opus 5.5 - размышляет всегда.
function tuning(model, job) {
  // job: "prose" - рассказ и ответы (важна скорость первого слова), "pick" - выбор мест, "quick" - короткая служебная задача
  if (model === "haiku") {
    if (job === "prose") return { output_config: { effort: "medium" } };
    if (job === "pick") return { output_config: { effort: "low" } };
    return { thinking: { type: "disabled" }, output_config: { effort: "low" } };
  }
  if (model === "sonnet") {
    if (job === "prose") return { thinking: { type: "between_tools" }, output_config: { effort: "medium" } };
    if (job === "pick") return { output_config: { effort: "low" } };
    return { thinking: { type: "between_tools" }, output_config: { effort: "low" } };
  }
  return { output_config: { effort: job === "prose" ? "medium" : "low" } };
}

export class AIError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "AIError";
    this.code = code;
  }
}

function normalize(e) {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.APIUserAbortError || e?.name === "AbortError") return new AIError("aborted");
  if (e instanceof Anthropic.AuthenticationError) return new AIError("auth");
  if (e instanceof Anthropic.PermissionDeniedError) return new AIError("permission");
  if (e instanceof Anthropic.RateLimitError) return new AIError("rate");
  if (e instanceof Anthropic.APIConnectionError) return new AIError("network");
  if (e instanceof Anthropic.APIError) {
    const msg = e.message || "";
    if (/credit balance|billing|payment/i.test(msg) || e.status === 402) return new AIError("credit");
    if (e.status === 529 || e.status >= 500 || /overloaded/i.test(msg)) return new AIError("overloaded");
    return new AIError("unknown", msg);
  }
  return new AIError("unknown", e?.message || String(e));
}

export function errorText(e) {
  const err = normalize(e);
  const map = {
    nokey: "err.noKey",
    auth: "err.auth",
    permission: "err.permission",
    credit: "err.credit",
    rate: "err.rate",
    overloaded: "err.overloaded",
    network: "err.network",
    refusal: "err.refusal",
    badjson: "err.badAnswer",
  };
  return map[err.code] ? t(map[err.code]) : t("err.unknown", { msg: (err.message || "").slice(0, 160) });
}

export const isAborted = (e) => normalize(e).code === "aborted";

// ---------- Ключ ----------

const K_KEY = "apiKey";
export const getKey = () => store.get(K_KEY, "") || "";
export const hasKey = () => getKey().length > 10;
export function setKey(key) {
  client = null;
  if (key) store.set(K_KEY, key.trim());
  else store.del(K_KEY);
}

let client = null;
function api() {
  const apiKey = getKey();
  if (!apiKey) throw new AIError("nokey");
  if (!client) client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120000 });
  return client;
}

const tier = () => TIERS[store.get("quality", "balanced")] || TIERS.balanced;

/** Маленький запрос, чтобы убедиться, что ключ рабочий. */
export async function checkKey(signal) {
  try {
    await api().messages.create(
      { model: MODEL.haiku, max_tokens: 16, messages: [{ role: "user", content: "Reply with the single word: ok" }], ...tuning("haiku", "quick") },
      { signal }
    );
    return true;
  } catch (e) {
    throw normalize(e);
  }
}

// ---------- Базовые вызовы ----------

const textOf = (msg) =>
  (msg.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

/**
 * Если API отклонил запрос из-за необязательной настройки (размышления, усилие, формат ответа),
 * возвращает тот же запрос без неё. Так приложение переживает изменения в правилах API.
 */
function relax(params, e) {
  if (!(e instanceof Anthropic.BadRequestError)) return null;
  const msg = (e.message || "").toLowerCase();
  if (params.thinking && msg.includes("thinking")) {
    const { thinking, ...rest } = params;
    return rest;
  }
  if (params.output_config?.effort && msg.includes("effort")) {
    const { effort, ...oc } = params.output_config;
    const { output_config, ...rest } = params;
    return Object.keys(oc).length ? { ...rest, output_config: oc } : rest;
  }
  if (params.output_config?.format && /schema|format|structured/.test(msg)) {
    // Без строгой схемы: просим JSON словами и разбираем ответ сами.
    const { format, ...oc } = params.output_config;
    const { output_config, ...rest } = params;
    const messages = params.messages.map((m, i) =>
      i === params.messages.length - 1 ? { ...m, content: `${m.content}\n\nReturn only one JSON object that matches this JSON schema, with no other text:\n${JSON.stringify(format.schema)}` } : m
    );
    return { ...rest, messages, ...(Object.keys(oc).length ? { output_config: oc } : {}) };
  }
  return null;
}

/** Ответ строго по JSON-схеме. Обрезанный или неразборчивый ответ пробуем получить ещё раз. */
async function askJSON({ model, job, system, user, schema, maxTokens, signal }) {
  const tune = tuning(model, job);
  let params = {
    model: MODEL[model],
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    ...tune,
    output_config: { ...tune.output_config, format: { type: "json_schema", schema } },
  };
  let relaxed = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    let msg;
    try {
      msg = await api().messages.create(params, { signal });
    } catch (e) {
      const easier = relaxed < 3 ? relax(params, e) : null;
      if (!easier) throw normalize(e);
      params = easier;
      relaxed++;
      attempt--;
      continue;
    }
    if (msg.stop_reason === "refusal") throw new AIError("refusal");
    if (msg.stop_reason === "max_tokens") continue;
    try {
      return lastJSON(textOf(msg));
    } catch {
      /* пробуем ещё раз */
    }
  }
  throw new AIError("badjson");
}

/** Потоковый текст: onDelta получает кусочки по мере появления. Возвращает весь текст. */
async function streamText({ model, job, system, messages, maxTokens, signal, onDelta }) {
  let params = { model: MODEL[model], max_tokens: maxTokens, system, messages, ...tuning(model, job) };
  for (let relaxed = 0; ; relaxed++) {
    let full = "";
    try {
      const stream = api().messages.stream(params, { signal });
      stream.on("text", (delta) => {
        full += delta;
        onDelta?.(delta, full);
      });
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal" && !full.trim()) throw new AIError("refusal");
      return full || textOf(final);
    } catch (e) {
      const easier = !full && relaxed < 2 ? relax(params, e) : null;
      if (!easier) throw normalize(e);
      params = easier;
    }
  }
}

// ---------- Задачи приложения ----------

const validRefs = (ctx) => new Set([...ctx.places.map((p) => p.ref), ...(ctx.minors || []).map((m) => m.ref)]);

/** Темы, о которых можно рассказать в этом месте. */
export async function suggestTopics(ctx, signal) {
  const { system, user } = topicsPrompt(ctx);
  const out = await askJSON({ model: tier().util, job: "pick", system, user, schema: SCHEMAS.topics, maxTokens: 4000, signal });
  const ok = new Set(ctx.places.map((p) => p.ref));
  return (out.topics || [])
    .map((x) => ({
      emoji: String(x.emoji || "").slice(0, 8),
      title: String(x.title || "").trim(),
      hint: String(x.hint || "").trim(),
      places: (x.places || []).filter((r) => ok.has(r)),
    }))
    .filter((x) => x.title && x.places.length)
    .slice(0, 8);
}

/** План рассказа: какие места и о чём. */
export async function planStories(ctx, opts, signal) {
  const { system, user } = planPrompt(ctx, opts);
  const out = await askJSON({ model: tier().util, job: "pick", system, user, schema: SCHEMAS.plan, maxTokens: 5000, signal });
  const byRef = new Map(ctx.places.map((p) => [p.ref, p]));
  const minors = new Map((ctx.minors || []).map((m) => [m.ref, m]));
  const refs = validRefs(ctx);
  const seen = new Set();
  const stories = [];
  for (const s of out.stories || []) {
    const place = byRef.get(s.place);
    if (!place || seen.has(place.ref) || !s.title) continue;
    seen.add(place.ref);
    const also = (s.also || []).filter((r) => refs.has(r) && r !== place.ref).map((r) => byRef.get(r) || minors.get(r));
    stories.push({ place, also, title: String(s.title).trim(), idea: String(s.idea || "").trim() });
  }
  if (ctx.mode === "route") stories.sort((a, b) => a.place.along - b.place.along);
  return stories.slice(0, opts.count);
}

/** Одна история, потоком. */
export function tellStory(ctx, args, onDelta, signal) {
  return streamText({
    model: tier().story,
    job: "prose",
    system: storySystem(ctx),
    messages: [{ role: "user", content: storyUser(ctx, args) }],
    maxTokens: tier().story === "opus" ? 12000 : 6000,
    signal,
    onDelta,
  });
}

/** Вопрос после истории: kind = "choice" (три варианта) или "open". */
export async function makeQuiz(args, signal) {
  const { system, user } = quizPrompt(args);
  const schema = args.kind === "choice" ? SCHEMAS.quizChoice : SCHEMAS.quizOpen;
  const q = await askJSON({ model: tier().util, job: "quick", system, user, schema, maxTokens: 2000, signal });
  if (!q.question) throw new AIError("badjson");
  if (args.kind === "choice") {
    const options = (q.options || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
    const correct = Number.isInteger(q.correct) ? q.correct : -1;
    if (options.length < 2 || correct < 0 || correct >= options.length) throw new AIError("badjson");
    return { kind: "choice", question: q.question.trim(), options, correct, rightReply: (q.right_reply || "").trim(), wrongReply: (q.wrong_reply || "").trim() };
  }
  return { kind: "open", question: q.question.trim(), expected: (q.answer || "").trim() };
}

/** Проверка ответа на открытый вопрос. */
export async function checkAnswer(args, signal) {
  const { system, user } = checkPrompt(args);
  const out = await askJSON({ model: tier().util, job: "quick", system, user, schema: SCHEMAS.check, maxTokens: 1200, signal });
  const verdict = ["right", "partly", "wrong"].includes(out.verdict) ? out.verdict : "partly";
  return { verdict, reply: String(out.reply || "").trim() };
}

/** Ответ на вопрос слушателя, потоком. history: [{ role: "user" | "assistant", content }] и последний элемент от user. */
export function answer(ctx, context, history, onDelta, signal) {
  return streamText({
    model: tier().story,
    job: "prose",
    system: chatSystem(ctx, context),
    messages: history,
    maxTokens: tier().story === "opus" ? 8000 : 3000,
    signal,
    onDelta,
  });
}
