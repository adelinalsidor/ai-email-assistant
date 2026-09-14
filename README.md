# AI Email Assistant

AI-powered triage for a shared team inbox. It reads new emails over IMAP, classifies each one with Claude (who should handle it, and how urgent it is), and tags the message directly in the inbox - no folders, nothing moved, nothing deleted.

Built as a portfolio project based on a real consulting scenario for a small logistics team, with the client's identity and data fully anonymized. See [Background](#background) below.

## What it does

A small logistics team shares one mailbox. Emails come in for quotes, loading orders, transport documents, delivery status, and complaints, addressed to no one in particular - someone has to read each one and figure out who should act on it and how fast.

This script does that triage automatically, on a schedule:

1. Connects to the mailbox over IMAP.
2. Fetches only the emails that arrived since the last run (see [Why UID tracking, not "unread"](#why-uid-tracking-not-unread)).
3. Sends each one to Claude with the team's current routing rules, asking for a category, an urgency level, and one sentence of reasoning.
4. Tags the message in place with two IMAP keywords - who it's assigned to (`Assigned-A`, `Assigned-B`, ...) and how urgent it is (`Urgent` / `Today` / `CanWait`, meant to map to a red/yellow/green colored tag in the mail client).
5. Logs every decision to a local CSV, so there's a record of who got assigned what and why - useful for a periodic summary to whoever manages the inbox.

Nothing is moved out of the shared inbox. Each team member filters by their own tag to see their queue; the manager sees everything, unfiltered, for free.

## Why tags instead of folders

The first design considered routing by moving each email into a per-person subfolder. That works well for a single person's inbox, but it actively hurts a *shared* inbox: the whole point is that a manager can see the team's overall activity at a glance, and splitting mail across folders means checking N folders instead of one.

Tagging solves this without extra tooling: everything stays in one inbox, tagged by who owns it and how urgent it is. Team members filter by their own tag; nobody has to build or maintain a separate view for the manager.

## Why the urgency colors are red/yellow/green, not something fancier

An earlier version used a distinct color per category plus a distinct color for urgency, which meant a single email could carry up to 12 different color combinations. That's not decision support, it's just visual noise. The fix: only one dimension - urgency - carries color, using the one color scheme everyone already knows without thinking about it. Who's assigned is shown as plain text (an initial), which has no ambiguity to begin with, so it doesn't need color at all.

## Why UID tracking, not "unread"

The obvious first approach is "process every unread email." It's also wrong for two reasons found while building this:

- **A mailbox can carry years of unrelated unread mail.** The very first test run tried to classify a several-thousand-message backlog that had nothing to do with this project, because it all happened to be unread, and got rate-limited by the mail server partway through.
- **"Unread" isn't the same as "not yet processed by us."** If a team member reads a message in their mail client before the next scheduled run, it silently disappears from an "unread" query - even though this tool never looked at it.

The fix: the script remembers the highest message UID it has already processed (`data/state.json`, created automatically, not committed) and only asks the server for messages newer than that, every run. It doesn't care whether a human has already read something.

## Why the routing rules live in a spreadsheet, not in code

`config/classification-rules.xlsx` is the single source of truth for categories, who each one is assigned to, and the typical urgency. The script reads it fresh on every run and builds the Claude prompt from it directly.

This means the team's own structure - what to call each type of request, who owns what - is never hardcoded. Editing a row in Excel is enough to change how the script behaves; no code changes, no redeploy. The sample table included here uses placeholder roles (`Person A`, `Person B`, `Person C`, `Manager`) on purpose - it's a starting template, not a prescription for how a logistics team should be organized.

## Why IMAP, not a vendor API or an MCP server

Two more obvious-looking options were considered and set aside, for concrete reasons rather than preference.

**A vendor API (Gmail API / Microsoft Graph)** only works if the mailbox is actually hosted by that vendor, and requires registering a cloud app, an OAuth consent screen, and in some cases a security review before it can be used for real. The client mailbox behind this project's real-world scenario is privately hosted - confirmed by checking its SPF/MX DNS records, not assumed - so a vendor API was never an option to begin with, for this mailbox or for most small-business mailboxes in general.

**An MCP server for the mail client** (a community Thunderbird MCP server, specifically) was tried first. It looked ideal on paper: the mailbox password never leaves Thunderbird. In practice, on Windows, the extension consistently failed to write its own connection file - a known, unresolved bug in that project, unrelated to anything on this end. After confirming the bug firsthand (not just from the issue tracker), the approach was abandoned. But the deeper issue isn't just the bug: MCP is built for a human interactively steering an agent in a live session. This project is the opposite shape of problem - an unattended job that runs on a schedule, with no one watching. Adding a desktop mail client and a bridge process into that loop is one more thing that can be closed, crashed, or out of date when the scheduled run fires.

**IMAP directly** turned out to be the simplest thing that actually fits the problem:

- An **app-specific password** is used, generated from the mail provider's own security settings - never the real account password, and revocable at any time without touching the main login.
- No cloud app registration, no OAuth consent screen - IMAP is supported by essentially every mail provider on earth, not just one vendor's.
- The script doesn't depend on Thunderbird being open at all; Thunderbird (or any IMAP client) is just how a human happens to view the result.
- It can run unattended, on a schedule (e.g. via Task Scheduler / cron), rather than needing a desktop app running in the foreground.

## Why the routing rules are written by the team, not inferred by watching them work

The obvious shortcut here: skip the spreadsheet, connect Claude to the mailbox for a week, and have it learn the routing rules on its own - who handles what, and how urgent each type of request really is - just from watching who replied, how fast, and what they wrote. No spreadsheet to fill in, no upfront work for the team.

It falls apart once you look at what "watching" a shared inbox can actually see. In a real team inbox, people don't reply from the shared address - they reply from their own, keeping the shared/manager address in CC. That's the only reason a reply is visible to something polling the shared inbox at all, and even then the visibility is partial:

- **A reply with no CC is invisible.** Someone forgets to CC the group under pressure - which happens exactly when things are urgent - and that resolution leaves no trace for the AI to learn from, even though it happened.
- **A phone call or a hallway conversation leaves no trace at all.** A human logging the outcome by hand knows "this got resolved by phone"; an AI reading the mailbox has nothing to read.
- **A handoff between colleagues is ambiguous.** If person A replies first and forwards it to a specialist, the thread shows both actions, but "who actually owns this category" isn't something you can safely derive from that - a human just states it.
- **Reply speed isn't the same as urgency**, which is the one thing this project cares about most. Someone can reply fast to something trivial out of politeness, or slowly to something urgent because they were in a meeting. Learning urgency from response latency means learning noise dressed up as signal.

Worse, this project exists *because* the team's existing habits were already losing urgent emails in routine traffic. An approach that learns its rules from a week of that same behavior risks re-encoding the exact problem it's meant to fix, instead of fixing it.

The spreadsheet has none of these problems: a category, a priority, and an owner are facts the team already knows, stated directly instead of guessed at from a noisy proxy. It's also the cheaper option - reading a static file once per run, versus classifying a week of live traffic before the tool has triaged a single real email.

The one part of the "watch and learn" idea worth keeping: using a short observation period to **pre-fill a draft** spreadsheet - suggested categories and owners for the manager to review and correct in fifteen minutes - rather than starting from a blank file. That keeps the spreadsheet as the actual source of truth, while cutting the effort of writing it from scratch.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | From [platform.claude.com](https://platform.claude.com) → Settings → API Keys |
| `IMAP_HOST` / `IMAP_PORT` | Your mail provider's IMAP settings |
| `IMAP_USER` | The mailbox address |
| `IMAP_APP_PASSWORD` | An app-specific password from your provider's account security settings - **not** your real password |

Then adjust `config/classification-rules.xlsx` to match your own team - rename the sample categories and roles, or add/remove rows entirely.

## Usage

```bash
npm run seed   # optional: pushes test-data/sample-emails.json into the mailbox, for a dry run
npm start      # fetches new mail, classifies it, tags it, logs it
```

Run `npm start` on a schedule (Task Scheduler, cron, a serverless cron trigger) for continuous triage.

## Project structure

```
config/classification-rules.xlsx   editable routing rules - the script's only source of truth
test-data/sample-emails.json       18 sample emails covering every category and urgency level
src/
  config.js               loads .env and the rules spreadsheet
  claudeClassifier.js     builds the prompt and calls Claude for structured classification
  imapClient.js           IMAP connect / fetch-new-messages / tag-message
  state.js                remembers the last processed UID between runs
  activityLog.js          appends every decision to data/activity-log.csv
  seedTestInbox.js         pushes the sample emails into the mailbox for testing
  run.js                  ties it all together
```

## Known limitations

- **Custom IMAP keywords aren't guaranteed by every provider.** This was tested against Yahoo Mail, which accepts them; a provider that only supports the standard flags (`\Seen`, `\Answered`, ...) would need a fallback (e.g. a `[Assigned-A][Urgent]` subject prefix, or a real per-category subfolder) instead of custom tags.
- **Classification cost scales with volume.** Each email is one Claude API call. For a very high-volume shared inbox, batching or a cheaper pre-filter pass would be worth adding.
- This is a triage layer, not a reply generator - it decides who should look at an email and how fast, it doesn't draft or send anything.

## Background

This project started as a real automation proposal for a small logistics company: a shared department inbox where a handful of urgent client emails were at real risk of getting lost in routine traffic. The classification categories, the routing logic, and the escalation rule for complaints all come from that real conversation with the client's team.

Everything company- and person-specific has been replaced with a fictional persona for this repository. The `config/classification-rules.xlsx` template and the sample data reflect the same structure and reasoning as the original, anonymized.
