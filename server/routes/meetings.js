import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { transcribeAudio } from '../services/transcription.js';
import { summarizeTranscript } from '../services/summarization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for audio file uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const ALLOWED_MIME_TYPES = [
  'audio/mpeg',       // mp3
  'audio/mp4',        // mp4 audio
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/m4a',
  'audio/ogg',
  'audio/flac',
  'video/mp4',        // mp4 with audio
  'video/webm',
  'audio/mpeg3',
  'audio/x-mpeg-3',
];

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB (auto-chunked for Whisper's 25 MB limit)
  },
  fileFilter: (req, file, cb) => {
    // Be lenient with MIME types — also check extension
    const allowedExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file format: ${ext}. Supported: mp3, mp4, wav, m4a, webm, ogg, flac`));
    }
  },
});

// ─── POST /api/meetings/upload ─────────────────────────────────────────────────
// Upload an audio file and start the transcription + summarization pipeline
router.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided.' });
    }

    const meetingId = uuidv4();
    const { filename, originalname, size } = req.file;

    // Insert initial record
    db.prepare(`
      INSERT INTO meetings (id, filename, original_name, file_size, status)
      VALUES (?, ?, ?, ?, 'processing')
    `).run(meetingId, filename, originalname, size);

    // Send immediate response — processing happens async
    res.status(202).json({
      id: meetingId,
      status: 'processing',
      message: 'Audio uploaded successfully. Transcription and summarization in progress.',
    });

    // Process in background (don't await in the request handler)
    processAudio(meetingId, path.join(uploadsDir, filename)).catch((err) => {
      console.error(`Processing failed for meeting ${meetingId}:`, err.message);
    });

  } catch (error) {
    console.error('Upload error:', error.message);
    if (error.message.includes('Unsupported file format')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// ─── Background processing pipeline ───────────────────────────────────────────
async function processAudio(meetingId, filePath) {
  try {
    // Step 1: Transcribe audio
    console.log(`[${meetingId}] Starting transcription...`);
    db.prepare('UPDATE meetings SET status = ? WHERE id = ?').run('transcribing', meetingId);

    const transcript = await transcribeAudio(filePath);

    db.prepare('UPDATE meetings SET transcript = ?, status = ? WHERE id = ?')
      .run(transcript, 'summarizing', meetingId);
    console.log(`[${meetingId}] Transcription complete (${transcript.length} chars)`);

    // Step 2: Summarize transcript
    console.log(`[${meetingId}] Starting summarization...`);
    const result = await summarizeTranscript(transcript);

    db.prepare(`
      UPDATE meetings 
      SET summary = ?, key_decisions = ?, action_items = ?, topics_discussed = ?,
          status = 'completed', processed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      result.summary,
      JSON.stringify(result.key_decisions),
      JSON.stringify(result.action_items),
      JSON.stringify(result.topics_discussed),
      meetingId
    );
    console.log(`[${meetingId}] Processing complete!`);

  } catch (error) {
    console.error(`[${meetingId}] Processing error:`, error.message);
    db.prepare('UPDATE meetings SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', error.message, meetingId);
  }
}

// ─── GET /api/meetings ─────────────────────────────────────────────────────────
// List all meetings, newest first
router.get('/', (req, res) => {
  try {
    const meetings = db.prepare(`
      SELECT id, original_name, file_size, status, summary, created_at, processed_at
      FROM meetings
      ORDER BY created_at DESC
    `).all();

    res.json(meetings);
  } catch (error) {
    console.error('List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch meetings.' });
  }
});

// ─── GET /api/meetings/:id ─────────────────────────────────────────────────────
// Get full meeting details
router.get('/:id', (req, res) => {
  try {
    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }

    // Parse JSON fields
    const response = {
      ...meeting,
      key_decisions: meeting.key_decisions ? JSON.parse(meeting.key_decisions) : [],
      action_items: meeting.action_items ? JSON.parse(meeting.action_items) : [],
      topics_discussed: meeting.topics_discussed ? JSON.parse(meeting.topics_discussed) : [],
    };

    res.json(response);
  } catch (error) {
    console.error('Detail error:', error.message);
    res.status(500).json({ error: 'Failed to fetch meeting details.' });
  }
});

// ─── DELETE /api/meetings/:id ──────────────────────────────────────────────────
// Delete a meeting and its audio file
router.delete('/:id', (req, res) => {
  try {
    const meeting = db.prepare('SELECT filename FROM meetings WHERE id = ?').get(req.params.id);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }

    // Delete audio file
    const filePath = path.join(uploadsDir, meeting.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete database record
    db.prepare('DELETE FROM meetings WHERE id = ?').run(req.params.id);

    res.json({ message: 'Meeting deleted successfully.' });
  } catch (error) {
    console.error('Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete meeting.' });
  }
});

export default router;
