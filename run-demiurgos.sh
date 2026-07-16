#!/bin/bash
# ============================================================
# DEMIURGOS — Simple Launcher
# Run this script to start the Demiurgos AI agent
# ============================================================

cd "$(dirname "$0")/packages/demiurgos" || exit 1

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     DEMIURGOS — The Gnostic Builder  ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "  ERROR: Node.js is not installed."
    echo "  Download it from: https://nodejs.org"
    exit 1
fi

# Show what you can do
if [ -z "$1" ]; then
    echo "  Available commands:"
    echo ""
    echo "    ./run-demiurgos.sh help       - Show all commands"
    echo "    ./run-demiurgos.sh status     - Check system health"
    echo "    ./run-demiurgos.sh ask \"...\"   - Ask a question (needs API key)"
    echo "    ./run-demiurgos.sh cost       - Show cost report"
    echo "    ./run-demiurgos.sh history    - Show past tasks"
    echo "    ./run-demiurgos.sh dream      - Run a dream cycle"
    echo "    ./run-demiurgos.sh serve      - Start web dashboard"
    echo ""
    echo "  Example: ./run-demiurgos.sh ask \"What is the best feed for layers?\""
    echo ""
    exit 0
fi

# Run the command
npx tsx src/cli.ts "$@"
