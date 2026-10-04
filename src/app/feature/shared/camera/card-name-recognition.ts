import type { Page } from 'tesseract.js';
import type { CardNameRecognition } from '../interface/card-name-recognition.interface';
import type { CardNameCandidate } from '../interface/card-name-candidate.interface';

/** Convert one OCR pass into a printed name without dictionary-based guessing. */
export function readCardName(
    data: Page,
    imageWidth: number,
    language: string,
): CardNameRecognition {
    let titleText = data.text;
    let confidence = data.confidence;
    const words =
        data.blocks?.flatMap((block) =>
            block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
        ) ?? [];
    if (!['ar', 'he'].includes(language)) {
        const manaStart = words.findIndex(
            (word, index) =>
                index > 0 &&
                word.bbox.x0 > imageWidth * 0.65 &&
                word.bbox.x0 - words[index - 1].bbox.x1 >
                    (words[index - 1].bbox.y1 - words[index - 1].bbox.y0) * 0.9,
        );
        if (manaStart > 0) {
            const titleWords = words.slice(0, manaStart);
            titleText = titleWords.map((word) => word.text).join(' ');
            confidence =
                titleWords.reduce((sum, word) => sum + word.confidence, 0) / titleWords.length;
        }
    }
    let name = titleText
        .normalize('NFC')
        .replace(/[^\p{L}\p{M}\p{N}'’.,:!?()\- /]/gu, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s'’.,:;|()]+|[\s|]+$/g, '')
        .trim();
    if (['ja', 'zhs', 'zht'].includes(language)) {
        name = name.replace(
            /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,
            '$1',
        );
    }
    if (!/\p{L}/u.test(name)) name = '';
    return { name, rawText: data.text.trim(), confidence, requiresReview: true };
}

/** Rank agreement across preprocessing/segmentation passes, not a single OCR score. */
export function selectCardName(candidates: readonly CardNameCandidate[]): CardNameRecognition {
    const groups = new Map<string, CardNameCandidate[]>();
    for (const candidate of candidates) {
        if (!candidate.name || candidate.confidence < 35) continue;
        const key = candidate.name.toLowerCase().replace(/[’]/g, "'");
        const group = groups.get(key) ?? [];
        group.push(candidate);
        groups.set(key, group);
    }
    let best: CardNameRecognition = { name: '', rawText: '', confidence: 0, requiresReview: true };
    let bestScore = -Infinity;
    for (const group of groups.values()) {
        const strongest = group.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
        const average =
            group.reduce((sum, candidate) => sum + candidate.confidence, 0) / group.length;
        const independentCrop = new Set(group.map((candidate) => candidate.source)).size > 1;
        const score = average + Math.min(group.length - 1, 3) * 4 + (independentCrop ? 8 : 0);
        if (score > bestScore) {
            bestScore = score;
            // Uncorroborated readings should prompt review even if Tesseract is confident.
            best = {
                name: strongest.name,
                rawText: strongest.rawText,
                confidence: strongest.confidence,
                requiresReview: group.length < 2 || strongest.confidence < 70,
            };
        }
    }
    return best;
}
