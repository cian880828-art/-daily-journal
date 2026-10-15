"""學習儀表板與查詢（純文字輸出）。"""
from . import progress as P
from . import scheduler as S
from .curriculum import AREA_NAMES


def render_dashboard(cur, prog, history):
    c = P.counts(prog)
    total = len(cur.order)
    learned = total - c["not_started"]
    out = ["═══ 學習儀表板 ═══", ""]
    out.append(f"已學習文法：{learned}／{total}　PASS：{c['pass']}　學習中：{c['learning']}　待加強：{c['needs_work']}　未學習：{c['not_started']}")
    out.append("")
    out.append("◆ 目前進行中")
    active = [g for g in cur.order if prog["grammar"][g]["status"] in ("learning", "needs_work")]
    for gid in active:
        g = prog["grammar"][gid]
        mark = "→ " if gid == prog.get("current_grammar_id") else "  "
        out.append(f"  {mark}{cur.title(gid)}（{P.STATUS_NAMES[g['status']]}）作答 {g['attempts']} 次，答對 {g['correct']}，"
                   f"不同情境正確 {len(g['scenarios_correct'])} 種")
    if not active:
        out.append("  （無）")
    out.append("")
    out.append("◆ 常見錯誤（依出現次數）")
    errs = sorted(prog["errors"].values(), key=lambda e: (-e["count"], e["key"]))
    for e in errs[:8]:
        out.append(f"  [{P.ERROR_STATE_NAMES[e['state']]}] {cur.title(e['grammar_id'])}｜{AREA_NAMES.get(e['category'], e['category'])}｜"
                   f"{e['description']}（{e['count']} 次，最近 {e['last_seen']}）")
    if not errs:
        out.append("  （尚無紀錄）")
    out.append("")
    out.append("◆ 最近學習紀錄")
    sess = [h for h in history if h.get("kind") == "session"][-5:]
    for h in reversed(sess):
        out.append(f"  {h['date']}  {cur.title(h['grammar_id'])}  {h['correct']}/{h['attempts']} 題正確  "
                   f"{P.STATUS_NAMES.get(h['status_before'], '')}→{P.STATUS_NAMES.get(h['status_after'], '')}"
                   f"{'' if h.get('completed', True) else '（中途結束）'}")
    if not sess:
        out.append("  （尚無紀錄）")
    out.append("")
    rec = S.recommend_next(prog, cur, history)
    out.append("◆ 下一堂建議")
    if rec["gid"]:
        out.append(f"  {cur.title(rec['gid'])}：{rec['reason']}")
        for n in rec["notes"]:
            out.append(f"    - {n}")
    else:
        out.append(f"  {rec['reason']}")
    return "\n".join(out)


def render_grammar_list(cur, prog, status=None):
    out = []
    for gid in cur.order:
        st = prog["grammar"][gid]["status"]
        if status and st != status:
            continue
        out.append(f"  {P.STATUS_NAMES[st]:<4} {gid:<22} {cur.title(gid)}")
    return "\n".join(out) or "  （沒有符合的文法）"


def render_grammar_detail(cur, prog, gid):
    g, st = cur.grammar[gid], prog["grammar"][gid]
    out = [f"{g['title']}（{gid}，{g['level']}）　狀態：{P.STATUS_NAMES[st['status']]}",
           f"意思：{g['meaning']}", f"接續：{g['connection']}", ""]
    for e in cur.examples(gid):
        out += [f"  {e['jp']}", f"  {e['kana']}", f"  {e['zh']}", ""]
    for m in g.get("mistakes", []):
        out.append(f"  ⚠ {m}")
    if st.get("note"):
        out.append(f"備註：{st['note']}")
    out.append(f"作答 {st['attempts']} 次，答對 {st['correct']}，不同情境正確：{', '.join(st['scenarios_correct']) or '無'}")
    return "\n".join(out)


def render_errors(cur, prog):
    errs = sorted(prog["errors"].values(), key=lambda e: (e["state"] == "stable", -e["count"]))
    out = []
    for e in errs:
        out.append(f"[{P.ERROR_STATE_NAMES[e['state']]}] {cur.title(e['grammar_id'])}｜{AREA_NAMES.get(e['category'], e['category'])}｜{e['description']}")
        out.append(f"    出現 {e['count']} 次（{e['first_seen']} ~ {e['last_seen']}），改正後連續答對 {e['consecutive_correct']} 次")
        for x in e["examples"][-2:]:
            out.append(f"    ✗ {x['wrong']}  ✓ {x['right']}")
    return "\n".join(out) or "（尚無錯誤紀錄）"


def render_history(cur, history, limit=15):
    att = [h for h in history if h.get("kind") == "attempt"][-limit:]
    out = []
    for h in att:
        mark = {"ok": "✓", "err": "✗", "nd": "△"}[h["result"]]
        out.append(f"{h['date']} {mark} [{cur.title(h['grammar_id'])}] {h['prompt'].splitlines()[0]}")
        out.append(f"      答：{h['answer']}" + (f"　→　{h['corrected']}" if h.get("corrected") else ""))
        for e in h.get("errors", []):
            out.append(f"      錯誤類型：{AREA_NAMES.get(e['category'], e['category'])}　{e['description']}")
    return "\n".join(out) or "（尚無紀錄）"
