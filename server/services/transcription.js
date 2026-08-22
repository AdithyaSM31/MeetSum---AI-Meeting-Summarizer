import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Whisper API limit is 25 MB — we chunk at 24 MB to leave safe margin
const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24 MB

/**
 * Transcribe an audio file using OpenAI Whisper API.
 * Automatically splits large files (>24 MB) into byte-range chunks.
 *
 * @param {string} filePath - Absolute path to the audio file
 * @returns {Promise<string>} - The full transcribed text
 */
export async function transcribeAudio(filePath) {
  const stats = fs.statSync(filePath);

  if (stats.size <= MAX_CHUNK_SIZE) {
    // Small file — transcribe directly
    return transcribeSingleFile(filePath);
  }

  // Large file — split into byte-range chunks, transcribe each, then merge
  console.log(`  File is ${(stats.size / (1024 * 1024)).toFixed(1)} MB — splitting into chunks...`);
  const chunkPaths = splitFileBySize(filePath, stats.size);
  console.log(`  Split into ${chunkPaths.length} chunks`);

  const transcripts = [];
  for (let i = 0; i < chunkPaths.length; i++) {
    console.log(`  Transcribing chunk ${i + 1}/${chunkPaths.length}...`);
    try {
      const text = await transcribeSingleFile(chunkPaths[i]);
      transcripts.push(text);
    } catch (err) {
      console.error(`  Chunk ${i + 1} failed:`, err.message);
      // Continue with remaining chunks — partial transcript is better than none
      transcripts.push(`[Chunk ${i + 1} transcription failed]`);
    }
  }

  // Clean up temp chunk files
  for (const chunkPath of chunkPaths) {
    try { fs.unlinkSync(chunkPath); } catch (_) { /* ignore */ }
  }

  // Clean up the temp directory
  try {
    const chunkDir = path.dirname(chunkPaths[0]);
    if (chunkDir !== path.dirname(filePath)) {
      fs.rmdirSync(chunkDir);
    }
  } catch (_) { /* ignore if not empty */ }

  return transcripts.join(' ');
}

/**
 * Transcribe a single audio file with Whisper API.
 */
async function transcribeSingleFile(filePath) {
  try {
    const fileStream = fs.createReadStream(filePath);

    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-1',
      response_format: 'text',
      language: 'en',
    });

    return transcription;
  } catch (error) {
    if (error.status === 413) {
      throw new Error('Audio chunk is too large for Whisper API.');
    }
    if (error.code === 'ENOENT') {
      throw new Error('Audio file not found on server.');
    }
    console.error('Transcription error:', error.message);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * Split a large audio file into byte-range chunks, each under MAX_CHUNK_SIZE.
 * 
 * For MP3/OGG/FLAC: Splits at byte boundaries. While not ideal (may lose a
 * fraction of a second at boundaries), Whisper handles slightly malformed
 * audio gracefully and this avoids requiring ffmpeg as a system dependency.
 * 
 * Returns an array of paths to the chunk files.
 */
function splitFileBySize(filePath, totalSize) {
  const ext = path.extname(filePath);
  const chunkDir = path.join(path.dirname(filePath), `chunks_${uuidv4()}`);
  fs.mkdirSync(chunkDir, { recursive: true });

  const numChunks = Math.ceil(totalSize / MAX_CHUNK_SIZE);
  const chunkPaths = [];
  const fd = fs.openSync(filePath, 'r');

  try {
    for (let i = 0; i < numChunks; i++) {
      const start = i * MAX_CHUNK_SIZE;
      const end = Math.min(start + MAX_CHUNK_SIZE, totalSize);
      const chunkSize = end - start;

      const buffer = Buffer.alloc(chunkSize);
      fs.readSync(fd, buffer, 0, chunkSize, start);

      const chunkPath = path.join(chunkDir, `chunk_${String(i).padStart(3, '0')}${ext}`);
      fs.writeFileSync(chunkPath, buffer);
      chunkPaths.push(chunkPath);
    }
  } finally {
    fs.closeSync(fd);
  }

  return chunkPaths;
}
