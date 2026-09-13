---
name: codex-video-factory-recover
description: Use when a Video Factory analysis, rough cut, review render, or final render was interrupted and the durable ledger must determine the only legal next action.
---

# Recover a Video Factory job

Read the ledger and revalidate inputs, capabilities, receipts, plan hash, edit hash, stage, and round.
Resume only pending work with the same idempotency keys. Do not retry failed work unchanged or
regenerate segments that still have valid receipts.
