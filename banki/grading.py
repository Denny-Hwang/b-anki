"""Verse dictation grading with punctuation tolerance and fuzzy matching."""
import re
import unicodedata

PUNCT_PATTERN = re.compile(r"[　\.,;:!?\"'`~\-—–…()\[\]{}<>/\\|·•‘’“”]")


def _strip_punct(text: str) -> str:
    return PUNCT_PATTERN.sub("", text)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = _strip_punct(text)
    text = text.replace(" ", "").replace("　", "")
    return text.lower()


def _split_words(text: str) -> list[str]:
    text = unicodedata.normalize("NFC", text or "")
    text = _strip_punct(text)
    return [w for w in text.split() if w]


def _levenshtein(a: str, b: str) -> int:
    if not a:
        return len(b)
    if not b:
        return len(a)
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[-1]


def _similarity(a: str, b: str) -> float:
    a_n, b_n = _normalize(a), _normalize(b)
    if not a_n and not b_n:
        return 1.0
    if not a_n or not b_n:
        return 0.0
    dist = _levenshtein(a_n, b_n)
    return 1 - dist / max(len(a_n), len(b_n))


def compute_word_match(user_text: str, answer_text: str, fuzzy_threshold: float = 0.6) -> dict:
    """Compare user input with answer text word-by-word.

    A word is "matched" if it's an exact normalized match, or a fuzzy match
    above `fuzzy_threshold`. Fuzzy matches are marked as partial.
    """
    answer_words = _split_words(answer_text)
    user_words = _split_words(user_text)

    if not answer_words:
        return {
            "score": 100, "total_words": 0, "matched_words": 0,
            "partial_words": 0,
            "answer_words": [], "user_words": [], "word_results": [],
        }

    matched = 0
    partial = 0
    word_results = []

    for i, aw in enumerate(answer_words):
        if i < len(user_words):
            uw = user_words[i]
            sim = _similarity(uw, aw)
            if sim == 1.0:
                matched += 1
                word_results.append({"answer": aw, "user": uw, "match": "full", "similarity": sim})
            elif sim >= fuzzy_threshold:
                partial += 1
                word_results.append({"answer": aw, "user": uw, "match": "partial", "similarity": sim})
            else:
                word_results.append({"answer": aw, "user": uw, "match": "miss", "similarity": sim})
        else:
            word_results.append({"answer": aw, "user": "", "match": "missing", "similarity": 0.0})

    for i in range(len(answer_words), len(user_words)):
        word_results.append({"answer": "", "user": user_words[i], "match": "extra", "similarity": 0.0})

    score_raw = (matched + partial * 0.6) / len(answer_words) * 100
    score = max(0, min(100, round(score_raw)))

    return {
        "score": score,
        "total_words": len(answer_words),
        "matched_words": matched,
        "partial_words": partial,
        "answer_words": answer_words,
        "user_words": user_words,
        "word_results": word_results,
    }


def render_word_comparison_html(result: dict) -> str:
    """Render word-by-word comparison with color coding."""
    html_parts = []
    for wr in result["word_results"]:
        m = wr["match"]
        if m == "full":
            html_parts.append(
                f'<span class="w-full">{wr["answer"]}</span>'
            )
        elif m == "partial":
            html_parts.append(
                f'<span class="w-partial" title="유사도 {int(wr["similarity"]*100)}%">'
                f'{wr["user"]} → {wr["answer"]}</span>'
            )
        elif m == "missing":
            html_parts.append(
                f'<span class="w-missing">{wr["answer"]}</span>'
            )
        elif m == "extra":
            html_parts.append(
                f'<span class="w-extra"><s>{wr["user"]}</s></span>'
            )
        else:
            html_parts.append(
                f'<span class="w-miss"><s>{wr["user"]}</s> → {wr["answer"]}</span>'
            )
    return " ".join(html_parts)
