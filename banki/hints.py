"""Progressive hint generation for verses and bible book ordering."""
import random

CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ',
           'ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']


def get_chosung_char(char: str) -> str:
    if '가' <= char <= '힣':
        code = ord(char) - ord('가')
        return CHOSUNG[code // 588]
    return char


def get_chosung(text: str) -> str:
    if not text:
        return ""
    return "".join(get_chosung_char(c) for c in text)


def first_chosung(word: str) -> str:
    if not word:
        return ""
    return get_chosung_char(word[0])


def verse_hint(verse: str, level: int) -> str:
    """Progressive verse hint.

    level 0: first character chosung of first word
    level 1: full first word
    level 2: first word + first character chosung of second word
    level 3: first two words
    level 4: first half of verse
    """
    words = [w for w in verse.split() if w]
    if not words:
        return ""
    if level <= 0:
        return f"💡 첫 단어의 초성: {first_chosung(words[0])}"
    if level == 1:
        return f"💡 첫 단어: {words[0]}"
    if level == 2:
        if len(words) > 1:
            return f"💡 {words[0]} {first_chosung(words[1])}..."
        return f"💡 첫 단어: {words[0]}"
    if level == 3:
        if len(words) >= 2:
            return f"💡 {words[0]} {words[1]} ..."
        return f"💡 첫 단어: {words[0]}"
    half = max(1, len(words) // 2)
    return "💡 " + " ".join(words[:half]) + " ..."


def chosung_outline(verse: str) -> str:
    """Whole-verse chosung outline (for advanced practice)."""
    words = [w for w in verse.split() if w]
    return " ".join(get_chosung(w) for w in words)


def random_word_hint(verse: str) -> str:
    words = [w for w in verse.split() if w]
    if not words:
        return ""
    return random.choice(words)


def book_hint(word: str, level: int, emoji_map: dict, hint_map: dict) -> str:
    """Progressive bible book hint.

    level 1: content hint only
    level 2: content + chosung
    level 3: content + chosung + character count
    """
    emoji = emoji_map.get(word, "💡")
    content = hint_map.get(word, "")
    ch = first_chosung(word)
    if level <= 1:
        if content:
            return f"{emoji} 힌트: {content}"
        return f"💡 '{ch}'으로 시작합니다"
    if level == 2:
        if content:
            return f"{emoji} {content} (초성: '{ch}')"
        return f"💡 '{ch}'으로 시작합니다"
    if content:
        return f"⚠️ 마지막 힌트! {content} ('{ch}'으로 시작하는 {len(word)}글자)"
    return f"⚠️ 마지막 힌트! '{ch}'으로 시작하는 {len(word)}글자"
