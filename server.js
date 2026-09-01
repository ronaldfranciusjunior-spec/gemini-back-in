import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 10000;

// ---------------------------------------------------------
// IMPORTANT: this must be set in Render → Environment tab
// as GEMINI_API_KEY, with a key generated at
// https://aistudio.google.com/apikey (NOT a Google Cloud
// OAuth client ID — that's what causes
// ACCESS_TOKEN_TYPE_UNSUPPORTED).
// ---------------------------------------------------------
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

  const MAX_ATTEMPTS = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
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

      console.error(
        `Gemini API error (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        error
      );

      if (isOverloaded && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }

      break;
    }
  }

  const wasOverloaded =
    lastError?.status === 503 ||
    lastError?.status === "UNAVAILABLE" ||
    /UNAVAILABLE|overloaded|high demand/i.test(lastError?.message || "");

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
