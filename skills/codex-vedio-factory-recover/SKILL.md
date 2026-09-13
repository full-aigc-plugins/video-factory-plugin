---
name: codex-vedio-factory-recover
description: Use when a Vedio Factory analysis, rough cut, review render, or final render was interrupted and the durable ledger must determine the only legal next action.
---

# Recover a Vedio Factory job

Read the ledger and revalidate inputs, capabilities, receipts, plan hash, edit hash, stage, and round.
Resume only pending work with the same idempotency keys. Do not retry failed work unchanged or
regenerate segments that still have valid receipts.
