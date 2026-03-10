#!/bin/bash
# ============================================================
# DEMIURGOS — Setup Script
# ============================================================
# Run this on your RTX 3060 machine to set up everything.

set -e

echo "============================================"
echo "  DEMIURGOS Setup"
echo "============================================"
echo ""

# --- Check Docker ---
if ! command -v docker &> /dev/null; then
    echo "[!] Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "[✓] Docker installed. You may need to log out and back in."
else
    echo "[✓] Docker found: $(docker --version)"
fi

# --- Check Docker Compose ---
if ! docker compose version &> /dev/null; then
    echo "[!] Docker Compose not found."
    echo "    Install it: https://docs.docker.com/compose/install/"
    exit 1
else
    echo "[✓] Docker Compose found: $(docker compose version --short)"
fi

# --- Check NVIDIA GPU ---
if command -v nvidia-smi &> /dev/null; then
    echo "[✓] NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo "[!] nvidia-smi not found. GPU features will be unavailable."
    echo "    Install NVIDIA drivers: sudo apt install nvidia-driver-535"
fi

# --- Check NVIDIA Container Toolkit ---
if docker info 2>/dev/null | grep -q "nvidia"; then
    echo "[✓] NVIDIA Container Toolkit detected"
else
    echo "[!] NVIDIA Container Toolkit not detected."
    echo "    Install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
    echo "    Or run:"
    echo "      curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg"
    echo "      sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit"
    echo "      sudo nvidia-ctk runtime configure --runtime=docker"
    echo "      sudo systemctl restart docker"
fi

# --- Create .env if not exists ---
if [ ! -f .env ]; then
    echo ""
    echo "[*] Creating .env from template..."
    cp .env.example .env

    # Generate API key
    DEMIURGOS_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
    echo "DEMIURGOS_API_KEY=$DEMIURGOS_KEY" >> .env

    echo "[✓] .env created. Edit it to add your API keys:"
    echo "    nano .env"
    echo ""
    echo "    Required:"
    echo "      ANTHROPIC_API_KEY=sk-ant-..."
    echo "    Optional:"
    echo "      OPENAI_API_KEY=sk-..."
else
    echo "[✓] .env already exists"
fi

echo ""
echo "============================================"
echo "  Next Steps:"
echo "============================================"
echo ""
echo "  1. Edit .env with your API keys:"
echo "     nano .env"
echo ""
echo "  2. Start all services:"
echo "     docker compose up -d"
echo ""
echo "  3. Pull Ollama models (first time only):"
echo "     docker exec demiurgos-ollama ollama pull mistral"
echo "     docker exec demiurgos-ollama ollama pull llama3"
echo ""
echo "  4. Verify:"
echo "     curl http://localhost:3001/health"
echo "     open http://localhost:3000  (dashboard)"
echo ""
echo "  5. First query:"
echo "     curl -X POST http://localhost:3001/task \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -H 'X-API-Key: YOUR_KEY' \\"
echo "       -d '{\"prompt\": \"What is Demiurgos?\"}'"
echo ""
