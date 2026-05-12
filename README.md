# B-Anki

A flashcard-style Bible verse memorization app built with [Streamlit](https://streamlit.io/).

Load your own verse sets from CSV files and practice recalling them with spaced repetition — just like [Anki](https://apps.ankiweb.net/), but for the Bible.

## Features

### 테마 1 · 성경구절 암기
- **세 가지 모드**: 학습(보고 가리고 복습) · 암송 · 받아쓰기
- **간격 반복(SRS)**: SM-2 알고리즘 — 어려운 카드는 자주, 쉬운 카드는 드물게
- **4단계 난이도 평가**: 다시 / 어려움 / 괜찮음 / 쉬움 (Anki 스타일)
- **점진적 힌트**: 초성 → 첫 단어 → 첫 어절 → 절반
- **받아쓰기 채점**: 구두점 무시 + Levenshtein 기반 유사어 부분 인정
- **TTS 듣기**: Web Speech API로 한/영 구절 음성 재생
- **다중 사용자**: 이름별로 진도/통계 분리 저장

### 테마 2 · 단어 순서 외우기
- **데이터셋**: 구약 39권 · 신약 27권 · 통합 66권 · 사용자 CSV
- **두 모드**: 🖱️ 클릭 배열 · ✍️ 받아쓰기
- **하트 시스템**: 허용 오답 1–10회 조정
- **단계적 힌트**: 책별 내용 요약 → 초성 → 글자수 (3단계)
- **이모지 배지**: 66권 각각 고유 이모지

### 공통
- **📊 통계 대시보드**: 학습 스트릭, 평균 정확도, 일자별 복습량, 어려운 카드 Top
- **📥 PNG 인증서**: 완료 시 html2canvas로 저장 가능
- **⌨️ 키보드 단축키**: Space · ←→ · H(힌트) · A+/A−
- **🌙 다크 모드**: `prefers-color-scheme` 자동 대응
- **📱 모바일 반응형**: flex-wrap + 미디어 쿼리
- **♿ 접근성**: aria-label, focus-visible 아웃라인, reduced-motion 대응
- **🔁 새로고침 안전**: 진도/이름/폰트크기를 SQLite와 query param에 영속화

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

앱은 기본적으로 `http://localhost:8501`에서 열립니다.

### Tests
```bash
pip install pytest
python -m pytest tests/ -v
```

## Adding Verse Sets

Place CSV files in the `data/` directory. Each file must have:

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

## Architecture

```
b-anki/
├── app.py                 # Thin Streamlit router
├── banki/                 # Application package
│   ├── config.py          # Constants
│   ├── data_loader.py     # CSV loaders (cached)
│   ├── grading.py         # Word-by-word match + fuzzy
│   ├── srs.py             # SM-2 spaced repetition
│   ├── storage.py         # SQLite persistence
│   ├── hints.py           # Progressive hints
│   ├── styles.py          # CSS (dark mode, responsive)
│   ├── audio.py           # TTS + sound effects
│   ├── keyboard.py        # JS keyboard shortcuts
│   ├── certificate.py     # Completion certs + PNG export
│   ├── stats.py           # Dashboard
│   ├── home.py            # Theme selection
│   ├── verse_mode.py      # Theme 1
│   ├── ordering_mode.py   # Theme 2
│   └── bible_data.py      # 66-book emoji + content hints
├── data/                  # CSV verse sets
└── tests/                 # Pytest unit tests
```

## Tech Stack
- **Streamlit** — UI framework
- **Pandas** — CSV loading
- **SQLite** — Progress persistence (stdlib)
- **Web Speech API** — TTS (browser-native, no API key)
- **html2canvas** — Certificate PNG export (CDN)
