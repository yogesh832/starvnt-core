import { Router } from 'express';
import { requireExternalAuth } from '../middleware/requireExternalAuth.js';
import { OpenAI } from 'openai';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { CustomerChatThread } from '../models/CustomerChatThread.js';

const router = Router();

const openai = new OpenAI({ 
  apiKey: process.env.GEMINI_API_KEY, 
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" 
});

router.post('/chat', requireExternalAuth, async (req, res, next) => {
  try {
    const { messages, threadId = 'default_thread' } = req.body;
    
    // Fetch some basic vendor data to provide to OpenAI as context
    const vendors = await VendorOrganization.find({ 'verification.isVerified': true }).limit(10);
    const vendorContext = vendors.map(v => `${v.businessName} (Rating: ${v.rating?.average || 0}) in ${v.location}`).join(', ');

    const systemPrompt = `You are Aura+, an elite AI event planner for STARVNT.
Your goal is to help users plan their events. Extract their event type, date, location, guest count, and budget.
CRITICAL RULE: DO NOT ask for all missing details at once. Ask for ONLY ONE missing piece of information at a time.
Whenever you ask a question, you MUST output a JSON block at the very end of your response.
If you are asking for the Location or Venue, output:
\`\`\`json
{ "action": "request_location" }
\`\`\`
For any other question, output 2 to 4 likely options for the user to click:
\`\`\`json
{ "options": ["Wedding", "Corporate Event", "Birthday", "Other"] }
\`\`\`
If you need the Budget, output:
\`\`\`json
{ "options": ["5-10 Lakh", "10-15 Lakh", "15-20 Lakh", "20 Lakh+"] }
\`\`\`
Here is some verified vendor data you can recommend: ${vendorContext}.
Keep your responses short, professional, and friendly. 
If the user provides all event details (Event Type, Date, Location, Guest Count), you MUST output a JSON block at the end of your response like this:
\`\`\`json
{ "type": "Wedding", "dateStr": "26 November 2025", "isoDate": "2025-11-26", "venue": "New Town", "guests": 500 }
\`\`\`
Do not output the final JSON block until you have enough information.`;

    const response = await openai.chat.completions.create({
      model: "gemini-3.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
    });

    const aiMessage = response.choices[0].message.content;
    
    // Save to DB
    let thread = await CustomerChatThread.findOne({ customerId: req.externalUser._id, threadId });
    if (!thread) {
       thread = new CustomerChatThread({ customerId: req.externalUser._id, threadId, messages: [] });
    }
    
    thread.messages = [ ...messages, { role: 'assistant', content: aiMessage } ];
    
    // Attempt to extract context if available
    const jsonMatch = aiMessage.match(/```(?:json)?\n?([\s\S]*?)\n?```/i);
    if (jsonMatch) {
       try {
         const data = JSON.parse(jsonMatch[1]);
         if (!data.options && data.action !== 'request_location') {
             thread.extractedContext = { ...thread.extractedContext, ...data };
         }
       } catch(e) {}
    }
    await thread.save();

    res.json({ reply: aiMessage });
  } catch (err) {
    next(err);
  }
});

router.post('/voice', requireExternalAuth, async (req, res, next) => {
  try {
    const { text } = req.body;
    
    // Default Rachel voice
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.5 }
      })
    });
    
    if (!response.ok) {
       throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
