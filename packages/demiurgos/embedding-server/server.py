"""
DEMIURGOS Embedding Server

FastAPI server providing sentence-transformer embeddings via HTTP.
Uses all-MiniLM-L6-v2 (384-dim) with automatic CUDA/CPU detection.
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

# Global model reference, loaded at startup
model: Optional[SentenceTransformer] = None
device: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model into memory on startup."""
    global model, device

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Loading model '{MODEL_NAME}' on device '{device}'...")
    model = SentenceTransformer(MODEL_NAME, device=device)
    logger.info(f"Model loaded. Embedding dimension: {EMBEDDING_DIM}")

    yield

    # Cleanup
    model = None
    logger.info("Model unloaded.")


app = FastAPI(
    title="Demiurgos Embedding Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / Response models ---

class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]
    dim: int


class BatchEmbedRequest(BaseModel):
    texts: list[str]


class BatchEmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int
    count: int


class HealthResponse(BaseModel):
    status: str
    model: str
    device: str
    embedding_dim: int


# --- Endpoints ---

@app.post("/embed", response_model=EmbedResponse)
async def embed_single(request: EmbedRequest):
    """Generate embedding for a single text."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text must not be empty")

    embedding = model.encode(request.text, normalize_embeddings=True)
    return EmbedResponse(
        embedding=embedding.tolist(),
        dim=len(embedding),
    )


@app.post("/embed/batch", response_model=BatchEmbedResponse)
async def embed_batch(request: BatchEmbedRequest):
    """Generate embeddings for a batch of texts."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not request.texts:
        raise HTTPException(status_code=400, detail="Texts array must not be empty")

    embeddings = model.encode(request.texts, normalize_embeddings=True)
    embeddings_list = embeddings.tolist()
    return BatchEmbedResponse(
        embeddings=embeddings_list,
        dim=EMBEDDING_DIM,
        count=len(embeddings_list),
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check returning model info."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    return HealthResponse(
        status="ok",
        model=MODEL_NAME,
        device=device or "unknown",
        embedding_dim=EMBEDDING_DIM,
    )
