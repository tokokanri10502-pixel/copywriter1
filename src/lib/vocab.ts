// 語彙トレ: 本人の解答（「、」区切り・最大5語）のうち、模範解答例（同じく「、」区切り）と
// 一致した語数を数える。○×判定ではなく「参考＆励まし」として表示するための集計。
export function vocabMatch(yourAnswer: string | null, modelAnswer: string | null) {
  const norm = (s: string) => s.replace(/　/g, ' ').trim().toLowerCase()
  const yours = [...new Set((yourAnswer ?? '').split('、').map(norm).filter(Boolean))]
  const model = new Set((modelAnswer ?? '').split('、').map(norm).filter(Boolean))
  const matched = yours.filter((w) => model.has(w)).length
  return { total: yours.length, matched }
}
