# SUBIDHA CORE — n8n AI Assistant Setup (100% Free / Zero API Cost)

This guide shows how to run **n8n** self-hosted on your Hostinger VPS and connect it to your SUBIDHA CORE **AI Assistant** (`/admin/ai`) using **Google Gemini Free Tier** or **Groq** with **zero paid subscriptions**.

---

## 1. Quick Start: Run n8n on Your VPS (Docker)

n8n runs in a lightweight Docker container (~250MB–350MB RAM):

```bash
# On your VPS (srv1391250)
sudo docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -e N8N_HOST="n8n.subidhafurnitureasansol.com" \
  -e WEBHOOK_URL="https://n8n.subidhafurnitureasansol.com/" \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

*(Or access directly via `http://93.127.195.203:5678` during initial setup).*

---

## 2. Get Your 100% Free Gemini API Key (No Credit Card Required)

1. Go to **[Google AI Studio](https://aistudio.google.com/)**.
2. Click **Get API key** $\rightarrow$ **Create API key**.
3. Copy your key.
   * **Free Tier Limits**: 15 requests per minute, 1,000,000 tokens per minute, 1,500 requests per day for `gemini-1.5-flash`.
   * **Cost**: **₹0 / $0 completely free forever**.

---

## 3. Import the Pre-Built Workflow into n8n

1. Open your n8n interface in your browser (`http://YOUR_VPS_IP:5678`).
2. Click **Workflows** $\rightarrow$ **Add Workflow** $\rightarrow$ **... (menu)** $\rightarrow$ **Import from File**.
3. Select `scripts/n8n/subidha_ai_agent_workflow.json`.
4. Double-click the **Google Gemini** node:
   * Select **Create New Credential**.
   * Paste your free Google AI Studio API key.
5. Click **Save** and toggle the workflow to **Active**.
6. Copy the Production Webhook URL from the **Webhook Trigger** node:
   e.g., `https://n8n.subidhafurnitureasansol.com/webhook/subidha-ai-query` (or `http://93.127.195.203:5678/webhook/subidha-ai-query`).

---

## 4. Connect SUBIDHA CORE to Your n8n AI Webhook

Add this single line to your backend environment on your VPS:

```bash
# Edit /etc/subidha/backend.env
N8N_AI_WEBHOOK_URL="http://127.0.0.1:5678/webhook/subidha-ai-query"
```

Restart gunicorn:
```bash
sudo systemctl reload-or-restart subidha-gunicorn
```

---

## 5. Test in Your Admin Webapp

1. Open your browser to: **`https://subidhafurnitureasansol.com/admin/ai`**
2. Click any of the **Quick Solopreneur Prompts**:
   * 📊 *Summarize today's business collections, targets, and pending receipts.*
   * ⚠️ *List customers with overdue EMIs and highest collection risk.*
   * 📦 *Check warehouse inventory items running low on stock.*
3. You will see the **⚡ n8n AI Agent** badge with a live, real-time natural language briefing generated from your live store database!
