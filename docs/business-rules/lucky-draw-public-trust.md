# Lucky Plan - public trust and commitment certificate

This document describes the additive public trust layer for Lucky Plan draws.
It does not change EMI math, payment posting, waiver generation, reconciliation,
commission, payout, or existing commit/reveal behavior.

## Goal

Give customers and branch staff a clearer way to understand how a draw becomes
publicly verifiable without exposing private customer data.

## Non-negotiable rules

- Commit/reveal behavior stays intact.
- Winner benefit remains future EMI waiver only.
- Public routes must not expose raw phone numbers, Aadhaar, KYC IDs, internal customer identifiers, or unmasked private data.
- Existing legacy draw records must continue to serialize safely.
- Admin actions remain admin-only.

## Public data model

Public Lucky Draw views may expose only safe fields such as:

- batch code
- draw month
- commitment hash
- commitment published timestamp
- reveal timestamp
- eligible snapshot count
- public verification status
- masked winner name
- winner lucky number
- waiver scope
- waived EMI count and amount
- public explanation text

### Safe language for customers

- The commitment hash is like a sealed envelope.
- The seed is revealed later for verification.
- The winner receives future EMI waiver only.

## Public endpoints

The public API now has additive Lucky Draw routes under `/api/v1/public/lucky-draws/`:

- latest trust summary
- commitment certificate
- public verification result
- masked winner detail

These endpoints are read-only and must stay privacy-safe.

## Audit expectations

Public trust actions should leave audit evidence for:

- commitment certificate published
- public verification record generated
- public winner result published

Audit entries must remain free of private customer data.

## Operational meaning

The public trust layer is meant to help with:

- customer reassurance
- branch staff explanation
- legal clarity
- later verification of the published commitment

It is not a substitute for the authoritative backend draw execution flow, ledger, or waiver records.

## Compatibility

This layer is additive only.
It must not require schema breaks or changes to historical EMI records.
Legacy draws should still show a safe masked public winner view and a valid public commitment hash fallback when available.
