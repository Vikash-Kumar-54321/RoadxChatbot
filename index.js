import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { COMPANY_DATA } from "./companyData.js";
import dotenv from 'dotenv'; // ✅ IMPORT dotenv

// ✅ LOAD ENVIRONMENT VARIABLES from .env file
dotenv.config();

const app = express();
app.use(bodyParser.json());

// ✅ Tokens loaded securely from .env
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; // ✅ Get Phone ID from .env

// ✅ Gemini model setup
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/* -------------------------------------------------------------------------- */
/* ✅ STEP 1: VERIFY WEBHOOK SETUP                                             */
/* -------------------------------------------------------------------------- */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🪝 Verification request received:", { mode, token, challenge });

  // ✅ Check if mode and token are correct
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed!");
    res.sendStatus(403);
  }
});

/* -------------------------------------------------------------------------- */
/* ✅ STEP 2: HANDLE INCOMING WHATSAPP MESSAGES                                */
/* -------------------------------------------------------------------------- */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    // ✅ Ensure it's a valid message payload
    if (message) {
      const from = message.from; // User's phone number
      const text = message.text?.body || ""; // The message text

      if (!text) {
        // Not a text message (e.g., image, reaction), ignore
        return res.sendStatus(200);
      }
      
      console.log(`📩 Message received from ${from}: ${text}`);

      // Generate AI response
      const aiReply = await getAIResponse(text);

      // Send the response back to the user
      await sendWhatsAppMessage(from, aiReply);
    }

    res.sendStatus(200); // Send 200 OK to acknowledge receipt
  } catch (error) {
    console.error("❌ Error in POST /webhook:", error);
    res.sendStatus(500); // Send 500 if an error occurs
  }
});

/* -------------------------------------------------------------------------- */
/* ✅ STEP 3: GENERATE AI RESPONSE                                             */
/* -------------------------------------------------------------------------- */
async function getAIResponse(userMessage) {
  try {
    // Simple greeting rule (case-insensitive, trims whitespace)
    if (/^(hi|hello|hey|hii)$/i.test(userMessage.trim())) {
      return "👋 Hello! Welcome to *RoadX Logistics*. How may I assist you today?";
    }

    // Main AI prompt
    const prompt = `
You are a professional WhatsApp Business assistant for *RoadX Logistics*.

🎯 Rules:
- Respond in a polite, formal, and professional tone.
- Use WhatsApp formatting (*bold*, line breaks, emojis) for clarity.
- ONLY answer using the company data below.
- If the user asks for something not in the data (like "What's the weather?" or "Tell me a joke"), you MUST decline.
- If you are unsure or the information is not available, reply with: "_📌 For this request, please contact our support team at support@roadx.com._"

Here is the company data:
${COMPANY_DATA}

Customer message: "${userMessage}"
`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error("❌ Gemini AI Error:", err);
    return "⚠️ Sorry, something went wrong while processing your request. Please try again later.";
  }
}

/* -------------------------------------------------------------------------- */
/* ✅ STEP 4: SEND MESSAGE BACK TO WHATSAPP                                    */
/* -------------------------------------------------------------------------- */
async function sendWhatsAppMessage(to, text) {
  try {
    // ✅ Use the Phone Number ID from .env
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`, // ✅ Use token from .env
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          text: { body: text },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
        console.error("❌ WhatsApp API Error Response:", data);
        throw new Error(`WhatsApp API failed: ${data.error?.message || response.statusText}`);
    }
    
    console.log("📤 WhatsApp API Response:", data);
  } catch (error) {
    console.error("❌ Error sending message:", error.message || error);
  }
}

/* -------------------------------------------------------------------------- */
/* ✅ STEP 5: START EXPRESS SERVER                                             */
/* -------------------------------------------------------------------------- */
const PORT = process.env.PORT || 3000; // Use port from environment or default to 3000
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));