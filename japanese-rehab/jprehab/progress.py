"""進度模型：文法狀態、錯誤追蹤（active → corrected_once → stable）、PASS 判定。

這個模組是純邏輯（不做 I/O），所有規則集中在這裡，方便測試與調整。
"""
from .curriculum import CORE_CATEGORIES

STATUSES = ("not_started", "learning", "needs_work", "pass")
STATUS_NAMES = {"not_started": "未學習", "learning": "學習中", "needs_work": "待加強", "pass": "PASS"}
ERROR_STATE_NAMES = {"active": "尚未改正", "corrected_once": "已改正一次", "stable": "穩定掌握"}

# 只有「獨立造句」類型的作答可計入 PASS；活用練習(drill)只用來修正活用／接續錯誤。
PRODUCTION_TYPES = {"translate", "compose"}
CORRECTED_AFTER = 1     # 連續答對幾次 → 已改正一次
STABLE_AFTER = 3        # 連續答對幾次 → 穩定掌握
PASS_MIN_SCENARIOS = 2  # 至少幾種不同情境的獨立正確輸出
PASS_MIN_SESSIONS = 2   # 且必須分布在至少幾次不同的練習中（同一堂答對多題不等於掌握）
RECENT_KEEP = 12


def new_grammar_state(status="not_started", note=""):
    return {"status": status, "attempts": 0, "correct": 0, "scenarios_correct": [], "correct_sessions": [],
            "recent": [], "seen_exercises": [], "sessions": 0,
            "last_studied": None, "pass_date": None, "note": note}


def new_progress(curriculum, today):
    seed = curriculum.seed
    prog = {"version": 1, "created": today, "seed_as_of": seed.get("as_of"),
            "current_grammar_id": seed.get("current_grammar_id"),
            "grammar": {}, "errors": {}}
    for gid in curriculum.order:
        entry = seed["grammar"].get(gid, {})
        st = new_grammar_state(entry.get("status", "not_started"), entry.get("note", ""))
        if st["status"] == "pass":
            st["pass_date"] = f"{seed.get('as_of', today)} (匯入)"
        prog["grammar"][gid] = st
    for e in seed.get("errors", []):
        register_error(prog, e["grammar_id"], e["category"], e.get("signature", "general"),
                       e.get("description", ""), e.get("wrong", ""), e.get("right", ""),
                       seed.get("as_of", today), count=e.get("count", 1), state=e.get("state", "active"))
    return prog


def sync_with_curriculum(prog, curriculum):
    """教材新增文法後，補上缺少的狀態（不動既有進度）。"""
    for gid in curriculum.order:
        prog["grammar"].setdefault(gid, new_grammar_state())
    return prog


# ---------------------------------------------------------------- 錯誤追蹤

def error_key(gid, category, signature):
    return f"{gid}|{category}|{signature}"


def register_error(prog, gid, category, signature, description, wrong, right, date, count=1, state="active"):
    key = error_key(gid, category, signature)
    errs = prog["errors"]
    if key in errs:
        e = errs[key]
        e["count"] += 1
        e["last_seen"] = date
        e["state"] = "active"          # 再次出現 → 回到未改正
        e["consecutive_correct"] = 0
    else:
        e = errs[key] = {"key": key, "grammar_id": gid, "category": category, "signature": signature,
                         "description": description, "count": count, "first_seen": date,
                         "last_seen": date, "state": state,
                         "consecutive_correct": {"active": 0, "corrected_once": CORRECTED_AFTER,
                                                 "stable": STABLE_AFTER}[state], "examples": []}
    if wrong or right:
        e["examples"] = (e["examples"] + [{"wrong": wrong, "right": right, "date": date}])[-5:]
    if description and not e.get("description"):
        e["description"] = description
    return e


def advance_errors(prog, gid, categories=None):
    """該文法答對一次（未用提示）→ 相關錯誤的連續答對數 +1，並更新狀態。"""
    for e in prog["errors"].values():
        if e["grammar_id"] != gid or e["state"] == "stable":
            continue
        if categories is not None and e["category"] not in categories:
            continue
        e["consecutive_correct"] += 1
        if e["consecutive_correct"] >= STABLE_AFTER:
            e["state"] = "stable"
        elif e["consecutive_correct"] >= CORRECTED_AFTER:
            e["state"] = "corrected_once"


def errors_for(prog, gid, states=None):
    return [e for e in prog["errors"].values()
            if e["grammar_id"] == gid and (states is None or e["state"] in states)]


# ---------------------------------------------------------------- 作答記錄與狀態

def record_attempt(prog, gid, *, result, scenario, etype, hinted, errors, date, exercise_id=None, resolves=None,
                   session_id=None):
    """result: 'ok' | 'err' | 'nd'（nd = 句子可能沒問題，但沒有展現目標文法）。

    errors: [{grammar_id, category, signature, description, wrong, right}]
    回傳 (舊狀態, 新狀態)。
    """
    g = prog["grammar"][gid]
    old = g["status"]
    g["attempts"] += 1
    g["last_studied"] = date
    if exercise_id and exercise_id not in g["seen_exercises"]:
        g["seen_exercises"].append(exercise_id)
    if result == "ok":
        g["correct"] += 1
        if etype in PRODUCTION_TYPES and not hinted and scenario not in g["scenarios_correct"]:
            g["scenarios_correct"].append(scenario)
        if etype in PRODUCTION_TYPES and not hinted and session_id:
            sess = g.setdefault("correct_sessions", [])
            if session_id not in sess:
                sess.append(session_id)
    g["recent"] = (g["recent"] + [{"d": date, "r": result, "sc": scenario, "t": etype, "h": bool(hinted)}])[-RECENT_KEEP:]

    for er in errors:
        register_error(prog, er["grammar_id"], er["category"], er.get("signature", "general"),
                       er.get("description", ""), er.get("wrong", ""), er.get("right", ""), date)
        other = prog["grammar"].get(er["grammar_id"])
        if other and er["grammar_id"] != gid and other["status"] == "pass":
            update_status(prog, er["grammar_id"])  # 已 PASS 的舊文法在別處又出錯 → 可能降級

    if result == "ok" and not hinted:
        advance_errors(prog, gid, resolves)
    return old, update_status(prog, gid)


def _prod_recent(g):
    return [r for r in g["recent"] if r["t"] in PRODUCTION_TYPES]


def pass_check(prog, gid):
    """回傳 (是否達標, 尚缺條件清單)。"""
    g = prog["grammar"][gid]
    missing = []
    n_sc = len(set(g["scenarios_correct"]))
    if n_sc < PASS_MIN_SCENARIOS:
        missing.append(f"需要至少 {PASS_MIN_SCENARIOS} 種不同情境的獨立正確輸出（目前 {n_sc}）")
    n_sess = len(set(g.get("correct_sessions", [])))
    if n_sess < PASS_MIN_SESSIONS:
        missing.append(f"需要在至少 {PASS_MIN_SESSIONS} 次不同的練習中都獨立答對（目前 {n_sess}）")
    last2 = _prod_recent(g)[-2:]
    if len(last2) < 2 or any(r["r"] != "ok" or r["h"] for r in last2):
        missing.append("最近 2 次造句需都獨立答對（不看提示）")
    for e in errors_for(prog, gid):
        name = e["description"] or e["category"]
        if e["state"] == "active" and e["category"] in CORE_CATEGORIES:
            missing.append(f"核心錯誤尚未改正：{name}")
        elif e["count"] >= 2 and e["state"] != "stable" and e["category"] in CORE_CATEGORIES:
            missing.append(f"反覆出現的錯誤尚未穩定（需連續 {STABLE_AFTER} 次正確）：{name}")
    return (not missing), missing


def needs_work_condition(prog, gid):
    g = prog["grammar"][gid]
    last = g["recent"][-4:]
    if sum(1 for r in last if r["r"] == "err") >= 2:
        return True
    return any(e["state"] == "active" and e["count"] >= 2 and e["category"] in CORE_CATEGORIES
               for e in errors_for(prog, gid))


def update_status(prog, gid):
    g = prog["grammar"][gid]
    st = g["status"]
    if st == "pass":
        # 已 PASS：只有在有反覆的核心錯誤時才降級
        if any(e["state"] == "active" and e["count"] >= 2 and e["category"] in CORE_CATEGORIES
               and e["last_seen"] >= (g["pass_date"] or "")[:10]
               for e in errors_for(prog, gid)):
            g["status"] = "needs_work"
        return g["status"]
    if g["attempts"] == 0 and st == "not_started":
        return st
    ok, _ = pass_check(prog, gid)
    if ok:
        g["status"] = "pass"
        g["pass_date"] = g["recent"][-1]["d"] if g["recent"] else None
    elif needs_work_condition(prog, gid):
        g["status"] = "needs_work"
    else:
        g["status"] = "learning"
    return g["status"]


def set_status_manual(prog, gid, status, today):
    if status not in STATUSES:
        raise ValueError(f"status 必須是 {STATUSES}")
    g = prog["grammar"][gid]
    g["status"] = status
    g["pass_date"] = f"{today} (手動)" if status == "pass" else None
    if status == "not_started":
        g.update(attempts=0, correct=0, scenarios_correct=[], correct_sessions=[], recent=[], seen_exercises=[])


def counts(prog):
    c = {s: 0 for s in STATUSES}
    for g in prog["grammar"].values():
        c[g["status"]] += 1
    return c
