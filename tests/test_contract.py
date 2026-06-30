"""SecBounty tests: triage guards, tier payout math, and full post→submit→triage→pay flow."""

P = 10**18   # 1 GEN pool


def test_normalize_triage(contract):
    n = contract.normalize_triage
    assert n({"valid": True, "severity": "high", "reason": "RCE"})["severity"] == "high"
    assert n({"valid": False, "severity": "critical", "reason": "x"})["severity"] == "none"   # invalid -> none
    assert n({})["valid"] is False and n({})["severity"] == "none"
    assert n({"valid": "yes", "severity": "LOW", "reason": "x"})["severity"] == "low"

def test_validate_triage(contract):
    v = contract.validate_triage
    assert v({"valid": True, "severity": "medium", "reason": "stored XSS"})
    assert not v({"valid": "true", "severity": "low", "reason": "x"})
    assert not v({"valid": True, "severity": "sev5", "reason": "x"})
    assert not v({"valid": True, "severity": "low", "reason": "  "})

def test_payout_for(contract):
    p = contract.payout_for
    assert p("critical", 1000) == 500
    assert p("high", 1000) == 250
    assert p("medium", 1000) == 100
    assert p("low", 1000) == 50
    assert p("none", 1000) == 0


def _new(contract):
    return contract, contract.SecBounty()

def test_post_requires_min_pool(contract):
    mod, c = _new(contract)
    mod.gl.message.value = 10**14
    try:
        c.post_scope("acme.com", "web"); assert False, "low pool should fail"
    except Exception:
        pass
    mod.gl.message.value = 0

def test_full_triage_pays_by_tier(contract):
    mod, c = _new(contract)
    mod.gl.message.sender_address = "0xAAa0000000000000000000000000000000000001"; mod.gl.message.value = P
    sid = c.post_scope("acme.com", "Web app, auth + payments in scope")
    mod.gl.message.value = 0
    mod.gl.message.sender_address = "0xBBb0000000000000000000000000000000000002"
    ridx = c.submit_report(sid, "Auth bypass via JWT none-alg", "https://poc.example/jwt")
    # validators grade it HIGH (25% of pool)
    mod.gl.nondet.exec_prompt = staticmethod(lambda *a, **k: {"valid": True, "severity": "high", "reason": "auth bypass"})
    out = c.triage(sid, ridx)
    assert out["severity"] == "high" and out["paid_wei"] == str(P // 4)
    rep = c.get_report(sid, ridx)
    assert rep["paid_wei"] == str(P // 4) and rep["valid"] is True
    sc = c.get_scope(sid)
    assert sc["remaining_wei"] == str(P - P // 4)
    st = c.stats()
    assert st["valid_reports"] == 1 and st["paid_wei"] == str(P // 4)
    mod.gl.nondet.exec_prompt = staticmethod(lambda *a, **k: {})
    mod.gl.message.sender_address = "0xa000000000000000000000000000000000000001"

def test_invalid_report_pays_zero(contract):
    mod, c = _new(contract)
    mod.gl.message.value = P
    sid = c.post_scope("x.com", "scope")
    mod.gl.message.value = 0
    ridx = c.submit_report(sid, "not a bug", "")
    out = c.triage(sid, ridx)   # offline default invalid -> none -> 0
    assert out["paid_wei"] == "0" and out["severity"] == "none"
