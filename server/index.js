import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import meetingsRouter from './routes/meetings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve uploaded files statically (if needed)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'client')));

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/meetings', meetingsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ─── Error Handling ────────────────────────────────────────────────────────────
// Handle multer errors
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large. Maximum size is 200 MB.',
    });
  }
  if (err.message && err.message.includes('Unsupported file format')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Meeting Summarizer Server running at http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/meetings`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/health\n`);
  
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY is not set. Transcription and summarization will fail.');
  }

  // ─── Keep-Alive Cron Job (Render Free Tier) ──────────────────────────────────
  // Render spins down free tier instances after 15 minutes of inactivity.
  // This internal cron job pings the /api/health endpoint every 14 minutes.
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const FOURTEEN_MINUTES = 14 * 60 * 1000;
  
  setInterval(async () => {
    try {
      console.log(`[Keep-Alive] Pinging ${RENDER_URL}/api/health at ${new Date().toISOString()}`);
      const res = await fetch(`${RENDER_URL}/api/health`);
      if (res.ok) {
        console.log('[Keep-Alive] Ping successful.');
      } else {
        console.warn(`[Keep-Alive] Ping returned status: ${res.status}`);
      }
    } catch (err) {
      console.error('[Keep-Alive] Ping failed:', err.message);
    }
  }, FOURTEEN_MINUTES);
});
