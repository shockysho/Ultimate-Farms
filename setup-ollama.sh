#!/bin/bash
# ============================================================
# Ultimate Farms — Ollama AI Setup (Free, Local)
# ============================================================
# This installs Ollama and a vision model so the AI can
# see your screen — completely free, runs on your machine.
#
# What it does:
#   1. Installs Ollama (local AI runtime)
#   2. Downloads a vision model that can understand screenshots
#   3. Installs screen control tools (xdotool, scrot)
#   4. Tests everything works
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Ultimate Farms — Free Local AI Setup${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "This will install a ${GREEN}free AI${NC} that runs on your machine."
echo -e "No signup, no API key, no monthly fees."
echo ""

# -------------------------------------------------------
# Step 1: Install Ollama
# -------------------------------------------------------
echo -e "${BLUE}[Step 1/4]${NC} Installing Ollama..."
echo ""

if command -v ollama &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Ollama already installed"
    ollama --version 2>/dev/null || true
else
    echo "  Downloading and installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo -e "  ${GREEN}✓${NC} Ollama installed"
fi
echo ""

# -------------------------------------------------------
# Step 2: Pull a vision model
# -------------------------------------------------------
echo -e "${BLUE}[Step 2/4]${NC} Downloading vision model..."
echo ""
echo -e "  This downloads a model that can ${GREEN}understand screenshots${NC}."
echo -e "  First time takes a few minutes (the model is ~4GB)."
echo ""

# Use llava as default — works on most hardware (needs ~8GB RAM)
MODEL="llava"
echo -e "  Pulling ${BOLD}$MODEL${NC} (vision model)..."
ollama pull "$MODEL"
echo -e "  ${GREEN}✓${NC} Vision model ready"
echo ""

# Also pull a small text model for tool-calling / reasoning
echo -e "  Pulling ${BOLD}llama3.2${NC} (reasoning model)..."
ollama pull llama3.2
echo -e "  ${GREEN}✓${NC} Reasoning model ready"
echo ""

# -------------------------------------------------------
# Step 3: Install screen control tools
# -------------------------------------------------------
echo -e "${BLUE}[Step 3/4]${NC} Installing screen control tools..."
echo ""

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "  Installing xdotool, scrot, python3..."
    sudo apt-get install -y xdotool scrot python3 python3-pip 2>/dev/null || {
        echo -e "  ${YELLOW}!${NC} Could not auto-install. Install manually:"
        echo "    sudo apt install xdotool scrot python3 python3-pip"
    }
    pip3 install requests 2>/dev/null || python3 -m pip install requests 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Screen tools installed"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  On macOS, grant Accessibility permissions:"
    echo "  System Settings → Privacy & Security → Accessibility"
    echo ""
    pip3 install requests 2>/dev/null || python3 -m pip install requests 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Dependencies installed"
fi
echo ""

# -------------------------------------------------------
# Step 4: Test everything
# -------------------------------------------------------
echo -e "${BLUE}[Step 4/4]${NC} Testing the setup..."
echo ""

# Test Ollama is running
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Ollama is running"
else
    echo "  Starting Ollama server..."
    ollama serve &>/dev/null &
    sleep 2
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Ollama started"
    else
        echo -e "  ${YELLOW}!${NC} Ollama may need a moment to start"
        echo "    Run: ollama serve"
    fi
fi

# Quick test — ask the vision model a simple question
echo "  Testing vision model..."
RESPONSE=$(curl -s http://localhost:11434/api/generate \
    -d '{"model":"llava","prompt":"Say hello in one sentence.","stream":false}' \
    2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('response','')[:100])" 2>/dev/null || echo "")

if [ -n "$RESPONSE" ]; then
    echo -e "  ${GREEN}✓${NC} Vision model working: $RESPONSE"
else
    echo -e "  ${YELLOW}!${NC} Could not test model. Make sure Ollama is running: ollama serve"
fi

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${GREEN}  Setup complete! Everything is free.${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "  To start the AI screen reader:"
echo -e "  ${BOLD}python3 ollama_screen_agent.py${NC}"
echo ""
echo -e "  The AI will:"
echo -e "    - See your screen (takes screenshots)"
echo -e "    - Understand what's on screen (vision model)"
echo -e "    - Click, type, and run commands for you"
echo ""
echo -e "  Models downloaded:"
echo -e "    - ${BOLD}llava${NC} — sees and understands images"
echo -e "    - ${BOLD}llama3.2${NC} — thinks and reasons"
echo ""
