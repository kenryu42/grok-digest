const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const SENTENCE_END = /[.!?。！？]/u;
const CLAUSE_END = /[,;:、，；：]/u;
const CJK_CHARACTERS_PER_WORD = 2;
const SHORTEST_WORD = 0.5;
const SENTENCE_PAUSE = 1;
const CLAUSE_PAUSE = 0.4;
const BLOCK_PAUSE = 1.5;
const MS_PER_MINUTE = 60_000;
const SPEECH_WORDS_PER_MINUTE = 190;
const SPEECH_RATE = { min: 0.5, max: 2 };

export type ReadToken = { text: string; at: number; word: boolean; step: number };

export type ReadPlan = { blocks: ReadToken[][]; weights: number[] };

function wordWeight(word: string): number {
  const cjk = word.match(CJK)?.length ?? 0;
  return cjk === 0 ? 1 : Math.max(cjk / CJK_CHARACTERS_PER_WORD, SHORTEST_WORD);
}

function pauseAfter(separator: string): number {
  if (SENTENCE_END.test(separator)) return SENTENCE_PAUSE;
  return CLAUSE_END.test(separator) ? CLAUSE_PAUSE : 0;
}

function addToLastWord(weights: number[], extra: number): void {
  const last = weights.length - 1;
  if (last >= 0) weights[last] = (weights[last] ?? 0) + extra;
}

export function readingPlan(texts: readonly string[]): ReadPlan {
  const weights: number[] = [];
  const blocks = texts.map((text) => {
    const tokens = [...segmenter.segment(text)].map(({ segment, index, isWordLike }): ReadToken => {
      if (isWordLike === true) {
        weights.push(wordWeight(segment));
        return { text: segment, at: index, word: true, step: weights.length - 1 };
      }
      addToLastWord(weights, pauseAfter(segment));
      return { text: segment, at: index, word: false, step: weights.length - 1 };
    });
    if (tokens.some(({ word }) => word)) addToLastWord(weights, BLOCK_PAUSE);
    return tokens;
  });
  return { blocks, weights };
}

export function wordMs(weight: number, wordsPerMinute: number): number {
  return (weight * MS_PER_MINUTE) / wordsPerMinute;
}

export function spokenText(plan: ReadPlan, fromStep: number): { text: string; starts: number[] } {
  const starts: number[] = [];
  const text = plan.blocks
    .map((tokens) => tokens.filter(({ step }) => step >= fromStep))
    .filter((tokens) => tokens.length > 0)
    .reduce((spoken, tokens, index) => {
      let block = index === 0 ? spoken : `${spoken}\n`;
      for (const { text: piece, word } of tokens) {
        if (word) starts.push(block.length);
        block += piece;
      }
      return block;
    }, "");
  return { text, starts };
}

export function speechLang(text: string): string {
  return KANA.test(text) ? "ja-JP" : "en-US";
}

export function speechRate(wordsPerMinute: number): number {
  return Math.min(Math.max(wordsPerMinute / SPEECH_WORDS_PER_MINUTE, SPEECH_RATE.min), SPEECH_RATE.max);
}
