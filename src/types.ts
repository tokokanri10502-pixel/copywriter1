// docs/spec.md 4 章のテーブルに対応する型（フロントで使う最小限）。

export type Role = 'trainee' | 'manager'
export type Track = 'joshi' | 'vocab'

export interface AppUser {
  id: string
  login_id: string
  display_name: string
  role: Role
}

// get-today が返す出題（正解列は含めない）。
export interface TodayQuestion {
  id: string
  track: Track
  week: number
  day: number
  order_no: number
  prompt: string
  context: string | null
  target_word: string | null
}

// 受験中に集める1問ぶんの解答（提出時に submit_set RPC へ渡す）。
export interface AnswerDraft {
  question_id: string
  answer_text: string
  elapsed_ms: number
  is_timeout: boolean
}

// get_today_full が返す1行（出題＋自分の既提出結果を統合）。
// 未提出なら submitted=false で your_answer 以降は null/'[]'（正解は非開示）。
export interface TodayFullRow extends TodayQuestion {
  submitted: boolean
  your_answer: string | null
  is_timeout: boolean
  is_correct: boolean | null
  model_answer: string | null
  accepted_answers: string[]
  scoring_method: string | null
}

// submit_set / get_results が返す採点済み1問ぶん（提出後に正解・模範解答を開示）。
export interface SetResult {
  question_id: string
  track: Track
  order_no: number
  prompt: string
  context: string | null
  target_word: string | null
  your_answer: string | null
  is_timeout: boolean
  is_correct: boolean | null
  model_answer: string | null
  accepted_answers: string[]
  scoring_method: string | null
}
