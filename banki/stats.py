"""Stats dashboard: streaks, accuracy, history."""
import streamlit as st
import pandas as pd

from . import storage


def render_dashboard(user_id: int, user_name: str) -> None:
    st.markdown(f"### 📊 {user_name}님의 학습 통계")

    stats = storage.get_user_stats(user_id)
    streak = storage.compute_streak(user_id)

    cols = st.columns(4)
    tiles = [
        ("🔥 연속", f"{streak}일"),
        ("📚 총 복습", str(stats["total_reviews"])),
        ("🃏 학습 카드", str(stats["cards_seen"])),
        ("🎯 평균", f"{stats['avg_accuracy']}%" if stats["avg_accuracy"] is not None else "—"),
    ]
    for col, (lbl, val) in zip(cols, tiles):
        with col:
            st.markdown(
                f'<div class="stat-tile"><div class="num">{val}</div>'
                f'<div class="lbl">{lbl}</div></div>',
                unsafe_allow_html=True,
            )

    st.markdown("")

    per_day = stats["per_day"]
    if per_day:
        df = pd.DataFrame(per_day)
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date")
        st.markdown("**일자별 복습 횟수**")
        st.bar_chart(df["count"], height=180)
    else:
        st.info("아직 복습 기록이 없습니다. 학습을 시작해 보세요.")

    sessions = stats["sessions"]
    if sessions:
        with st.expander(f"최근 세션 ({len(sessions)}개) 보기"):
            for s in sessions:
                avg = s["avg_score"]
                avg_str = f"{round(avg)}%" if avg is not None else "—"
                started = s["started_at"][:16].replace("T", " ")
                st.markdown(
                    f"- **{started}** · {s['set_name']} · {s['mode']} · "
                    f"{s['cards_reviewed']}장 · 평균 {avg_str}"
                )


def render_hard_cards(user_id: int, set_name: str) -> None:
    cards = storage.get_hard_cards(user_id, set_name, limit=10)
    if not cards:
        return
    st.markdown("**🔁 자주 틀린 구절 (복습 권장)**")
    for c in cards:
        st.markdown(f"- {c['location']} — 실수 {c['lapses']}회 (난이도 ease={c['ease']:.2f})")
