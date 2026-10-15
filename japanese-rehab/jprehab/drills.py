"""活用／接續練習：以規則自動產生題目與標準答案（可離線精準批改）。"""
import random
from .conjugation import all_scripts

# gid -> (動詞形, [後綴], 題目說明)
VERB_TEMPLATES = {
    "N4-nakutemo-ii":      ("nai_ku", ["てもいい", "てもいいです", "てもよい"], "不用～也可以（～なくてもいい）"),
    "N4-nakutewa-ikenai":  ("nai_ku", ["てはいけない", "てはいけません", "てはならない"], "必須～（～なくてはいけない）"),
    "N4-nakereba-naranai": ("nai_kere", ["ばならない", "ばなりません"], "必須～（～なければならない）"),
    "N4-koto-ga-dekiru":   ("dict", ["ことができる", "ことができます"], "能夠～（～ことができる）"),
    "N4-temo-ii":          ("te", ["もいい", "もいいです"], "可以～（～てもいい）"),
    "N4-tewa-ikenai":      ("te", ["はいけない", "はいけません"], "不可以～（～てはいけない）"),
    "N5-tai":              ("masu_stem", ["たい", "たいです"], "想～（～たい）"),
    "N4-nagara":           ("masu_stem", ["ながら"], "一邊～（～ながら）"),
    "N4-sugiru":           ("masu_stem", ["すぎる", "すぎます", "すぎた", "すぎました"], "太過～（～すぎる）"),
    "N4-hou-ga-ii":        ("ta", ["ほうがいい", "ほうがいいです", "方がいい", "方がいいです"], "最好～（～たほうがいい）"),
    "N4-te-miru":          ("te", ["みる", "みます", "みたい", "みたいです"], "試試看（～てみる）"),
    "N4-koto-ga-aru":      ("ta", ["ことがある", "ことがあります"], "曾經～（～たことがある）"),
}
FORM_NAMES = {"dict": "辭書形", "masu_stem": "ます形去ます", "nai_ku": "ない形去い＋く", "nai_kere": "ない形去い＋けれ",
              "te": "て形", "ta": "た形"}
PLAIN_FORMS = {"masu": "ます形", "nai": "ない形", "ta": "た形", "te": "て形"}
GENERIC_GID = "N5-verb-forms"


def has_drills(gid):
    return gid in VERB_TEMPLATES or gid in ("N4-kamoshirenai", GENERIC_GID)


def _mk(gid, idx, prompt, accepted, hint, form):
    return {"id": f"drill-{gid}-{idx}", "grammar": gid, "scenario": "drill", "type": "drill",
            "level": 1, "prompt_zh": prompt, "accepted": accepted, "hint": hint,
            "form": form, "resolves": ["conjugation", "connection"]}


def _combine(stems, suffixes):
    return [s + x for s in stems for x in suffixes]


def _verb_item(gid, v, rng):
    form, suffixes, label = VERB_TEMPLATES[gid]
    stems = all_scripts(v, form)
    prompt = f"把「{v['kanji']}（{v['kana']}／{v['gloss']}）」變成：{label}"
    hint = f"先變成「{FORM_NAMES[form]}」：{all_scripts(v, form)[-1]}，再接「{suffixes[0]}」"
    return prompt, _combine(stems, suffixes), hint, form


def _extra_item(gid, vocab, rng):
    """名詞／形容詞的接續（nakutemo-ii、kamoshirenai 才有）。"""
    if gid == "N4-nakutemo-ii":
        kind = rng.choice(["i", "na", "n"])
        if kind == "i":
            w = rng.choice(vocab["i_adjectives"])
            stems = [w["kanji"][:-1] + "くなく", w["kana"][:-1] + "くなく"]
            return (f"把「{w['kanji']}（{w['kana']}／{w['gloss']}）」變成：不～也可以（～くなくてもいい）",
                    _combine(stems, ["てもいい", "てもいいです"]), "い形容詞：去い＋くなくてもいい", "adj-i")
        w = rng.choice(vocab["na_adjectives"] if kind == "na" else vocab["nouns"])
        stems = [w["kanji"] + "でなく", w["kana"] + "でなく"]
        return (f"把「{w['kanji']}（{w['kana']}／{w['gloss']}）」變成：不是～也可以（～でなくてもいい）",
                _combine(stems, ["てもいい", "てもいいです"]), "名詞・な形容詞：＋でなくてもいい", "noun")
    if gid == "N4-kamoshirenai":
        kind = rng.choice(["i", "na", "n"])
        pool = {"i": vocab["i_adjectives"], "na": vocab["na_adjectives"], "n": vocab["nouns"]}[kind]
        w = rng.choice(pool)
        hint = {"i": "い形容詞：普通形（高い）直接接かもしれない",
                "na": "な形容詞：語幹直接接かもしれない（不加だ／な）",
                "n": "名詞：直接接かもしれない（不加だ／な）"}[kind]
        stems = [w["kanji"], w["kana"]]
        return (f"把「{w['kanji']}（{w['kana']}／{w['gloss']}）」變成：可能～（～かもしれない）",
                _combine(stems, ["かもしれない", "かもしれません"]), hint, "adj-" + kind)
    return None


def make_drills(curriculum, gid, n=2, rng=None, avoid=()):
    rng = rng or random.Random()
    vocab = curriculum.vocab
    verbs = [v for v in vocab["verbs"] if v["kanji"] not in avoid] or vocab["verbs"]
    godan = [v for v in verbs if v["group"] == "godan"]
    other = [v for v in verbs if v["group"] != "godan"]
    items, idx = [], rng.randrange(1000)
    if gid == GENERIC_GID:
        order = [godan, other, godan, other]
        for i in range(n):
            v = rng.choice(order[i % 4] or verbs)
            form = rng.choice(list(PLAIN_FORMS))
            ans = all_scripts(v, form)
            items.append(_mk(gid, idx + i, f"把「{v['kanji']}（{v['kana']}／{v['gloss']}）」變成{PLAIN_FORMS[form]}",
                             ans, "依動詞分類（五段／一段／不規則）活用", form))
        return items
    if gid == "N4-kamoshirenai":
        for i in range(n):
            if i % 2 == 0:
                v = rng.choice(godan if i == 0 else other or verbs)
                form = rng.choice(["dict", "ta"])
                stems = all_scripts(v, form)
                label = "可能～（～かもしれない）" if form == "dict" else "可能已經～了（～たかもしれない）"
                items.append(_mk(gid, idx + i, f"把「{v['kanji']}（{v['kana']}／{v['gloss']}）」變成：{label}",
                                 _combine(stems, ["かもしれない", "かもしれません"]),
                                 "動詞：普通形（辭書形／た形）直接接かもしれない", form))
            else:
                p, acc, hint, form = _extra_item(gid, vocab, rng)
                items.append(_mk(gid, idx + i, p, acc, hint, form))
        return items
    if gid not in VERB_TEMPLATES:
        return []
    for i in range(n):
        extra = gid == "N4-nakutemo-ii" and i == n - 1 and n >= 3
        if extra:
            p, acc, hint, form = _extra_item(gid, vocab, rng)
        else:
            pool = godan if i % 2 == 0 else other
            v = rng.choice(pool or verbs)
            p, acc, hint, form = _verb_item(gid, v, rng)
        items.append(_mk(gid, idx + i, p, acc, hint, form))
    return items
