import re
import unicodedata

_PUNCT = re.compile(r"[\s。、．，,.!！?？「」『』（）()・~〜～…]+")


def normalize(s: str) -> str:
    """全形轉半形、去空白與標點，用來比對日文答案。"""
    return _PUNCT.sub("", unicodedata.normalize("NFKC", s or ""))
