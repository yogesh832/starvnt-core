import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireExternalAuth } from '../middleware/requireExternalAuth.js';
import { MAX_VOICE_BYTES, synthesizeSpeech, transcribeAudio } from '../services/voice.service.js';

export function createVoiceRouter({ authenticate = requireExternalAuth, speak = synthesizeSpeech, transcribe = transcribeAudio } = {}) {
  const router = Router();
  const limit = rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'VOICE_RATE_LIMITED', message: 'Too many voice requests. Please wait a moment.' } });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VOICE_BYTES, files: 1, fields: 0 } });
  function failure(res, error) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error instanceof multer.MulterError ? 400 : error.status || 502;
    const code = error.code === 'LIMIT_FILE_SIZE' ? 'VOICE_AUDIO_TOO_LARGE' : String(error.code || '').startsWith('VOICE_') ? error.code : 'VOICE_PROVIDER_UNAVAILABLE';
    return res.status(status).json({ error: code, message: String(error.code || '').startsWith('VOICE_') ? error.message : 'Voice is unavailable. Please try again.' });
  }
  router.post('/transcribe', authenticate, limit, (req, res) => {
    upload.single('file')(req, res, async error => {
      if (error) return failure(res, error);
      try { res.setHeader('Cache-Control', 'no-store'); res.json(await transcribe(req.file)); }
      catch (error) { failure(res, error); }
    });
  });
  router.post('/voice', authenticate, limit, async (req, res) => {
    try {
      const audio = await speak(req.body?.text);
      res.setHeader('Cache-Control', 'no-store');
      res.type('audio/mpeg').send(audio);
    } catch (error) { failure(res, error); }
  });
  return router;
}
