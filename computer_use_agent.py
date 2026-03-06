"""
Ultimate Farms — AI Computer Use Agent
=======================================
This script lets Claude see your screen and control your computer.
You type what you want done, and the AI does it.

HOW TO USE:
    python3 computer_use_agent.py

Then type something like:
    "Open Firefox and go to github.com/shockysho/Ultimate-Farms"
    "Open the terminal and run npm install"
    "Take a screenshot and tell me what's on screen"

The AI will take screenshots of your screen, figure out where to
click, and execute the actions step by step.

REQUIREMENTS:
    pip install anthropic
    # Linux: sudo apt install scrot xdotool
    # macOS: grant Accessibility permissions in System Settings
"""

import anthropic
import base64
import subprocess
import sys
import os
import platform
import time
import json

# -------------------------------------------------------
# Configuration
# -------------------------------------------------------

# Load API key from environment or .env file
def load_api_key():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key

    # Try loading from .env file
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("ANTHROPIC_API_KEY="):
                    return line.strip().split("=", 1)[1]

    print("ERROR: No API key found.")
    print("Set ANTHROPIC_API_KEY environment variable or create a .env file.")
    print("Get a key at: https://console.anthropic.com/settings/keys")
    sys.exit(1)


# Detect screen resolution
def get_screen_size():
    system = platform.system()
    try:
        if system == "Linux":
            output = subprocess.check_output(
                ["xdpyinfo"], stderr=subprocess.DEVNULL
            ).decode()
            for line in output.split("\n"):
                if "dimensions:" in line:
                    dims = line.split()[1]
                    w, h = dims.split("x")
                    return int(w), int(h)
        elif system == "Darwin":
            output = subprocess.check_output(
                ["system_profiler", "SPDisplaysDataType"]
            ).decode()
            for line in output.split("\n"):
                if "Resolution:" in line:
                    parts = line.split()
                    w_idx = parts.index("Resolution:") + 1
                    return int(parts[w_idx]), int(parts[w_idx + 2])
    except Exception:
        pass

    # Sensible defaults
    return 1920, 1080


# -------------------------------------------------------
# Screen interaction functions
# -------------------------------------------------------

def take_screenshot():
    """Capture the screen and return as base64 PNG."""
    system = platform.system()
    tmp_path = "/tmp/ai_screenshot.png"

    try:
        if system == "Linux":
            subprocess.run(
                ["scrot", "-o", tmp_path],
                check=True,
                capture_output=True,
            )
        elif system == "Darwin":
            subprocess.run(
                ["screencapture", "-x", tmp_path],
                check=True,
                capture_output=True,
            )
        else:
            print(f"Unsupported OS: {system}")
            return None

        with open(tmp_path, "rb") as f:
            return base64.standard_b64encode(f.read()).decode("utf-8")
    except FileNotFoundError as e:
        print(f"Screenshot tool not found: {e}")
        print("Install: sudo apt install scrot  (Linux)")
        return None
    except Exception as e:
        print(f"Screenshot error: {e}")
        return None


def move_mouse(x, y):
    """Move mouse to coordinates."""
    system = platform.system()
    if system == "Linux":
        subprocess.run(["xdotool", "mousemove", str(x), str(y)])
    elif system == "Darwin":
        # Use cliclick on macOS (brew install cliclick)
        subprocess.run(["cliclick", f"m:{x},{y}"])


def click_mouse(x, y, button="left"):
    """Click at coordinates."""
    system = platform.system()
    btn_map = {"left": "1", "right": "3", "middle": "2"}

    if system == "Linux":
        subprocess.run(["xdotool", "mousemove", str(x), str(y)])
        subprocess.run(["xdotool", "click", btn_map.get(button, "1")])
    elif system == "Darwin":
        cmd = "c" if button == "left" else "rc"
        subprocess.run(["cliclick", f"{cmd}:{x},{y}"])


def double_click(x, y):
    """Double-click at coordinates."""
    system = platform.system()
    if system == "Linux":
        subprocess.run(["xdotool", "mousemove", str(x), str(y)])
        subprocess.run(["xdotool", "click", "--repeat", "2", "1"])
    elif system == "Darwin":
        subprocess.run(["cliclick", f"dc:{x},{y}"])


def type_text(text):
    """Type text using keyboard."""
    system = platform.system()
    if system == "Linux":
        # xdotool type handles most characters
        subprocess.run(["xdotool", "type", "--clearmodifiers", text])
    elif system == "Darwin":
        subprocess.run(["cliclick", f"t:{text}"])


def press_key(key):
    """Press a special key or key combination."""
    system = platform.system()
    if system == "Linux":
        subprocess.run(["xdotool", "key", key])
    elif system == "Darwin":
        # Map common key names for cliclick
        key_map = {
            "Return": "return",
            "Tab": "tab",
            "Escape": "escape",
            "BackSpace": "delete",
            "space": "space",
        }
        mapped = key_map.get(key, key)
        subprocess.run(["cliclick", f"kp:{mapped}"])


def scroll(x, y, direction="down", amount=3):
    """Scroll at position."""
    system = platform.system()
    if system == "Linux":
        subprocess.run(["xdotool", "mousemove", str(x), str(y)])
        btn = "5" if direction == "down" else "4"
        subprocess.run(["xdotool", "click", "--repeat", str(amount), btn])
    elif system == "Darwin":
        scroll_amount = -amount if direction == "down" else amount
        subprocess.run(["cliclick", f"m:{x},{y}"])
        # osascript for scrolling on macOS
        subprocess.run([
            "osascript", "-e",
            f'tell application "System Events" to scroll area 1 of front window of first process whose frontmost is true by {scroll_amount}'
        ])


def drag(start_x, start_y, end_x, end_y):
    """Drag from one point to another."""
    system = platform.system()
    if system == "Linux":
        subprocess.run(["xdotool", "mousemove", str(start_x), str(start_y)])
        subprocess.run(["xdotool", "mousedown", "1"])
        subprocess.run(["xdotool", "mousemove", str(end_x), str(end_y)])
        subprocess.run(["xdotool", "mouseup", "1"])


# -------------------------------------------------------
# Process AI tool calls
# -------------------------------------------------------

def handle_tool_use(tool_name, tool_input):
    """Execute a computer use tool action and return the result."""
    action = tool_input.get("action")

    if action == "screenshot":
        screenshot_b64 = take_screenshot()
        if screenshot_b64:
            return {
                "type": "tool_result",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": screenshot_b64,
                        },
                    }
                ],
            }
        return {"type": "tool_result", "content": "Failed to take screenshot"}

    elif action == "mouse_move":
        coords = tool_input.get("coordinate", [0, 0])
        move_mouse(coords[0], coords[1])
        time.sleep(0.3)
        return {"type": "tool_result", "content": "Mouse moved"}

    elif action == "left_click":
        coords = tool_input.get("coordinate", [0, 0])
        click_mouse(coords[0], coords[1], "left")
        time.sleep(0.5)
        return {"type": "tool_result", "content": "Left clicked"}

    elif action == "right_click":
        coords = tool_input.get("coordinate", [0, 0])
        click_mouse(coords[0], coords[1], "right")
        time.sleep(0.5)
        return {"type": "tool_result", "content": "Right clicked"}

    elif action == "double_click":
        coords = tool_input.get("coordinate", [0, 0])
        double_click(coords[0], coords[1])
        time.sleep(0.5)
        return {"type": "tool_result", "content": "Double clicked"}

    elif action == "left_click_drag":
        start = tool_input.get("start_coordinate", [0, 0])
        end = tool_input.get("coordinate", [0, 0])
        drag(start[0], start[1], end[0], end[1])
        time.sleep(0.5)
        return {"type": "tool_result", "content": "Dragged"}

    elif action == "type":
        text = tool_input.get("text", "")
        type_text(text)
        time.sleep(0.3)
        return {"type": "tool_result", "content": "Text typed"}

    elif action == "key":
        key = tool_input.get("text", "")
        press_key(key)
        time.sleep(0.3)
        return {"type": "tool_result", "content": f"Key pressed: {key}"}

    elif action == "scroll":
        coords = tool_input.get("coordinate", [0, 0])
        direction = tool_input.get("direction", "down")
        amount = tool_input.get("amount", 3)
        scroll(coords[0], coords[1], direction, amount)
        time.sleep(0.3)
        return {"type": "tool_result", "content": f"Scrolled {direction}"}

    else:
        return {"type": "tool_result", "content": f"Unknown action: {action}"}


# -------------------------------------------------------
# Main agent loop
# -------------------------------------------------------

def run_agent():
    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)

    screen_w, screen_h = get_screen_size()
    print(f"Screen: {screen_w}x{screen_h}")

    # Define the computer use tool
    tools = [
        {
            "type": "computer_20250124",
            "name": "computer",
            "display_width_px": screen_w,
            "display_height_px": screen_h,
            "display_number": 0,
        }
    ]

    # System prompt telling the AI who it is and what it can do
    system_prompt = f"""You are an AI assistant that can see and control a computer screen.
You are helping the owner of Ultimate Farms — a poultry farm operation in Ghana.
The owner knows exactly what they want built but is not a coder.

Your job:
- See the screen via screenshots
- Click, type, scroll, and navigate to accomplish tasks
- Work through tasks step by step
- Explain what you're doing in simple terms (no jargon)
- If something goes wrong, explain what happened and try a different approach
- Be thorough — complete the full task, don't stop halfway

Screen resolution: {screen_w}x{screen_h}

Always take a screenshot first to see the current state before acting.
After each action, take another screenshot to verify it worked."""

    conversation = []

    print("")
    print("=" * 50)
    print("  AI Computer Use Agent — Ready")
    print("=" * 50)
    print("")
    print("Tell the AI what to do. It will see your screen")
    print("and take actions. Type 'quit' to exit.")
    print("")

    while True:
        # Get user instruction
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "q"):
            print("Goodbye!")
            break

        # Add user message
        conversation.append({"role": "user", "content": user_input})

        # Agent loop — keep going until the AI is done
        while True:
            try:
                response = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=4096,
                    system=system_prompt,
                    tools=tools,
                    messages=conversation,
                )
            except anthropic.APIError as e:
                print(f"\nAPI Error: {e}")
                break

            # Process the response
            assistant_content = response.content
            conversation.append({"role": "assistant", "content": assistant_content})

            # Check if AI wants to use tools
            tool_uses = [b for b in assistant_content if b.type == "tool_use"]
            text_blocks = [b for b in assistant_content if b.type == "text"]

            # Print any text the AI says
            for block in text_blocks:
                print(f"\nAI: {block.text}")

            # If no tool use, the AI is done with this turn
            if not tool_uses:
                break

            # Execute each tool call
            tool_results = []
            for tool_use in tool_uses:
                print(f"\n  [Action: {tool_use.input.get('action', '?')}]", end="")

                result = handle_tool_use(tool_use.name, tool_use.input)

                # Format as proper tool result
                tool_result_msg = {
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                }

                if isinstance(result.get("content"), list):
                    tool_result_msg["content"] = result["content"]
                else:
                    tool_result_msg["content"] = str(result.get("content", ""))

                tool_results.append(tool_result_msg)

            # Add tool results and continue the loop
            conversation.append({"role": "user", "content": tool_results})
            print()  # newline after actions

            # Safety: if stop reason is "end_turn", we're done
            if response.stop_reason == "end_turn":
                break


if __name__ == "__main__":
    run_agent()
