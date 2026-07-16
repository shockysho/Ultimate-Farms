FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY server.py .

# Configuration via environment variables
ENV WHISPER_MODEL=tiny
ENV WHISPER_DEVICE=cpu
ENV WHISPER_COMPUTE_TYPE=int8

EXPOSE 8081

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8081"]
