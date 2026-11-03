// Vercel serverless function: POST /api/rewrite  { text, mode }  ->  { result }
// Works with Anthropic (ANTHROPIC_API_KEY) or OpenAI (OPENAI_API_KEY). Anthropic wins if both are set.

const MODES = {
  naturlig: "Gør teksten mere flydende og naturlig at læse. Ret samtidig stavefejl, kommafejl og grammatik.",
  professionel: "Gør tonen professionel og høflig, som til en kunde eller en chef. Undgå slang.",
  venlig: "Gør tonen varm, venlig og imødekommende, men stadig klar.",
  kortere: "Gør teksten markant kortere. Behold alle vigtige oplysninger, fjern gentagelser og fyldord.",
  enklere: "Gør teksten lettere at læse: korte sætninger, almindelige ord, ingen fagudtryk. Sigt efter en LIX under 30.",
  laengere: "Uddyb teksten lidt, så den bliver mere fyldestgørende og klar, uden at finde på nye fakta."
};

const FREE_WORD_LIMIT = Number(process.env.FREE_WORD_LIMIT || 300);
const PRO_WORD_LIMIT = Number(process.env.PRO_WORD_LIMIT || 3000);
const PER_IP_PER_HOUR = Number(process.env.PER_IP_PER_HOUR || 20);

// Best-effort in-memory rate limit (per warm instance). For hard limits, add Upstash Redis later.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), hour = 3600_000;
  const list = (hits.get(ip) || []).filter(t => now - t < hour);
  if (list.length >= PER_IP_PER_HOUR) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function isPro(req) {
  const codes = (process.env.PRO_CODES || "").split(",").map(s => s.trim()).filter(Boolean);
  const code = (req.headers["x-pro-code"] || "").toString().trim();
  return Boolean(code) && codes.includes(code);
}

function buildPrompt(text, mode) {
  return `Du er en dygtig dansk sprogredaktør. Omskriv teksten nedenfor på dansk.

Stil: ${MODES[mode]}

Regler:
- Behold meningen og alle fakta. Find ikke på nye oplysninger.
- Skriv korrekt, moderne dansk med rigtig tegnsætning.
- Behold navne, tal og hilsner.
- Svar KUN med den omskrevne tekst. Ingen forklaring, ingen anførselstegn, ingen overskrift.

Tekst:
"""
${text}
"""`;
}

async function callAnthropic(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Anthropic error");
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
}

async function callOpenAI(prompt) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "OpenAI error");
  return (data.choices?.[0]?.message?.content || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Brug POST." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const text = (body?.text || "").toString().trim();
  const mode = MODES[body?.mode] ? body.mode : "naturlig";

  if (!text) return res.status(400).json({ error: "Indsæt en tekst først." });

  const pro = isPro(req);
  const words = (text.match(/\S+/g) || []).length;
  const limit = pro ? PRO_WORD_LIMIT : FREE_WORD_LIMIT;
  if (words > limit) {
    return res.status(402).json({
      error: pro
        ? `Teksten er for lang. Maks ${limit} ord ad gangen.`
        : `Gratis-versionen kan omskrive op til ${limit} ord. Opgrader til Pro for længere tekster.`,
      upgrade: !pro
    });
  }

  const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() || "unknown";
  if (!pro && rateLimited(ip)) {
    return res.status(429).json({ error: "Du har brugt dine gratis omskrivninger for nu. Prøv igen om en time, eller opgrader til Pro.", upgrade: true });
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Serveren mangler en API-nøgle." });
  }

  try {
    const prompt = buildPrompt(text, mode);
    const result = process.env.ANTHROPIC_API_KEY ? await callAnthropic(prompt) : await callOpenAI(prompt);
    if (!result) throw new Error("Tomt svar");
    return res.status(200).json({ result, pro });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Noget gik galt. Prøv igen om lidt." });
  }
}
