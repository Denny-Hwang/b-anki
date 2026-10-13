import { getChosungChar } from './hints.js';

// Grading for "which verse is this?" — the reverse of verse recall.
//
// The learner types an address such as "롬 12:1", "로마서12장1절" or
// "요한일서 4:8"; we reduce it to (book, chapter, verse) so spacing, the 장/절
// suffixes and the common short book names all land on the same answer.

/** Canonical book name -> accepted aliases (short names, 요한1서 style spellings). */
const BOOKS = {
  창세기: ['창'], 출애굽기: ['출'], 레위기: ['레'], 민수기: ['민'], 신명기: ['신'],
  여호수아: ['수'], 사사기: ['삿'], 룻기: ['룻'], 사무엘상: ['삼상'], 사무엘하: ['삼하'],
  열왕기상: ['왕상'], 열왕기하: ['왕하'], 역대상: ['대상'], 역대하: ['대하'],
  에스라: ['스'], 느헤미야: ['느'], 에스더: ['에'], 욥기: ['욥'], 시편: ['시'],
  잠언: ['잠'], 전도서: ['전'], 아가: ['아'], 이사야: ['사'], 예레미야: ['렘'],
  예레미야애가: ['애'], 에스겔: ['겔'], 다니엘: ['단'], 호세아: ['호'], 요엘: ['욜'],
  아모스: ['암'], 오바댜: ['옵'], 요나: ['욘'], 미가: ['미'], 나훔: ['나'],
  하박국: ['합'], 스바냐: ['습'], 학개: ['학'], 스가랴: ['슥'], 말라기: ['말'],
  마태복음: ['마'], 마가복음: ['막'], 누가복음: ['눅'], 요한복음: ['요'],
  사도행전: ['행'], 로마서: ['롬'], 고린도전서: ['고전'], 고린도후서: ['고후'],
  갈라디아서: ['갈'], 에베소서: ['엡'], 빌립보서: ['빌'], 골로새서: ['골'],
  데살로니가전서: ['살전'], 데살로니가후서: ['살후'], 디모데전서: ['딤전'],
  디모데후서: ['딤후'], 디도서: ['딛'], 빌레몬서: ['몬'], 히브리서: ['히'],
  야고보서: ['약'], 베드로전서: ['벧전'], 베드로후서: ['벧후'],
  요한일서: ['요한1서', '요일'], 요한이서: ['요한2서', '요이'],
  요한삼서: ['요한3서', '요삼'], 유다서: ['유'], 요한계시록: ['계시록', '계'],
};

const ALIAS_TO_BOOK = new Map();
for (const [book, aliases] of Object.entries(BOOKS)) {
  ALIAS_TO_BOOK.set(book, book);
  aliases.forEach((a) => ALIAS_TO_BOOK.set(a, book));
}

// Longest alias first, so "요한일서" is never read as the "요" of 요한복음.
const ALIASES_BY_LENGTH = [...ALIAS_TO_BOOK.keys()].sort((a, b) => b.length - a.length);

/** Unify the equivalent spellings of a book name ("요한1서" == "요한일서"). */
export function canonicalBook(name) {
  const key = (name || '').normalize('NFC').replace(/\s+/g, '');
  return ALIAS_TO_BOOK.get(key) || key;
}

/**
 * Split an address into { book, chapter, verse }, or null when it has no
 * recognisable book or no chapter number.
 *
 * `verse` stays a string so ranges ("8-9") compare exactly; it is '' when the
 * address names only a chapter.
 */
export function parseReference(text) {
  const compact = (text || '').normalize('NFC')
    .replace(/[\s　]+/g, '')
    .replace(/[~–—－]/g, '-');
  if (!compact) return null;

  const alias = ALIASES_BY_LENGTH.find((a) => compact.startsWith(a));
  if (!alias) return null;

  const rest = compact.slice(alias.length);
  const m = rest.match(/^(\d+)(?:장|:|\.)?(\d+(?:-\d+)?)?절?$/);
  if (!m) return null;
  return { book: ALIAS_TO_BOOK.get(alias), chapter: Number(m[1]), verse: m[2] || '' };
}

/**
 * Grade a typed address against the verse's real one.
 *   100 — same book, chapter and verse
 *    50 — right book and chapter, wrong verse (so close it deserves credit)
 *     0 — anything else, including an unreadable answer
 */
export function gradeReference(userText, answerText) {
  const answer = parseReference(answerText);
  const user = parseReference(userText);
  if (!answer || !user) {
    // An answer we cannot parse (odd CSV) still deserves an exact-text match.
    const same = (userText || '').replace(/\s+/g, '') === (answerText || '').replace(/\s+/g, '');
    return { score: same && answer === null ? 100 : 0, parsed: false };
  }
  const bookOk = user.book === answer.book;
  const chapterOk = user.chapter === answer.chapter;
  const verseOk = user.verse === answer.verse;
  let score = 0;
  if (bookOk && chapterOk && verseOk) score = 100;
  else if (bookOk && chapterOk) score = 50;
  return { score, parsed: true, bookOk, chapterOk, verseOk };
}

/**
 * Progressive hint for an address.
 *   0 the topic (when the set has one) or the testament's side of the Bible
 *   1 the book's leading consonant
 *   2 the book name
 *   3+ the book and chapter
 */
export function referenceHint(location, level, topic = '') {
  const ref = parseReference(location);
  if (!ref) return `💡 ${location.slice(0, Math.max(1, Math.ceil(location.length / 2)))}…`;
  if (level <= 0) {
    return topic ? `💡 주제: ${topic}` : `💡 ${ref.verse ? '절' : '장'} 번호: ${ref.verse || ref.chapter}`;
  }
  if (level === 1) return `💡 책 이름의 초성: ${getChosungChar(ref.book[0])}`;
  if (level === 2) return `💡 책 이름: ${ref.book}`;
  return `💡 ${ref.book} ${ref.chapter}장`;
}
