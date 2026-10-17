#!/usr/bin/env python3
"""
scripts/agent_sync.py — Universal Inter-Agent Communication & Synchronization CLI.

Allows all AI agents (Antigravity/Gemini, Claude, Cursor, GitHub Copilot/Codex)
to broadcast and read updates regarding schema changes, business rules,
financial invariants, and workflow modifications.

Usage:
  # Broadcast an update to the shared agent log and n8n webhook:
  python scripts/agent_sync.py broadcast \
    --agent "Claude" \
    --type "schema_change" \
    --summary "Added warranty configuration to PIM products" \
    --details "Added warranty_enabled and warranty_months fields to PimProduct model."

  # Inspect current multi-agent status and recent updates:
  python scripts/agent_sync.py status

  # Print recent agent communication log:
  python scripts/agent_sync.py log
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# Paths
REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_PATH = REPO_ROOT / "docs" / "AGENT_SYNC_LOG.md"

# Default n8n Agent Sync Webhook (configured on Hostinger VPS or via env)
DEFAULT_WEBHOOK = os.getenv(
    "N8N_AGENT_SYNC_WEBHOOK",
    "https://subidhafurnitureasansol.com/n8n/webhook/agent-sync"
)


def get_git_info() -> dict:
    """Extract current git branch and commit hash."""
    branch = "unknown"
    commit = "unknown"
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0:
            branch = res.stdout.strip()
    except Exception:
        pass

    try:
        res = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0:
            commit = res.stdout.strip()
    except Exception:
        pass

    return {"branch": branch, "commit": commit}


def append_to_log(agent: str, event_type: str, summary: str, details: str, git_info: dict) -> None:
    """Append a structured sync entry to docs/AGENT_SYNC_LOG.md."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = f"""
### {timestamp} — {summary}
- **Agent**: {agent}
- **Type**: `{event_type}`
- **Git State**: `{git_info['branch']}@{git_info['commit']}`
- **Summary**: {summary}
- **Details**:
  {details}
"""
    if not LOG_PATH.exists():
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "w", encoding="utf-8") as f:
            f.write("# AGENT_SYNC_LOG.md — Inter-Agent Communication Ledger\n\n## Recent Updates\n")

    content = LOG_PATH.read_text(encoding="utf-8")
    marker = "## Recent Updates"
    if marker in content:
        parts = content.split(marker, 1)
        new_content = parts[0] + marker + "\n" + entry + parts[1]
    else:
        new_content = content + "\n" + entry

    LOG_PATH.write_text(new_content, encoding="utf-8")
    print(f"✓ Appended update to {LOG_PATH.relative_to(REPO_ROOT)}")


def notify_n8n(agent: str, event_type: str, summary: str, details: str, git_info: dict) -> bool:
    """Send payload to n8n Agent Sync webhook."""
    webhook_url = DEFAULT_WEBHOOK
    payload = {
        "agent": agent,
        "event_type": event_type,
        "summary": summary,
        "details": details,
        "git_branch": git_info["branch"],
        "git_commit": git_info["commit"],
        "timestamp": datetime.now().isoformat(),
        "project": "SUBIDHA CORE",
    }

    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": f"AgentSync/{agent}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status in (200, 201):
                print(f"✓ Successfully dispatched to n8n webhook ({resp.status})")
                return True
            else:
                print(f"ℹ n8n webhook responded with status {resp.status}")
                return False
    except Exception as exc:
        print(f"ℹ n8n webhook notice (offline or unreachable, local log preserved): {exc}")
        return False


def cmd_broadcast(args) -> None:
    git_info = get_git_info()
    print(f"\n📡 Broadcasting update from agent: {args.agent} (branch: {git_info['branch']})")
    append_to_log(args.agent, args.type, args.summary, args.details, git_info)
    notify_n8n(args.agent, args.type, args.summary, args.details, git_info)
    print("\n✓ Update synchronized across all agent workspaces!\n")


def cmd_status(args) -> None:
    git_info = get_git_info()
    print("=" * 60)
    print("🤖 SUBIDHA CORE — Multi-Agent Workspace Status")
    print("=" * 60)
    print(f"Current Branch: {git_info['branch']}")
    print(f"Current Commit: {git_info['commit']}")
    print(f"Canonical Rules: AGENTS.md, docs/SUBIDHA_CORE_PROJECT_RULEBOOK.md")
    print(f"Shared Log: docs/AGENT_SYNC_LOG.md")
    print("-" * 60)

    if LOG_PATH.exists():
        lines = LOG_PATH.read_text(encoding="utf-8").splitlines()
        recent_headers = [l for l in lines if l.startswith("### ")]
        print(f"Recent Synced Updates ({len(recent_headers)} total):")
        for h in recent_headers[:5]:
            print(f"  • {h.replace('### ', '')}")
    else:
        print("No sync log found yet. Run 'python scripts/agent_sync.py broadcast' to create one.")
    print("=" * 60)


def cmd_log(args) -> None:
    if LOG_PATH.exists():
        print(LOG_PATH.read_text(encoding="utf-8"))
    else:
        print("No sync log found yet.")


def main():
    parser = argparse.ArgumentParser(description="Universal Inter-Agent Communication CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # broadcast command
    p_broadcast = subparsers.add_parser("broadcast", help="Broadcast an update to all agents")
    p_broadcast.add_argument("--agent", required=True, help="Name of agent (e.g. Claude, Antigravity, Cursor, Codex)")
    p_broadcast.add_argument("--type", default="feature", help="Type of change (schema, invariant, feature, fix)")
    p_broadcast.add_argument("--summary", required=True, help="Short summary of changes")
    p_broadcast.add_argument("--details", required=True, help="Markdown details of the update")
    p_broadcast.set_defaults(func=cmd_broadcast)

    # status command
    p_status = subparsers.add_parser("status", help="Show multi-agent sync status")
    p_status.set_defaults(func=cmd_status)

    # log command
    p_log = subparsers.add_parser("log", help="Print inter-agent sync history")
    p_log.set_defaults(func=cmd_log)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
