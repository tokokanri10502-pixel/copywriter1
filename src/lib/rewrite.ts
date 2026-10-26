// 推敲トラック（自由記述の書き直し）の小ヘルパー。
import type { SelfRating } from '../types'
import { toHiragana } from './vocab'

// model_answer（「模範例1／模範例2」改行「観点：…」改行「OKの条件：条件1／条件2」）を
// 模範例・観点・OKの条件に分ける。OKの条件は 2026-10-27 から（無い問題もある）。
export function splitRewriteModel(model: string | null | undefined): {
  examples: string
  point: string
  criteria: string[]
} {
  if (!model) return { examples: '', point: '', criteria: [] }
  const ci = model.indexOf('OKの条件：')
  const body = ci < 0 ? model : model.slice(0, ci)
  const criteria =
    ci < 0
      ? []
      : model
          .slice(ci + 'OKの条件：'.length)
          .split('／')
          .map((x) => x.trim())
          .filter(Boolean)
  const i = body.indexOf('観点：')
  if (i < 0) return { examples: body.trim(), point: '', criteria }
  return { examples: body.slice(0, i).trim(), point: body.slice(i + '観点：'.length).trim(), criteria }
}

export const SELF_RATINGS: { value: SelfRating; mark: string; label: string }[] = [
  { value: 'good', mark: '◎', label: 'できた' },
  { value: 'close', mark: '△', label: '惜しい' },
  { value: 'miss', mark: '×', label: '直せていない' },
]

export const selfRatingLabel = (r: SelfRating | null | undefined) => {
  const hit = SELF_RATINGS.find((x) => x.value === r)
  return hit ? `${hit.mark} ${hit.label}` : null
}

// 比較用に、空白・かぎかっこ・文末の句点を取り除く。
// カタカナ/ひらがな・全角/半角の違いもそろえる。
const normalizeSentence = (s: string) =>
  toHiragana(s).replace(/[\s　「」『』]/g, '').replace(/[。．.]+$/, '')

// 書き直した文が模範例のどれかと（表記の細部を除いて）完全一致するか。
export function matchesModel(answer: string | null | undefined, examples: string): boolean {
  if (!answer || !examples) return false
  const a = normalizeSentence(answer)
  return a !== '' && examples.split('／').some((ex) => normalizeSentence(ex) === a)
}

// 元の文から書き換えていないか（空白・かぎかっこ・文末の句点の違いは無視）。
export function isUnchanged(answer: string | null | undefined, original: string | null | undefined): boolean {
  if (!answer || !original) return false
  return normalizeSentence(answer) === normalizeSentence(original)
}
