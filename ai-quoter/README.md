---
title: Andreal AI Quoter
emoji: 🤖
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# Andreal AI Quoter

Conversational print-quoting assistant. Claude handles the conversation; the **validated Andreal
pricing engine** (`index.html`, run client-side) does every number, live from the master vendor sheet.

## Setup (one secret)
In the Space → **Settings → Variables and secrets** add a **Secret**:
- `ANTHROPIC_API_KEY` = your Anthropic API key

Optional **Variables**:
- `MODEL` (default `claude-sonnet-5`)

Then the chat is live at `/`. The plain estimator is at `/index.html`.
