"""靜態教材載入：文法、練習題、情境、錯誤偵測規則。與個人進度分開。"""
from . import store

AREA_NAMES = {
    "particle": "助詞", "conjugation": "動詞活用", "connection": "文法接續",
    "meaning": "語意", "naturalness": "自然度", "other": "其他",
}
CORE_CATEGORIES = {"particle", "conjugation", "connection", "meaning"}


class Curriculum:
    def __init__(self):
        d = store.DATA_DIR
        g = store.read_json(d / "grammar.json")["grammar"]
        self.order = [x["id"] for x in g]
        self.grammar = {x["id"]: x for x in g}
        self.exercises = store.read_json(d / "exercises.json")["exercises"]
        self.scenarios = store.read_json(d / "scenarios.json")["scenarios"]
        self.patterns = store.read_json(d / "error_patterns.json")["patterns"]
        self.vocab = store.read_json(d / "verbs.json")
        self.seed = store.read_json(d / "seed_progress.json")

    def title(self, gid: str) -> str:
        g = self.grammar.get(gid)
        return g["title"] if g else gid

    def scenario_name(self, sid: str) -> str:
        return self.scenarios.get(sid, {}).get("name", sid)

    def exercises_for(self, gid: str):
        return [e for e in self.exercises if e["grammar"] == gid]

    def examples(self, gid: str):
        return [dict(jp=e[0], kana=e[1], zh=e[2], scenario=e[3]) for e in self.grammar[gid]["examples"]]

    def next_in_order(self, gid: str):
        i = self.order.index(gid)
        return self.order[i + 1] if i + 1 < len(self.order) else None
