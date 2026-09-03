// 文章判定トラック（選択式）の小ヘルパー。

// answer_text（例 "3,4"）を選んだ番号の配列に変換する。
export function parsePicks(answer: string | null | undefined): number[] {
  if (!answer) return []
  return Array.from(
    new Set(
      answer
        .split(/[^0-9]+/)
        .filter((s) => s !== '')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n)),
    ),
  ).sort((a, b) => a - b)
}

// 選んだ番号の配列を answer_text（"3,4"）に変換する。
export function picksToText(picks: number[]): string {
  return [...picks].sort((a, b) => a - b).join(',')
}
