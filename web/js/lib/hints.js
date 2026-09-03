// Progressive hints for verses and bible-book ordering. Ported from banki/hints.py.

const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

export function getChosungChar(char) {
  const code = char.codePointAt(0);
  if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
    return CHOSUNG[Math.floor((code - HANGUL_BASE) / 588)];
  }
  return char;
}

export function getChosung(text) {
  if (!text) return '';
  return Array.from(text).map(getChosungChar).join('');
}

export function firstChosung(word) {
  if (!word) return '';
  return getChosungChar(word[0]);
}

/**
 * Progressive verse hint.
 *   0 first word's leading consonant · 1 first word · 2 first word + next
 *   consonant · 3 first two words · 4+ first half of the verse
 */
export function verseHint(verse, level) {
  const words = (verse || '').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (level <= 0) return `💡 첫 단어의 초성: ${firstChosung(words[0])}`;
  if (level === 1) return `💡 첫 단어: ${words[0]}`;
  if (level === 2) {
    if (words.length > 1) return `💡 ${words[0]} ${firstChosung(words[1])}...`;
    return `💡 첫 단어: ${words[0]}`;
  }
  if (level === 3) {
    if (words.length >= 2) return `💡 ${words[0]} ${words[1]} ...`;
    return `💡 첫 단어: ${words[0]}`;
  }
  const half = Math.max(1, Math.floor(words.length / 2));
  return '💡 ' + words.slice(0, half).join(' ') + ' ...';
}

/** Whole-verse consonant outline, for advanced practice. */
export function chosungOutline(verse) {
  return (verse || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(getChosung)
    .join(' ');
}

/**
 * Progressive bible-book hint.
 *   1 content only · 2 content + leading consonant · 3 adds the letter count
 */
export function bookHint(word, level, emojiMap, hintMap) {
  const emoji = emojiMap[word] || '💡';
  const content = hintMap[word] || '';
  const ch = firstChosung(word);

  if (level <= 1) {
    return content ? `${emoji} 힌트: ${content}` : `💡 '${ch}'으로 시작합니다`;
  }
  if (level === 2) {
    return content ? `${emoji} ${content} (초성: '${ch}')` : `💡 '${ch}'으로 시작합니다`;
  }
  return content
    ? `⚠️ 마지막 힌트! ${content} ('${ch}'으로 시작하는 ${Array.from(word).length}글자)`
    : `⚠️ 마지막 힌트! '${ch}'으로 시작하는 ${Array.from(word).length}글자`;
}
