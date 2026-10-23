// 推敲トラック（自由記述の書き直し）の小ヘルパー。
import type { SelfRating } from '../types'

// model_answer（「模範例1／模範例2\n観点：…」）を模範例と観点に分ける。
export function splitRewriteModel(model: string | null | undefined): { examples: string; point: string } {
  if (!model) return { examples: '', point: '' }
  const i = model.indexOf('観点：')
  if (i < 0) return { examples: model.trim(), point: '' }
  return { examples: model.slice(0, i).trim(), point: model.slice(i + '観点：'.length).trim() }
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
const normalizeSentence = (s: string) =>
  s.replace(/[\s　「」『』]/g, '').replace(/[。．.]+$/, '')

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
