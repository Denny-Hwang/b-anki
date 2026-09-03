"""Regenerate web/js/lib/bible-data.js from banki/bible_data.py.

The emoji and hint tables are the one piece of theme-2 content that lives in
Python and is also needed by the browser, so we generate rather than
transcribe: run this after editing banki/bible_data.py.

    python3 scripts/gen_bible_data.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from banki import bible_data  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "web", "js", "lib", "bible-data.js",
)


def main() -> None:
    parts = [
        "// Generated from banki/bible_data.py by scripts/gen_bible_data.py — do not edit by hand.",
        "",
    ]
    for name, mapping in [
        ("BIBLE_BOOK_EMOJIS", bible_data.BIBLE_BOOK_EMOJIS),
        ("BIBLE_BOOK_HINTS", bible_data.BIBLE_BOOK_HINTS),
    ]:
        parts.append(f"export const {name} = " + json.dumps(mapping, ensure_ascii=False, indent=2) + ";")
        parts.append("")
    parts += [
        "export function getBookEmoji(word) {",
        "  return BIBLE_BOOK_EMOJIS[word] || '';",
        "}",
        "",
        "export function getBookHint(word) {",
        "  return BIBLE_BOOK_HINTS[word] || '';",
        "}",
    ]
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(parts) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
