# B-Anki

A flashcard-style Bible verse memorization app built with [Streamlit](https://streamlit.io/).

Load your own verse sets from CSV files and practice recalling them one by one — just like [Anki](https://apps.ankiweb.net/), but for the Bible.

## Features

- **CSV-based verse sets** — drop any `.csv` file into `data/` and start studying
- **Multiple Bible versions** — toggle between Korean Revised Version (개역개정) and NIV
- **Shuffle or sequential** order
- **Progress tracking** with a progress bar
- **Skip & retry** — skip difficult verses now and review them later

## Getting Started

### Prerequisites

- Python 3.10+

### Installation

```bash
pip install -r requirements.txt
```

### Run

```bash
streamlit run app.py
```

The app opens at `http://localhost:8501` by default.

## Adding Verse Sets

Place CSV files in the `data/` directory. Each file must have the following columns:

| Column | Description |
|---|---|
| `location` | Book, chapter, and verse (e.g. `Romans 8:28`) |
| `verse_krv` | Verse text in Korean (개역개정) |
| `verse_niv` | Verse text in English (NIV) |

Example:

```csv
location,verse_krv,verse_niv
빌립보서 4:13,내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라,I can do all this through him who gives me strength.
```

A sample file with 10 verses is included at `data/sample_verses.csv`.

## Tech Stack

- [Streamlit](https://streamlit.io/) — UI framework
- [Pandas](https://pandas.pydata.org/) — CSV loading
