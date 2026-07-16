#!/bin/bash
# ============================================================
# Ultimate Farms — AI Computer Use Setup
# ============================================================
# This script sets up an AI that can see your screen, click,
# type, browse the web, and operate any program on your behalf.
#
# YOU DON'T NEED TO UNDERSTAND THIS CODE.
# Just run it and follow the prompts.
#
# What it does:
#   1. Checks your system has what's needed (Docker, Python)
#   2. Installs the Anthropic Python SDK
#   3. Sets up your API key securely
#   4. Gives you TWO options to run Computer Use:
#      - Docker container (virtual desktop — safest)
#      - Direct on your machine (sees YOUR actual screen)
# ============================================================

set -e

# Colors for readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Ultimate Farms — AI Computer Use Setup${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "This will set up an AI that can ${GREEN}see your screen${NC},"
echo -e "${GREEN}click${NC}, ${GREEN}type${NC}, and ${GREEN}operate any program${NC} for you."
echo ""

# -------------------------------------------------------
# Step 1: Check prerequisites
# -------------------------------------------------------
echo -e "${BLUE}[Step 1/4]${NC} Checking your system..."
echo ""

MISSING=()

# Check Python
if command -v python3 &>/dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo -e "  ${GREEN}✓${NC} Python found: $PYTHON_VERSION"
else
    echo -e "  ${RED}✗${NC} Python 3 not found"
    MISSING+=("python3")
fi

# Check pip
if command -v pip3 &>/dev/null || python3 -m pip --version &>/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} pip found"
else
    echo -e "  ${RED}✗${NC} pip not found"
    MISSING+=("pip3")
fi

# Check Docker (optional but recommended)
if command -v docker &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Docker found"
    HAS_DOCKER=true
else
    echo -e "  ${YELLOW}!${NC} Docker not found (optional — needed for sandboxed mode)"
    HAS_DOCKER=false
fi

# Check for required system tools (for direct mode)
if command -v xdotool &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} xdotool found (screen control)"
else
    echo -e "  ${YELLOW}!${NC} xdotool not found (needed for direct screen control)"
fi

if command -v scrot &>/dev/null || command -v gnome-screenshot &>/dev/null || command -v screencapture &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Screenshot tool found"
else
    echo -e "  ${YELLOW}!${NC} No screenshot tool found"
fi

echo ""

if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${RED}Missing required tools: ${MISSING[*]}${NC}"
    echo ""
    echo "Install them first:"
    echo ""
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  brew install ${MISSING[*]}"
    else
        echo "  sudo apt install ${MISSING[*]}   # Ubuntu/Debian"
        echo "  sudo dnf install ${MISSING[*]}   # Fedora"
    fi
    echo ""
    exit 1
fi

# -------------------------------------------------------
# Step 2: Install Anthropic SDK
# -------------------------------------------------------
echo -e "${BLUE}[Step 2/4]${NC} Installing Anthropic Python SDK..."
echo ""

pip3 install --upgrade anthropic 2>&1 | tail -1
echo -e "  ${GREEN}✓${NC} Anthropic SDK installed"
echo ""

# -------------------------------------------------------
# Step 3: Set up API key
# -------------------------------------------------------
echo -e "${BLUE}[Step 3/4]${NC} Setting up your API key..."
echo ""

if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo -e "  ${GREEN}✓${NC} API key already set in environment"
else
    echo -e "  You need an Anthropic API key."
    echo -e "  Get one at: ${BLUE}https://console.anthropic.com/settings/keys${NC}"
    echo ""
    read -sp "  Paste your API key here (it won't show): " API_KEY
    echo ""

    if [ -z "$API_KEY" ]; then
        echo -e "  ${RED}No key entered. Exiting.${NC}"
        exit 1
    fi

    # Save to .env file (not committed to git)
    echo "ANTHROPIC_API_KEY=$API_KEY" > .env
    echo -e "  ${GREEN}✓${NC} Key saved to .env file"

    # Also export for current session
    export ANTHROPIC_API_KEY="$API_KEY"

    # Add .env to gitignore if not already there
    if ! grep -q "^\.env$" .gitignore 2>/dev/null; then
        echo ".env" >> .gitignore
        echo -e "  ${GREEN}✓${NC} Added .env to .gitignore (keeps your key safe)"
    fi
fi
echo ""

# -------------------------------------------------------
# Step 4: Choose your mode
# -------------------------------------------------------
echo -e "${BLUE}[Step 4/4]${NC} Choose how you want the AI to work:"
echo ""
echo -e "  ${BOLD}1) Docker Sandbox (Recommended for beginners)${NC}"
echo -e "     The AI gets its own virtual desktop inside a container."
echo -e "     Safe — it can't accidentally mess up your real computer."
echo -e "     You watch it work through your browser at localhost:8080."
echo ""
echo -e "  ${BOLD}2) Direct Screen Control${NC}"
echo -e "     The AI sees YOUR actual screen and controls YOUR mouse/keyboard."
echo -e "     More powerful — it can use all your logged-in apps."
echo -e "     But it's operating your real computer, so be attentive."
echo ""
echo -e "  ${BOLD}3) Free Local AI — Ollama (No API key needed)${NC}"
echo -e "     Uses a free AI model that runs on YOUR machine."
echo -e "     Lower quality than Claude, but completely free."
echo -e "     Needs ~8GB RAM. Run: ${BOLD}bash setup-ollama.sh${NC}"
echo ""
echo -e "  ${BOLD}4) Just install everything, I'll choose later${NC}"
echo ""

read -p "  Enter 1, 2, 3, or 4: " CHOICE
echo ""

case $CHOICE in
    1)
        if [ "$HAS_DOCKER" = false ]; then
            echo -e "${RED}Docker is required for sandbox mode.${NC}"
            echo "Install Docker first: https://docs.docker.com/get-docker/"
            exit 1
        fi
        echo -e "${GREEN}Starting Docker sandbox...${NC}"
        echo ""
        echo "Pulling the Anthropic Computer Use container..."
        docker pull ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo

        echo ""
        echo -e "${GREEN}Starting the AI desktop...${NC}"
        echo ""
        docker run -d \
            --name ultimate-farms-ai \
            -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
            -p 5900:5900 \
            -p 8501:8501 \
            -p 6080:6080 \
            -p 8080:8080 \
            ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo

        echo ""
        echo -e "${BOLD}============================================${NC}"
        echo -e "${GREEN}  AI Desktop is running!${NC}"
        echo -e "${BOLD}============================================${NC}"
        echo ""
        echo -e "  Open your browser and go to:"
        echo -e "  ${BOLD}${BLUE}http://localhost:8080${NC}"
        echo ""
        echo -e "  You'll see a virtual desktop. Type your instructions"
        echo -e "  in the chat box and watch the AI work."
        echo ""
        echo -e "  To stop:  ${YELLOW}docker stop ultimate-farms-ai${NC}"
        echo -e "  To start: ${YELLOW}docker start ultimate-farms-ai${NC}"
        echo -e "  To remove: ${YELLOW}docker rm ultimate-farms-ai${NC}"
        echo ""
        ;;
    2)
        echo -e "${GREEN}Setting up direct screen control...${NC}"
        echo ""

        # Install system dependencies
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "Installing screen control tools..."
            sudo apt-get install -y xdotool scrot python3-xlib 2>/dev/null || true
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            echo "On macOS, you'll need to grant Accessibility permissions."
            echo "System Settings → Privacy & Security → Accessibility"
        fi

        echo -e "  ${GREEN}✓${NC} Direct mode ready"
        echo ""
        echo -e "  Run the AI agent with:"
        echo -e "  ${BOLD}python3 computer_use_agent.py${NC}"
        echo ""
        ;;
    3)
        echo -e "${GREEN}Setting up free local AI with Ollama...${NC}"
        echo ""
        echo "  This will run the Ollama setup script."
        echo ""
        bash "$(dirname "$0")/setup-ollama.sh"
        exit 0
        ;;
    4)
        echo -e "${GREEN}Everything installed. You're ready to go.${NC}"
        echo ""
        echo -e "  To use Docker sandbox: re-run this script and pick option 1"
        echo -e "  To use direct mode:    ${BOLD}python3 computer_use_agent.py${NC}"
        echo ""
        ;;
    *)
        echo "Invalid choice. Run the script again."
        exit 1
        ;;
esac

echo -e "${BOLD}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Read docs/AI_WORKSPACE_SETUP.md for the full guide"
echo "  2. Read docs/COMPUTER_USE_INSTRUCTIONS.md for how to give the AI tasks"
echo "  3. Start with simple tasks and work up to complex ones"
echo ""
echo "Free alternative (no API key):"
echo "  bash setup-ollama.sh          # One-time setup"
echo "  python3 ollama_screen_agent.py  # Run the free AI"
echo ""
