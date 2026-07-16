"""
Ultimate Farms — Free AI Screen Reader (Ollama)
================================================
This lets a FREE local AI see your screen and control your computer.
No API key needed. No signup. Runs entirely on your machine.

HOW TO USE:
    1. First run: bash setup-ollama.sh
    2. Then:      python3 ollama_screen_agent.py

Then type something like:
    "Take a screenshot and tell me what's on screen"
    "Open Firefox and go to google.com"
    "Open the terminal and run ls"

The AI takes screenshots, figures out what's on screen, and executes
actions step by step using your mouse, keyboard, and terminal.

REQUIREMENTS:
    - Ollama installed (setup-ollama.sh handles this)
    - Models: llava (vision) + llama3.2 (reasoning)
    - Linux: xdotool, scrot
    - macOS: grant Accessibility permissions
"""

import base64
import json
import os
import platform
import re
import subprocess
import sys
import time
import requests


# -------------------------------------------------------
# Configuration
# -------------------------------------------------------

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
VISION_MODEL = os.environ.get("OLLAMA_VISION_MODEL", "llava")
REASON_MODEL = os.environ.get("OLLAMA_REASON_MODEL", "llama3.2")


def check_ollama():
    """Make sure Ollama is running and models are available."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        models = [m["name"] for m in resp.json().get("models", [])]
        # Check model names (Ollama returns names like "llava:latest")
        has_vision = any(VISION_MODEL in m for m in models)
        has_reason = any(REASON_MODEL in m for m in models)
        if not has_vision:
            print(f"ERROR: Vision model '{VISION_MODEL}' not found.")
            print(f"  Run: ollama pull {VISION_MODEL}")
            sys.exit(1)
        if not has_reason:
            print(f"ERROR: Reasoning model '{REASON_MODEL}' not found.")
            print(f"  Run: ollama pull {REASON_MODEL}")
            sys.exit(1)
        return True
    except requests.ConnectionError:
        print("ERROR: Cannot connect to Ollama.")
        print("  Make sure Ollama is running: ollama serve")
        sys.exit(1)


# -------------------------------------------------------
# Screen interaction (same as computer_use_agent.py)
# -------------------------------------------------------

def take_screenshot():
    """Capture screen, return as base64 PNG."""
    system = platform.system()
    tmp_path = "/tmp/ai_screenshot.png"
    try:
        if system == "Linux":
            subprocess.run(["scrot", "-o", tmp_path], check=True, capture_output=True)
        elif system == "Darwin":
            subprocess.run(["screencapture", "-x", tmp_path], check=True, capture_output=True)
        else:
            print(f"Unsupported OS: {system}")
            return None
        with open(tmp_path, "rb") as f:
            return base64.standard_b64encode(f.read()).decode("utf-8")
    except FileNotFoundError as e:
        print(f"Screenshot tool not found: {e}")
        if system == "Linux":
            print("  Install it: sudo apt install scrot")
        return None
    except Exception as e:
        print(f"Screenshot error: {e}")
        return None


def _run(cmd):
    subprocess.run(cmd, capture_output=True)


def move_mouse(x, y):
    if platform.system() == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
    elif platform.system() == "Darwin":
        _run(["cliclick", f"m:{x},{y}"])


def click_mouse(x, y, button="left"):
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
        btn_map = {"left": "1", "right": "3", "middle": "2"}
        _run(["xdotool", "click", btn_map.get(button, "1")])
    elif system == "Darwin":
        cmd = "c" if button == "left" else "rc"
        _run(["cliclick", f"{cmd}:{x},{y}"])


def double_click(x, y):
    if platform.system() == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
        _run(["xdotool", "click", "--repeat", "2", "1"])


def type_text(text):
    if platform.system() == "Linux":
        _run(["xdotool", "type", "--clearmodifiers", text])
    elif platform.system() == "Darwin":
        _run(["cliclick", f"t:{text}"])


def press_key(key):
    if platform.system() == "Linux":
        _run(["xdotool", "key", key])


def scroll(x, y, direction="down", amount=3):
    if platform.system() == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
        btn = "5" if direction == "down" else "4"
        _run(["xdotool", "click", "--repeat", str(amount), btn])


def run_bash_command(command):
    """Run a bash command and return output."""
    try:
        result = subprocess.run(
            ["bash", "-c", command],
            capture_output=True, text=True, timeout=120
        )
        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += ("\n" if output else "") + result.stderr
        return output if output else "(command completed with no output)"
    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out after 120 seconds"
    except Exception as e:
        return f"ERROR: {e}"


def get_screen_size():
    """Detect screen resolution."""
    try:
        if platform.system() == "Linux":
            output = subprocess.check_output(
                ["xdpyinfo"], stderr=subprocess.DEVNULL
            ).decode()
            for line in output.split("\n"):
                if "dimensions:" in line:
                    dims = line.split()[1]
                    w, h = dims.split("x")
                    return int(w), int(h)
    except Exception:
        pass
    return 1920, 1080


# -------------------------------------------------------
# Ollama API helpers
# -------------------------------------------------------

def ask_vision(prompt, image_b64):
    """Ask the vision model about an image. Returns text."""
    payload = {
        "model": VISION_MODEL,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False,
    }
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json().get("response", "")
    except Exception as e:
        return f"Vision model error: {e}"


def ask_reason(prompt, context=""):
    """Ask the reasoning model to decide what to do. Returns text."""
    full_prompt = prompt
    if context:
        full_prompt = f"Context:\n{context}\n\n{prompt}"

    payload = {
        "model": REASON_MODEL,
        "prompt": full_prompt,
        "stream": False,
    }
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json().get("response", "")
    except Exception as e:
        return f"Reasoning model error: {e}"


# -------------------------------------------------------
# Action parser — extracts actions from AI text
# -------------------------------------------------------

def parse_action(text):
    """
    Parse the AI's response for an action to execute.
    The AI is prompted to output actions in a specific format:
        ACTION: click 500 300
        ACTION: type "hello world"
        ACTION: key Return
        ACTION: bash ls -la
        ACTION: scroll 500 300 down
        ACTION: screenshot
        ACTION: done
    Returns (action_type, params) or None.
    """
    for line in text.split("\n"):
        line = line.strip()
        if not line.upper().startswith("ACTION:"):
            continue

        parts = line[7:].strip()
        if not parts:
            continue

        cmd = parts.split()[0].lower()

        if cmd == "click":
            match = re.search(r"(\d+)\s+(\d+)", parts)
            if match:
                return ("click", int(match.group(1)), int(match.group(2)))

        elif cmd == "double_click" or cmd == "doubleclick":
            match = re.search(r"(\d+)\s+(\d+)", parts)
            if match:
                return ("double_click", int(match.group(1)), int(match.group(2)))

        elif cmd == "type":
            match = re.search(r'type\s+"(.+)"', parts, re.IGNORECASE)
            if match:
                return ("type", match.group(1))
            # Also handle without quotes
            text_part = parts[5:].strip().strip('"')
            if text_part:
                return ("type", text_part)

        elif cmd == "key":
            key_name = parts[4:].strip()
            if key_name:
                return ("key", key_name)

        elif cmd == "bash":
            bash_cmd = parts[5:].strip()
            if bash_cmd:
                return ("bash", bash_cmd)

        elif cmd == "scroll":
            match = re.search(r"(\d+)\s+(\d+)\s+(up|down)", parts, re.IGNORECASE)
            if match:
                return ("scroll", int(match.group(1)), int(match.group(2)), match.group(3))
            # Default: scroll down at center
            return ("scroll", 960, 540, "down")

        elif cmd == "move":
            match = re.search(r"(\d+)\s+(\d+)", parts)
            if match:
                return ("move", int(match.group(1)), int(match.group(2)))

        elif cmd == "screenshot":
            return ("screenshot",)

        elif cmd == "done":
            return ("done",)

    return None


def execute_action(action):
    """Execute a parsed action. Returns a description of what happened."""
    if action is None:
        return None

    cmd = action[0]

    if cmd == "click":
        _, x, y = action
        click_mouse(x, y)
        time.sleep(0.5)
        return f"Clicked at ({x}, {y})"

    elif cmd == "double_click":
        _, x, y = action
        double_click(x, y)
        time.sleep(0.5)
        return f"Double-clicked at ({x}, {y})"

    elif cmd == "type":
        _, text = action
        type_text(text)
        time.sleep(0.3)
        return f"Typed: {text}"

    elif cmd == "key":
        _, key_name = action
        press_key(key_name)
        time.sleep(0.3)
        return f"Pressed key: {key_name}"

    elif cmd == "bash":
        _, bash_cmd = action
        print(f"\n  [Running: {bash_cmd[:80]}]")
        output = run_bash_command(bash_cmd)
        if len(output) > 3000:
            output = output[:1500] + "\n...(truncated)...\n" + output[-1500:]
        return f"Command output:\n{output}"

    elif cmd == "scroll":
        _, x, y, direction = action
        scroll(x, y, direction)
        time.sleep(0.3)
        return f"Scrolled {direction} at ({x}, {y})"

    elif cmd == "move":
        _, x, y = action
        move_mouse(x, y)
        time.sleep(0.2)
        return f"Moved mouse to ({x}, {y})"

    elif cmd == "screenshot":
        return "TAKE_SCREENSHOT"

    elif cmd == "done":
        return "DONE"

    return None


# -------------------------------------------------------
# Main agent loop
# -------------------------------------------------------

SYSTEM_CONTEXT = """You are an AI assistant that can see and control a computer screen.
You help the owner of Ultimate Farms — a poultry farm in Ghana.
The owner is not a coder, so explain everything in simple terms.

You can perform these actions (output exactly one per response):
  ACTION: screenshot             — take a screenshot to see the screen
  ACTION: click X Y              — click at pixel coordinates (X, Y)
  ACTION: double_click X Y       — double-click at coordinates
  ACTION: type "text here"       — type text on the keyboard
  ACTION: key KeyName            — press a key (Return, Tab, Escape, BackSpace, etc.)
  ACTION: bash command here      — run a terminal command
  ACTION: scroll X Y down        — scroll down at position (or "up")
  ACTION: move X Y               — move mouse to position
  ACTION: done                   — you're finished with the task

IMPORTANT RULES:
1. Always start by taking a screenshot to see the current screen state.
2. After clicking or typing, take another screenshot to verify it worked.
3. Output EXACTLY ONE action per response — the action line must start with "ACTION:"
4. Before the action, briefly explain what you're doing and why.
5. Coordinates are pixel positions on the screen.
6. When you finish the task, use ACTION: done and summarize what you did.
"""


def run_agent():
    check_ollama()
    screen_w, screen_h = get_screen_size()

    print("")
    print("=" * 56)
    print("  Ultimate Farms — Free AI Screen Reader")
    print("  Powered by Ollama (runs locally, no cost)")
    print("=" * 56)
    print("")
    print(f"  Screen: {screen_w}x{screen_h}")
    print(f"  Vision model:    {VISION_MODEL}")
    print(f"  Reasoning model: {REASON_MODEL}")
    print("")
    print("  Tell the AI what to do in plain English.")
    print("  Type 'quit' to exit.")
    print("")

    while True:
        try:
            user_input = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "q"):
            print("Goodbye!")
            break

        # Build the task for the agent
        history = []
        history.append(f"USER TASK: {user_input}")

        # Agent loop — keeps acting until done or max steps
        max_steps = 15
        step = 0
        last_screenshot = None

        while step < max_steps:
            step += 1
            print(f"\n  [Step {step}/{max_steps}]", end="", flush=True)

            # Decide what to do: use vision if we have a screenshot, otherwise reason
            context = "\n".join(history[-10:])  # Keep last 10 entries for context

            if last_screenshot:
                # Ask vision model: "what do you see + what should we do?"
                vision_prompt = (
                    f"{SYSTEM_CONTEXT}\n\n"
                    f"History of actions so far:\n{context}\n\n"
                    f"Look at this screenshot and decide the next action. "
                    f"Describe what you see briefly, then output your action."
                )
                print(" (analyzing screen...)", end="", flush=True)
                ai_response = ask_vision(vision_prompt, last_screenshot)
                last_screenshot = None
            else:
                # No screenshot yet — use reasoning model
                reason_prompt = (
                    f"{SYSTEM_CONTEXT}\n\n"
                    f"History of actions so far:\n{context}\n\n"
                    f"Decide the next action. Remember to take a screenshot "
                    f"if you need to see the screen."
                )
                print(" (thinking...)", end="", flush=True)
                ai_response = ask_reason(reason_prompt)

            # Print what the AI said
            # Filter out the ACTION line for cleaner display
            display_lines = []
            for line in ai_response.split("\n"):
                if not line.strip().upper().startswith("ACTION:"):
                    if line.strip():
                        display_lines.append(line.strip())
            if display_lines:
                display_text = " ".join(display_lines[:3])
                if len(display_text) > 200:
                    display_text = display_text[:200] + "..."
                print(f"\n  AI: {display_text}")

            # Parse and execute the action
            action = parse_action(ai_response)
            if action is None:
                # AI didn't output a valid action — nudge it
                history.append(f"AI said: {ai_response[:200]}")
                history.append("SYSTEM: No valid action detected. Please output an ACTION line.")
                continue

            result = execute_action(action)

            if result == "TAKE_SCREENSHOT":
                print("\n  [Taking screenshot...]", end="", flush=True)
                last_screenshot = take_screenshot()
                if last_screenshot:
                    history.append("ACTION: screenshot — taken successfully")
                    print(" done")
                else:
                    history.append("ACTION: screenshot — FAILED")
                    print(" failed!")
                continue

            if result == "DONE":
                print("\n  [Task complete]")
                break

            if result:
                print(f"\n  [Result: {result[:100]}]")
                history.append(f"ACTION: {action[0]} — {result[:300]}")
            else:
                history.append(f"ACTION: {action[0]} — executed")

        if step >= max_steps:
            print(f"\n  [Reached maximum {max_steps} steps. Stopping.]")
            print("  Tip: Break complex tasks into smaller steps.")


if __name__ == "__main__":
    run_agent()
