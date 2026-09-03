# B-Anki

A flashcard-style memorization app for Bible verses and church-polity study, built with [Streamlit](https://streamlit.io/).

Load your own verse sets or question banks from CSV files and practice recalling them with spaced repetition — just like [Anki](https://apps.ankiweb.net/), but for the Bible and the Book of Order.

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

### 테마 3 · PCUSA 헌법·규례 학습문제
- **문제은행**: 신임 제직 세미나 "PCUSA 직제사역의 이해" 5~7쪽 학습문제 34문제 (6개 분야)
- **세 가지 방식**: 📖 플래시카드(자기평가) · 🔤 객관식(4지선다) · ✍️ 주관식(직접 입력)
- **분야별 출제**: 교회의 구조와 헌법 · 당회 · 직제사역의 임기 · 직분과 제직선출 · 공천위원회 · 공동의회
- **자동 채점**: 주관식은 유사어 부분 인정, 대체 정답(`accept`) 허용
- **해설 제공**: 문제마다 헌법 근거와 배경 설명
- **📝 오답노트**: 틀린/부분정답 문제만 골라 다시 풀기
- **간격 반복(SRS)**: 테마 1과 동일한 SM-2 스케줄링을 문제 단위로 적용

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

## Adding Question Banks (테마 3)

Question banks are CSV files in `data/` whose name starts with `quiz_`. Columns:

| Column | Required | Description |
|---|---|---|
| `id` | ✅ | Unique question id — also the SRS card key, so keep it stable |
| `category` | ✅ | Grouping label used by the 분야 filter (e.g. `당회와 공동의회`) |
| `question` | ✅ | The prompt shown to the learner |
| `answer` | ✅ | The canonical answer |
| `accept` | | `\|`-separated alternate answers also graded correct |
| `distractors` | | `\|`-separated wrong options for 객관식 mode |
| `explanation` | | Background shown after answering |

`distractors` may be left empty — 객관식 mode then borrows other questions' answers
(closest in length first) as options. Categories appear in the order they first
occur in the file.

```csv
id,category,question,answer,accept,distractors,explanation
Q001,공의회,교역장로(목사)의 안수는 어느 공의회가 주관하는가?,노회,,당회|대회|총회,교역장로 안수는 노회 주관이다.
```

The bundled bank `data/quiz_pcusa_constitution.csv` holds the 34 학습문제 printed on
pages 5–7 of the 신임 제직 세미나 제2강 "PCUSA 직제사역의 이해" handout.

## Architecture

```
b-anki/
├── app.py                 # Thin Streamlit router
├── banki/                 # Application package
│   ├── config.py          # Constants
│   ├── data_loader.py     # CSV loaders (cached)
│   ├── grading.py         # Word-by-word match + fuzzy
│   ├── quiz.py            # Theme 3 logic (options, grading, selection)
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
│   ├── quiz_mode.py       # Theme 3
│   └── bible_data.py      # 66-book emoji + content hints
├── data/                  # CSV verse sets + question banks
└── tests/                 # Pytest unit + AppTest smoke tests
```

## Tech Stack
- **Streamlit** — UI framework
- **Pandas** — CSV loading
- **SQLite** — Progress persistence (stdlib)
- **Web Speech API** — TTS (browser-native, no API key)
- **html2canvas** — Certificate PNG export (CDN)
