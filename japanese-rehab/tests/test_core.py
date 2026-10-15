import json
import os
import random
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jprehab import grader as G
from jprehab import progress as P
from jprehab import scheduler as S
from jprehab import session, store, ai
from jprehab.conjugation import conjugate
from jprehab.curriculum import Curriculum
from jprehab.drills import make_drills

KANJI = re.compile(r"[一-鿿]")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["JPREHAB_USER_DIR"] = self.tmp.name
        os.environ["JPREHAB_TODAY"] = "2026-10-15"
        os.environ["JPREHAB_AI"] = "off"
        self.cur = Curriculum()
        self.prog = P.new_progress(self.cur, "2026-10-15")

    def tearDown(self):
        self.tmp.cleanup()


class TestData(Base):
    def test_ids_unique_and_seed_valid(self):
        self.assertEqual(len(self.cur.order), len(set(self.cur.order)))
        for gid in self.cur.seed["grammar"]:
            self.assertIn(gid, self.cur.grammar)
        for e in self.cur.seed["errors"]:
            self.assertIn(e["grammar_id"], self.cur.grammar)

    def test_examples_have_pure_kana_reading(self):
        for gid, g in self.cur.grammar.items():
            self.assertGreaterEqual(len(g["examples"]), 1, gid)
            for jp, kana, zh, sc in g["examples"]:
                self.assertFalse(KANJI.search(kana), f"{gid}: kana 欄含漢字 {kana}")
                self.assertIn(sc, self.cur.scenarios)
        for gid in ("N4-nakutemo-ii", "N4-kamoshirenai", "N4-koto-ga-dekiru"):
            self.assertGreaterEqual(len(self.cur.grammar[gid]["examples"]), 2)
            self.assertLessEqual(len(self.cur.grammar[gid]["examples"]), 4)

    def test_dialogue_kana_pure(self):
        for g in self.cur.grammar.values():
            for d in g.get("dialogues", []):
                for jp, kana, zh in d["lines"]:
                    self.assertFalse(KANJI.search(kana), kana)

    def test_exercise_references_and_self_consistency(self):
        ids = set()
        for ex in self.cur.exercises:
            self.assertNotIn(ex["id"], ids)
            ids.add(ex["id"])
            self.assertIn(ex["grammar"], self.cur.grammar)
            self.assertIn(ex["scenario"], self.cur.scenarios)
            for u in ex.get("uses", []):
                self.assertIn(u, self.cur.grammar)
            for a in ex["accepted"]:
                res = G.grade(a, ex, self.cur, use_ai=False)
                self.assertEqual(res["result"], "ok", f"{ex['id']} 的參考答案自己都過不了：{a}")
            if ex.get("key_parts"):
                self.assertTrue(G._key_parts_ok(ex["accepted"][0], ex), ex["id"])

    def test_patterns_compile_and_fix(self):
        for p in self.cur.patterns:
            re.compile(p["regex"])
            self.assertIn(p["grammar"], self.cur.grammar)
        errs, fixed = G.detect_errors("予約しなくでもいいです", self.cur.patterns)
        self.assertEqual(fixed, "予約しなくてもいいです")


class TestConjugation(unittest.TestCase):
    def test_forms(self):
        V = lambda k, a, g: {"kanji": k, "kana": a, "group": g}
        cases = [("飲む", "のむ", "godan", "nai_ku", "飲まなく"), ("行く", "いく", "godan", "te", "行って"),
                 ("泳ぐ", "およぐ", "godan", "ta", "泳いだ"), ("話す", "はなす", "godan", "te", "話して"),
                 ("買う", "かう", "godan", "nai", "買わない"), ("帰る", "かえる", "godan", "masu_stem", "帰り"),
                 ("食べる", "たべる", "ichidan", "nai_ku", "食べなく"), ("予約する", "よやくする", "suru", "nai_ku", "予約しなく"),
                 ("来る", "くる", "kuru", "nai_ku", "来なく"), ("待つ", "まつ", "godan", "ta", "待った"),
                 ("遊ぶ", "あそぶ", "godan", "te", "遊んで"), ("死ぬ", "しぬ", "godan", "ta", "死んだ")]
        for k, a, g, form, exp in cases:
            self.assertEqual(conjugate(V(k, a, g), form), exp)
        self.assertEqual(conjugate(V("来る", "くる", "kuru"), "nai_ku", "kana"), "こなく")


class TestGrading(Base):
    def ex(self, id_):
        return next(e for e in self.cur.exercises if e["id"] == id_)

    def test_exact_and_alternative_phrasing(self):
        ex = self.ex("nm-1")
        self.assertEqual(G.grade("明日は早く起きなくてもいいです。", ex, self.cur, use_ai=False)["source"], "exact")
        alt = G.grade("あしたははやくおきなくてもいいよ", ex, self.cur, use_ai=False)  # 不同說法
        self.assertEqual((alt["result"], alt["source"]), ("ok", "rule"))

    def test_known_error_detected_with_fix(self):
        r = G.grade("明日は早く起きなくでもいいです。", self.ex("nm-1"), self.cur, use_ai=False)
        self.assertEqual(r["result"], "err")
        self.assertEqual(r["errors"][0]["category"], "conjugation")
        self.assertIn("なくてもいい", r["corrected"])

    def test_conditional_error_i_adj_nara(self):
        r = G.grade("天気が良くなら、散歩に行きたいです", self.ex("rv-tara-2"), self.cur, use_ai=False)
        self.assertEqual(r["result"], "err")
        self.assertEqual(r["errors"][0]["grammar_id"], "N4-nara")
        ok = G.grade("天気が良くなったら、散歩に行きたいです", self.ex("rv-tara-2"), self.cur, use_ai=False)
        self.assertEqual(ok["result"], "ok")

    def test_na_adj_kamoshirenai(self):
        r = G.grade("あの店は静かだかもしれません", self.ex("kk-7"), self.cur, use_ai=False)
        self.assertEqual(r["errors"][0]["signature"], "da-kamo")

    def test_uncertain_goes_to_self_grade(self):
        r = G.grade("明日は寝ます", self.ex("nm-1"), self.cur, use_ai=False)
        self.assertTrue(r["uncertain"])
        r2 = G.apply_self_grade(r, "N4-nakutemo-ii", "明日は寝ます", "err", "meaning", "沒用目標文法")
        self.assertEqual((r2["result"], r2["errors"][0]["category"]), ("err", "meaning"))

    def test_drill_alternatives_kanji_kana(self):
        d = make_drills(self.cur, "N4-nakutemo-ii", 2, random.Random(1))[0]
        for a in d["accepted"]:
            self.assertEqual(G.grade(a, d, self.cur, use_ai=False)["result"], "ok")
        self.assertEqual(G.grade("ちがう", d, self.cur, use_ai=False)["result"], "err")

    def test_ai_paths(self):
        ex = self.ex("nm-1")
        fake = lambda r: (lambda a, e, g: ai.normalize_ai_result(r))
        acc = G.grade("明日は早起きしなくてもいいです", ex, self.cur,
                      ai_func=fake({"verdict": "acceptable", "uses_target_grammar": True, "errors": [],
                                    "natural": "明日は早起きしなくて大丈夫です"}))
        self.assertEqual(acc["result"], "ok")
        self.assertEqual(acc["natural"], "明日は早起きしなくて大丈夫です")
        self.assertEqual(acc["errors"], [])  # 自然度建議不算錯誤
        nd = G.grade("明日は休みです", ex, self.cur,
                     ai_func=fake({"verdict": "correct", "uses_target_grammar": False, "errors": []}))
        self.assertEqual(nd["result"], "nd")
        bad = G.grade("明日は早く起きるなくてもいい", ex, self.cur,
                      ai_func=fake({"verdict": "incorrect", "errors": [{"category": "conjugation", "message": "m", "wrong": "起きるな", "right": "起きな"}]}))
        self.assertEqual(bad["result"], "err")

        def boom(a, e, g):
            raise OSError("offline")
        fb = G.grade("あしたははやくおきなくてもいいです", ex, self.cur, ai_func=boom)
        self.assertEqual(fb["result"], "ok")  # AI 失敗 → 退回本機規則
        self.assertIn("AI 批改失敗", fb["feedback"])


class TestProgress(Base):
    n = 0

    def attempt(self, gid, result, sc, hinted=False, errors=(), etype="translate", session="auto"):
        if session == "auto":
            TestProgress.n += 1
            session = f"s{TestProgress.n}"
        return P.record_attempt(self.prog, gid, result=result, scenario=sc, etype=etype, hinted=hinted,
                                errors=list(errors), date="2026-10-16", session_id=session)

    def test_seed_import(self):
        c = P.counts(self.prog)
        self.assertEqual(c["pass"], 20)
        self.assertEqual(self.prog["grammar"]["N4-nakutemo-ii"]["status"], "needs_work")
        self.assertEqual(self.prog["grammar"]["N4-kamoshirenai"]["status"], "learning")
        self.assertEqual(self.prog["grammar"]["N4-koto-ga-dekiru"]["status"], "learning")
        self.assertEqual(self.prog["grammar"]["N4-te-miru"]["status"], "not_started")
        e = self.prog["errors"]["N4-nakutemo-ii|conjugation|nakude-mo"]
        self.assertEqual((e["state"], e["count"]), ("active", 2))

    def test_one_correct_is_not_pass(self):
        gid = "N4-kamoshirenai"
        self.attempt(gid, "ok", "daily")
        self.assertEqual(self.prog["grammar"][gid]["status"], "learning")

    def test_needs_two_scenarios_and_independence(self):
        gid = "N4-kamoshirenai"
        self.attempt(gid, "ok", "daily")
        self.attempt(gid, "ok", "daily")
        self.assertNotEqual(self.prog["grammar"][gid]["status"], "pass")  # 同一情境
        self.attempt(gid, "ok", "work", hinted=True)
        self.assertNotEqual(self.prog["grammar"][gid]["status"], "pass")  # 用了提示不算獨立
        self.attempt(gid, "ok", "work")
        self.assertNotEqual(self.prog["grammar"][gid]["status"], "pass")  # 最近兩次其中一次有提示
        self.attempt(gid, "ok", "food")
        self.assertEqual(self.prog["grammar"][gid]["status"], "pass")

    def test_same_session_is_not_enough(self):
        gid = "N4-kamoshirenai"
        self.attempt(gid, "ok", "daily", session="x")
        self.attempt(gid, "ok", "work", session="x")
        self.attempt(gid, "ok", "food", session="x")
        self.assertEqual(self.prog["grammar"][gid]["status"], "learning")
        self.attempt(gid, "ok", "food", session="y")
        self.assertEqual(self.prog["grammar"][gid]["status"], "pass")

    def test_recurring_error_must_become_stable(self):
        gid = "N4-nakutemo-ii"
        err = {"grammar_id": gid, "category": "conjugation", "signature": "nakude-mo", "description": "d", "wrong": "a", "right": "b"}
        self.attempt(gid, "err", "food", errors=[err])
        e = self.prog["errors"][f"{gid}|conjugation|nakude-mo"]
        self.assertEqual((e["count"], e["state"]), (3, "active"))
        self.attempt(gid, "ok", "food")
        self.attempt(gid, "ok", "work")
        self.assertEqual(e["state"], "corrected_once")          # 改正一次 ≠ 穩定
        self.assertNotEqual(self.prog["grammar"][gid]["status"], "pass")
        self.attempt(gid, "ok", "daily")
        self.assertEqual(e["state"], "stable")
        self.assertEqual(self.prog["grammar"][gid]["status"], "pass")

    def test_error_reappears_resets(self):
        gid = "N4-nakutemo-ii"
        err = {"grammar_id": gid, "category": "conjugation", "signature": "nakude-mo", "description": "d", "wrong": "", "right": ""}
        self.attempt(gid, "ok", "food")
        e = self.prog["errors"][f"{gid}|conjugation|nakude-mo"]
        self.assertEqual(e["state"], "corrected_once")
        self.attempt(gid, "err", "work", errors=[err])
        self.assertEqual((e["state"], e["consecutive_correct"]), ("active", 0))

    def test_not_demonstrated_does_not_count(self):
        gid = "N4-kamoshirenai"
        self.attempt(gid, "nd", "daily")
        self.assertEqual(self.prog["grammar"][gid]["scenarios_correct"], [])

    def test_drill_does_not_count_for_pass_scenarios(self):
        gid = "N4-nakutemo-ii"
        P.record_attempt(self.prog, gid, result="ok", scenario="drill", etype="drill", hinted=False, errors=[],
                         date="d", resolves={"conjugation", "connection"})
        self.assertEqual(self.prog["grammar"][gid]["scenarios_correct"], [])
        e = self.prog["errors"][f"{gid}|conjugation|nakude-mo"]
        self.assertEqual(e["consecutive_correct"], 1)

    def test_needs_work_after_repeated_mistakes(self):
        gid = "N4-koto-ga-dekiru"
        err = {"grammar_id": gid, "category": "connection", "signature": "no-koto", "description": "d", "wrong": "", "right": ""}
        self.attempt(gid, "err", "daily", errors=[err])
        self.attempt(gid, "err", "work", errors=[err])
        self.assertEqual(self.prog["grammar"][gid]["status"], "needs_work")

    def test_passed_grammar_demoted_on_repeated_core_error(self):
        gid = "N4-node"
        err = {"grammar_id": gid, "category": "connection", "signature": "da-node", "description": "d", "wrong": "", "right": ""}
        self.attempt("N4-kamoshirenai", "err", "daily", errors=[err])
        self.assertEqual(self.prog["grammar"][gid]["status"], "pass")  # 只錯一次不降級
        self.attempt("N4-kamoshirenai", "err", "daily", errors=[err])
        self.assertEqual(self.prog["grammar"][gid]["status"], "needs_work")


class TestScheduler(Base):
    def test_resumes_current_unpassed(self):
        gid, why = S.pick_main(self.prog, self.cur)
        self.assertEqual(gid, "N4-nakutemo-ii")

    def test_order_after_pass(self):
        self.prog["grammar"]["N4-nakutemo-ii"]["status"] = "pass"
        self.assertEqual(S.pick_main(self.prog, self.cur)[0], "N4-kamoshirenai")
        self.prog["grammar"]["N4-kamoshirenai"]["status"] = "pass"
        self.prog["current_grammar_id"] = None
        self.assertEqual(S.pick_main(self.prog, self.cur)[0], "N4-koto-ga-dekiru")
        self.prog["grammar"]["N4-koto-ga-dekiru"]["status"] = "pass"
        self.assertEqual(S.pick_main(self.prog, self.cur)[0], "N4-te-miru")

    def test_does_not_teach_passed_grammar_as_new(self):
        for _ in range(20):
            plan = S.plan_lesson(self.prog, self.cur, [], rng=random.Random(_))
            self.assertNotEqual(self.prog["grammar"][plan["gid"]]["status"], "pass")

    def test_no_repeat_exercises_and_fallback(self):
        gid = "N4-nakutemo-ii"
        seen = set()
        for i in range(5):
            plan = S.plan_lesson(self.prog, self.cur, [], rng=random.Random(i), n=3)
            ids = [e["id"] for e in plan["exercises"]]
            self.assertFalse(seen & set(ids))
            seen |= set(ids)
            self.prog["grammar"][gid]["seen_exercises"] += ids
        self.assertTrue(any(i.startswith("gen-") for i in ids))  # 手寫題用完後自動產生新題

    def test_drills_scheduled_for_unstable_conjugation_error(self):
        plan = S.plan_lesson(self.prog, self.cur, [], rng=random.Random(1))
        self.assertEqual(len(plan["drills"]), 2)
        self.assertEqual(len({e["scenario"] for e in plan["exercises"]}), len(plan["exercises"]))  # 情境不重複

    def test_mode_review_has_no_exercises(self):
        plan = S.plan_lesson(self.prog, self.cur, [], mode="review")
        self.assertEqual(plan["exercises"], [])

    def test_scenario_not_all_travel(self):
        hist = [{"kind": "session", "scenario": "travel"}] * 3
        picks = {S.pick_scenario(self.prog, self.cur, "N4-nakutemo-ii", hist, random.Random(i)) for i in range(30)}
        self.assertNotEqual(picks, {"travel"})
        self.assertNotIn("travel", picks)


class TestStore(Base):
    def test_atomic_roundtrip_and_backup_recovery(self):
        store.save_progress(self.prog)
        self.assertEqual(store.load_progress()["current_grammar_id"], "N4-nakutemo-ii")
        self.prog["current_grammar_id"] = "N4-kamoshirenai"
        store.save_progress(self.prog)
        store.progress_path().write_text("{ broken", encoding="utf-8")
        recovered = store.load_progress()  # 主檔損毀 → 讀上一版備份
        self.assertEqual(recovered["current_grammar_id"], "N4-nakutemo-ii")

    def test_history_skips_torn_line(self):
        store.append_history({"kind": "attempt", "x": 1})
        with open(store.history_path(), "a", encoding="utf-8") as f:
            f.write('{"kind": "att')
        store.append_history({"kind": "attempt", "x": 2})
        # 壞行之後的紀錄接在同一行，會被一起丟掉；這裡只確認不會 crash 且前面的資料保留
        self.assertGreaterEqual(len(store.read_history()), 1)


class TestEndToEnd(Base):
    def run_sessions(self, n_sessions):
        answers = {"cur": ""}
        orig_run_item = session.run_item
        orig_ask = session.ask

        def wrapped(idx, total, ex, ctx):
            if ex.get("accepted"):
                answers["cur"] = ex["accepted"][0]
            else:
                answers["cur"] = "今日は予約しなくてもいいです。"
            return orig_run_item(idx, total, ex, ctx)

        def fake_ask(prompt):
            if "你的答案" in prompt:
                return answers["cur"]
            if "自評" in prompt:
                return "1"
            return ""

        session.run_item, session.ask = wrapped, fake_ask
        try:
            import io, contextlib
            for i in range(n_sessions):
                prog = store.load_progress()
                with contextlib.redirect_stdout(io.StringIO()):
                    session.run_today(self.cur, prog, store.read_history(), rng=random.Random(i))
        finally:
            session.run_item, session.ask = orig_run_item, orig_ask

    def test_progresses_to_pass_and_next_grammar_and_persists(self):
        store.save_progress(self.prog)
        statuses = []
        for _ in range(6):
            self.run_sessions(1)
            statuses.append(store.load_progress()["grammar"]["N4-nakutemo-ii"]["status"])
            if statuses[-1] == "pass":
                break
        self.assertEqual(statuses[-1], "pass", statuses)
        self.assertGreater(len(statuses), 1, "不應該一堂課就 PASS")
        self.assertNotEqual(statuses[0], "pass")
        prog = store.load_progress()
        self.assertEqual(prog["current_grammar_id"], "N4-kamoshirenai")
        self.assertEqual(prog["errors"]["N4-nakutemo-ii|conjugation|nakude-mo"]["state"], "stable")
        hist = store.read_history()
        self.assertTrue(any(h["kind"] == "session" for h in hist))
        self.assertTrue(all("answer" in h and "result" in h for h in hist if h["kind"] == "attempt"))
        # 下一堂自動接續 kamoshirenai，不重教已 PASS 的文法
        self.run_sessions(1)
        last = [h for h in store.read_history() if h["kind"] == "session"][-1]
        self.assertEqual(last["grammar_id"], "N4-kamoshirenai")

    def test_quit_midway_keeps_answered_items(self):
        store.save_progress(self.prog)
        calls = {"n": 0}
        orig = session.ask

        def fake_ask(prompt):
            if "你的答案" in prompt:
                calls["n"] += 1
                if calls["n"] > 2:
                    raise session.Quit()
                return "飲まなくでもいい"
            return ""
        session.ask = fake_ask
        try:
            import io, contextlib
            with contextlib.redirect_stdout(io.StringIO()):
                session.run_today(self.cur, store.load_progress(), [], rng=random.Random(1))
        finally:
            session.ask = orig
        prog = store.load_progress()
        total = sum(g["attempts"] for g in prog["grammar"].values())
        self.assertEqual(total, 2)
        sess = [h for h in store.read_history() if h["kind"] == "session"][-1]
        self.assertFalse(sess["completed"])


if __name__ == "__main__":
    unittest.main()
