# SecBounty

**Vulnerability bounties paid by consensus-graded severity, on GenLayer.**

A project posts a scope and funds a bounty pool. Researchers submit findings (a vulnerability + a PoC
link). `triage` has every validator independently judge validity and assign a severity tier
(**none / low / medium / high / critical**); the result is accepted only when validators agree on the
**severity** (comparative equivalence). A valid report is paid a tier-scaled slice of the pool via
`emit_transfer`, capped at the remaining balance.

The verb is **"grade severity → tier-scaled payout"** — distinct from a single best-wins bounty; many
reports can be paid, each by how bad the bug is.

- **Contract (Bradbury, chain 4221):** `0xcBF0e2Fa91201681d8690be5Df8a317A6a4E9a9b`
- **Deployed from:** `rivale` (`0xc388…51A44`)
- **Explorer:** https://explorer-bradbury.genlayer.com/contract/0xcBF0e2Fa91201681d8690be5Df8a317A6a4E9a9b

---

## Why GenLayer is essential

Severity grading is expert judgment (and money rides on it). GenLayer has validators independently
read the report + PoC and agree on the tier before the contract pays — decentralized triage that a
bare EVM can't do, with the payout bound to the consensus result.

## Workflow

| Step | Method | What happens |
| --- | --- | --- |
| Post | `post_scope(target, scope)` *(payable)* | Funds the bounty pool. |
| Report | `submit_report(scope_id, title, poc_url)` | Researcher submits a finding. |
| Triage | `triage(scope_id, idx)` | Consensus severity → tier-scaled payout from the pool. |
| Read | `get_scope(id)` / `get_report(id, idx)` / `stats()` | Pool, remaining, per-report severity + payout. |

### Correctness check & payout math

`_triage` wraps grading in **`gl.eq_principle.prompt_comparative`** — principle: *"the severity tier and
validity must match across validators."* `validate_triage` enforces the severity enum + real boolean +
reason; `normalize_triage` forces `severity=none` when invalid. `payout_for(severity, pool)` = pool ×
`TIER_BPS` (critical 50% / high 25% / medium 10% / low 5%), each payout capped at the remaining pool.
Unit-tested incl. tier math + a full post→report→triage(high)→pay run.

## Architecture

```
SecBounty/
├── contracts/sec_bounty.py  ← GenLayer Intelligent Contract (consensus severity + tier payout via emit_transfer)
├── tests/                   ← pytest: triage guards, payout_for tiers, full pay flow, invalid→0
└── app/                     ← React + Vite + Tailwind v4 + Framer Motion (21st.dev style)
                               orange severity-heat theme, program board + per-report severity tiers
```

## Tests

```bash
cd SecBounty
python3 -m venv .venv && .venv/bin/pip install pytest -q
.venv/bin/python -m pytest tests/ -q
```
Covers `normalize_triage` / `validate_triage`, `payout_for` tiers, a full **post → submit → triage(high)
→ pay** run, and invalid→0 (shim auto-inits `TreeMap`, stubs `emit_transfer`). On-chain: deployment
verified live (`stats`); payable paths exercised in-app (wallet attaches `value`).

## Deploy

```bash
genlayer deploy --contract contracts/sec_bounty.py
```
