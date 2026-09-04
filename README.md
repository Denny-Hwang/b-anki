# B-Anki

성경 구절 암송, 성경 66권 순서, PCUSA 헌법·규례 학습문제를 **간격 반복(SRS)** 으로 익히는 웹 앱.
[Anki](https://apps.ankiweb.net/)처럼 어려운 카드는 자주, 쉬운 카드는 드물게 나옵니다.

**웹앱**: https://denny-hwang.github.io/b-anki/ — 서버 없이 브라우저에서 바로 돌아갑니다.

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
- **해설 제공**: 해설이 적힌 문제는 헌법 근거와 배경을 함께 표시 (현재 34문제 중 7문제)
- **📝 오답노트**: 틀린/부분정답 문제만 골라 다시 풀기
- **간격 반복(SRS)**: 테마 1과 동일한 SM-2 스케줄링을 문제 단위로 적용

### 공통
- **📊 통계 대시보드**: 학습 스트릭, 평균 정확도, 일자별 복습량, 어려운 카드 Top
- **💾 백업**: 학습 기록을 JSON으로 내보내고 다른 기기에서 불러오기
- **📥 PNG 인증서**: 완료 시 html2canvas로 저장 가능
- **⌨️ 키보드 단축키**: Space · ←→ · H(힌트) · A/Z(글자 크기)
- **🌙 다크 모드**: 시스템 설정 자동 + 수동 전환
- **📱 모바일 반응형**
- **♿ 접근성**: aria-label, focus-visible 아웃라인, reduced-motion 대응
- **🔁 새로고침 안전**: 진도·이름·글자 크기를 브라우저에 영속화

## 학습 기록은 어디에 저장되나요?

**이 브라우저 안에만** 저장됩니다(localStorage). 기록이 서버로 전송되지 않으므로:

- 앱을 다시 배포해도 진도가 사라지지 않습니다
- 다른 사람이 내 이름을 알아도 내 기록을 볼 수 없습니다
- 대신 **기기 간 자동 동기화는 되지 않습니다** — 홈 화면의
  **백업 내려받기 / 불러오기**로 옮기세요

## 개발

정적 사이트라 빌드 도구도 번들러도 필요 없습니다. Python은 데이터 복사와
`manifest.json` 생성에만 쓰입니다.

```bash
# 빌드해서 로컬에서 띄우기 → http://localhost:8123
python3 scripts/build_site.py
python3 -m http.server -d _site 8123
```

### 테스트

```bash
# 1) 파이썬 기준 구현
pip install -r requirements.txt pytest
python -m pytest tests/ -v

# 2) 자바스크립트 포팅이 파이썬과 동일한지 (1,450개 검사)
python3 scripts/gen_fixtures.py
node web/tests/logic.test.mjs

# 3) 실제 브라우저에서 세 테마 전체 흐름 (40개 검사)
npm install --no-save playwright && npx playwright install chromium
python3 scripts/build_site.py
python3 -m http.server -d _site 8123 &
node web/tests/e2e.test.mjs
```

## Architecture

브라우저에서 전부 실행되는 정적 사이트입니다. `banki/` 파이썬 패키지는
채점·SRS·힌트·문제 로직의 **기준 구현(reference implementation)** 으로 남아 있고,
`web/js/lib/`의 자바스크립트 포팅이 이와 같은 결과를 내는지 골든 픽스처로 검증합니다.

```
b-anki/
├── web/                       # GitHub Pages로 배포되는 정적 사이트
│   ├── index.html
│   ├── styles/app.css         # 디자인 토큰 · 컴포넌트 · 다크 모드
│   ├── js/
│   │   ├── app.js             # 진입점: 전역 액션 + 키보드 단축키
│   │   ├── router.js          # 뷰 등록과 리렌더 루프
│   │   ├── ui.js              # 이스케이핑 템플릿, 앱바, 토스트, 컨페티
│   │   ├── lib/
│   │   │   ├── csv.js         # RFC 4180 파서
│   │   │   ├── grading.js     # ← banki/grading.py 포팅
│   │   │   ├── srs.js         # ← banki/srs.py 포팅
│   │   │   ├── hints.js       # ← banki/hints.py 포팅
│   │   │   ├── quiz.js        # ← banki/quiz.py 포팅
│   │   │   ├── bible-data.js  # ← banki/bible_data.py 에서 생성
│   │   │   ├── storage.js     # localStorage 영속화 (SQLite 대체)
│   │   │   ├── datasets.js    # manifest.json + CSV 로딩
│   │   │   ├── audio.js       # TTS · 효과음
│   │   │   └── certificate.js # 수료증 + PNG 저장
│   │   └── views/             # home · verse · ordering · quiz · stats
│   └── tests/
│       ├── logic.test.mjs     # 포팅이 파이썬과 일치하는지
│       └── e2e.test.mjs       # 실제 브라우저 흐름
├── app.py, banki/             # 기존 Streamlit 앱 (아래 참고)
│   ├── config.py · grading.py · srs.py · quiz.py · hints.py · bible_data.py
│   │                          #   ↑ 웹앱이 포팅해 온 기준 구현
│   └── storage.py · *_mode.py · styles.py …
│                              #   ↑ Streamlit 전용 UI 계층
├── scripts/
│   ├── build_site.py          # web/ + data/ → _site/ + manifest.json
│   ├── gen_fixtures.py        # 파이썬 출력 → tests/fixtures/logic.json
│   └── gen_bible_data.py      # bible_data.py → bible-data.js
├── data/                      # CSV 구절집 · 문제집
└── tests/                     # pytest + 골든 픽스처
```

### 왜 로직을 두 벌 유지하나요?

정적 호스팅에는 파이썬 런타임이 없어 채점·SRS를 브라우저에서 다시 구현해야 했습니다.
포팅이 원본과 어긋나면 점수와 복습 일정이 조용히 달라지므로,
`scripts/gen_fixtures.py`가 파이썬 출력을 고정하고
`web/tests/logic.test.mjs`가 자바스크립트 결과를 그것과 대조합니다.
CI에서 두 검사가 모두 돌아갑니다.

파이썬 `round()`는 은행가 반올림이라 `round(2.5) == 2`인 반면 `Math.round(2.5)`는 3입니다.
`web/js/lib/util.js`의 `pyRound()`가 이 차이를 맞춥니다.

## Adding Verse Sets

`data/` 폴더에 CSV를 넣으면 빌드 시 `manifest.json`에 자동 등록됩니다.

| Column | Required | Description |
|---|---|---|
| `location` | ✅ | Book, chapter, and verse (e.g. `Romans 8:28`) — also the SRS card key |
| `verse_krv` | ✅ | Verse text in Korean (개역개정) |
| `verse_niv` | ✅ | Verse text in English (NIV) |
| `topic` | | 교재 진도 등 구절의 주제 — 있으면 장절 위에 함께 표시됩니다 |

```csv
location,verse_krv,verse_niv
빌립보서 4:13,내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라,I can do all this through him who gives me strength.
```

`data/제자양육 성경암송.csv`가 `topic` 열을 쓰는 예입니다.

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

## 기존 Streamlit 앱

`app.py`의 Streamlit 버전은 그대로 동작합니다. 웹앱이 포팅해 온 채점·SRS·힌트·문제
로직(`banki/grading.py`, `srs.py`, `hints.py`, `quiz.py`, `bible_data.py`)이 기준
구현이자 파이썬 테스트의 대상이라 함께 유지됩니다.

```bash
pip install -r requirements.txt
streamlit run app.py     # http://localhost:8501
```

Streamlit 버전은 진도를 서버의 `data/banki.db`에 저장하므로 웹앱의 브라우저 기록과
공유되지 않습니다.

## 배포

**최초 1회 설정이 필요합니다**: 저장소 **Settings → Pages → Source**를
**GitHub Actions**로 바꿔 주세요. 이건 저장소 소유자만 할 수 있습니다 — 워크플로
토큰(`GITHUB_TOKEN`)에는 Pages 사이트를 만들 권한이 없어서
`configure-pages`의 `enablement: true`로도 대신할 수 없습니다.

그 뒤로는 `main`에 푸시할 때마다 `.github/workflows/pages.yml`이 `_site/`를 만들어
자동 배포합니다. 설정 전에는 빌드까지는 성공하고 `configure-pages` 단계에서
`Get Pages site failed … Please verify that the repository has Pages enabled`
로 멈춥니다.

## Tech Stack
- **Vanilla JS (ES modules)** — 빌드 도구·프레임워크 없음
- **localStorage** — 진도 영속화
- **Web Speech API** — TTS (브라우저 내장, API 키 불필요)
- **html2canvas** — 인증서 PNG 저장 (CDN, 필요할 때만 로드)
- **Pretendard** — 한글 웹폰트 (CDN, 실패 시 시스템 폰트로 대체)
- **Python** — 기준 구현과 빌드 스크립트
