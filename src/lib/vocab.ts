// 語彙トレ: 本人の解答（「、」区切り・最大5語）のうち、模範解答例（同じく「、」区切り）と
// 近い語の数を数える。○×判定ではなく「参考＆励まし」として表示するための集計。
//
// 同じ意味なのに表記の違いで外れないよう、比べる前に次の3つをそろえる（2026-10-27 受講者の声で追加）。
//   A. 語尾の違い   … 「強化する」＝「強化」、「穏やかな」＝「穏やか」、「広げた」＝「広げる」
//   B. かなの違い   … カタカナ→ひらがな、全角/半角（「カット」＝「かっと」）
//   C. 漢字とかな   … 模範例に「広げる（ひろげる）」と読みを持たせ、どちらで書いても一致

// カタカナをひらがなに直す（全角/半角は NFKC でそろえてから）。
export const toHiragana = (s: string) =>
  s.normalize('NFKC').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

// 取り除く語尾（長いものから順に試す）。取り除いた後に2文字以上残るときだけ削る。
const ENDINGS = [
  'しました', 'させる', 'される', 'します', 'でした', 'だった', 'ました',
  'した', 'して', 'する', 'です', 'てき', 'ます',
  'な', 'に', 'だ', 'の', 'た', 'て', 'る', 'す', 'く', 'い', 'と',
].sort((a, b) => b.length - a.length)

// 比べるための形（語幹）にそろえる。
function core(word: string): string {
  const s = toHiragana(word)
    .replace(/的/g, 'てき')
    .replace(/[\s〜~・、。「」]/g, '')
    .toLowerCase()
  // 「抜本的な」→「抜本てき」→「抜本」のように重なった語尾にも対応するため2回まで削る。
  let out = s
  for (let pass = 0; pass < 2; pass++) {
    const e = ENDINGS.find((x) => out.endsWith(x) && out.length - x.length >= 2)
    if (!e) break
    out = out.slice(0, -e.length)
  }
  return out
}

// 模範例の1語「広げる（ひろげる）」を、表記と読みの両方に分ける。
function variants(word: string): string[] {
  const m = word.match(/^(.*?)[（(]([^）)]+)[）)]\s*$/)
  return m ? [m[1], m[2]] : [word]
}

// 表示用: 模範例から読み仮名（「（ひろげる）」の部分）を取り除く。
export const stripReadings = (model: string | null | undefined) =>
  (model ?? '').replace(/[（(][^）)]*[）)]/g, '')

export function vocabMatch(yourAnswer: string | null, modelAnswer: string | null) {
  const yours = [...new Set((yourAnswer ?? '').split('、').map((w) => w.trim()).filter(Boolean))]
  const model = new Set(
    (modelAnswer ?? '')
      .split('、')
      .flatMap((w) => variants(w.trim()))
      .map(core)
      .filter(Boolean),
  )
  const matched = yours.filter((w) => model.has(core(w))).length
  return { total: yours.length, matched }
}
