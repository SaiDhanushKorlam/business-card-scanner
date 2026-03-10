const Tesseract = require('tesseract.js');
const { Card } = require('../models/Card'); // Updated import for Sequelize
const fs = require('fs');
const axios = require('axios');
const xlsx = require('xlsx'); // Added this so your Excel export works!

exports.uploadCard = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng');

        // Combined Instructions because Gemma 3 on OpenRouter currently dislikes the 'system' role
        const combinedPrompt = `
        INSTRUCTIONS:
        You are a specialized business card parser. Extract all details from the provided text into a flat JSON object.
        1. The 'address' field must be a single STRING. NEVER use nested objects.
        2. Capture EVERY detail (name, jobTitle, company, email, phone, website, address, education, social media).
        3. If a field is missing, use null.
        4. Return ONLY raw JSON.
        5. If there are multiple phone numbers or emails, join them into ONE string separated by a comma.

        TEXT TO PARSE:
        ${text}
        `;

        const aiResponse = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemma-3-27b-it",
            messages: [
                {
                    role: "user",
                    content: combinedPrompt
                }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, // Pulling from .env now!
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "CardConnect App"
            }
        });

        let extractedData = JSON.parse(aiResponse.data.choices[0].message.content);

        // Flatten address if Gemma ignores the prompt
        if (extractedData.address && typeof extractedData.address === 'object') {
            extractedData.address = Object.values(extractedData.address).filter(Boolean).join(', ');
        }

        // SEQUELIZE CHANGE: Create and save the record in one step
        const newCard = await Card.create({
            ...extractedData,
            rawText: text
        });

        fs.unlinkSync(req.file.path);
        res.status(200).json({ success: true, data: newCard });

    } catch (error) {
        const errorData = error.response?.data || error.message;
        console.error("Gemma Extraction Error:", JSON.stringify(errorData, null, 2));

        res.status(500).json({
            error: 'Gemma 3 is busy or instruction failed',
            details: errorData
        });
    }
};

exports.downloadExcel = async (req, res) => {
    try {
        // SEQUELIZE CHANGE: Fetch all cards, exclude unwanted columns, and return raw JSON
        // 'raw: true' is the Sequelize equivalent to Mongoose's '.lean()'
        const cards = await Card.findAll({
            attributes: { exclude: ['id', 'createdAt', 'updatedAt', 'rawText'] },
            raw: true
        });

        if (cards.length === 0) return res.status(404).send('No data to export');

        // xlsx.utils.json_to_sheet automatically creates headers from the JSON keys!
        const worksheet = xlsx.utils.json_to_sheet(cards);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Scanned Cards");

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="CardConnect_Export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error(error);
        res.status(500).send('Excel generation failed');
    }
};