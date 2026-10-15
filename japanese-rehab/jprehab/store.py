"""資料保存：原子寫入 JSON、追加式 JSONL、損毀時自動使用備份。"""
import json
import os
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def user_dir() -> Path:
    """個人資料夾。可用環境變數 JPREHAB_USER_DIR 覆寫（測試或多人使用）。"""
    d = Path(os.environ.get("JPREHAB_USER_DIR", ROOT / "user_data"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def progress_path() -> Path:
    return user_dir() / "progress.json"


def history_path() -> Path:
    return user_dir() / "history.jsonl"


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def today_str() -> str:
    return os.environ.get("JPREHAB_TODAY") or datetime.now().strftime("%Y-%m-%d")


def read_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json_atomic(path: Path, obj) -> None:
    """先寫暫存檔、fsync，再 os.replace；並保留上一版為 .bak。"""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        if path.exists():
            try:
                os.replace(path, path.with_suffix(path.suffix + ".bak"))
            except OSError:
                pass
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def load_progress():
    """讀取進度；主檔損毀時改讀 .bak；都不存在回傳 None。"""
    p = progress_path()
    bak = p.with_suffix(p.suffix + ".bak")
    for cand in (p, bak):
        if cand.exists():
            try:
                return read_json(cand)
            except (json.JSONDecodeError, OSError):
                continue
    if p.exists():
        raise RuntimeError(f"進度檔 {p} 與備份都無法讀取，請檢查檔案（不會自動覆寫）。")
    return None


def save_progress(progress: dict) -> None:
    progress["updated_at"] = now_iso()
    write_json_atomic(progress_path(), progress)


def append_history(record: dict) -> None:
    record = dict(record)
    record.setdefault("ts", now_iso())
    p = history_path()
    with open(p, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())


def read_history() -> list:
    p = history_path()
    if not p.exists():
        return []
    out = []
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # 略過寫到一半的壞行
    return out
