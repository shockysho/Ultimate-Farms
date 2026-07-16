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

It also has a built-in bash tool (run terminal commands) and a text
editor tool (edit files directly) — so it can code without needing
to open an editor app.

REQUIREMENTS:
    pip install anthropic
    # Linux: sudo apt install scrot xdotool xdpyinfo
    # macOS: grant Accessibility permissions in System Settings
"""

import anthropic
import base64
import subprocess
import sys
import os
import platform
import time


# -------------------------------------------------------
# Configuration
# -------------------------------------------------------

# Which model and tool version to use.
# Claude Opus 4.6 / Sonnet 4.6 / Opus 4.5 use the newer tool version.
# Older models (Sonnet 4, Opus 4, etc.) use computer_20250124.
MODEL = "claude-sonnet-4-6"
COMPUTER_TOOL_VERSION = "computer_20251124"
TEXT_EDITOR_TOOL_VERSION = "text_editor_20250728"
BASH_TOOL_VERSION = "bash_20250124"
BETA_FLAG = "computer-use-2025-11-24"


def load_api_key():
    """Load API key from environment or .env file."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key

    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1]

    print("ERROR: No API key found.")
    print("Set ANTHROPIC_API_KEY environment variable or create a .env file.")
    print("Get a key at: https://console.anthropic.com/settings/keys")
    sys.exit(1)


def get_screen_size():
    """Detect screen resolution. Returns (width, height)."""
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
                    idx = parts.index("Resolution:") + 1
                    return int(parts[idx]), int(parts[idx + 2])
    except Exception:
        pass

    # Anthropic recommends 1024x768 for best model accuracy,
    # but we default to 1920x1080 for real screen control.
    return 1920, 1080


# -------------------------------------------------------
# Screen interaction functions (Linux + macOS)
# -------------------------------------------------------

def take_screenshot():
    """Capture the screen and return as base64 PNG."""
    system = platform.system()
    tmp_path = "/tmp/ai_screenshot.png"

    try:
        if system == "Linux":
            subprocess.run(["scrot", "-o", tmp_path], check=True, capture_output=True)
        elif system == "Darwin":
            subprocess.run(["screencapture", "-x", tmp_path], check=True, capture_output=True)
        else:
            print(f"Unsupported OS for screenshots: {system}")
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
    """Run a shell command silently."""
    subprocess.run(cmd, capture_output=True)


def move_mouse(x, y):
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
    elif system == "Darwin":
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
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
        _run(["xdotool", "click", "--repeat", "2", "1"])
    elif system == "Darwin":
        _run(["cliclick", f"dc:{x},{y}"])


def triple_click(x, y):
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
        _run(["xdotool", "click", "--repeat", "3", "1"])
    elif system == "Darwin":
        _run(["cliclick", f"tc:{x},{y}"])


def type_text(text):
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "type", "--clearmodifiers", text])
    elif system == "Darwin":
        _run(["cliclick", f"t:{text}"])


def press_key(key):
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "key", key])
    elif system == "Darwin":
        key_map = {
            "Return": "return", "Tab": "tab", "Escape": "escape",
            "BackSpace": "delete", "space": "space",
        }
        _run(["cliclick", f"kp:{key_map.get(key, key)}"])


def hold_key(key):
    """Hold a key down (for key combos)."""
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "keydown", key])


def release_key(key):
    """Release a held key."""
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "keyup", key])


def scroll(x, y, direction="down", amount=3):
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "mousemove", str(x), str(y)])
        btn = "5" if direction == "down" else "4"
        _run(["xdotool", "click", "--repeat", str(amount), btn])
    elif system == "Darwin":
        scroll_val = -amount if direction == "down" else amount
        _run(["cliclick", f"m:{x},{y}"])
        _run(["osascript", "-e",
              f'tell application "System Events" to scroll area 1 of front window '
              f'of first process whose frontmost is true by {scroll_val}'])


def drag(start_x, start_y, end_x, end_y):
    system = platform.system()
    if system == "Linux":
        _run(["xdotool", "mousemove", str(start_x), str(start_y)])
        _run(["xdotool", "mousedown", "1"])
        _run(["xdotool", "mousemove", "--sync", str(end_x), str(end_y)])
        _run(["xdotool", "mouseup", "1"])


def mouse_down():
    if platform.system() == "Linux":
        _run(["xdotool", "mousedown", "1"])


def mouse_up():
    if platform.system() == "Linux":
        _run(["xdotool", "mouseup", "1"])


def run_bash_command(command):
    """Run a bash command and return stdout + stderr."""
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
        if not output:
            output = "(command completed with no output)"
        return output
    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out after 120 seconds"
    except Exception as e:
        return f"ERROR: {e}"


# -------------------------------------------------------
# Handle the three tool types
# -------------------------------------------------------

def handle_computer_tool(tool_input):
    """Handle computer use actions (screen, mouse, keyboard)."""
    action = tool_input.get("action")
    coords = tool_input.get("coordinate", [0, 0])

    if action == "screenshot":
        screenshot_b64 = take_screenshot()
        if screenshot_b64:
            return [{"type": "image", "source": {
                "type": "base64", "media_type": "image/png", "data": screenshot_b64
            }}]
        return "Failed to take screenshot"

    elif action == "mouse_move":
        move_mouse(coords[0], coords[1])
        time.sleep(0.3)
        return "Mouse moved"

    elif action == "left_click":
        click_mouse(coords[0], coords[1], "left")
        time.sleep(0.5)
        return "Left clicked"

    elif action == "right_click":
        click_mouse(coords[0], coords[1], "right")
        time.sleep(0.5)
        return "Right clicked"

    elif action == "middle_click":
        click_mouse(coords[0], coords[1], "middle")
        time.sleep(0.5)
        return "Middle clicked"

    elif action == "double_click":
        double_click(coords[0], coords[1])
        time.sleep(0.5)
        return "Double clicked"

    elif action == "triple_click":
        triple_click(coords[0], coords[1])
        time.sleep(0.5)
        return "Triple clicked"

    elif action == "left_click_drag":
        start = tool_input.get("start_coordinate", [0, 0])
        drag(start[0], start[1], coords[0], coords[1])
        time.sleep(0.5)
        return "Dragged"

    elif action == "left_mouse_down":
        move_mouse(coords[0], coords[1])
        mouse_down()
        time.sleep(0.3)
        return "Mouse button held down"

    elif action == "left_mouse_up":
        move_mouse(coords[0], coords[1])
        mouse_up()
        time.sleep(0.3)
        return "Mouse button released"

    elif action == "type":
        type_text(tool_input.get("text", ""))
        time.sleep(0.3)
        return "Text typed"

    elif action == "key":
        press_key(tool_input.get("text", ""))
        time.sleep(0.3)
        return f"Key pressed: {tool_input.get('text', '')}"

    elif action == "hold_key":
        hold_key(tool_input.get("text", ""))
        time.sleep(0.1)
        return f"Key held: {tool_input.get('text', '')}"

    elif action == "scroll":
        direction = tool_input.get("direction", "down")
        amount = tool_input.get("amount", 3)
        scroll(coords[0], coords[1], direction, amount)
        time.sleep(0.3)
        return f"Scrolled {direction}"

    elif action == "wait":
        duration = tool_input.get("duration", 1)
        time.sleep(duration)
        return f"Waited {duration}s"

    else:
        return f"Unknown action: {action}"


def handle_bash_tool(tool_input):
    """Handle bash tool — run terminal commands."""
    command = tool_input.get("command", "")
    restart = tool_input.get("restart", False)

    if restart:
        return "Shell restarted"

    if not command:
        return "No command provided"

    print(f"\n  [Running: {command[:80]}{'...' if len(command) > 80 else ''}]")
    output = run_bash_command(command)

    # Truncate very long output to avoid blowing up context
    if len(output) > 10000:
        output = output[:5000] + "\n\n... (output truncated) ...\n\n" + output[-5000:]

    return output


def handle_text_editor_tool(tool_input):
    """Handle text editor tool — view/edit files without opening an app."""
    command = tool_input.get("command")
    path = tool_input.get("path", "")

    if command == "view":
        try:
            view_range = tool_input.get("view_range")
            with open(path, "r") as f:
                lines = f.readlines()
            if view_range:
                start, end = view_range
                lines = lines[start - 1:end]
                header = f"[Viewing {path} lines {start}-{end}]\n"
            else:
                header = f"[Viewing {path} ({len(lines)} lines)]\n"
            numbered = ""
            offset = (view_range[0] if view_range else 1)
            for i, line in enumerate(lines):
                numbered += f"{i + offset:6}\t{line}"
            return header + numbered
        except FileNotFoundError:
            return f"File not found: {path}"
        except Exception as e:
            return f"Error reading file: {e}"

    elif command == "create":
        file_text = tool_input.get("file_text", "")
        try:
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "w") as f:
                f.write(file_text)
            return f"File created: {path}"
        except Exception as e:
            return f"Error creating file: {e}"

    elif command == "str_replace":
        old_str = tool_input.get("old_str", "")
        new_str = tool_input.get("new_str", "")
        try:
            with open(path, "r") as f:
                content = f.read()
            count = content.count(old_str)
            if count == 0:
                return f"Error: old_str not found in {path}"
            if count > 1:
                return f"Error: old_str found {count} times in {path}. Make it more specific."
            content = content.replace(old_str, new_str, 1)
            with open(path, "w") as f:
                f.write(content)
            return f"Replacement made in {path}"
        except FileNotFoundError:
            return f"File not found: {path}"
        except Exception as e:
            return f"Error editing file: {e}"

    elif command == "insert":
        insert_line = tool_input.get("insert_line", 0)
        new_str = tool_input.get("new_str", "")
        try:
            with open(path, "r") as f:
                lines = f.readlines()
            lines.insert(insert_line, new_str + "\n")
            with open(path, "w") as f:
                f.writelines(lines)
            return f"Inserted text at line {insert_line} in {path}"
        except Exception as e:
            return f"Error inserting text: {e}"

    elif command == "undo_edit":
        return "Undo not supported in this implementation. Use git to revert."

    else:
        return f"Unknown editor command: {command}"


# -------------------------------------------------------
# Main agent loop
# -------------------------------------------------------

def run_agent():
    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)

    screen_w, screen_h = get_screen_size()
    print(f"Screen detected: {screen_w}x{screen_h}")

    # All three tool types that Computer Use supports
    tools = [
        {
            "type": COMPUTER_TOOL_VERSION,
            "name": "computer",
            "display_width_px": screen_w,
            "display_height_px": screen_h,
            "display_number": 0,
        },
        {
            "type": TEXT_EDITOR_TOOL_VERSION,
            "name": "str_replace_based_edit_tool",
        },
        {
            "type": BASH_TOOL_VERSION,
            "name": "bash",
        },
    ]

    system_prompt = f"""You are an AI assistant that can see and control a computer screen.
You are helping the owner of Ultimate Farms — a poultry farm operation in Ghana.
The owner knows exactly what they want built but is not a coder.

You have THREE tools:
1. computer — see the screen (screenshots), click, type, scroll, drag
2. bash — run terminal commands directly (faster than typing in a terminal app)
3. str_replace_based_edit_tool — view and edit files directly (faster than using an editor app)

Your approach:
- For coding tasks: prefer bash and str_replace_based_edit_tool (fast, precise)
- For visual tasks (testing UI, using browser): use computer tool
- For research (web browsing): use computer tool to operate the browser
- Always take a screenshot first to see the current state
- After important actions, take a screenshot to verify it worked

Communication:
- Explain what you're doing in simple terms (no jargon)
- If something goes wrong, explain plainly and try a different approach
- Be thorough — complete the full task, don't stop halfway
- When you're done, summarize what you did

Screen resolution: {screen_w}x{screen_h}
Working directory: {os.getcwd()}"""

    conversation = []

    print("")
    print("=" * 56)
    print("  Ultimate Farms — AI Computer Use Agent")
    print("=" * 56)
    print("")
    print("  The AI can:")
    print("    - See your screen and click/type (computer tool)")
    print("    - Run terminal commands (bash tool)")
    print("    - Edit code files directly (editor tool)")
    print("")
    print("  Tell it what to do in plain English.")
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

        conversation.append({"role": "user", "content": user_input})

        # Agent loop — the AI keeps acting until it's done
        while True:
            try:
                response = client.beta.messages.create(
                    model=MODEL,
                    max_tokens=4096,
                    system=system_prompt,
                    tools=tools,
                    messages=conversation,
                    betas=[BETA_FLAG],
                )
            except anthropic.APIError as e:
                print(f"\nAPI Error: {e}")
                # Remove the last user message so conversation stays valid
                conversation.pop()
                break

            assistant_content = response.content
            conversation.append({"role": "assistant", "content": assistant_content})

            # Print any text the AI says
            for block in assistant_content:
                if block.type == "text" and block.text.strip():
                    print(f"\nAI: {block.text}")

            # Find tool use blocks
            tool_uses = [b for b in assistant_content if b.type == "tool_use"]

            # If no tool calls, the AI is done with this turn
            if not tool_uses:
                break

            # Execute each tool call and collect results
            tool_results = []
            for tool_use in tool_uses:
                tool_name = tool_use.name
                tool_input = tool_use.input

                # Route to the right handler
                if tool_name == "computer":
                    action = tool_input.get("action", "?")
                    print(f"\n  [Screen: {action}]", end="", flush=True)
                    result = handle_computer_tool(tool_input)
                elif tool_name == "bash":
                    result = handle_bash_tool(tool_input)
                elif tool_name == "str_replace_based_edit_tool":
                    cmd = tool_input.get("command", "?")
                    path = tool_input.get("path", "")
                    print(f"\n  [Editor: {cmd} {path}]", end="", flush=True)
                    result = handle_text_editor_tool(tool_input)
                else:
                    result = f"Unknown tool: {tool_name}"

                # Format the result for the API
                tool_result_msg = {"type": "tool_result", "tool_use_id": tool_use.id}

                if isinstance(result, list):
                    # Image results (screenshots) are lists
                    tool_result_msg["content"] = result
                else:
                    tool_result_msg["content"] = str(result)

                tool_results.append(tool_result_msg)

            # Send tool results back to continue the conversation
            conversation.append({"role": "user", "content": tool_results})

            # If the model said stop, we're done
            if response.stop_reason == "end_turn":
                break


if __name__ == "__main__":
    run_agent()
