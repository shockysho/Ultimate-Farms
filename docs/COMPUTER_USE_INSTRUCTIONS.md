# How to Give the AI Tasks (Computer Use)

You don't need to know how to code. You just need to know what you want.
This guide shows you how to talk to the AI so it does exactly what you need.

---

## The Golden Rule

**Talk to it like you'd talk to a smart employee who's sitting at your computer.**

Don't say: "Execute a POST request to the GitHub API endpoint"
Say: "Go to my GitHub repo and create a new issue called 'Add feed tracking page'"

---

## How It Works

```
1. You type what you want done (in plain English)
2. The AI takes a screenshot of your screen
3. It figures out what to click/type
4. It does the action
5. It takes another screenshot to verify
6. Repeats until the task is done
```

You can watch it work in real time. It's like screen-sharing
with someone who's controlling your computer remotely.

---

## Starting the AI

### Option A: Docker Sandbox (safest)

```bash
# Run the setup script
./setup-computer-use.sh
# Pick option 1
# Open http://localhost:8080 in your browser
# Type instructions in the chat box
```

### Option B: Direct Screen Control

```bash
# Run the setup script first (one time)
./setup-computer-use.sh

# Then run the agent
python3 computer_use_agent.py
```

---

## Example Instructions (Copy & Paste These)

### Setting Up Your Dev Environment

```
Open the terminal. Navigate to the Ultimate-Farms folder.
Run "npm install" to install all the packages.
Then run "npm run dev" to start the development server.
Open Firefox and go to localhost:3000 to see if the app loads.
Take a screenshot and tell me what you see.
```

### Working on the GitHub Repo

```
Open Firefox and go to github.com/shockysho/Ultimate-Farms.
Look at the open issues. Tell me what issues exist.
Then go to the code tab and look at the src/modules folder.
Tell me which modules have been built and which are empty.
```

### Building a New Feature

```
I need you to build the Daily Production Brief page.
Here's what it should do:

1. Show today's date at the top
2. Have input fields for:
   - Number of eggs collected (morning, afternoon, evening)
   - Number of birds that died today
   - Feed consumed in kg
3. Auto-calculate:
   - HDP% (eggs / total birds × 100)
   - Daily mortality rate
   - FCR (feed consumed / egg weight produced)
4. A "Submit" button that saves the data
5. A table below showing the last 7 days

Use React for the frontend. Follow the patterns in the existing
src/modules/ folder. Use Tailwind CSS for styling. Make it work
on mobile screens (most users will be on phones).

Start by opening VS Code, looking at the existing code structure,
then build the component step by step.
```

### Debugging

```
The app is showing an error when I try to log in.
Open the terminal and run "npm run dev" to start the app.
Then open Firefox and go to localhost:3000.
Try to log in with test@test.com / password123.
Look at what error appears on screen AND in the terminal.
Tell me what's wrong and fix it.
```

### Research and Documentation

```
I need to integrate MoMo (MTN Mobile Money) payments into the app.
Open Firefox and search for "MTN MoMo API documentation Ghana".
Find the developer docs and read through:
- How to get API credentials
- How to make a collection request (receive payment)
- What the webhook/callback looks like
Then create a summary document in the docs/ folder with the
key information I need, and write a basic integration module
in src/modules/strategic/momo-integration.ts
```

### Multi-Step Complex Task

```
I need you to do the following, step by step:

1. Open the terminal and check if PostgreSQL is running
   (run: sudo systemctl status postgresql)

2. If it's not running, start it

3. Open the database and create the tables from our schema files.
   The SQL files are in src/db/schemas/. Run them in order:
   - 001_core_mes.sql
   - 002_financial.sql
   - 003_biosecurity_maintenance.sql

4. After the tables are created, verify by listing all tables

5. Then open VS Code, go to src/config/ and update the database
   connection settings to point to localhost

6. Run the app and verify it can connect to the database

Tell me the status after each step.
```

---

## Tips for Best Results

### Be Specific About What "Done" Looks Like

Bad: "Make the login page better"
Good: "On the login page, make the logo bigger, center the form,
and add a 'Forgot Password' link below the password field"

### Break Big Tasks Into Chunks

Instead of: "Build the entire feed management system"

Do this:
1. "First, create the feed inventory table component"
2. "Now add the form to record new feed deliveries"
3. "Now add the aflatoxin test result field with pass/fail"
4. "Now connect it to the database"

### Tell It What Tools to Use

"Use VS Code to edit the files"
"Use Firefox to browse the web"
"Use the terminal to run commands"

### Tell It Your Constraints

"This needs to work on phones with small screens"
"The internet is unreliable here, so make it work offline"
"The farm workers may not read English well — use icons"

### Let It Know When Something's Wrong

"That doesn't look right — the button is cut off on the right side"
"The text is too small, make everything bigger"
"It crashed — look at the error in the terminal and fix it"

---

## What the AI Can Do

| Task | Example |
|---|---|
| Write code | "Create a React component for egg collection tracking" |
| Browse the web | "Search for the best offline-first database for React" |
| Use the terminal | "Run the tests and fix any failures" |
| Edit files | "Open the config file and change the port to 3001" |
| Use any app | "Open Figma and screenshot the farm dashboard design" |
| Install software | "Install PostgreSQL and set it up" |
| Debug | "The page is blank — find out why and fix it" |
| Research | "Find how to send WhatsApp messages from Node.js" |
| Git operations | "Commit all changes and push to GitHub" |
| Database work | "Create the tables and add some test data" |

## What It Can't Do (Well)

- Very fast-paced interactions (games, rapid animations)
- CAPTCHAs (intentionally designed to block bots)
- Anything requiring your physical password/biometrics
- Tasks that need internet if you're offline

---

## Safety Tips

1. **Watch it work** — especially the first few times
2. **Don't give it banking credentials** — if it needs MoMo API keys,
   paste them yourself rather than letting it read them from screen
3. **Use the Docker sandbox** for anything you're unsure about
4. **It can't undo everything** — if it deletes a file, it's gone
   (unless you use git, which auto-saves your code history)
5. **Ctrl+C stops it** — if it's doing something wrong, just interrupt

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "API key not found" | Run `./setup-computer-use.sh` again and enter your key |
| "Screenshot tool not found" | `sudo apt install scrot xdotool` (Linux) |
| AI clicks wrong things | Make your screen resolution lower (1280x720) so buttons are bigger |
| AI is too slow | Use Docker mode — it runs at a fixed resolution optimized for AI |
| "Model does not support computer use" | Make sure you're using claude-sonnet-4-6 |
| Docker won't start | Install Docker: `curl -fsSL https://get.docker.com | sh` |
