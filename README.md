# WhatsApp Expense Tracker Bot

Send a message like `milk 50` or `uber 230` to a WhatsApp group and the bot logs it to a Google Sheet with the item, category, amount, and date — then replies with a confirmation.

```
You:  milk 238
Bot:  Got it — Milk ₹238 under Groceries, 21 Mar ✓
```

---

## How It Works

1. You send a natural-language expense message to a dedicated WhatsApp group (just you in it)
2. The bot reads the message via `whatsapp-web.js` (connects as your WhatsApp account)
3. Gemini AI parses the message into: item, category, amount, date
4. A row is appended to Google Sheets
5. Bot replies with a confirmation

---

## Prerequisites

- Node.js 20+
- A Google account (for Sheets + GCP service account)
- A Google AI Studio account (free Gemini API key)
- Your personal WhatsApp number (the bot runs as you)
- Optional: Brevo account for email alerts when the bot disconnects

---

## First-Time Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd expense-bot
npm install
```

### 2. Create a WhatsApp group

Create a WhatsApp group with only yourself in it. This is where you'll send expense messages.

### 3. Get a Gemini API key

Go to https://aistudio.google.com/ → Get API key → Create API key. Copy it.

### 4. Set up Google Sheets

1. Create a new Google Sheet
2. Rename the default tab from `Sheet1` to `Expenses`
3. Add headers in row 1: `Date | Item | Category | Amount | Raw`
4. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`

### 5. Create a GCP service account

1. Go to https://console.cloud.google.com/
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API** for the project:
   APIs & Services → Enable APIs → search "Google Sheets API" → Enable
4. Go to IAM & Admin → Service Accounts → Create Service Account
5. Give it any name, click through to finish
6. Open the service account → Keys tab → Add Key → Create new key → JSON
7. Download the JSON file, rename it to `service-account.json`, place it in the project root
8. Copy the `client_email` from the JSON file
9. Share your Google Sheet with that email address (Editor access)

### 6. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all values:

```env
GEMINI_API_KEY=          # from step 3
GOOGLE_SHEETS_ID=        # from step 4
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account.json
TARGET_GROUP_JID=        # see step 7 below
ALERT_EMAIL=             # your email for disconnect alerts
SMTP_HOST=smtp-relay.brevo.com
SMTP_USER=               # from Brevo (or leave as dummy if you don't need alerts)
SMTP_PASS=               # from Brevo (or leave as dummy)
HEALTH_PORT=3000
```

### 7. Find your WhatsApp group JID

The bot needs the group's internal ID (JID) to know which group to listen to.

```bash
node scripts/list-groups.js
```

Scan the QR code with WhatsApp (Linked Devices → Link a Device). When it says "Ready!", send any message from your Expenses group. The terminal will print:

```
Paste this into .env: TARGET_GROUP_JID=120363xxxxxxxxx@g.us
```

Copy that into your `.env`. Then press Ctrl+C.

> After this step you'll have a linked device called "list-groups" in WhatsApp. You can remove it — it's no longer needed.

### 8. Run the bot

```bash
npm start
```

Scan the QR code again (a new session for the main bot). Once it says "Expense bot is ready and listening.", send an expense message from your group:

```
milk 50
coffee 180
uber 230 yesterday
gym membership 1500
```

You'll get a reply and a new row in your sheet.

---

## Running in Production (Hetzner / any Linux VPS)

### Server setup (one-time)

```bash
# Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
npm install -g pm2

# Install Chromium (for whatsapp-web.js / Puppeteer)
sudo apt install -y chromium
```

### Deploy

```bash
# On your Mac — copy files to server (skip node_modules and auth sessions)
scp -r expense-bot root@<server-ip>:~/expense-bot
# Or use git: push to GitHub, then git clone on the server

# On the server
cd ~/expense-bot
npm install
# Copy your .env and service-account.json to ~/expense-bot/

# Start with PM2
pm2 start index.js --name expense-bot
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

### First-time QR scan on server

```bash
pm2 logs expense-bot
```

A QR code will appear in the logs. Scan it with WhatsApp. After that, the session is saved and the bot restarts automatically without needing a QR scan.

### Useful PM2 commands

```bash
pm2 logs expense-bot      # view live logs
pm2 status                # check if running
pm2 restart expense-bot   # restart
pm2 stop expense-bot      # stop
```

---

## Expense Categories

The bot automatically assigns one of these 15 categories:

| Category | Examples |
|---|---|
| Groceries | milk, vegetables, supermarket |
| Food & Dining | restaurant, coffee, swiggy |
| Transport | uber, petrol, metro |
| Travel | flight, hotel, holiday |
| Health & Medical | doctor, medicine, pharmacy |
| Fitness | gym, yoga, protein powder |
| Personal Care | haircut, salon, skincare |
| Shopping | clothes, shoes, amazon |
| Home & Maintenance | rent, electrician, furniture |
| Subscriptions | netflix, spotify, icloud |
| Utilities | electricity, internet, water |
| Education | course, books, tuition |
| Entertainment | movie, concert, game |
| Gifts & Donations | birthday gift, donation |
| Other | anything that doesn't fit |

---

## Project Structure

```
expense-bot/
├── index.js                  # Entry point — wires everything together
├── scripts/
│   └── list-groups.js        # One-time script to find your WhatsApp group JID
├── src/
│   ├── bot.js                # Message handler and WhatsApp client setup
│   ├── config.js             # Loads and validates environment variables
│   ├── filters.js            # Decides which messages to process
│   ├── parser.js             # Calls Gemini to parse expense from message text
│   ├── sheets.js             # Appends rows to Google Sheets
│   ├── health.js             # HTTP health endpoint (GET /health)
│   └── mailer.js             # Sends email alerts on WhatsApp disconnect
├── tests/                    # Jest unit tests
├── .env                      # Your secrets (never commit this)
├── .env.example              # Template for .env
├── service-account.json      # GCP service account key (never commit this)
└── failed.jsonl              # Local fallback log when Sheets API is unreachable
```

---

## Monitoring

The bot exposes a health endpoint:

```
GET http://localhost:3000/health
→ {"status":"ok","ts":"2026-03-21T..."}
```

You can point UptimeRobot (free tier) at `http://<server-ip>:3000/health` to get notified if the server goes down.

---

## If the Bot Stops Working

**WhatsApp session expired** — this happens occasionally. SSH into the server and run:

```bash
pm2 logs expense-bot
```

If you see a QR code, scan it with WhatsApp to re-authenticate. The bot will resume on its own after scanning.

**Expenses logged to `failed.jsonl`** — if the Sheets API was unreachable, expenses are saved locally. You can manually copy them into the sheet.

---

## Running Tests

```bash
npm test
```
