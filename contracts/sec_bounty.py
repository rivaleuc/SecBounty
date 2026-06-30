# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
SecBounty — vulnerability bounties paid by consensus-graded severity.

A project posts a scope and funds a bounty pool. Researchers submit findings
(a vulnerability + a PoC link). `triage` has every validator independently judge
the report's validity and assign a severity tier (none / low / medium / high /
critical); the result is accepted only when validators agree on the SEVERITY
(comparative equivalence). A valid report is paid a tier-scaled slice of the pool
via the supported emit_transfer primitive, capped at the remaining balance.

The verb is "grade severity → tier-scaled payout" — distinct from a single best-
wins bounty; many reports can be paid, each by how bad the bug is.
"""
import json
from genlayer import *

MIN_POOL_WEI = 10**15
SEVERITIES = ("none", "low", "medium", "high", "critical")
TIER_BPS = {"critical": 5000, "high": 2500, "medium": 1000, "low": 500, "none": 0}


def normalize_triage(raw) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    valid = raw.get("valid")
    valid = bool(valid) if isinstance(valid, bool) else str(valid).strip().lower() in ("true", "yes", "1")
    sev = str(raw.get("severity", "")).strip().lower()
    if sev not in SEVERITIES:
        sev = "none"
    if not valid:
        sev = "none"
    reason = raw.get("reason")
    reason = reason[:400] if isinstance(reason, str) and reason.strip() else "no reason"
    return {"valid": valid, "severity": sev, "reason": reason}


def validate_triage(data) -> bool:
    if not isinstance(data, dict):
        return False
    if not isinstance(data.get("valid"), bool):
        return False
    if data.get("severity") not in SEVERITIES:
        return False
    r = data.get("reason")
    return isinstance(r, str) and bool(r.strip())


def payout_for(severity: str, pool_wei: int) -> int:
    return (int(pool_wei) * TIER_BPS.get(severity, 0)) // 10000


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


class SecBounty(gl.Contract):
    scopes: TreeMap[str, str]
    reports: TreeMap[str, str]      # "scope:idx" -> report json
    scope_count: u256
    paid_wei: u256
    valid_reports: u256

    def __init__(self):
        self.scope_count = u256(0)
        self.paid_wei = u256(0)
        self.valid_reports = u256(0)

    @gl.public.write.payable
    def post_scope(self, target: str, scope: str) -> str:
        pool = int(gl.message.value)
        if pool < MIN_POOL_WEI:
            raise Exception("bounty pool below minimum")
        target = str(target).strip()
        scope = str(scope).strip()
        if not target or not scope:
            raise Exception("target and scope required")
        key = str(int(self.scope_count))
        rec = {
            "owner": str(gl.message.sender_address),
            "target": target[:200],
            "scope": scope[:800],
            "pool_wei": str(pool),
            "remaining_wei": str(pool),
            "report_count": 0,
        }
        self.scopes[key] = json.dumps(rec)
        self.scope_count += u256(1)
        return key

    @gl.public.write
    def submit_report(self, scope_id: str, title: str, poc_url: str) -> str:
        scope_id = str(scope_id)
        if scope_id not in self.scopes:
            raise Exception("unknown scope")
        s = json.loads(self.scopes[scope_id])
        title = str(title).strip()
        if not title:
            raise Exception("title required")
        idx = int(s["report_count"])
        self.reports[f"{scope_id}:{idx}"] = json.dumps({
            "researcher": str(gl.message.sender_address),
            "title": title[:200],
            "poc_url": str(poc_url).strip()[:400],
            "state": "submitted",       # submitted -> triaged
            "valid": False,
            "severity": "",
            "reason": "",
            "paid_wei": "0",
        })
        s["report_count"] = idx + 1
        self.scopes[scope_id] = json.dumps(s)
        return str(idx)

    @gl.public.write
    def triage(self, scope_id: str, idx: str) -> dict:
        scope_id = str(scope_id)
        key = f"{scope_id}:{str(idx)}"
        if scope_id not in self.scopes or key not in self.reports:
            raise Exception("unknown report")
        s = json.loads(self.scopes[scope_id])
        r = json.loads(self.reports[key])
        if r["state"] != "submitted":
            raise Exception("already triaged")

        verdict = self._triage(s["target"], s["scope"], r["title"], r["poc_url"])
        r["valid"] = verdict["valid"]
        r["severity"] = verdict["severity"]
        r["reason"] = verdict["reason"]
        r["state"] = "triaged"

        pay = 0
        if verdict["valid"] and verdict["severity"] != "none":
            want = payout_for(verdict["severity"], int(s["pool_wei"]))
            pay = min(want, int(s["remaining_wei"]))
            if pay > 0:
                s["remaining_wei"] = str(int(s["remaining_wei"]) - pay)
                self.paid_wei += u256(pay)
                self.valid_reports += u256(1)
                _Payee(Address(r["researcher"])).emit_transfer(value=u256(pay))
        r["paid_wei"] = str(pay)

        self.reports[key] = json.dumps(r)
        self.scopes[scope_id] = json.dumps(s)
        return {"scope": scope_id, "report": str(idx), "severity": verdict["severity"], "paid_wei": str(pay)}

    def _triage(self, target: str, scope: str, title: str, poc_url: str) -> dict:
        def grade() -> str:
            live = ""
            url = (poc_url or "").strip()
            if url.startswith("http"):
                try:
                    live = gl.nondet.web.get(url).body.decode("utf-8")[:4000]
                except Exception:
                    try:
                        live = gl.nondet.web.render(url, mode="text")[:4000]
                    except Exception:
                        live = "(PoC fetch failed)"
            prompt = f"""You are a security triager assessing a vulnerability report against a program scope.

TARGET: {target}
SCOPE: {scope}

REPORT: {title}
PROOF-OF-CONCEPT (fetched if URL):
{live or "(no PoC content)"}

Is it valid and in-scope? Assign severity: none/low/medium/high/critical (CVSS-style).
Reply ONLY JSON: {{"valid": true/false, "severity": "none|low|medium|high|critical", "reason": "<short>"}}"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(raw, dict):
                try:
                    raw = json.loads(str(raw))
                except Exception:
                    raw = {}
            return json.dumps(normalize_triage(raw))

        result = gl.eq_principle.prompt_comparative(
            grade,
            principle="The 'severity' tier and the 'valid' boolean must match across validators. Reason wording may differ.",
        )
        data = json.loads(result) if isinstance(result, str) else result
        if not validate_triage(data):
            data = normalize_triage(data if isinstance(data, dict) else {})
        return data

    @gl.public.view
    def get_scope(self, scope_id: str) -> dict:
        scope_id = str(scope_id)
        if scope_id not in self.scopes:
            return {"exists": False}
        s = json.loads(self.scopes[scope_id])
        s["exists"] = True
        return s

    @gl.public.view
    def get_report(self, scope_id: str, idx: str) -> dict:
        key = f"{str(scope_id)}:{str(idx)}"
        if key not in self.reports:
            return {"exists": False}
        r = json.loads(self.reports[key])
        r["exists"] = True
        return r

    @gl.public.view
    def stats(self) -> dict:
        return {"total_scopes": int(self.scope_count), "valid_reports": int(self.valid_reports), "paid_wei": str(int(self.paid_wei))}
