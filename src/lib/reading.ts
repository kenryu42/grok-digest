const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
const characters = new Intl.Segmenter("ja", { granularity: "grapheme" });

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CJK_ALL = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const SENTENCE_END = /[.!?。！？]/u;
const CLAUSE_END = /[,;:、，；：]/u;
const CJK_CHARACTERS_PER_WORD = 2;
const SHORTEST_WORD = 0.5;
const LONG_WORD = { letters: 8, weight: 1.25 };
const SENTENCE_PAUSE = 1;
const CLAUSE_PAUSE = 0.4;
const BLOCK_PAUSE = 1.5;
const RAMP_UP = [1.8, 1.5, 1.25, 1.1];
const MS_PER_MINUTE = 60_000;

export type ReadToken = { text: string; at: number; word: boolean; step: number };

type ReadWord = { text: string; focus: number; block: number };

export type ReadPlan = { blocks: ReadToken[][]; words: ReadWord[]; weights: number[] };

export function graphemes(text: string): string[] {
  return Array.from(characters.segment(text), ({ segment }) => segment);
}

function wordWeight(word: string): number {
  const cjk = word.match(CJK_ALL)?.length ?? 0;
  if (cjk > 0) return Math.max(cjk / CJK_CHARACTERS_PER_WORD, SHORTEST_WORD);
  return graphemes(word).length > LONG_WORD.letters ? LONG_WORD.weight : 1;
}

function pauseAfter(separator: string): number {
  if (SENTENCE_END.test(separator)) return SENTENCE_PAUSE;
  return CLAUSE_END.test(separator) ? CLAUSE_PAUSE : 0;
}

function addToLastWord(weights: number[], extra: number): void {
  const last = weights.length - 1;
  if (last >= 0) weights[last] = (weights[last] ?? 0) + extra;
}

export function focusIndex(word: string): number {
  const length = graphemes(word).length;
  if (CJK.test(word)) return Math.floor((length - 1) / 2);
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return length <= 13 ? 3 : 4;
}

export function readingPlan(texts: readonly string[]): ReadPlan {
  const weights: number[] = [];
  const words: ReadWord[] = [];
  const blocks = texts.map((text, block) => {
    let prefix = "";
    let touchingWord = false;
    return [...segmenter.segment(text)].map(({ segment, index, isWordLike }): ReadToken => {
      if (isWordLike === true) {
        weights.push(wordWeight(segment));
        words.push({ text: `${prefix}${segment}`, focus: graphemes(prefix).length + focusIndex(segment), block });
        prefix = "";
        touchingWord = true;
        return { text: segment, at: index, word: true, step: weights.length - 1 };
      }
      addToLastWord(weights, pauseAfter(segment));
      const mark = segment.trim();
      const last = words.at(-1);
      if (mark === "") touchingWord = false;
      else if (touchingWord && last !== undefined) last.text += mark;
      else prefix += mark;
      return { text: segment, at: index, word: false, step: weights.length - 1 };
    });
  });
  blocks.forEach((tokens) => {
    if (tokens.some(({ word }) => word)) {
      const lastStep = tokens.findLast(({ word }) => word)?.step ?? -1;
      weights[lastStep] = (weights[lastStep] ?? 0) + BLOCK_PAUSE;
    }
  });
  return { blocks, words, weights };
}

export function stepMs(plan: ReadPlan, step: number, wordsPerMinute: number): number {
  const ramp = RAMP_UP[step] ?? 1;
  return ((plan.weights[step] ?? 0) * ramp * MS_PER_MINUTE) / wordsPerMinute;
}
