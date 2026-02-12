require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const PDFDocument = require("pdfkit");

const app = express();

app.use(cors({
  origin: [
    "https://resume-analyzer-frontend-gamma.vercel.app",
    "http://localhost:3000"
  ],
}));
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ---------------- HOME ----------------
app.get("/", (req, res) => {
  res.send("AI Resume Analyzer Backend Running 🚀");
});

// ---------------- TEXT ANALYSIS ----------------
app.post("/analyze", async (req, res) => {
  const { resumeText } = req.body;

  if (!resumeText || resumeText.trim().length < 50) {
    return res.status(400).json({ error: "Resume text is too short" });
  }

  try {
    const parsed = await analyzeWithAI(resumeText);
    res.json(parsed);
  } catch (error) {
    console.error("Analyze Error:", error.message);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

// ---------------- PDF ANALYSIS ----------------
app.post("/analyze-pdf", upload.single("resume"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "PDF file is required" });
  }

  try {
    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ error: "Could not extract enough text" });
    }

    const parsed = await analyzeWithAI(resumeText);
    res.json(parsed);

  } catch (error) {
    console.error("PDF Error:", error.message);
    res.status(500).json({ error: "PDF analysis failed" });
  }
});

// ---------------- DOWNLOAD PDF REPORT ----------------
app.post("/download-report", (req, res) => {
  const data = req.body;

  if (!data || !data.ats_score) {
    return res.status(400).json({ error: "Invalid report data" });
  }

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=resume-analysis-report.pdf"
  );

  doc.pipe(res);

  doc.fontSize(22).text("AI Resume Analysis Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(16).text(`ATS Score: ${data.ats_score} / 100`);
  doc.moveDown();

  const addSection = (title, items) => {
    doc.fontSize(14).text(title, { underline: true });
    doc.moveDown(0.5);

    items.forEach((item) => {
      doc.fontSize(12).text(`• ${item}`);
    });

    doc.moveDown();
  };

  addSection("Strengths", data.strengths || []);
  addSection("Weaknesses", data.weaknesses || []);
  addSection("Missing Skills", data.missing_skills || []);
  addSection("Improvement Suggestions", data.improvement_suggestions || []);

  doc.end();
});

// ---------------- AI FUNCTION ----------------
async function analyzeWithAI(resumeText) {
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `
You are a professional ATS resume evaluator.

Return ONLY valid JSON.

{
  "ats_score": number (0-100),
  "strengths": string[],
  "weaknesses": string[],
  "missing_skills": string[],
  "improvement_suggestions": string[]
}
`
        },
        {
          role: "user",
          content: `Analyze this resume thoroughly:\n\n${resumeText}`
        }
      ]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      }
    }
  );

  let aiResponse = response.data.choices[0].message.content;

  aiResponse = aiResponse
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(aiResponse);

    if (parsed.ats_score <= 1) {
      parsed.ats_score = Math.round(parsed.ats_score * 100);
    }

    parsed.ats_score = Math.min(100, Math.max(0, parsed.ats_score));

    return parsed;
  } catch (err) {
    console.error("JSON Parse Error:", aiResponse);
    throw new Error("AI returned invalid JSON");
  }
}

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 8000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});