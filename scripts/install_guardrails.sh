#!/usr/bin/env bash
# scripts/install_guardrails.sh — Activate Git Hooks & Guardrails

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "🔒 Configuring Git hooks for SUBIDHA CORE..."
chmod +x .githooks/pre-commit
chmod +x .githooks/pre-push

git config core.hooksPath .githooks

echo "✅ Git guardrail hooks installed successfully!"
echo "   • .githooks/pre-commit (blocks destructive SQL & unapproved deletions)"
echo "   • .githooks/pre-push (blocks unauthorized automated pushes)"

