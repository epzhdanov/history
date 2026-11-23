// Все инструкции для Claude в одном месте. Инструкции на английском (так модель следует им точнее),
// язык ответа задаётся отдельно.

import { describe, localName } from "./places.js";

const LANG = { ru: "Russian", en: "English" };
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const walkMin = (m) => Math.max(1, Math.round(m / 75));

// ---------- Схемы ответов (structured outputs) ----------

const str = (description) => ({ type: "string", description });

export const SCHEMAS = {
  topics: {
    type: "object",
    additionalProperties: false,
    required: ["topics"],
    properties: {
      topics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["emoji", "title", "hint", "places"],
          properties: {
            emoji: str("One emoji that fits the theme"),
            title: str("Theme name, 2 to 4 words"),
            hint: str("A teaser of up to 8 words that makes the listener curious"),
            places: { type: "array", items: { type: "string" }, description: "Ids of the places from the list that carry this theme, e.g. P3" },
          },
        },
      },
    },
  },
  plan: {
    type: "object",
    additionalProperties: false,
    required: ["stories"],
    properties: {
      stories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["place", "also", "title", "idea"],
          properties: {
            place: str("Id of the main place of the story, e.g. P3"),
            also: { type: "array", items: { type: "string" }, description: "Ids of other places or small objects (P.. or M..) that belong in the same story. Usually empty." },
            title: str("Short intriguing title without spoilers"),
            idea: str("One or two sentences: who, what happened, what the twist is"),
          },
        },
      },
    },
  },
  quizChoice: {
    type: "object",
    additionalProperties: false,
    required: ["question", "options", "correct", "right_reply", "wrong_reply"],
    properties: {
      question: str("The question"),
      options: { type: "array", items: { type: "string" }, description: "Exactly three short answer options" },
      correct: { type: "integer", description: "Index of the right option: 0, 1 or 2" },
      right_reply: str("What to say when the answer is right"),
      wrong_reply: str("What to say when the answer is wrong; it names the right answer"),
    },
  },
  quizOpen: {
    type: "object",
    additionalProperties: false,
    required: ["question", "answer"],
    properties: {
      question: str("The question"),
      answer: str("The expected answer in one sentence, for checking"),
    },
  },
  check: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "reply"],
    properties: {
      verdict: { type: "string", enum: ["right", "partly", "wrong"] },
      reply: str("What to say to the listener"),
    },
  },
};

// ---------- Общие блоки ----------

function listenerBlock(audience, ui) {
  if (audience === "kids") {
    const langNote =
      ui === "en"
        ? "Write for a native English speaker of that age. Do not flatten the vocabulary to beginner level: a few rich, exact words are welcome when the sentence makes their meaning clear."
        : 'Speak to the child as "ты".';
    return `<listener>
A child of 6 or 7, with a parent beside them. Write the way a good children's storyteller talks:
- Short sentences and everyday words. If a rare word is needed, explain it in the same breath.
- One hero, one problem, one surprise. The child should be able to retell it at dinner.
- Make it concrete: what people wore, ate, feared, laughed at. Compare sizes, ages and distances with things a child knows.
- Talk to the child directly, and once or twice ask them to look for something around them.
- Warm and a little funny, never babyish.
- Nothing gory or frightening. Wars, executions, fires, plagues and earthquakes get one calm phrase at most, with the attention on how people coped and helped each other.
- At most one simple number. Instead of dates, say how long ago it was in a way a child can picture.
${langNote}
</listener>`;
  }
  return `<listener>
A curious adult who does not need things simplified. Speak to them as an equal${ui === "ru" ? ', as "вы"' : ""}, with dry wit where it fits. Dark and uncomfortable history is welcome when it is true: tell it straight, without relish.
</listener>`;
}

function deliveryBlock(voice, ui) {
  if (voice) {
    const ex =
      ui === "ru"
        ? 'Write "улица", "святой", "век", "год", "около" in full. Write "четырнадцатый век", "Жуан Пятый", not Roman numerals. Write foreign names in Cyrillic the way they sound ("Руа Аугушта", "Праса ду Комерсиу"), without the original spelling next to them.'
        : 'Write "Saint", "Street", "century", "about" in full. Write "the fourteenth century", "John the Fifth", not Roman numerals. Write foreign names in a form an English voice can pronounce, without extra spellings in brackets.';
    return `<delivery>
A speech synthesizer will read your text aloud, so write for the ear:
- Flowing sentences that are easy to say. No lists, headings, brackets or footnotes.
- No abbreviations and no Roman numerals. ${ex}
- No symbols such as %, &, / or the number sign. Years in digits are fine.
- Separate paragraphs with an empty line.
</delivery>`;
  }
  return `<delivery>
The text will be read on a phone screen. Plain paragraphs of 2 to 4 sentences, separated by an empty line. No headings, lists or markdown. At the first mention of a local proper name, write it in the story's language and add the local spelling in brackets, so the reader can match it with street signs.
</delivery>`;
}

function styleBlock(ui) {
  return `<style>
Write in ${LANG[ui]}${ui === "ru" ? ": living, natural Russian, the way a good storyteller talks, with no textbook or official phrasing" : ""}.
Sound like a person, not like a guidebook or a chatbot. No stock phrases and no grand summing-up lines (${ui === "ru" ? '"это место хранит память", "стоит как напоминание", "окунёмся в историю"' : '"a testament to", "rich tapestry", "steeped in history", "delve"'}). End on the last beat of the story, not on a moral.
Do not use the long dash. Use commas and full stops, or a short hyphen with spaces where the grammar needs a dash.
</style>`;
}

const TRUTH = `<truth>
Everything must be true. Work from the source text in the request and from what you reliably know about this exact place. Never invent names, dates, numbers, quotes or events to make a story better. If something is a legend, or historians disagree, say so in passing in the storyteller's voice. If the sources hold little, tell a smaller true story (how people lived here, what this street was for) and keep it short. Leave out anything you are unsure of. For a small object given only by name and type, say only what is given.
</truth>`;

function areaLine(ctx) {
  const a = ctx.area;
  const parts = a ? [a.road, a.quarter, a.city, a.country].filter(Boolean) : [];
  const where = parts.length ? parts.join(", ") : `${ctx.center.lat.toFixed(4)}, ${ctx.center.lon.toFixed(4)}`;
  if (ctx.mode === "route" && ctx.route) {
    const via = ctx.route.streets?.length ? ` The way goes along: ${ctx.route.streets.slice(0, 8).map((s) => `${s.name} (${s.distance} m)`).join(", ")}.` : "";
    const dest = ctx.route.destName ? ` to ${ctx.route.destName}` : "";
    return `The listener starts at ${where} and walks${dest}: ${Math.round(ctx.route.distance)} m, about ${walkMin(ctx.route.distance)} minutes on foot.${via}`;
  }
  return `The listener is standing at ${where}. Search radius: ${Math.round(ctx.radius)} m.`;
}

/** Где место находится для слушателя, словами для модели. */
export function whereFor(p, ctx) {
  if (ctx.mode === "route") {
    if (p.behind) return `at the very start of the walk, BEHIND the listener (they have to turn around), ${Math.round(p.offset)} m away`;
    if (p.beyond) return `just past the end of the walk, ${Math.round(p.offset)} m further on`;
    const side = p.side === "left" ? "on the listener's LEFT" : p.side === "right" ? "on the listener's RIGHT" : "directly on the path";
    const when = p.atStart ? "right at the start of the walk" : p.atEnd ? "at the very end of the walk" : `${Math.round(p.along / 10) * 10} m from the start, about ${walkMin(p.along)} min of walking`;
    return `${when}, ${side}, ${Math.round(p.offset)} m from the path`;
  }
  if (p.dist < 25) return "right where the listener stands";
  return `${Math.round(p.dist / 10) * 10} m ${compass(p.bearing)} of the listener, about ${walkMin(p.dist)} min on foot`;
}

function placeLines(ctx) {
  const rows = ctx.places.map((p) => {
    const local = localName(p, ctx.ui, ctx.wikis);
    const intro = p.intro?.text ? ` | ${p.intro.text.slice(0, 380)}` : "";
    return `${p.ref} | ${p.name}${local ? ` [${local}]` : ""} | ${whereFor(p, ctx)} | ${describe(p, ctx.ui) || "no description"}${intro}`;
  });
  return rows.join("\n");
}

function minorLines(ctx) {
  if (!ctx.minors?.length) return "";
  return ctx.minors.map((m) => `${m.ref} | ${m.name} | ${whereFor(m, ctx)} | ${m.desc || "no description"}`).join("\n");
}

function listBlock(ctx) {
  const minors = minorLines(ctx);
  return `<places>
Format: id | name [local name] | where it is for the listener | what it is | start of the encyclopedia article
${placeLines(ctx)}
</places>${
    minors
      ? `

<small_objects>
Things without an article that the listener passes or sees (shops, statues, fountains). Only the name and type are known.
${minors}
</small_objects>`
      : ""
  }`;
}

// ---------- Темы ----------

export function topicsPrompt(ctx) {
  const system = `You suggest story themes for an app that tells true stories about the places around the listener. From a list of real places near them you find the threads worth following.

Rules:
- Every theme must be specific to this neighbourhood and backed by at least one place from the list. "History" or "Architecture" is not a theme; "The earthquake of 1755" or "Smugglers on the river" is.
- Prefer themes with people and events in them: a disaster, a rescue, a scandal, a legend, a trade, a ruler, a mystery, an invention.
- Use only places that a person can see or walk to. Ignore list entries that are not a visitable place (countries, whole cities, organisations, timelines).
- Base themes on the descriptions given and on what you reliably know about these exact places. Do not invent.
- Make the themes different from each other.
- Write title and hint in ${LANG[ctx.ui]}. No long dashes.`;
  const who =
    ctx.audience === "kids"
      ? "The listener is a child of 6-7 with a parent: choose themes a child would pick (animals, kings and queens, knights, ships, treasure, fire brigades, trams and trains, sweets, funny mishaps) and phrase them playfully. Nothing frightening."
      : "The listener is an adult.";
  const user = `${areaLine(ctx)}
${who}

${listBlock(ctx)}

Suggest 6 themes (fewer if the places do not support that many).`;
  return { system, user };
}

// ---------- План рассказа ----------

export function planPrompt(ctx, { count, topics, interest, told }) {
  const order =
    ctx.mode === "route"
      ? "Order the stories strictly by position along the route, from the start to the end."
      : "Open with the strongest story among the nearest places, then order the rest so the walk between them makes sense.";
  const system = `You plan a short storytelling walk for an app. You get a list of real places around the listener and decide which of them get a story, and what each story is.

Rules:
- Choose places a person can see or walk to: buildings, squares, streets, monuments, churches, bridges, parks, stations, shops. Skip list entries that are not a visitable place (countries, whole cities, organisations, events, timelines, lists).
- Choose for story value: something happened there, someone lived or died there, there is a legend, a disaster, a rescue, a scandal, an invention, a mystery. A famous place with nothing but facts loses to a modest place with a real story.
- When story value is close, prefer the nearer place.
- Only plan stories that are true. Base each idea on the descriptions given and on what you reliably know about that exact place. If you know nothing solid about a place and its description is thin, do not pick it.
- One main place per story. Add another place or a small object to "also" only when it truly belongs to the same story.
- Do not plan two stories about the same place or the same event.
- ${order}
- Write title and idea in ${LANG[ctx.ui]}. No long dashes.`;

  const who =
    ctx.audience === "kids"
      ? "The listener is a child of 6-7 with a parent. Choose stories a child will enjoy and can follow: animals, kings and queens, knights, ships, treasure, brave or clever people, inventions, funny mishaps, how children lived long ago. Avoid stories whose core is cruelty or death."
      : "The listener is an adult.";
  const picked = topics?.length
    ? `\nThe listener picked these themes, so build the walk around them:\n${topics.map((t) => `- ${t.title}: ${t.hint}${t.places?.length ? ` (places: ${t.places.join(", ")})` : ""}`).join("\n")}`
    : "";
  const own = interest ? `\nThe listener also wrote what interests them: "${interest}". Give this priority where the places allow it.` : "";
  const done = told?.length ? `\nAlready told in this walk, do not repeat these places or events:\n${told.map((s) => `- ${s.title} (${s.place})`).join("\n")}` : "";

  const user = `${areaLine(ctx)}
${who}${picked}${own}${done}

${listBlock(ctx)}

Plan ${count} ${count === 1 ? "story" : "stories"}. If fewer places have a real story, plan fewer. Never pad.`;
  return { system, user };
}

// ---------- История ----------

export function storySystem({ ui, audience, voice }) {
  return `You are a storyteller walking beside the listener through a real place. You tell true stories about what is around them, the way a brilliant local friend would.

<story>
The listener is tired of general facts. Give them a story: a particular moment, real people, something at stake, a turn, an ending. Tie it to this exact spot and to something they can see from where they are. Start inside the scene or with a detail worth looking at. Leave out founding dates, architects, style names, dimensions and visitor information unless the story turns on them. One story told well beats five facts.
</story>

${TRUTH}

${listenerBlock(audience, ui)}

${deliveryBlock(voice, ui)}

${styleBlock(ui)}

<output>
Output only the words of the story. No title, no greeting, no summary, no question at the end, no remarks about the task.
</output>`;
}

export function storyUser(ctx, { story, index, total, words, told, sources, extras }) {
  const p = story.place;
  const local = localName(p, ctx.ui, ctx.wikis);
  const src = sources.length
    ? sources.map((s) => `<source place="${s.name}" language="${s.lang}">\n${s.text}\n</source>`).join("\n")
    : "No article was found. Rely on what you reliably know about this place, and keep the story short if that is little.";
  const also = extras?.length ? `\n<also_in_this_story>\n${extras.map((e) => `${e.name} | ${whereFor(e, ctx)} | ${e.desc || describe(e, ctx.ui) || ""}`).join("\n")}\n</also_in_this_story>` : "";
  const before = told?.length ? `\nAlready told on this walk (do not repeat them, and open this story in a different way): ${told.map((s) => `"${s.title}"`).join(", ")}.` : "";
  const pointer =
    ctx.audience === "kids"
      ? "Begin with one short sentence that shows the child where to look and names the place. Give the distance in a way a child understands (very close, a few minutes of walking); no compass directions."
      : ctx.mode === "route"
        ? "Begin with one short sentence that tells the listener when and on which side the place will appear, and names it."
        : "Begin with one short sentence that names the place and tells the listener how far it is and in which direction.";

  return `<situation>
${areaLine(ctx)}
This is story ${index + 1} of ${total} on this walk.${before}
</situation>

<place>
Name: ${p.name}${local ? ` (local name: ${local})` : ""}
What it is: ${describe(p, ctx.ui) || "unknown"}
Where it is for the listener: ${whereFor(p, ctx)}
</place>${also}

<suggested_story>
Title the listener sees: ${story.title}
Idea: ${story.idea}
This is a suggestion from a planner that did not read the sources. If the sources do not support it, tell another true story about this place.
</suggested_story>

<sources>
${src}
</sources>

${pointer} Then go straight into the story.

Length: about ${words} words.`;
}

// ---------- Вопрос после истории ----------

export function quizPrompt({ ui, audience, voice, kind, title, text }) {
  const who =
    audience === "kids"
      ? `The listener is a child of 6-7${ui === "ru" ? ', addressed as "ты"' : ""}. Ask about something concrete from the story: who, what, why, what happened next. Keep the question short and friendly. Replies are warm and never make the child feel bad.`
      : `The listener is an adult${ui === "ru" ? ', addressed as "вы"' : ""}. Ask something that takes understanding of the story, not recall of a date or a number. Replies are short and matter-of-fact, with a light touch.`;
  const shape =
    kind === "choice"
      ? `Give exactly three short options. The wrong ones are believable but clearly wrong for someone who listened. Put the right one in a random position.
"right_reply": one or two sentences that confirm the answer and add one small detail from the story.
"wrong_reply": one or two sentences that give the right answer kindly.`
      : `It is an open question that can be answered in a few words or one sentence. "answer" is the expected answer, used only for checking.`;
  const spoken = voice ? "\nEverything will be read aloud by a speech synthesizer: no brackets, abbreviations, Roman numerals or symbols." : "";
  const system = `You write one question that checks whether the listener understood a story they have just heard. The question must be answerable from the story alone.

${who}

${shape}${spoken}
Write in ${LANG[ui]}. No long dashes.`;
  const user = `<story title="${title}">
${text}
</story>`;
  return { system, user };
}

export function checkPrompt({ ui, audience, voice, question, expected, answer, text }) {
  const who =
    audience === "kids"
      ? `The listener is a child of 6-7${ui === "ru" ? ', addressed as "ты"' : ""}. Be generous: a child's own words, a partial answer or the right idea all count as right. Praise specifically. If the answer is wrong, give the right one kindly in one sentence.`
      : `The listener is an adult${ui === "ru" ? ', addressed as "вы"' : ""}. Accept answers that carry the right meaning. Reply in one or two sentences.`;
  const spoken = voice ? " The reply is read aloud by a speech synthesizer: no brackets, abbreviations or symbols." : "";
  const system = `You check a listener's answer to a question about a story they have just heard, and reply to them directly.

${who}
The answer may come from speech recognition, so forgive odd spelling and misheard words.${spoken}
Write the reply in ${LANG[ui]}. No long dashes.`;
  const user = `<story>
${text}
</story>

Question: ${question}
Expected answer: ${expected}
The listener answered: "${answer}"`;
  return { system, user };
}

// ---------- Разговор: вопросы слушателя ----------

export function chatSystem(ctx, { story, storyText, sources }) {
  const short = ctx.audience === "kids" ? "two or three short sentences" : "two to five sentences";
  const src = sources?.length ? `\n<sources>\n${sources.map((s) => `<source place="${s.name}" language="${s.lang}">\n${s.text.slice(0, 5000)}\n</source>`).join("\n")}\n</sources>` : "";
  const current = story
    ? `\n<current_story place="${story.place.name}" title="${story.title}">\n${storyText || "(the story is still being written)"}\n</current_story>`
    : "";
  return `You are a storyteller walking beside the listener through a real place. They have just interrupted to ask something or to talk. Answer them the way a knowledgeable friend would, then stop so the walk can go on.

<answering>
Answer what was asked, in ${short}, unless they ask for a story or for more detail: then tell it properly, in about ${ctx.audience === "kids" ? 90 : 160} words.
If the question is about something around them, use the lists below to work out what they mean.
If you do not know, say so plainly and offer what you do know. Do not end with a question unless you need one to understand them.
</answering>

${TRUTH}

${listenerBlock(ctx.audience, ctx.ui)}

${deliveryBlock(ctx.voice, ctx.ui)}

${styleBlock(ctx.ui)}

<situation>
${areaLine(ctx)}
</situation>
${current}${src}

${listBlock(ctx)}`;
}
