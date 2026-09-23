import { Router } from 'express';
import { requireExternalAuth } from '../middleware/requireExternalAuth.js';
import { OpenAI } from 'openai';
import { randomUUID } from 'node:crypto';
import { VendorOrganization } from '../models/VendorOrganization.js';
import { VendorService } from '../models/VendorService.js';
import { CustomerChatThread } from '../models/CustomerChatThread.js';

const router = Router();

const openai = new OpenAI({ 
  apiKey: process.env.GEMINI_API_KEY, 
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" 
});

function cleanContent(value) {
  return String(value || '').trim();
}

function titleFromMessage(message) {
  const compact = cleanContent(message).replace(/\s+/g, ' ');
  if (!compact) return 'New event plan';
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

async function getOrCreateThread(customerId, threadId, firstMessage = '') {
  const resolvedThreadId =
    cleanContent(threadId) || `thread_${Date.now()}_${randomUUID().slice(0, 8)}`;
  let thread = await CustomerChatThread.findOne({ customerId, threadId: resolvedThreadId });
  if (!thread) {
    thread = new CustomerChatThread({
      customerId,
      threadId: resolvedThreadId,
      title: titleFromMessage(firstMessage),
      messages: [],
      lastMessageAt: new Date(),
    });
  }
  return thread;
}

function toThreadSummary(thread) {
  const last = thread.messages?.[thread.messages.length - 1];
  return {
    id: thread.threadId,
    title: thread.title,
    lastMessageAt: thread.lastMessageAt || thread.updatedAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages?.length || 0,
    preview: last?.content ? titleFromMessage(last.content) : '',
    extractedContext: thread.extractedContext || {},
  };
}

router.get('/threads', requireExternalAuth, async (req, res, next) => {
  try {
    const threads = await CustomerChatThread.find({ customerId: req.externalUser._id })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(50);
    res.json({ ok: true, threads: threads.map(toThreadSummary) });
  } catch (err) {
    next(err);
  }
});

router.post('/threads', requireExternalAuth, async (req, res, next) => {
  try {
    const { title } = req.body || {};
    const thread = await getOrCreateThread(
      req.externalUser._id,
      `thread_${Date.now()}_${randomUUID().slice(0, 8)}`,
      title || 'New event plan',
    );
    if (title) thread.title = titleFromMessage(title);
    await thread.save();
    res.status(201).json({ ok: true, thread: toThreadSummary(thread), messages: [] });
  } catch (err) {
    next(err);
  }
});

router.get('/threads/:threadId', requireExternalAuth, async (req, res, next) => {
  try {
    const thread = await CustomerChatThread.findOne({
      customerId: req.externalUser._id,
      threadId: req.params.threadId,
    });
    if (!thread) return res.status(404).json({ error: 'CHAT_THREAD_NOT_FOUND' });
    res.json({
      ok: true,
      thread: toThreadSummary(thread),
      messages: thread.messages,
      extractedContext: thread.extractedContext || {},
    });
  } catch (err) {
    next(err);
  }
});

router.post('/threads/:threadId/messages', requireExternalAuth, async (req, res, next) => {
  try {
    const { role = 'assistant', content, metadata = {} } = req.body || {};
    const text = cleanContent(content);
    if (!text) return res.status(400).json({ error: 'MESSAGE_REQUIRED' });
    if (!['user', 'assistant'].includes(role)) {
      return res.status(400).json({ error: 'INVALID_MESSAGE_ROLE' });
    }

    const thread = await getOrCreateThread(req.externalUser._id, req.params.threadId, text);
    thread.messages.push({ role, content: text, metadata });
    thread.lastMessageAt = new Date();
    if (!thread.title || thread.title === 'New event plan') {
      const firstUser = thread.messages.find((m) => m.role === 'user');
      thread.title = titleFromMessage(firstUser?.content || text);
    }
    await thread.save();
    res.status(201).json({ ok: true, thread: toThreadSummary(thread), message: thread.messages.at(-1) });
  } catch (err) {
    next(err);
  }
});

router.post('/chat', requireExternalAuth, async (req, res, next) => {
  try {
    const { message, messages = [], threadId } = req.body || {};
    const userMessage =
      cleanContent(message) ||
      cleanContent([...messages].reverse().find((m) => m?.role === 'user')?.content);
    if (!userMessage) {
      return res.status(400).json({ error: 'MESSAGE_REQUIRED' });
    }

    const thread = await getOrCreateThread(req.externalUser._id, threadId, userMessage);
    thread.messages.push({ role: 'user', content: userMessage });
    thread.lastMessageAt = new Date();
    if (!thread.title || thread.title === 'New event plan') {
      thread.title = titleFromMessage(userMessage);
    }
    await thread.save();
    
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

    const conversationHistory = thread.messages
      .filter((m) => ['user', 'assistant'].includes(m.role))
      .slice(-24)
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await openai.chat.completions.create({
      model: "gemini-3.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory
      ],
      temperature: 0.7,
    });

    const aiMessage = response.choices[0].message.content;
    thread.messages.push({ role: 'assistant', content: aiMessage });
    thread.lastMessageAt = new Date();
    
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

    res.json({
      ok: true,
      reply: aiMessage,
      thread: toThreadSummary(thread),
      threadId: thread.threadId,
    });
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
