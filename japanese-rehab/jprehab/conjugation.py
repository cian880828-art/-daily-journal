"""日文動詞活用（含漢字與假名兩種寫法），供活用練習自動產生標準答案。"""

GODAN = {  # 辭書形語尾 -> (あ段, い段, え段)
    "う": ("わ", "い", "え"), "く": ("か", "き", "け"), "ぐ": ("が", "ぎ", "げ"),
    "す": ("さ", "し", "せ"), "つ": ("た", "ち", "て"), "ぬ": ("な", "に", "ね"),
    "ぶ": ("ば", "び", "べ"), "む": ("ま", "み", "め"), "る": ("ら", "り", "れ"),
}
TE_TA = {"う": "っ", "つ": "っ", "る": "っ", "む": "ん", "ぶ": "ん", "ぬ": "ん",
         "く": "い", "ぐ": "い", "す": "し"}

FORMS = ("dict", "masu_stem", "masu", "nai", "nai_ku", "nai_kere", "ta", "te")


def conjugate(verb: dict, form: str, script: str = "kanji") -> str:
    """script: 'kanji'（用 kanji 欄位）或 'kana'。"""
    s = verb[script]
    group = verb["group"]
    if form == "dict":
        return s
    if group == "kuru":
        pre_a = "来" if script == "kanji" else "こ"
        pre_i = "来" if script == "kanji" else "き"
        table = {"masu_stem": pre_i, "masu": pre_i + "ます", "nai": pre_a + "ない",
                 "nai_ku": pre_a + "なく", "nai_kere": pre_a + "なけれ",
                 "ta": pre_i + "た", "te": pre_i + "て"}
        return table[form]
    if group == "suru":
        base = s[:-2]
        table = {"masu_stem": base + "し", "masu": base + "します", "nai": base + "しない",
                 "nai_ku": base + "しなく", "nai_kere": base + "しなけれ",
                 "ta": base + "した", "te": base + "して"}
        return table[form]
    if group == "ichidan":
        base = s[:-1]
        table = {"masu_stem": base, "masu": base + "ます", "nai": base + "ない",
                 "nai_ku": base + "なく", "nai_kere": base + "なけれ",
                 "ta": base + "た", "te": base + "て"}
        return table[form]
    if group == "godan":
        base, end = s[:-1], s[-1]
        a, i, _e = GODAN[end]
        if s in ("行く", "いく"):
            te_stem = base + "っ"
        else:
            te_stem = base + TE_TA[end]
        voiced = end in ("む", "ぶ", "ぬ", "ぐ")
        ta = te_stem + ("だ" if voiced else "た")
        te = te_stem + ("で" if voiced else "て")
        if end == "す":
            ta, te = base + "した", base + "して"
        table = {"masu_stem": base + i, "masu": base + i + "ます", "nai": base + a + "ない",
                 "nai_ku": base + a + "なく", "nai_kere": base + a + "なけれ", "ta": ta, "te": te}
        return table[form]
    raise ValueError(f"unknown verb group: {group}")


def all_scripts(verb: dict, form: str):
    """回傳漢字、假名兩種寫法（去重）。"""
    out = []
    for sc in ("kanji", "kana"):
        v = conjugate(verb, form, sc)
        if v not in out:
            out.append(v)
    return out
