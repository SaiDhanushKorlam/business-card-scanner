import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_RETRIES = 3;

app.use(cors({ origin: ["http://localhost:5173", "https://your-vercel-domain.vercel.app"] })); // Update with your actual Vercel domain later
app.use(express.json({ limit: "20mb" }));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined in .env");
} else {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log("✓ Connected to MongoDB Atlas"))
        .catch(err => console.error("MongoDB connection error:", err));
}

// Card Schema
const cardSchema = new mongoose.Schema({
    companyName: String,
    fullName: String,
    jobTitle: String,
    email: String,
    phone: String,
    fax: String,
    addressLine1: String,
    addressLine2: String,
    web: String,
    status: { type: String, default: 'done' },
    createdAt: { type: Date, default: Date.now }
});

const Card = mongoose.model("Card", cardSchema);

const SYSTEM_PROMPT = `You are a business card data extractor. Given an image of a business card, extract contact information and return ONLY a valid JSON object with these exact keys:
{
  "companyName": "",
  "fullName": "",
  "jobTitle": "",
  "email": "",
  "phone": "",
  "fax": "",
  "addressLine1": "",
  "addressLine2": "",
  "web": ""
}
Rules:
- Return ONLY the JSON object, no markdown, no explanation, no extra text
- If a field is not found, use an empty string ""
- For email, phone, fax, web: if multiple values exist, separate with " | "
- For address: put street/building in addressLine1, city/state/zip/country in addressLine2`;

const FIELD_KEYS = ["companyName", "fullName", "jobTitle", "email", "phone", "fax", "addressLine1", "addressLine2", "web"];

function isEmptyExtraction(parsed) {
    return FIELD_KEYS.every((k) => !parsed[k] || parsed[k].trim() === "");
}

function tryParseJSON(text) {
    if (!text || text.trim() === "") return null;
    const cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .replace(/^[\s\S]*?(\{)/, "$1")
        .replace(/(\})[\s\S]*$/, "$1")
        .trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

async function callOpenRouter(base64Image, mimeType) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
            model: "nvidia/nemotron-nano-12b-v2-vl:free",
            max_tokens: 1000,
            temperature: 0.1,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: `data:${mimeType};base64,${base64Image}` },
                        },
                        { type: "text", text: "Extract the contact information from this business card image. Return ONLY the JSON object." },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || `OpenRouter HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    return text;
}

// Routes
app.get("/api/cards", async (req, res) => {
    try {
        const cards = await Card.find().sort({ createdAt: -1 });
        res.json(cards);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch cards" });
    }
});

app.post("/api/extract", async (req, res) => {
    const { base64Image, mimeType } = req.body;

    if (!base64Image || !mimeType) {
        return res.status(400).json({ error: "base64Image and mimeType are required" });
    }

    let lastRawResponse = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[Extract] Attempt ${attempt}/${MAX_RETRIES}`);
            const rawText = await callOpenRouter(base64Image, mimeType);
            lastRawResponse = rawText || "";

            const parsed = tryParseJSON(rawText);

            if (parsed && !isEmptyExtraction(parsed)) {
                const savedCard = await Card.create(parsed);
                return res.json(savedCard);
            }
        } catch (err) {
            console.error(`[Extract] Attempt ${attempt} error:`, err.message);
            if (attempt === MAX_RETRIES) {
                return res.status(502).json({ error: err.message });
            }
        }
        await new Promise((r) => setTimeout(r, 1000));
    }

    res.status(422).json({ error: "Extraction yielded no data" });
});

app.delete("/api/cards/:id", async (req, res) => {
    try {
        await Card.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete card" });
    }
});

app.patch("/api/cards/:id", async (req, res) => {
    try {
        const updatedCard = await Card.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedCard);
    } catch (err) {
        res.status(500).json({ error: "Failed to update card" });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`✓ Backend proxy running on http://localhost:${PORT}`);
    });
}

export default app;
