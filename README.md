# SinaLite Account Research Tool

AI-powered print reseller classification for SinaLite account approvals.

Upload a CSV or Excel file of accounts → Claude AI researches each one → Download a colour-coded PDF report.

---

## What It Does

For each account in your file, Claude analyzes:
- **Email domain** (e.g. `@designstudio.com` vs `@gmail.com`)
- **Company name** (e.g. "Quick Signs" or "ABC Printing")
- **Website domain** (e.g. `fastprints.ca`)
- **Address / location** context
- **Self-declared business type** (treated as a hint only — may be wrong)

Each account gets a verdict: **Reseller ✓**, **Not Reseller ✗**, or **Uncertain ?** — plus a confidence level, reasoning, and key signals. The final PDF report colour-codes rows in green (reseller), red (not reseller), and yellow (uncertain).

---

## Setup

### Prerequisites
- Node.js 18+ (download at [nodejs.org](https://nodejs.org))
- A Claude API key from [console.anthropic.com](https://console.anthropic.com)

### Run Locally

```bash
# 1. Clone your GitHub repo (after you've pushed it there)
git clone https://github.com/YOUR_USERNAME/sinalite-account-research.git
cd sinalite-account-research

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploy to Vercel

### Step 1 — Push to GitHub

```bash
# In the project folder:
git init
git add .
git commit -m "Initial commit"

# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/sinalite-account-research.git
git push -u origin main
```

### Step 2 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Select the `sinalite-account-research` repository
4. Leave all settings as defaults (Vercel auto-detects Next.js)
5. Click **"Deploy"**

Your app will be live at `https://sinalite-account-research.vercel.app` (or a custom domain you configure).

> **Note on timeouts:** `vercel.json` sets a 30-second function timeout. This requires a **Vercel Hobby plan or above** (free plan defaults to 10 seconds, which may timeout on slow Claude responses). If you see timeout errors, upgrade to Hobby ($0/month for personal use) or Pro.

---

## CSV / Excel File Format

The tool auto-detects common column names. You do **not** need exact column headers — it maps common variations automatically.

| Field | Recognized Headers |
|---|---|
| Company | `Company`, `Business Name`, `Organization` |
| Email | `Email`, `Email Address` |
| Website | `Website`, `URL`, `Web Site`, `Domain` |
| Contact Name | `Name`, `Full Name`, `Contact`, `First Name` + `Last Name` |
| Address | `Address`, `Street Address`, `Billing Address` |
| City | `City` |
| Province/State | `Province`, `State` |
| Country | `Country` |
| Business Type | `Business Type`, `Type`, `Category`, `Industry` |

**Tip:** Export directly from your account management system — the tool handles the column mapping automatically.

---

## Cost Estimate

| Accounts | Estimated Cost | Estimated Time |
|---|---|---|
| 10 | ~$0.03 | ~1.5 min |
| 25 | ~$0.08 | ~4 min |
| 50 | ~$0.15 | ~7 min |
| 100 | ~$0.30 | ~14 min |

*Using Claude Sonnet at current Anthropic pricing. Costs may vary.*

---

## Tech Stack

- **Next.js 14** (App Router) — React framework
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling
- **@anthropic-ai/sdk** — Claude API
- **papaparse** — CSV parsing
- **xlsx** — Excel parsing
- **jspdf + jspdf-autotable** — PDF generation

---

## Disclaimer

This tool is for **internal SinaLite use only**. AI-generated results should always be reviewed by a team member before making final account approval decisions.
