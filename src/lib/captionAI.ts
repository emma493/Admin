/**
 * Caption AI (Beta) — SEO caption + hashtag suggester for uploads.
 *
 * Honest scope: this is a LOCAL suggestion engine, not a trained model and
 * not a live scrape. The 26 reference aggregators (tik.porn, xfree, redgifs,
 * sex.com, xxxtik, fikfap, fkbae, hornyleak, r/tiktoknsfw, r/tiktokporn,
 * fyptt, sharesome, xxxfollow, waptap, ogfap, onlytik, pin.porn, pornobae,
 * saucesenpai, reddxxx, reelsmunkey, shorts.xxx, onlyscroll, tiktits,
 * nuditok) are JS-rendered / bot-protected / rate-limited, so no live crawl
 * runs from here. The banks below are a SEED CORPUS modeled on those sites'
 * SEO patterns: brief hook captions + broad/niche/category hashtag mix.
 * Refresh hook: swap/extend the banks from a future trend fetcher
 * (allowed APIs/RSS) without touching callers — suggest() is the boundary.
 *
 * Session B contract: Admin writes `caption` (string) + `hashtags`
 * (string[]) on videos; public site displays them on play and indexes them
 * for caption/hashtag search. See AI/MEMORY.md.
 */

import type { VideoCategory } from '../types';
import rawCorpus from './trend-corpus.json';

interface CorpusEntry {
  caption: string;
  hashtags: string[];
  weight?: number;
}

function corpusFor(category: VideoCategory): CorpusEntry[] {
  const list = (rawCorpus as any)?.[category];
  if (!Array.isArray(list)) return [];
  const valid: CorpusEntry[] = [];
  for (const e of list) {
    if (
      e &&
      typeof e.caption === 'string' &&
      e.caption.trim().length > 0 &&
      e.caption.length <= 120 &&
      Array.isArray(e.hashtags) &&
      e.hashtags.length > 0 &&
      e.hashtags.every((t: unknown) => typeof t === 'string' && (t as string).startsWith('#'))
    ) {
      valid.push({ caption: e.caption.trim(), hashtags: e.hashtags, weight: e.weight });
    }
  }
  return valid;
}

export const TREND_SOURCES = [
  'tik.porn', 'xfree.com', 'redgifs.com', 'sex.com', 'xxxtik.com', 'fikfap.com',
  'fkbae.to', 'hornyleak.tv', 'reddit.com/r/tiktoknsfw', 'reddit.com/r/tiktokporn',
  'fyptt.to', 'sharesome.com', 'xxxfollow.com', 'waptap.com', 'ogfap.com',
  'onlytik.com', 'pin.porn', 'pornobae.com', 'saucesenpai.com', 'reddxxx.com',
  'reelsmunkey.com', 'shorts.xxx', 'onlyscroll.com', 'tiktits.com', 'nuditok.com',
];

const HOOK_WORDS = ['pov', 'wait', 'rate', 'watch', 'part', 'reply', 'duet', 'try'];

const GIRLS_CAPTIONS = [
  'POV: she understood the assignment',
  'Wait for the transition',
  'Rate this fit 1-10',
  'POV: friday night energy',
  'She ate this trend up',
  'Watch till the end',
  'POV: main character moment',
  'This dance lives in my head',
  'Reply with your rating',
  'POV: golden hour hits different',
  'Part 1 — should I post part 2?',
  'The confidence in this one',
];

// Niche tags mined 2026-09-25 from 238 crawled titles (tools/crawl_trends.py
// + merge_corpus.py keyword mining), extended 2026-09-25 from the 1531-title
// trend_crawler.py run. Only brand-safe tags kept — explicit scene titles were
// rejected as captions, their niche keywords became tags.
const GIRLS_TAGS = [
  '#fyp', '#viral', '#trending', '#tiktok', '#foryou', '#dance', '#trend',
  '#solo', '#amateur', '#girls', '#beauty', '#fitcheck', '#transition',
  '#pov', '#shortxx', '#brunette', '#blonde', '#dancing', '#natural',
  '#tattoo', '#cute', '#redhead', '#curvy',
];

export interface CaptionSuggestion {
  caption: string;
  hashtags: string[];
}

/** Hook-rate heuristic: brief + hook word + question/CTA wins. */
export function scoreCaption(caption: string): number {
  let score = 100 - Math.min(60, caption.length);
  const lower = caption.toLowerCase();
  if (HOOK_WORDS.some((w) => lower.includes(w))) score += 15;
  if (/\?|1-10|part/i.test(caption)) score += 10;
  return score;
}

/** Rotating suggestion so bulk uploads get varied captions, not 50 dupes.
 * Manual corpus entries come FIRST (repeated by weight), seed banks fill the rest. */
export function suggestFor(category: VideoCategory, index: number, salt = 0): CaptionSuggestion {
  const pool: CaptionSuggestion[] = [];
  for (const e of corpusFor(category)) {
    const times = Math.min(3, Math.max(1, e.weight ?? 1));
    for (let k = 0; k < times; k++) pool.push({ caption: e.caption, hashtags: e.hashtags });
  }
  const captions = GIRLS_CAPTIONS;
  const tags = GIRLS_TAGS;
  for (let k = 0; k < captions.length; k++) {
    pool.push({
      caption: captions[k],
      hashtags: [
        tags[(k * 3) % tags.length],
        tags[(k * 3 + 4) % tags.length],
        tags[(k * 3 + 8) % tags.length],
        tags[(k * 3 + 12) % tags.length],
      ].filter((t, i, arr) => arr.indexOf(t) === i),
    });
  }
  return pool[(index + salt * 7) % pool.length];
}
