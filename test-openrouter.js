import 'dotenv/config';

const SYSTEM_PROMPT = `You are a business card data extractor. Return ONLY a valid JSON object.`;

async function testOpenRouter() {
    console.log("Testing OpenRouter with key:", process.env.OPENROUTER_API_KEY ? "EXISTS" : "MISSING");
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "HTTP-Referer": "http://localhost:3001", // OpenRouter sometimes requires this
                "X-Title": "Business Card Scanner",
            },
            body: JSON.stringify({
                model: "nvidia/nemotron-nano-12b-v2-vl:free",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: "Extract info from this test: Name: John Doe" }
                ],
            }),
        });

        const data = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

testOpenRouter();
