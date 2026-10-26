// docs/spec.md 4 章のテーブルに対応する型（フロントで使う最小限）。

export type Role = 'trainee' | 'manager'
export type Track = 'joshi' | 'vocab' | 'sentence' | 'rewrite'

// 推敲トラックの自己採点（できた / 惜しい / 直せていない）。
export type SelfRating = 'good' | 'close' | 'miss'

// 文章判定トラック（選択式）の選択肢。ok/reason は提出後のみ入る（出題時は非開示）。
export interface SentenceOption {
  no: number
  text: string
  ok?: boolean
  reason?: string
}

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
  options: SentenceOption[] | null // sentence トラックのみ。出題時は ok/reason 抜き
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
  self_rating: SelfRating | null
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
  options: SentenceOption[] | null // sentence: 提出後の選択肢（正誤・理由つき）
  self_rating?: SelfRating | null // rewrite: 自己採点
}

// 推敲の講評（Claude の週次講評 / 上長の一言）。verdict は自己採点と同じ3段階。
export interface Review {
  reviewer: 'claude' | 'manager'
  reviewer_name: string | null
  verdict: SelfRating | null
  comment: string | null
  suggestion: string | null
  created_at: string
}
