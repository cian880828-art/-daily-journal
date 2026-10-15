"""自動安排下一堂課。每次都從目前進度與歷史紀錄出發，不只看上一堂。"""
import random
from . import progress as P
from . import drills as D

TRAVEL_SOFT_LIMIT = 1   # 最近 3 堂課中旅行情境最多出現幾次（避免過度依賴旅行）
MODES = ("full", "review", "dialogue", "translate", "compose", "mixed", "correction")


def pick_main(prog, curriculum, force=None):
    """決定這堂課的主要文法，回傳 (gid, 原因)；全部 PASS 則 (None, 原因)。"""
    if force:
        return force, "手動指定"
    st = lambda gid: prog["grammar"][gid]["status"]
    cur = prog.get("current_grammar_id")
    if cur and st(cur) in ("learning", "needs_work"):
        label = P.STATUS_NAMES[st(cur)]
        return cur, f"目前學習中的文法（{label}），尚未 PASS，繼續練習"
    for wanted, why in (("needs_work", "有「待加強」的文法，優先處理"), ("learning", "有「學習中」的文法尚未 PASS，優先處理")):
        for gid in curriculum.order:
            if st(gid) == wanted:
                return gid, why
    for gid in curriculum.order:
        if st(gid) == "not_started":
            return gid, "目前沒有未 PASS 的文法，依順序進入下一項"
    return None, "所有文法都已 PASS"


def recent_session_scenarios(history, k=3):
    sess = [h for h in history if h.get("kind") == "session"]
    return [h.get("scenario") for h in sess[-k:]]


def pick_scenario(prog, curriculum, gid, history, rng, forced=None):
    if forced:
        return forced
    names = list(curriculum.scenarios)
    g = prog["grammar"][gid]
    recent = recent_session_scenarios(history)
    scored = []
    for sc in names:
        score = 0
        score += 2 if sc not in g["scenarios_correct"] else 0
        score += 1 if sc not in recent else 0
        if sc == "travel" and recent.count("travel") >= TRAVEL_SOFT_LIMIT:
            score -= 2
        scored.append((score + rng.random() * 0.5, sc))
    return max(scored)[1]


def pick_warmup(prog, curriculum, main_gid, rng):
    """挑一題「別的文法」的複習題：優先處理尚未穩定的錯誤，題目要是沒做過的。"""
    cands = []
    for e in prog["errors"].values():
        if e["grammar_id"] == main_gid or e["state"] == "stable":
            continue
        cands.append((0 if e["state"] == "active" else 1, e["last_seen"], e["grammar_id"]))
    for _, _, gid in sorted(cands):
        seen = set(prog["grammar"][gid]["seen_exercises"])
        pool = [x for x in curriculum.exercises_for(gid) if x["id"] not in seen]
        if pool:
            return rng.choice(pool)
    return None


def _desired_level(g):
    return 1 if g["correct"] < 2 else (2 if g["correct"] < 5 else 3)


def generic_compose(prog, curriculum, gid, n_idx, rng, scenario_pref=None):
    """沒有手寫題時，由情境庫＋目標文法產生自由造句題，並逐步要求混用舊文法。"""
    g = prog["grammar"][gid]
    names = [s for s in curriculum.scenarios if s != "travel" or rng.random() < 0.3]
    sc = scenario_pref or rng.choice([s for s in names if s not in g["scenarios_correct"]] or names)
    sinfo = curriculum.scenarios[sc]
    gram = curriculum.grammar[gid]
    prompt = f"【{sinfo['name']}】{rng.choice(sinfo['prompts'])}\n請用「{gram['title']}」說 1 句話。"
    uses = []
    if g["correct"] >= 2:
        passed = [x for x in curriculum.order if x != gid and prog["grammar"][x]["status"] == "pass"
                  and curriculum.grammar[x]["level"] != "N5"]
        if passed:
            mix = rng.choice(passed)
            uses = [mix]
            prompt += f"\n（進階：同時加上「{curriculum.title(mix)}」，讓句子更長）"
    return {"id": f"gen-{gid}-{rng.randrange(10**6)}-{n_idx}", "grammar": gid, "scenario": sc,
            "type": "compose", "level": _desired_level(g), "prompt_zh": prompt, "accepted": [],
            "key_parts": None, "uses": uses, "hint": f"接續：{gram['connection']}"}


def pick_exercises(prog, curriculum, gid, n, rng, kind=None, prefer_mixed=False):
    g = prog["grammar"][gid]
    seen = set(g["seen_exercises"])
    pool = [e for e in curriculum.exercises_for(gid) if e["id"] not in seen]
    if kind:
        pool = [e for e in pool if e["type"] == kind]
    if kind == "compose":
        pool = []
    want = _desired_level(g)
    chosen, used_sc = [], set()
    for _ in range(n):
        if not pool:
            break

        def key(e):
            return (0 if (prefer_mixed and e.get("uses")) else 1,
                    1 if e["scenario"] in used_sc else 0,
                    abs(e["level"] - want),
                    1 if e["scenario"] in g["scenarios_correct"] else 0,
                    rng.random())
        pick = min(pool, key=key)
        pool.remove(pick)
        chosen.append(pick)
        used_sc.add(pick["scenario"])
    i = 0
    while len(chosen) < n:
        chosen.append(generic_compose(prog, curriculum, gid, i, rng))
        i += 1
    return chosen


def plan_lesson(prog, curriculum, history, *, mode="full", force_gid=None, scenario=None, n=3, rng=None):
    rng = rng or random.Random()
    gid, reason = pick_main(prog, curriculum, force_gid)
    if gid is None:
        return {"gid": None, "reason": reason}
    sc = pick_scenario(prog, curriculum, gid, history, rng, scenario)
    plan = {"gid": gid, "reason": reason, "scenario": sc, "mode": mode,
            "show_review": mode in ("full", "review", "dialogue", "mixed"),
            "show_dialogue": mode in ("full", "review", "dialogue"),
            "warmup": None, "drills": [], "exercises": []}
    if mode in ("review", "dialogue"):
        return plan

    # 針對性練習：該文法還有未穩定的活用／接續錯誤 → 先做活用練習
    unstable = [e for e in P.errors_for(prog, gid, states=("active", "corrected_once"))
                if e["category"] in ("conjugation", "connection")]
    if D.has_drills(gid) and (unstable or mode == "correction"):
        plan["drills"] = D.make_drills(curriculum, gid, 3 if mode == "correction" else 2, rng)
    if mode in ("full", "mixed"):
        plan["warmup"] = pick_warmup(prog, curriculum, gid, rng)
    if mode == "correction":
        n = 1
    kind = {"translate": "translate", "compose": "compose"}.get(mode)
    plan["exercises"] = pick_exercises(prog, curriculum, gid, n, rng, kind=kind, prefer_mixed=(mode == "mixed"))
    return plan


def recommend_next(prog, curriculum, history):
    """儀表板用：下一堂建議內容（不產生題目，不修改進度）。"""
    gid, reason = pick_main(prog, curriculum)
    if gid is None:
        return {"gid": None, "reason": reason, "notes": []}
    notes = []
    for e in P.errors_for(prog, gid, states=("active", "corrected_once")):
        notes.append(f"針對錯誤：{e['description']}（{P.ERROR_STATE_NAMES[e['state']]}）")
    ok, missing = P.pass_check(prog, gid)
    notes += [f"PASS 還缺：{m}" for m in missing]
    return {"gid": gid, "reason": reason, "notes": notes}
