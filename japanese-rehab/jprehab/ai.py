"""選用的 AI 批改（Claude API）。沒有 ANTHROPIC_API_KEY 或呼叫失敗時，自動退回本機規則＋自評。

只使用標準函式庫 urllib，不需安裝任何套件。
"""
import json
import os
import urllib.error
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-sonnet-5-5"
VALID_CATEGORIES = ("particle", "conjugation", "connection", "meaning", "naturalness", "other")

SYSTEM = """你是日文老師，學生是台灣人，過去有 JLPT N2 程度、10 年沒用日文，現在從 N4 重新復健。
請批改學生針對「目標文法」寫出的日文句子。原則：
1. 不要只比對唯一標準答案；只要文法正確、語意符合題目，任何合理的說法都算正確（verdict=correct）。
2. 文法沒錯但有更自然的說法，verdict=acceptable，並在 natural 給出更自然的版本，不要當成錯誤。
3. 真正的錯誤才用 verdict=incorrect。錯誤類型 category 只能是：particle(助詞)、conjugation(動詞活用)、connection(文法接續)、meaning(語意)、naturalness(自然度)、other。
4. uses_target_grammar：句子是否確實用了目標文法（用了別的正確文法來表達，則為 false）。
5. 說明用繁體中文（台灣用語），精簡，不要鼓勵性廢話。
只輸出一個 JSON 物件，不要其他文字，格式：
{"verdict":"correct|acceptable|incorrect","uses_target_grammar":true,
 "errors":[{"category":"...","message":"簡短原因","wrong":"錯的片段","right":"正確片段"}],
 "corrected":"修正後的完整句子（沒錯就留空字串）","natural":"更自然的說法（沒有就留空字串）","feedback":"一句話總評"}"""


def enabled() -> bool:
    if os.environ.get("JPREHAB_AI", "").lower() in ("off", "0", "false", "no"):
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _extract_json(text: str):
    a, b = text.find("{"), text.rfind("}")
    if a < 0 or b <= a:
        raise ValueError("no json in response")
    return json.loads(text[a:b + 1])


def grade(answer: str, exercise: dict, grammar: dict, timeout: int = 40) -> dict:
    """回傳正規化後的批改結果 dict；失敗時丟出例外，由呼叫端退回本機批改。"""
    key = os.environ["ANTHROPIC_API_KEY"]
    task = (f"目標文法：{grammar['title']}（{grammar['meaning']}）\n接續：{grammar['connection']}\n"
            f"題目類型：{exercise.get('type')}\n題目：{exercise.get('prompt_zh', '')}\n"
            f"參考答案（僅供參考，不是唯一答案）：{'；'.join(exercise.get('accepted', [])[:2]) or '（無）'}\n"
            f"學生的答案：{answer}")
    body = json.dumps({"model": os.environ.get("JPREHAB_AI_MODEL", DEFAULT_MODEL), "max_tokens": 700,
                       "system": SYSTEM, "messages": [{"role": "user", "content": task}]}).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, method="POST", headers={
        "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return normalize_ai_result(_extract_json(text))


def normalize_ai_result(raw: dict) -> dict:
    verdict = raw.get("verdict")
    if verdict not in ("correct", "acceptable", "incorrect"):
        raise ValueError(f"bad verdict: {verdict!r}")
    errors = []
    for e in raw.get("errors") or []:
        cat = e.get("category") if e.get("category") in VALID_CATEGORIES else "other"
        errors.append({"category": cat, "message": str(e.get("message", "")),
                       "wrong": str(e.get("wrong", "")), "right": str(e.get("right", ""))})
    return {"verdict": verdict, "uses_target_grammar": bool(raw.get("uses_target_grammar", True)),
            "errors": errors, "corrected": str(raw.get("corrected") or ""),
            "natural": str(raw.get("natural") or ""), "feedback": str(raw.get("feedback") or "")}
