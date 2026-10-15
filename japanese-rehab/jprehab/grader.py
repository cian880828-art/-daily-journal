"""批改：規則偵測 → 標準答案／關鍵片段 → （選用）AI → 自評。

原則：絕不只比對唯一標準答案。
  * 已知的確定錯誤（例如「なくでも」）由規則直接抓出並給出修正版。
  * 沒有命中錯誤規則時，只要關鍵文法片段齊全就接受不同說法（規則判定）。
  * 規則無法判斷時，有 AI 就交給 AI；否則請使用者對照參考答案自評。
"""
import re
from . import ai as ai_mod
from .textutil import normalize
from .curriculum import AREA_NAMES
from .drills import FORM_NAMES


def detect_errors(answer, patterns):
    """回傳 (errors, corrected_sentence)。"""
    errors, corrected = [], answer
    for p in patterns:
        m = re.search(p["regex"], answer)
        if not m:
            continue
        right = re.sub(p["regex"], p["fix"], m.group(0)) if p.get("fix") else ""
        errors.append({"grammar_id": p["grammar"], "category": p["category"], "signature": p["id"],
                       "description": p["message"], "message": p["message"],
                       "wrong": m.group(0), "right": right})
        if p.get("fix"):
            corrected = re.sub(p["regex"], p["fix"], corrected)
    return errors, (corrected if corrected != answer else "")


def _is_exact(answer, ex):
    n = normalize(answer)
    return any(n == normalize(a) for a in ex.get("accepted", []))


def _key_parts_ok(answer, ex):
    parts = ex.get("key_parts")
    if not parts:
        return False
    n = normalize(answer)
    return all(any(normalize(alt) in n for alt in group) for group in parts)


def _result(result, source, **kw):
    base = {"result": result, "source": source, "errors": [], "corrected": "", "natural": "",
            "feedback": "", "uncertain": False}
    base.update(kw)
    return base


def grade(answer, ex, curriculum, use_ai=True, ai_func=None):
    """回傳批改結果 dict。若 uncertain=True，呼叫端需再請使用者自評。"""
    gid = ex["grammar"]
    g = curriculum.grammar[gid]
    det_errors, det_corrected = detect_errors(answer, curriculum.patterns)

    if det_errors:
        return _result("err", "rule", errors=det_errors, corrected=det_corrected,
                       feedback="；".join(e["message"] for e in det_errors))

    if _is_exact(answer, ex):
        return _result("ok", "exact", feedback="與參考答案一致。")

    if ex["type"] == "drill":
        errs = _drill_error(answer, ex)
        return _result("err", "rule", errors=[errs], corrected=ex["accepted"][0], feedback=errs["message"])

    if use_ai and (ai_func or ai_mod.enabled()):
        try:
            r = (ai_func or (lambda a, e, gg: ai_mod.grade(a, e, gg)))(answer, ex, g)
        except Exception as exc:  # 網路或格式問題 → 退回本機批改
            note = f"（AI 批改失敗，改用本機規則：{type(exc).__name__}）"
            return _local(answer, ex, g, note)
        return _from_ai(r, gid)

    return _local(answer, ex, g, "")


def _local(answer, ex, g, note):
    if _key_parts_ok(answer, ex):
        return _result("ok", "rule", feedback=("關鍵文法片段齊全，規則判定正確（不同說法也接受）。" + note).strip())
    return _result("err", "self", uncertain=True,
                   feedback=("本機規則無法確定，請對照參考答案自評。" + note).strip())


def _from_ai(r, gid):
    errors = [{"grammar_id": gid, "category": e["category"], "signature": "ai-" + e["category"],
               "description": e["message"], "message": e["message"], "wrong": e["wrong"], "right": e["right"]}
              for e in r["errors"] if e["category"] != "naturalness"]
    if r["verdict"] == "incorrect":
        result = "err"
        if not errors:
            errors = [{"grammar_id": gid, "category": "other", "signature": "ai-other",
                       "description": r["feedback"] or "AI 判定有誤", "message": r["feedback"], "wrong": "", "right": ""}]
    elif not r["uses_target_grammar"]:
        result, errors = "nd", []
    else:
        result, errors = "ok", []
    return _result(result, "ai", errors=errors, corrected=r["corrected"], natural=r["natural"],
                   feedback=r["feedback"], verdict=r["verdict"])


def _drill_error(answer, ex):
    n = normalize(answer)
    suffix_ok = any(n.endswith(normalize(s)) for s in _suffixes(ex))
    category = "conjugation" if suffix_ok else "connection"
    msg = ("語尾接續正確，但前面的活用形有誤。" if suffix_ok else "後面接的形式有誤，請對照接續規則。")
    return {"grammar_id": ex["grammar"], "category": category, "signature": f"drill-{ex.get('form', 'x')}",
            "description": f"活用練習錯誤：{FORM_NAMES.get(ex.get('form'), ex.get('form'))}（{AREA_NAMES[category]}）", "message": msg,
            "wrong": answer, "right": ex["accepted"][0]}


def _suffixes(ex):
    common = ["てもいい", "てもいいです", "てはいけない", "てはいけません", "かもしれない", "かもしれません",
              "ことができる", "ことができます", "ばならない", "ばなりません", "たい", "たいです", "ながら",
              "すぎる", "すぎます", "ほうがいい", "ほうがいいです", "ことがある", "ことがあります", "みる", "みます"]
    # 取標準答案共同的結尾作為「語尾」
    acc = ex["accepted"][0]
    return [s for s in common if acc.endswith(s)] or [acc[-2:]]


def apply_self_grade(res, gid, answer, choice, category=None, note=""):
    """把使用者自評寫回批改結果。choice: ok | err | nd | natural。"""
    res = dict(res, source="self", uncertain=False)
    if choice == "ok":
        res["result"] = "ok"
    elif choice == "natural":
        res["result"] = "ok"
        res["feedback"] = (res.get("feedback", "") + " 自評：文法正確但不太自然。").strip()
    elif choice == "nd":
        res["result"] = "nd"
    else:
        res["result"] = "err"
        cat = category or "other"
        res["errors"] = [{"grammar_id": gid, "category": cat, "signature": "self-" + cat,
                          "description": note or f"自評：{AREA_NAMES.get(cat, cat)}錯誤",
                          "message": note, "wrong": answer, "right": ""}]
    return res
