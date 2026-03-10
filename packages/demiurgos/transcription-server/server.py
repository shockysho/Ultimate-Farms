"""
DEMIURGOS — Whisper Transcription Server

FastAPI server that accepts audio files and returns text transcriptions
using the faster-whisper library (CTranslate2-based Whisper inference).

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8081

Endpoints:
    POST /transcribe  — Upload audio file, returns transcribed text
    GET  /health      — Health check
"""

import os
import tempfile
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from faster_whisper import WhisperModel

# --- Configuration ---

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "tiny")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("transcription-server")

# --- App Setup ---

app = FastAPI(
    title="Demiurgos Transcription Server",
    description="Whisper-based audio transcription for knowledge ingestion",
    version="0.1.0",
)

# Load model at startup
model: WhisperModel | None = None


@app.on_event("startup")
def load_model():
    """Load the Whisper model on server startup."""
    global model
    logger.info(f"Loading whisper model: {MODEL_SIZE} (device={DEVICE}, compute={COMPUTE_TYPE})")
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    logger.info("Model loaded successfully")


# --- Endpoints ---


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "model": MODEL_SIZE,
        "device": DEVICE,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Transcribe an uploaded audio file.

    Accepts common audio formats: wav, mp3, m4a, ogg, flac, webm.
    Returns the full transcribed text.
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Validate file type
    allowed_extensions = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"}
    filename = file.filename or "audio.wav"
    ext = Path(filename).suffix.lower()

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {ext}. Supported: {', '.join(allowed_extensions)}",
        )

    # Save uploaded file to temp location
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        logger.info(f"Transcribing: {filename} ({len(content)} bytes)")

        # Run transcription
        segments, info = model.transcribe(tmp_path, beam_size=5)

        # Collect all segment texts
        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())

        full_text = " ".join(text_parts)

        logger.info(
            f"Transcription complete: {len(full_text)} chars, "
            f"language={info.language} (prob={info.language_probability:.2f})"
        )

        return JSONResponse(
            content={
                "text": full_text,
                "language": info.language,
                "language_probability": round(info.language_probability, 3),
                "duration": round(info.duration, 2),
            }
        )

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
