#!/bin/bash
# ============================================================
# DEMIURGOS — Local Setup Script
# ============================================================
# Run this on your local machine to set up Demiurgos.

set -e

echo "=== Demiurgos Setup ==="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is required. Install it from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "ERROR: Node.js 20+ required. Current: $(node -v)"
    exit 1
fi

echo "Node.js: $(node -v)"

# Install dependencies
echo "Installing dependencies..."
npm install

# Copy env file if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
    echo "IMPORTANT: Edit .env and add your API keys!"
fi

# Build TypeScript
echo "Building..."
npm run build

# Check Ollama (optional)
if command -v ollama &> /dev/null; then
    echo "Ollama: found"
    echo "Pulling default models..."
    ollama pull mistral 2>/dev/null || echo "  (skipped mistral — pull manually)"
    ollama pull llama3 2>/dev/null || echo "  (skipped llama3 — pull manually)"
else
    echo "Ollama: not found (optional — install for free local models)"
    echo "  Install: https://ollama.ai"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env and add your ANTHROPIC_API_KEY"
echo "  2. Run: npx tsx src/cli.ts ask 'What is 2+2?'"
echo "  3. Run: npx tsx src/cli.ts serve  (starts dashboard + API)"
echo "  4. Open: http://localhost:3000    (dashboard)"
echo ""
echo "Optional:"
echo "  - Install Ollama for free local models: https://ollama.ai"
echo "  - Start Ollama: ollama serve"
echo "  - Pull models: ollama pull mistral && ollama pull llama3"
