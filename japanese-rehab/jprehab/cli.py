import argparse
import random
import sys

from . import dashboard as DB
from . import progress as P
from . import scheduler as S
from . import session, store
from .curriculum import Curriculum


def load_state(cur, create=True):
    prog = store.load_progress()
    if prog is None:
        if not create:
            return None
        prog = P.new_progress(cur, store.today_str())
        store.save_progress(prog)
        print(f"已用初始資料建立進度檔：{store.progress_path()}\n")
    P.sync_with_curriculum(prog, cur)
    return prog


def cmd_init(args, cur):
    if store.progress_path().exists() and not args.reset:
        print("進度檔已存在，未變更。若要用初始資料重設，請加 --reset（會先備份成 .bak）。")
        return 0
    prog = P.new_progress(cur, store.today_str())
    store.save_progress(prog)
    print(f"已建立進度檔：{store.progress_path()}")
    print(DB.render_dashboard(cur, prog, []))
    return 0


def cmd_today(args, cur):
    prog = load_state(cur)
    history = store.read_history()
    if args.grammar and args.grammar not in cur.grammar:
        print(f"找不到文法 ID：{args.grammar}（用 `grammar` 指令查看清單）")
        return 2
    if args.scenario and args.scenario not in cur.scenarios:
        print(f"找不到情境：{args.scenario}（可用：{', '.join(cur.scenarios)}）")
        return 2
    rng = random.Random(args.seed) if args.seed is not None else random.Random()
    session.run_today(cur, prog, history, mode=args.mode, force_gid=args.grammar, scenario=args.scenario,
                      n=args.n, use_ai=not args.no_ai, rng=rng)
    return 0


def cmd_dashboard(args, cur):
    prog = load_state(cur)
    print(DB.render_dashboard(cur, prog, store.read_history()))
    return 0


def cmd_grammar(args, cur):
    prog = load_state(cur)
    if args.id:
        if args.id not in cur.grammar:
            print(f"找不到文法 ID：{args.id}")
            return 2
        print(DB.render_grammar_detail(cur, prog, args.id))
    else:
        print(DB.render_grammar_list(cur, prog, args.status))
    return 0


def cmd_errors(args, cur):
    print(DB.render_errors(cur, load_state(cur)))
    return 0


def cmd_history(args, cur):
    load_state(cur)
    print(DB.render_history(cur, store.read_history(), args.limit))
    return 0


def cmd_set_status(args, cur):
    prog = load_state(cur)
    if args.id not in cur.grammar:
        print(f"找不到文法 ID：{args.id}")
        return 2
    P.set_status_manual(prog, args.id, args.status, store.today_str())
    store.save_progress(prog)
    store.append_history({"kind": "manual", "date": store.today_str(), "grammar_id": args.id,
                          "status": args.status})
    print(f"{cur.title(args.id)} → {P.STATUS_NAMES[args.status]}")
    return 0


def build_parser():
    ap = argparse.ArgumentParser(prog="jp.py", description="日文復健學習系統")
    sub = ap.add_subparsers(dest="cmd")
    p = sub.add_parser("init", help="用初始資料建立進度檔")
    p.add_argument("--reset", action="store_true")
    p.set_defaults(fn=cmd_init)
    p = sub.add_parser("today", help="開始今天的練習（預設指令）")
    p.add_argument("--mode", choices=S.MODES, default="full",
                   help="full 完整流程｜review 只看範例｜dialogue 對話｜translate 中翻日｜compose 自行造句｜mixed 綜合｜correction 錯誤補強")
    p.add_argument("--grammar", help="指定文法 ID（預設自動接續進度）")
    p.add_argument("--scenario", help="指定情境：work/food/shopping/leisure/travel/friends/health/daily")
    p.add_argument("-n", type=int, default=3, help="造句題數（預設 3）")
    p.add_argument("--no-ai", action="store_true", help="不使用 AI 批改")
    p.add_argument("--seed", type=int, help="固定亂數（除錯用）")
    p.set_defaults(fn=cmd_today)
    p = sub.add_parser("dashboard", help="學習儀表板")
    p.set_defaults(fn=cmd_dashboard)
    p = sub.add_parser("grammar", help="文法清單／詳細內容")
    p.add_argument("id", nargs="?")
    p.add_argument("--status", choices=P.STATUSES)
    p.set_defaults(fn=cmd_grammar)
    p = sub.add_parser("errors", help="錯誤追蹤紀錄")
    p.set_defaults(fn=cmd_errors)
    p = sub.add_parser("history", help="最近的作答紀錄")
    p.add_argument("--limit", type=int, default=15)
    p.set_defaults(fn=cmd_history)
    p = sub.add_parser("set-status", help="手動調整文法狀態")
    p.add_argument("id")
    p.add_argument("status", choices=P.STATUSES)
    p.set_defaults(fn=cmd_set_status)
    return ap


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = build_parser()
    args = ap.parse_args(argv)
    if not args.cmd:
        args = ap.parse_args(["today"] + (argv or []))
    cur = Curriculum()
    try:
        return args.fn(args, cur)
    except session.Quit:
        print("\n已離開。")
        return 0
