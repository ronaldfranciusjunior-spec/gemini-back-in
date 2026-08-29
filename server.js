import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.get("/", (req, res) => {
  res.send("Gemini backend is working!");
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: "Please enter something to generate."
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Create a clear, organized note based on this request:\n\n${prompt}`
    });

    res.json({
      text: response.text
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Could not generate the note."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
