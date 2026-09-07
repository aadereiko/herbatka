import { useQuery } from '@tanstack/react-query'

import { fetchBrands, fetchIngredients, fetchTeas } from '../../features/catalog/queries'
import { buildVocabulary } from './vocabulary'
import type { VocabEntry } from './vocabulary'

/** One page of 100 from each endpoint. Enough for this catalog with room to spare — and a
 *  bench that silently paged through 4000 ingredients would be measuring something other
 *  than what the real prefill feature could afford to load. */
const VOCAB_PAGE_SIZE = 100

export type Vocabulary = {
  entries: VocabEntry[]
  counts: { ingredients: number; brands: number; teas: number }
  /** True when any endpoint reported more rows than one page holds, so the bench can say
   *  so rather than quietly matching against a truncated dictionary. */
  truncated: boolean
}

/**
 * The catalog, as one flat list of words to match OCR against.
 *
 * Reuses `features/catalog/queries`' own fetchers rather than writing three more `api()`
 * calls: the endpoints and their page envelope are already spelled out there, and a
 * second copy in a dev folder is a second place to update when one of them moves.
 *
 * Not keyed by viewer, unlike every other catalog query. Those are, because they carry
 * `my_score` and `is_favourite`; this one reads nothing but `id`, `name`, `tea_type` and
 * `is_caffeinated`, which are the same for everybody — so a cache entry crossing a
 * sign-in boundary leaks nothing and saves three requests.
 */
export function useVocabulary() {
  return useQuery({
    queryKey: ['dev', 'ocr', 'vocabulary'],
    queryFn: async (): Promise<Vocabulary> => {
      const [ingredients, brands, teas] = await Promise.all([
        fetchIngredients({ size: VOCAB_PAGE_SIZE }),
        fetchBrands({ size: VOCAB_PAGE_SIZE }),
        fetchTeas({ size: VOCAB_PAGE_SIZE }),
      ])
      return {
        entries: buildVocabulary({
          ingredients: ingredients.items,
          brands: brands.items,
          teas: teas.items,
        }),
        counts: {
          ingredients: ingredients.total,
          brands: brands.total,
          teas: teas.total,
        },
        truncated: [ingredients, brands, teas].some((page) => page.pages > 1),
      }
    },
    // The vocabulary changes when somebody adds a tea, which is not something that
    // happens while a photograph is being tuned. Refetching it on every window focus
    // would restart the whole match pass for nothing.
    staleTime: Infinity,
  })
}
