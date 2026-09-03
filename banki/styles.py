"""CSS injection: responsive layout, dark mode, accessibility, components."""
import streamlit as st
from . import config


def get_font_size() -> int:
    if "font_size" not in st.session_state:
        try:
            saved = st.query_params.get("fs", "")
            st.session_state.font_size = int(saved) if saved else config.DEFAULT_FONT_SIZE
        except (ValueError, TypeError):
            st.session_state.font_size = config.DEFAULT_FONT_SIZE
    return st.session_state.font_size


def set_font_size(size: int) -> None:
    size = max(config.MIN_FONT_SIZE, min(config.MAX_FONT_SIZE, size))
    st.session_state.font_size = size
    try:
        st.query_params["fs"] = str(size)
    except Exception:
        pass


def inject_global_styles() -> None:
    """Inject base CSS: design tokens, responsive layout, dark-mode aware components."""
    font_size = get_font_size()
    location_size = max(font_size - 6, 14)
    result_size = max(font_size - 8, 13)
    st.markdown(
        f"""
        <style>
        :root {{
            --b-card-bg: #f8fafc;
            --b-card-fg: #1e293b;
            --b-card-border: #3b82f6;
            --b-hidden-bg: #f1f5f9;
            --b-hidden-fg: #475569;
            --b-hidden-border: #94a3b8;
            --b-hint-bg: #fffbeb;
            --b-hint-fg: #78350f;
            --b-hint-border: #f59e0b;
            --b-location-fg: #1e3a5f;
            --b-good: #16a34a;
            --b-partial: #d97706;
            --b-bad: #dc2626;
            --b-muted: #64748b;
            --b-cert-grad-start: #fffbeb;
            --b-cert-grad-mid: #fef3c7;
            --b-cert-fg: #92400e;
            --b-cert-name-fg: #1e3a5f;
        }}

        @media (prefers-color-scheme: dark) {{
            :root {{
                --b-card-bg: #1e293b;
                --b-card-fg: #f1f5f9;
                --b-card-border: #60a5fa;
                --b-hidden-bg: #0f172a;
                --b-hidden-fg: #cbd5e1;
                --b-hidden-border: #475569;
                --b-hint-bg: #422006;
                --b-hint-fg: #fef3c7;
                --b-hint-border: #f59e0b;
                --b-location-fg: #93c5fd;
                --b-good: #4ade80;
                --b-partial: #fbbf24;
                --b-bad: #f87171;
                --b-muted: #94a3b8;
                --b-cert-grad-start: #422006;
                --b-cert-grad-mid: #78350f;
                --b-cert-fg: #fef3c7;
                --b-cert-name-fg: #bfdbfe;
            }}
        }}

        div[data-testid="stMainBlockContainer"] {{
            max-width: 820px;
        }}

        .verse-location {{
            font-size: {location_size}px;
            font-weight: bold;
            color: var(--b-location-fg);
            text-align: center;
            margin-bottom: 10px;
            letter-spacing: 0.02em;
        }}
        .verse-text {{
            font-size: {font_size}px;
            line-height: 1.65;
            text-align: center;
            padding: 22px;
            background: var(--b-card-bg);
            color: var(--b-card-fg);
            border-radius: 14px;
            border-left: 4px solid var(--b-card-border);
            margin: 10px 0;
            min-height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .verse-hidden {{
            font-size: {font_size}px;
            text-align: center;
            padding: 40px 20px;
            background: var(--b-hidden-bg);
            color: var(--b-hidden-fg);
            border-radius: 14px;
            border: 2px dashed var(--b-hidden-border);
            margin: 10px 0;
            min-height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .hint-display {{
            font-size: {max(font_size - 4, 16)}px;
            text-align: center;
            padding: 15px;
            background: var(--b-hint-bg);
            color: var(--b-hint-fg);
            border-radius: 12px;
            border: 2px solid var(--b-hint-border);
            margin: 10px 0;
            font-weight: 600;
        }}
        .dictation-result {{
            font-size: {result_size}px;
            line-height: 1.85;
            padding: 16px;
            background: var(--b-card-bg);
            color: var(--b-card-fg);
            border-radius: 12px;
            margin: 10px 0;
        }}
        .dictation-result .w-full {{ color: var(--b-good); font-weight: 700; }}
        .dictation-result .w-partial {{ color: var(--b-partial); font-weight: 600; }}
        .dictation-result .w-missing {{ color: var(--b-bad); text-decoration: underline; }}
        .dictation-result .w-extra {{ color: var(--b-partial); }}
        .dictation-result .w-miss {{ color: var(--b-bad); }}

        .score-display {{
            font-size: 56px;
            font-weight: 800;
            text-align: center;
            margin: 12px 0;
            letter-spacing: -0.02em;
        }}
        .score-good {{ color: var(--b-good); }}
        .score-ok {{ color: var(--b-partial); }}
        .score-bad {{ color: var(--b-bad); }}

        .theme-card {{
            border: 2px solid rgba(148, 163, 184, 0.3);
            border-radius: 16px;
            padding: 28px 20px;
            text-align: center;
            background: var(--b-card-bg);
            min-height: 200px;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }}
        .theme-card:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 18px rgba(0,0,0,0.08);
        }}
        .theme-card h3 {{ margin-top: 10px; color: var(--b-card-fg); }}
        .theme-card p {{ color: var(--b-muted); font-size: 14px; }}

        .answer-chain {{
            font-size: 16px;
            line-height: 2;
            padding: 15px;
            background: rgba(34, 197, 94, 0.08);
            color: var(--b-card-fg);
            border-radius: 12px;
            border-left: 4px solid var(--b-good);
            margin: 10px 0;
        }}

        /* theme 3: PCUSA 헌법·규례 학습문제 */
        .quiz-category {{
            font-size: 13px;
            font-weight: 600;
            color: var(--b-muted);
            letter-spacing: 0.02em;
            margin-bottom: 6px;
        }}
        .quiz-question {{
            font-size: {max(font_size - 6, 17)}px;
            line-height: 1.7;
            padding: 20px 22px;
            background: var(--b-card-bg);
            color: var(--b-card-fg);
            border-radius: 14px;
            border-left: 4px solid var(--b-card-border);
            margin: 4px 0 14px;
        }}
        .quiz-question .quiz-num {{
            font-weight: 800;
            color: var(--b-card-border);
            margin-right: 6px;
        }}
        .quiz-hidden {{
            font-size: {max(font_size - 8, 15)}px;
            text-align: center;
            padding: 32px 20px;
            background: var(--b-hidden-bg);
            color: var(--b-hidden-fg);
            border-radius: 14px;
            border: 2px dashed var(--b-hidden-border);
            margin: 10px 0;
        }}
        .quiz-verdict {{
            font-size: 20px;
            font-weight: 700;
            text-align: center;
            padding: 10px;
            border-radius: 12px;
            margin: 10px 0;
        }}
        .quiz-correct {{ background: rgba(34, 197, 94, 0.12); color: var(--b-good); }}
        .quiz-partial {{ background: rgba(217, 119, 6, 0.12); color: var(--b-partial); }}
        .quiz-wrong {{ background: rgba(220, 38, 38, 0.12); color: var(--b-bad); }}
        .quiz-picked {{
            font-size: 15px;
            text-align: center;
            color: var(--b-bad);
            margin: 4px 0 10px;
        }}
        .quiz-answer {{
            font-size: {max(font_size - 8, 16)}px;
            line-height: 1.6;
            padding: 16px 18px;
            background: rgba(34, 197, 94, 0.08);
            color: var(--b-card-fg);
            border-radius: 12px;
            border-left: 4px solid var(--b-good);
            margin: 10px 0;
        }}
        .quiz-answer .quiz-answer-lbl {{
            display: inline-block;
            font-size: 12px;
            font-weight: 700;
            color: var(--b-good);
            border: 1px solid var(--b-good);
            border-radius: 6px;
            padding: 1px 7px;
            margin-right: 10px;
            vertical-align: middle;
        }}
        .quiz-explanation {{
            font-size: 14px;
            line-height: 1.75;
            padding: 14px 16px;
            background: var(--b-hint-bg);
            color: var(--b-hint-fg);
            border-radius: 12px;
            border: 1px solid var(--b-hint-border);
            margin: 10px 0;
        }}

        .stat-tile {{
            background: var(--b-card-bg);
            color: var(--b-card-fg);
            padding: 18px 16px;
            border-radius: 14px;
            text-align: center;
            border: 1px solid rgba(148, 163, 184, 0.25);
        }}
        .stat-tile .num {{
            font-size: 32px;
            font-weight: 800;
            color: var(--b-card-border);
        }}
        .stat-tile .lbl {{
            font-size: 13px;
            color: var(--b-muted);
            margin-top: 4px;
        }}

        /* mobile-friendly button rows */
        @media (max-width: 640px) {{
            div[data-testid="stHorizontalBlock"] {{
                flex-wrap: wrap;
            }}
            div[data-testid="stHorizontalBlock"] > div {{
                min-width: 120px !important;
                flex: 1 1 45% !important;
            }}
            .score-display {{ font-size: 44px; }}
            .verse-text, .verse-hidden {{ padding: 16px; }}
        }}

        @media (prefers-reduced-motion: reduce) {{
            .theme-card {{ transition: none; }}
        }}

        button[kind="primary"]:focus-visible,
        button[kind="secondary"]:focus-visible {{
            outline: 3px solid var(--b-card-border) !important;
            outline-offset: 2px !important;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def inject_certificate_styles() -> None:
    st.markdown(
        """
        <style>
        .b-cert-wrap {
            border: 4px double #d4af37;
            border-radius: 20px;
            padding: 40px 30px;
            margin: 20px auto;
            max-width: 640px;
            text-align: center;
            background: linear-gradient(135deg, var(--b-cert-grad-start) 0%, var(--b-cert-grad-mid) 50%, var(--b-cert-grad-start) 100%);
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            color: var(--b-cert-fg);
        }
        .b-cert-wrap h1 {
            font-family: Georgia, serif;
            color: var(--b-cert-fg);
            font-size: 32px;
            margin-bottom: 5px;
        }
        .b-cert-wrap .name {
            font-size: 28px;
            font-weight: bold;
            color: var(--b-cert-name-fg);
            margin: 20px 0;
        }
        .b-cert-wrap hr {
            border: 1px solid #d4af37;
            margin: 15px 40px;
        }
        .b-cert-wrap .quote {
            font-size: 15px;
            color: var(--b-cert-fg);
            margin: 2px 20px;
            font-style: italic;
            opacity: 0.85;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
