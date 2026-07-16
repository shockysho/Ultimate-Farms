// ============================================================
// DEMIURGOS — YouTube Source Ingestor
// ============================================================
//
// Ingests YouTube video transcripts into the knowledge base.
// Primary: downloads audio via yt-dlp → transcribes via Whisper server.
// Fallback: extracts YouTube auto-captions via yt-dlp.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestText } from '../ingestor.js';
import type { IngestResult } from '../ingestor.js';

const WHISPER_URL = process.env.WHISPER_URL ?? 'http://localhost:8081';

/**
 * Ingest a YouTube video transcript into the knowledge base.
 *
 * Strategy:
 * 1. Try whisper transcription (yt-dlp audio download → whisper server)
 * 2. Fallback to YouTube auto-captions via yt-dlp
 */
export async function ingestYouTube(
  url: string,
  domain: string,
): Promise<IngestResult> {
  // Extract video metadata first
  const metadata = getVideoMetadata(url);

  // Try whisper transcription first
  let transcript = await tryWhisperTranscription(url);

  // Fallback to auto-captions
  if (!transcript) {
    transcript = tryAutoCaptions(url);
  }

  if (!transcript || transcript.trim().length === 0) {
    throw new Error(
      `Could not extract transcript from YouTube video: ${url}. ` +
      `Ensure yt-dlp is installed and the whisper server is running at ${WHISPER_URL}, ` +
      `or that the video has auto-captions available.`,
    );
  }

  // Build source label with metadata
  const sourceLabel = metadata.title
    ? `youtube:${metadata.title} (${metadata.channel ?? 'unknown'}) — ${url}`
    : `youtube:${url}`;

  return ingestText(transcript, sourceLabel, domain, {
    chunkSize: 600,
    overlap: 120,
  });
}

// --- Whisper Transcription Path ---

async function tryWhisperTranscription(url: string): Promise<string | null> {
  // Check if whisper server is available
  try {
    const healthCheck = await fetch(`${WHISPER_URL}/health`);
    if (!healthCheck.ok) return null;
  } catch {
    // Server not reachable
    return null;
  }

  // Download audio via yt-dlp
  const tmpDir = tmpdir();
  const audioPath = join(tmpDir, `demiurgos-yt-${Date.now()}.wav`);

  try {
    execSync(
      `yt-dlp -x --audio-format wav --audio-quality 0 -o "${audioPath}" "${url}"`,
      { stdio: 'pipe', timeout: 120_000 },
    );
  } catch {
    // yt-dlp failed to download audio
    cleanup(audioPath);
    return null;
  }

  if (!existsSync(audioPath)) return null;

  // Send audio to whisper server
  try {
    const audioBuffer = readFileSync(audioPath);
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');

    const response = await fetch(`${WHISPER_URL}/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      cleanup(audioPath);
      return null;
    }

    const result = await response.json() as { text: string };
    cleanup(audioPath);
    return result.text ?? null;
  } catch {
    cleanup(audioPath);
    return null;
  }
}

// --- Auto-Captions Fallback ---

function tryAutoCaptions(url: string): string | null {
  const tmpDir = tmpdir();
  const subDir = join(tmpDir, `demiurgos-subs-${Date.now()}`);

  try {
    execSync(`mkdir -p "${subDir}"`, { stdio: 'pipe' });

    // Download auto-generated subtitles
    execSync(
      `yt-dlp --write-auto-sub --sub-lang en --skip-download ` +
      `--sub-format vtt -o "${join(subDir, 'sub')}" "${url}"`,
      { stdio: 'pipe', timeout: 60_000 },
    );

    // Find the .vtt file
    const files = readdirSync(subDir).filter(f => f.endsWith('.vtt'));
    if (files.length === 0) {
      cleanupDir(subDir);
      return null;
    }

    const vttContent = readFileSync(join(subDir, files[0]), 'utf-8');
    cleanupDir(subDir);
    return parseVTT(vttContent);
  } catch {
    cleanupDir(subDir);
    return null;
  }
}

/**
 * Parse WebVTT subtitle file to plain text.
 * Removes timestamps, cue markers, and deduplicates lines.
 */
function parseVTT(vtt: string): string {
  const lines = vtt.split('\n');
  const textLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip WEBVTT header
    if (trimmed === 'WEBVTT' || trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) {
      continue;
    }

    // Skip timestamp lines (e.g., "00:00:01.000 --> 00:00:04.000")
    if (/^\d{2}:\d{2}:\d{2}/.test(trimmed)) continue;

    // Skip empty lines and numeric cue identifiers
    if (trimmed === '' || /^\d+$/.test(trimmed)) continue;

    // Strip HTML tags from subtitle text (e.g., <c>, <b>)
    const cleaned = trimmed.replace(/<[^>]+>/g, '').trim();

    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      textLines.push(cleaned);
    }
  }

  return textLines.join(' ');
}

// --- Metadata Extraction ---

interface VideoMetadata {
  title: string | null;
  channel: string | null;
}

function getVideoMetadata(url: string): VideoMetadata {
  try {
    const raw = execSync(
      `yt-dlp --print title --print channel --skip-download "${url}"`,
      { stdio: 'pipe', timeout: 30_000 },
    ).toString().trim();

    const [title, channel] = raw.split('\n');
    return { title: title ?? null, channel: channel ?? null };
  } catch {
    return { title: null, channel: null };
  }
}

// --- Cleanup Helpers ---

function cleanup(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Best effort cleanup
  }
}

function cleanupDir(dirPath: string): void {
  try {
    execSync(`rm -rf "${dirPath}"`, { stdio: 'pipe' });
  } catch {
    // Best effort cleanup
  }
}
