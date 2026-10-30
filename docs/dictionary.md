# WORD-AL dictionary data

## Source and license

The current answer and accepted-guess lists are a small, hand-curated starter set maintained in `src/game.ts`; they were not copied from an external word list. There is therefore no external dataset license or attribution to pass through. The lists are intentionally not represented as a comprehensive English dictionary. Before importing a larger list, record its source/version/license and attribution here, then filter for familiar general-audience English and review unsuitable entries.

## Data model

`ANSWERS[5]` and `ANSWERS[6]` contain eligible secret answers. `ACCEPTED` is the larger accepted-guess source set; `src/dictionary.ts` normalizes, length-filters, deduplicates, and indexes it as a Set separately for each supported length. Answer words are verified to be subsets of accepted guesses by tests. Current counts: 61 five-letter and 30 six-letter answers; 158 five-letter and 53 six-letter accepted guesses. Print the current counts with `npx tsx -e "import { dictionarySizes } from './src/dictionary.ts'; console.log(dictionarySizes)"`.

Normalization trims only surrounding whitespace and lowercases. It does not strip punctuation, accents, apostrophes, or unsupported characters; validation then requires only ASCII `a-z` and the exact configured length. Add entries to the source arrays in lowercase, rerun tests, and keep answer eligibility more restrictive than accepted guesses. No generated/derived dictionary file exists.

Only `general` is currently supported. Other category requests fail explicitly instead of silently falling back. The browser includes these starter answer/guess sets for local practice. The multiplayer server chooses the authoritative answer and validates guesses server-side; private match payloads must not expose the chosen answer before round completion. Word-difficulty metadata is not fabricated; Random Words can have uneven difficulty.
