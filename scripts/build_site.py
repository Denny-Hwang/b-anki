"""Assemble the static site served by GitHub Pages.

Copies web/ and data/ into _site/ and writes data/manifest.json — a static host
has no directory listing, so the file lists that banki/data_loader.py built with
os.listdir() have to be baked in at build time.

    python3 scripts/build_site.py && python3 -m http.server -d _site 8000
"""
import argparse
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from banki import config  # noqa: E402

WEB_DIR = os.path.join(ROOT, "web")
DATA_DIR = os.path.join(ROOT, "data")

#: Development-only files that must not reach the published site.
EXCLUDE = {"package.json", "tests", "node_modules"}


def ordered(files, preferred):
    """Sorted, but with the bundled default first — matching data_loader.py."""
    files = sorted(files)
    if preferred in files:
        files.remove(preferred)
        files.insert(0, preferred)
    return files


def build_manifest():
    names = [f for f in os.listdir(DATA_DIR) if f.endswith(".csv")]
    verse = [
        f for f in names
        if not f.startswith("bible_books_") and not f.startswith(config.QUIZ_FILE_PREFIX)
    ]
    ordering = [f for f in names if f.startswith("bible_books_")]
    quiz = [f for f in names if f.startswith(config.QUIZ_FILE_PREFIX)]
    return {
        "verse": ordered(verse, config.DEFAULT_FILE),
        "ordering": sorted(ordering),
        "quiz": ordered(quiz, config.DEFAULT_QUIZ_FILE),
    }


def copy_web(out_dir):
    for entry in os.listdir(WEB_DIR):
        if entry in EXCLUDE:
            continue
        source = os.path.join(WEB_DIR, entry)
        target = os.path.join(out_dir, entry)
        if os.path.isdir(source):
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join(ROOT, "_site"))
    args = parser.parse_args()
    out_dir = os.path.abspath(args.out)

    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)

    copy_web(out_dir)

    data_out = os.path.join(out_dir, "data")
    os.makedirs(data_out, exist_ok=True)
    csvs = [f for f in os.listdir(DATA_DIR) if f.endswith(".csv")]
    for name in csvs:
        shutil.copy2(os.path.join(DATA_DIR, name), os.path.join(data_out, name))

    manifest = build_manifest()
    with open(os.path.join(data_out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    # Pages runs Jekyll by default, which would skip files starting with "_".
    open(os.path.join(out_dir, ".nojekyll"), "w").close()

    print(f"built {out_dir}")
    print(f"  구절집 {len(manifest['verse'])} · 순서 {len(manifest['ordering'])} "
          f"· 문제집 {len(manifest['quiz'])}")


if __name__ == "__main__":
    main()
