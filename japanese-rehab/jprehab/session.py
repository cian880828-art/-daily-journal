"""互動式課程：Step 1 確認進度 → 2 範例複習 → 3 情境對話 → 4 短句輸出 → 5 訂正 → 6 PASS 判定 → 7 更新紀錄。"""
import random
from . import progress as P
from . import scheduler as S
from . import grader as G
from . import store
from .curriculum import AREA_NAMES

LINE = "─" * 44
TYPE_NAMES = {"translate": "中翻日", "compose": "自行造句", "drill": "活用練習"}
CATEGORY_MENU = ["particle", "conjugation", "connection", "meaning", "naturalness", "other"]


class Quit(Exception):
    pass


def say(text=""):
    print(text)


def ask(prompt):
    try:
        return input(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        raise Quit()


def show_example(jp, kana, zh, indent="  "):
    say(f"{indent}{jp}")
    say(f"{indent}{kana}")
    say(f"{indent}{zh}")


# ------------------------------------------------------------------ Step 1-3

def show_progress_summary(prog, cur, plan, history):
    gid = plan["gid"]
    g = prog["grammar"][gid]
    c = P.counts(prog)
    say(f"Step 1｜目前進度")
    say(f"  主要文法：{cur.title(gid)}（{P.STATUS_NAMES[g['status']]}）")
    say(f"  選擇原因：{plan['reason']}")
    say(f"  PASS {c['pass']}／學習中 {c['learning']}／待加強 {c['needs_work']}／未學習 {c['not_started']}")
    open_errs = [e for e in P.errors_for(prog, gid) if e["state"] != "stable"]
    for e in open_errs:
        say(f"  · 追蹤中的錯誤：{e['description']}（{P.ERROR_STATE_NAMES[e['state']]}，出現 {e['count']} 次）")
    ok, missing = P.pass_check(prog, gid)
    for m in missing:
        say(f"  · PASS 還缺：{m}")
    say()


def show_review(cur, gid, scenario):
    g = cur.grammar[gid]
    say(f"Step 2｜範例複習：{g['title']}")
    say(f"  意思：{g['meaning']}")
    say(f"  接續：{g['connection']}")
    say()
    exs = sorted(cur.examples(gid), key=lambda e: e["scenario"] != scenario)[:4]
    for e in exs:
        say(f"  【{cur.scenario_name(e['scenario'])}】")
        show_example(e["jp"], e["kana"], e["zh"], indent="    ")
    for m in g.get("mistakes", []):
        say(f"  ⚠ 常見錯誤：{m}")
    for c in g.get("confusable", []):
        name = cur.title(c["with"]) if c["with"] in cur.grammar else c["with"]
        say(f"  ≠ 容易混淆 {name}：{c['note']}")
    say()


def show_dialogue(cur, gid, scenario):
    dlgs = cur.grammar[gid].get("dialogues") or []
    if not dlgs:
        return
    d = next((x for x in dlgs if x["scenario"] == scenario), dlgs[0])
    say(f"Step 3｜情境對話：{cur.scenario_name(d['scenario'])}")
    for jp, kana, zh in d["lines"]:
        show_example(jp, kana, zh, indent="  ")
        say()


# ------------------------------------------------------------------ Step 4-5

def _self_grade(res, ex, gid, answer, cur):
    say(f"  {LINE}")
    say("  本機規則無法確定這句是否正確，請對照下面的資訊自評。")
    if ex.get("accepted"):
        say(f"  參考答案（不是唯一答案）：{ex['accepted'][0]}")
    g = cur.grammar[gid]
    say(f"  接續規則：{g['connection']}")
    import re
    hit = bool(re.search(g.get("use_re", "$^"), answer))
    say(f"  {'偵測到' if hit else '沒偵測到'}目標文法的常見寫法。")
    say("  你的句子：  1 正確   2 有錯   3 意思對但沒用到目標文法   4 文法正確但不太自然")
    choice = {"1": "ok", "2": "err", "3": "nd", "4": "natural"}.get(ask("  自評 (1-4) > "), "err")
    cat, note = None, ""
    if choice == "err":
        say("  錯誤類型：" + "  ".join(f"{i + 1} {AREA_NAMES[c]}" for i, c in enumerate(CATEGORY_MENU)))
        sel = ask("  類型 (1-6) > ")
        cat = CATEGORY_MENU[int(sel) - 1] if sel.isdigit() and 1 <= int(sel) <= 6 else "other"
        note = ask("  簡單描述錯在哪（可留空）> ")
    return G.apply_self_grade(res, gid, answer, choice, cat, note)


def show_correction(res, ex, answer):
    say(f"  {LINE}")
    if res["result"] == "ok":
        say("  ✓ 正確" + {"exact": "（與參考答案一致）", "rule": "（規則判定）", "ai": "（AI 批改）", "self": "（自評）"}[res["source"]])
    elif res["result"] == "nd":
        say("  △ 句子本身可以，但沒有用到這次的目標文法，這題不計入通過條件。")
    else:
        say("  ✗ 需要訂正")
    if res["result"] != "ok" or res.get("corrected"):
        say(f"  原句：{answer}")
    fix = res.get("corrected") or (ex["accepted"][0] if res["result"] != "ok" and ex.get("accepted") else "")
    if fix:
        say(f"  修正：{fix}")
    for e in res["errors"]:
        wrong = f"「{e['wrong']}」→「{e['right']}」：" if e.get("wrong") and e.get("right") else "："
        say(f"  原因【{AREA_NAMES.get(e['category'], e['category'])}】{wrong}{e.get('message') or e.get('description', '')}")
    if res.get("feedback") and not res["errors"]:
        say(f"  說明：{res['feedback']}")
    if res.get("natural"):
        say(f"  更自然的說法：{res['natural']}")
    if res["result"] == "ok" and res["source"] in ("rule", "self") and ex.get("accepted"):
        say(f"  參考：{ex['accepted'][0]}")


def run_item(idx, total, ex, ctx):
    cur, prog = ctx["cur"], ctx["prog"]
    gid = ex["grammar"]
    label = TYPE_NAMES[ex["type"]]
    tag = f"（複習：{cur.title(gid)}）" if gid != ctx["main_gid"] else ""
    sc = "" if ex["scenario"] == "drill" else f"｜{cur.scenario_name(ex['scenario'])}"
    say(f"[{idx}/{total}] {label}{sc}{tag}")
    say(f"  {ex['prompt_zh']}")
    say("  （? 看提示，s 跳過，q 結束今天的練習）")
    hinted = False
    while True:
        answer = ask("  你的答案 > ")
        if answer == "q":
            raise Quit()
        if answer == "s":
            say("  已跳過（不計入紀錄）。\n")
            return None
        if answer == "?":
            hinted = True
            say(f"  提示：{ex.get('hint') or cur.grammar[gid]['connection']}（這題不算獨立輸出）")
            continue
        if answer:
            break
    res = G.grade(answer, ex, cur, use_ai=ctx["use_ai"], ai_func=ctx.get("ai_func"))
    if res["uncertain"]:
        res = _self_grade(res, ex, gid, answer, cur)
    show_correction(res, ex, answer)

    errors = res["errors"]
    old, new = P.record_attempt(prog, gid, result=res["result"], scenario=ex["scenario"], etype=ex["type"],
                                hinted=hinted, errors=errors, date=ctx["date"], exercise_id=ex["id"],
                                resolves=set(ex["resolves"]) if ex.get("resolves") else None,
                                session_id=ctx["session_id"])
    ctx["touched"].setdefault(gid, old)
    store.append_history({"kind": "attempt", "session_id": ctx["session_id"], "date": ctx["date"],
                          "grammar_id": gid, "exercise_id": ex["id"], "type": ex["type"],
                          "scenario": ex["scenario"], "prompt": ex["prompt_zh"], "answer": answer,
                          "hinted": hinted, "result": res["result"], "source": res["source"],
                          "corrected": res.get("corrected") or (ex["accepted"][0] if res["result"] == "err" and ex.get("accepted") else ""),
                          "natural": res.get("natural", ""), "feedback": res.get("feedback", ""),
                          "errors": [{k: e.get(k, "") for k in ("grammar_id", "category", "signature", "description", "wrong", "right")} for e in errors]})
    store.save_progress(prog)  # 每題都存檔：中途關閉也不會遺失
    ctx["results"].append((gid, res["result"], hinted))
    if new != old:
        say(f"  ⇒ 「{cur.title(gid)}」狀態：{P.STATUS_NAMES[old]} → {P.STATUS_NAMES[new]}")
    say()
    return res


# ------------------------------------------------------------------ 主流程

def run_today(cur, prog, history, *, mode="full", force_gid=None, scenario=None, n=3, use_ai=True,
              rng=None, ai_func=None):
    rng = rng or random.Random()
    date = store.today_str()
    plan = S.plan_lesson(prog, cur, history, mode=mode, force_gid=force_gid, scenario=scenario, n=n, rng=rng)
    say(f"═══ 今日練習 {date} ═══\n")
    if plan["gid"] is None:
        say("所有文法都已 PASS。可用 `grammar` 指令查看，或在 data/grammar.json 加入新文法。")
        return
    gid = plan["gid"]
    prog["session_counter"] = prog.get("session_counter", 0) + 1
    ctx = {"cur": cur, "prog": prog, "date": date, "use_ai": use_ai, "ai_func": ai_func, "main_gid": gid,
           "session_id": f"{date}-{prog['session_counter']}", "results": [], "touched": {}}
    status_before = prog["grammar"][gid]["status"]

    show_progress_summary(prog, cur, plan, history)
    completed = True
    try:
        if plan["show_review"]:
            show_review(cur, gid, plan["scenario"])
        if plan["show_dialogue"]:
            show_dialogue(cur, gid, plan["scenario"])
        items = ([plan["warmup"]] if plan["warmup"] else []) + plan["drills"] + plan["exercises"]
        if items:
            say(f"Step 4｜短句輸出（共 {len(items)} 題）\n")
            extras, i = 0, 0
            while i < len(items):
                res = run_item(i + 1, len(items), items[i], ctx)
                if res and res["result"] == "err" and items[i]["type"] == "drill" and extras < 2:
                    from . import drills as D
                    more = D.make_drills(cur, items[i]["grammar"], 1, rng)
                    if more:
                        items.insert(i + 1, more[0])  # 活用錯誤 → 立刻補一題同類型練習
                        extras += 1
                i += 1
        elif plan["mode"] in ("review", "dialogue"):
            ask("看完後按 Enter 結束 > ")
    except Quit:
        completed = False
        say("\n（已中途結束，作答過的題目都已存檔。）")
    finish(cur, prog, plan, ctx, status_before, completed)


def finish(cur, prog, plan, ctx, status_before, completed):
    gid = plan["gid"]
    say(f"Step 6/7｜判定與紀錄")
    if not ctx["results"]:
        prog["session_counter"] -= 1
        store.save_progress(prog)
        say("  這次沒有作答，不更新進度。")
        return
    for g_id in ctx["touched"]:
        prog["grammar"][g_id]["sessions"] += 1
    oks = sum(1 for _, r, _ in ctx["results"] if r == "ok")
    say(f"  本次作答 {len(ctx['results'])} 題，正確 {oks} 題")
    for g_id, old in ctx["touched"].items():
        new = prog["grammar"][g_id]["status"]
        note = "（無變化）" if new == old else "（已變更）"
        say(f"  · {cur.title(g_id)}：{P.STATUS_NAMES[old]} → {P.STATUS_NAMES[new]} {note}")
    g = prog["grammar"][gid]
    if g["status"] == "pass":
        say(f"  🎉 「{cur.title(gid)}」達到 PASS 標準，進入下一項。")
        if prog.get("current_grammar_id") == gid:
            prog["current_grammar_id"] = None
    else:
        ok, missing = P.pass_check(prog, gid)
        for m in missing:
            say(f"  · 距離 PASS：{m}")
        prog["current_grammar_id"] = gid
    nxt, why = S.pick_main(prog, cur)
    if g["status"] == "pass" and nxt:
        prog["current_grammar_id"] = nxt
    store.append_history({"kind": "session", "session_id": ctx["session_id"], "date": ctx["date"],
                          "grammar_id": gid, "scenario": plan["scenario"], "mode": plan["mode"],
                          "reason": plan["reason"], "completed": completed,
                          "attempts": len(ctx["results"]), "correct": oks,
                          "status_before": status_before, "status_after": g["status"],
                          "next_grammar_id": nxt, "touched": list(ctx["touched"])})
    store.save_progress(prog)
    say(f"  下次從這裡開始：{cur.title(nxt) if nxt else '（全部完成）'}　{why}")
