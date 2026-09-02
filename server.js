import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 10000;

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "FATAL: GEMINI_API_KEY is not set. " +
    "Set it in Render → Environment, then redeploy."
  );
}

const ai = new GoogleGenAI({ apiKey });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.post("/generate", async (req, res) => {
  const prompt = req.body?.prompt;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({
      error: "Missing or empty 'prompt' in request body."
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      error: "Server is missing GEMINI_API_KEY. Contact the site owner."
    });
  }

  const MODELS = [
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-pro-latest"
  ];
  const ATTEMPTS_PER_MODEL = 2;
  let lastError = null;

  outer:
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "You are a study assistant. Turn the following raw " +
                    "lecture transcript into clean, organized study notes.\n\n" +
                    "Formatting rules (follow exactly):\n" +
                    "- Do NOT use Markdown symbols of any kind: no #, ##, " +
                    "**, *, or _.\n" +
                    "- Write section titles as plain text in ALL CAPS on " +
                    "their own line.\n" +
                    "- Use a simple dash and space (\"- \") for bullet " +
                    "points, nothing else.\n" +
                    "- Leave a blank line between sections.\n" +
                    "- Fix obvious speech-to-text errors where the meaning " +
                    "is clear, but do not invent content that wasn't said." +
                    "\n\nTranscript:\n" +
                    prompt
                }
              ]
            }
          ]
        });

        const text = response?.text
          ?? response?.candidates?.[0]?.content?.parts?.[0]?.text
          ?? "";

        if (!text) {
          console.error("Gemini returned no text:", JSON.stringify(response));
          return res.status(502).json({
            error: "Gemini returned an empty response."
          });
        }

        return res.json({ text });
      } catch (error) {
        lastError = error;

        const isOverloaded =
          error?.status === 503 ||
          error?.status === "UNAVAILABLE" ||
          /UNAVAILABLE|overloaded|high demand/i.test(error?.message || "");

        const isQuotaExceeded =
          error?.status === 429 ||
          error?.status === "RESOURCE_EXHAUSTED" ||
          /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(error?.message || "");

        const isModelUnavailable =
          error?.status === 404 ||
          error?.status === "NOT_FOUND" ||
          /NOT_FOUND|no longer available|is not found/i.test(error?.message || "");

        console.error(
          `Gemini API error [model: ${model}, attempt ${attempt}/${ATTEMPTS_PER_MODEL}]:`,
          error
        );

        if (isQuotaExceeded || isModelUnavailable) {
          continue outer;
        }

        if (isOverloaded && attempt < ATTEMPTS_PER_MODEL) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
          continue;
        }

        if (isOverloaded) {
          continue outer;
        }

        break outer;
      }
    }
  }

  const wasOverloaded =
    lastError?.status === 503 ||
    lastError?.status === "UNAVAILABLE" ||
    /UNAVAILABLE|overloaded|high demand/i.test(lastError?.message || "");

  const wasQuotaExceeded =
    lastError?.status === 429 ||
    lastError?.status === "RESOURCE_EXHAUSTED" ||
    /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(lastError?.message || "");

  if (wasQuotaExceeded) {
    return res.status(429).json({
      error:
        "Daily AI usage limit reached for all available models. " +
        "Please try again tomorrow, or upgrade the Gemini API plan."
    });
  }

  if (wasOverloaded) {
    return res.status(503).json({
      error: "Gemini is busy right now. Please try again in a minute."
    });
  }

  res.status(500).json({
    error: "Failed to generate notes.",
    detail: lastError?.message || String(lastError)
  });
});

app.get("/", (req, res) => {
  res.send("gemini-back-in is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
