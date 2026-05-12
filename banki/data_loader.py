"""CSV loaders with caching."""
import io
import os

import pandas as pd
import streamlit as st

from . import config


@st.cache_data(show_spinner=False)
def load_verse_csv(file_path: str) -> pd.DataFrame:
    return pd.read_csv(file_path)


@st.cache_data(show_spinner=False)
def load_ordering_csv(file_path: str) -> list[str]:
    df = pd.read_csv(file_path)
    df = df.sort_values("order").reset_index(drop=True)
    return df["name_ko"].tolist()


def load_ordering_csv_from_upload(uploaded_file) -> list[str] | None:
    raw = uploaded_file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp949")
    df = pd.read_csv(io.StringIO(text))
    required = {"order", "name_ko", "name_en"}
    if not required.issubset(set(df.columns)):
        return None
    df = df.sort_values("order").reset_index(drop=True)
    return df["name_ko"].tolist()


def list_verse_files() -> list[str]:
    if not os.path.isdir(config.DATA_DIR):
        return []
    files = [
        f for f in os.listdir(config.DATA_DIR)
        if f.endswith(".csv") and not f.startswith("bible_books_")
    ]
    files.sort()
    if config.DEFAULT_FILE in files:
        files.remove(config.DEFAULT_FILE)
        files.insert(0, config.DEFAULT_FILE)
    return files


def list_ordering_files() -> list[str]:
    if not os.path.isdir(config.DATA_DIR):
        return []
    return sorted(
        f for f in os.listdir(config.DATA_DIR)
        if f.startswith("bible_books_") and f.endswith(".csv")
    )
