"""Completion certificates with PNG download."""
import html
import time

import streamlit as st
import streamlit.components.v1 as components

from . import config, styles


def _html_escape(text: str) -> str:
    return html.escape(text or "")


def render_verse_certificate(
    name: str,
    results: dict,
    total: int,
    set_label: str,
    on_continue_label: str | None = None,
) -> None:
    """Render a verse-memorization certificate."""
    styles.inject_certificate_styles()

    has_dictation = any("score" in v for v in results.values())
    avg_score = None
    grade = None
    if has_dictation:
        scores = [v["score"] for v in results.values() if "score" in v]
        if scores:
            avg_score = round(sum(scores) / len(scores))
            grade = config.compute_grade(avg_score)

    safe_name = _html_escape(name) if name else "수고하신 분"
    safe_set = _html_escape(set_label)
    date_str = time.strftime("%Y-%m-%d")

    score_html = ""
    if avg_score is not None:
        score_html = (
            '<p style="font-size:20px; margin:15px 0;">'
            f"평균 정확도: <b>{avg_score}%</b> "
            f"(등급: <b>{grade}</b>)</p>"
        )

    body = f"""
        <div id="banki-cert" class="b-cert-wrap">
            <div style="font-size:48px; margin-bottom:10px;">🏆</div>
            <h1>수 료 증</h1>
            <p style="font-size:14px; opacity:0.85; margin-bottom:25px;">{safe_set}</p>
            <hr>
            <p class="name">{safe_name}</p>
            <p style="font-size:16px; opacity:0.85;">위 사람은 성경 암송 {total}구절을 모두 마쳤음을 증명합니다.</p>
            {score_html}
            <hr>
            <p class="quote">&ldquo;이 율법책을 네 입에서 떠나지 말게 하며</p>
            <p class="quote">주야로 그것을 묵상하여</p>
            <p class="quote">그 가운데 기록한 대로 다 지켜 행하라&rdquo;</p>
            <p style="font-size:13px; opacity:0.7;">— 여호수아 1:8</p>
            <p style="font-size:16px; font-weight:bold; margin-top:18px;">🎉 축하합니다!</p>
            <p style="font-size:14px; opacity:0.85;">하나님의 말씀을 마음에 새기는 귀한 시간이었습니다.</p>
            <p style="font-size:11px; opacity:0.6; margin-top:14px;">발급일 {date_str}</p>
        </div>
    """
    st.markdown(body, unsafe_allow_html=True)
    _render_download_button("성경암송_수료증")

    if has_dictation:
        with st.expander("구절별 상세 결과 보기"):
            for loc, res in results.items():
                if "score" in res:
                    s = res["score"]
                    icon = "✅" if s >= 80 else "⚠️" if s >= 50 else "❌"
                    st.markdown(f"{icon} **{loc}** — {s}%")


def render_ordering_certificate(
    name: str,
    dataset: str,
    mode: str,
    elapsed_seconds: float,
    wrong_count: int,
) -> None:
    styles.inject_certificate_styles()

    minutes = int(elapsed_seconds // 60)
    seconds = int(elapsed_seconds % 60)
    time_str = f"{minutes}분 {seconds}초"

    safe_name = _html_escape(name) if name else "익명의 도전자"
    safe_dataset = _html_escape(dataset)
    safe_mode = _html_escape(mode)
    date_str = time.strftime("%Y-%m-%d")

    if wrong_count == 0:
        comment = "완벽합니다! 🏆"
    elif wrong_count <= 2:
        comment = "훌륭합니다! 거의 완벽한 암기력! ⭐"
    else:
        comment = "수고하셨습니다! 다음엔 더 잘할 수 있어요! 💪"

    body = f"""
        <div id="banki-cert" class="b-cert-wrap">
            <div style="font-size:48px; margin-bottom:10px;">✨</div>
            <h1>단어 순서 암기 인증서</h1>
            <hr>
            <p class="name">{safe_name}</p>
            <p style="font-size:16px;">과목: <b>{safe_dataset}</b></p>
            <p style="font-size:16px;">모드: <b>{safe_mode}</b></p>
            <p style="font-size:16px;">소요 시간: <b>{time_str}</b></p>
            <p style="font-size:16px;">틀린 횟수: <b>{wrong_count}회</b></p>
            <p style="font-size:16px;">날짜: <b>{date_str}</b></p>
            <hr>
            <p style="font-size:18px; font-weight:bold; margin:15px 0;">{comment}</p>
        </div>
    """
    st.markdown(body, unsafe_allow_html=True)
    _render_download_button("단어순서_수료증")


def _render_download_button(filename_prefix: str) -> None:
    """Inject an html2canvas-based PNG download button.

    Falls back gracefully if the library can't load.
    """
    components.html(
        f"""
        <div style="text-align:center; margin: 10px 0;">
            <button id="banki-dl"
                style="background:#16a34a; color:white; border:none; border-radius:8px;
                       padding:10px 18px; font-size:14px; cursor:pointer; min-height:40px;"
                aria-label="인증서 PNG 다운로드">
                📥 인증서 PNG 저장
            </button>
            <span id="banki-dl-msg" style="margin-left:8px; font-size:12px; color:#64748b;"></span>
        </div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script>
        (function() {{
            const btn = document.getElementById('banki-dl');
            const msg = document.getElementById('banki-dl-msg');
            btn.addEventListener('click', async function() {{
                const parentDoc = window.parent.document;
                const node = parentDoc.getElementById('banki-cert');
                if (!node) {{
                    msg.textContent = '인증서 요소를 찾지 못했습니다';
                    return;
                }}
                if (typeof html2canvas === 'undefined') {{
                    msg.textContent = '라이브러리 로드 실패 (오프라인)';
                    return;
                }}
                msg.textContent = '저장 중...';
                try {{
                    const canvas = await html2canvas(node, {{
                        scale: 2, backgroundColor: null, useCORS: true,
                    }});
                    const url = canvas.toDataURL('image/png');
                    const a = document.createElement('a');
                    a.download = '{filename_prefix}_' + new Date().toISOString().slice(0,10) + '.png';
                    a.href = url;
                    a.click();
                    msg.textContent = '저장 완료';
                }} catch (e) {{
                    msg.textContent = '저장 실패: ' + e.message;
                }}
            }});
        }})();
        </script>
        """,
        height=64,
    )
