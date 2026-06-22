import { useEffect, useRef, useState } from 'react'
import Timer from '../components/Timer'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'
import { vocabMatch } from '../lib/vocab'
import type { AnswerDraft, AppUser, SetResult, TodayQuestion, Track } from '../types'

const SECONDS_BY_TRACK: Record<Track, number> = { joshi: 30, vocab: 60 }
const ANSWERS_BY_TRACK: Record<Track, number> = { joshi: 1, vocab: 5 }
const TRACK_LABEL: Record<Track, string> = { joshi: '助詞トレーニング', vocab: '語彙トレーニング' }
const TRACK_ICON: Record<Track, string> = { joshi: '助', vocab: '語' }
const TRACK_ABBR: Record<Track, string> = { joshi: '助詞トレ', vocab: '語彙トレ' }
const TRACK_DESC: Record<Track, string> = {
  joshi: 'てにをはを正確に運用する',
  vocab: '言い換え・連想で語彙を広げる',
}

type Phase = 'select' | 'running' | 'done'

function ExamHeader({ name, onLogout }: { name: string; onLogout: () => void }) {
  return (
    <div className="topbar">
      <span className="topbar__name">{name} さん</span>
      <button className="linkbtn" onClick={onLogout}>ログアウト</button>
    </div>
  )
}

export default function Exam({ user }: { user: AppUser }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [questions, setQuestions] = useState<TodayQuestion[]>([])
  const [doneResults, setDoneResults] = useState<Record<Track, SetResult[] | null>>({
    joshi: null,
    vocab: null,
  })

  const [phase, setPhase] = useState<Phase>('select')
  const [track, setTrack] = useState<Track | null>(null)
  const [index, setIndex] = useState(0)
  const [inputs, setInputs] = useState<string[]>([''])
  const [runAnswers, setRunAnswers] = useState<AnswerDraft[]>([])
  const [results, setResults] = useState<SetResult[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const startRef = useRef(Date.now())
  // 最終問題の提出が始まったら多重実行を防ぐ（タイマー満了/Enter連打対策）。
  const finalizingRef = useRef(false)
  useEffect(() => {
    if (phase === 'running') startRef.current = Date.now()
  }, [phase, index])

  // 初回: 当日の出題と、既提出の結果を読み込む。
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: qs, error } = await supabase.rpc('get_today')
      if (!active) return
      if (error) {
        setStatus('error')
        return
      }
      const list = (qs ?? []) as TodayQuestion[]
      setQuestions(list)

      const ids = list.map((q) => q.id)
      if (ids.length) {
        const { data: res } = await supabase.rpc('get_results', { p_question_ids: ids })
        if (!active) return
        const rows = (res ?? []) as SetResult[]
        const grouped: Record<Track, SetResult[] | null> = { joshi: null, vocab: null }
        for (const t of ['joshi', 'vocab'] as Track[]) {
          const r = rows.filter((x) => x.track === t)
          if (r.length > 0) grouped[t] = r
        }
        setDoneResults(grouped)
      }
      setStatus('ready')
    })()
    return () => {
      active = false
    }
  }, [])

  const setFor = (t: Track) => questions.filter((q) => q.track === t).sort((a, b) => a.order_no - b.order_no)
  const trackQuestions = track ? setFor(track) : []
  const current = trackQuestions[index]
  const answerCount = track ? ANSWERS_BY_TRACK[track] : 1
  // 通算の日番号（週1日1=1日目 … 週2日5=10日目）。当日の出題から算出。
  const dayNo = questions[0] ? (questions[0].week - 1) * 5 + questions[0].day : null

  function startSet(t: Track) {
    finalizingRef.current = false
    setTrack(t)
    setIndex(0)
    setInputs(Array(ANSWERS_BY_TRACK[t]).fill(''))
    setRunAnswers([])
    setPhase('running')
  }

  function viewResults(t: Track) {
    setTrack(t)
    setResults(doneResults[t] ?? [])
    setPhase('done')
  }

  // もう一度挑戦する: 自分の提出をリセット(reset_set)してからセットを再開。
  // 上書き方式（最新のみ残す）= リセット→再提出で自然に最新だけになる。
  async function retrySet(t: Track) {
    const ids = setFor(t).map((q) => q.id)
    if (ids.length === 0) return
    setSubmitting(true)
    const { error } = await supabase.rpc('reset_set', { p_question_ids: ids })
    setSubmitting(false)
    if (error) {
      setSubmitError(error.message ?? JSON.stringify(error))
      return
    }
    setSubmitError(null)
    setDoneResults((prev) => ({ ...prev, [t]: null }))
    setResults([])
    startSet(t)
  }

  function updateInput(i: number, value: string) {
    setInputs((prev) => prev.map((s, idx) => (idx === i ? value : s)))
  }

  async function submitSet(answers: AnswerDraft[]) {
    setSubmitting(true)
    const { data, error } = await supabase.rpc('submit_set', { p_answers: answers })
    setSubmitting(false)
    const rows = (data ?? []) as SetResult[]
    if (error) {
      // 一時デバッグ: 失敗内容を画面に表示する。
      setSubmitError(error.message ?? JSON.stringify(error))
      setResults([])
    } else {
      setSubmitError(null)
      setResults(rows)
      if (track) setDoneResults((prev) => ({ ...prev, [track]: rows.filter((r) => r.track === track) }))
    }
    setPhase('done')
  }

  function recordAndNext(timedOut: boolean) {
    if (!current || finalizingRef.current) return
    const joined = inputs.map((s) => s.trim()).filter(Boolean).join('、')
    const draft: AnswerDraft = {
      question_id: current.id,
      answer_text: timedOut ? '' : joined,
      elapsed_ms: Date.now() - startRef.current,
      is_timeout: timedOut,
    }
    const next = [...runAnswers, draft]
    setRunAnswers(next)
    setInputs(Array(answerCount).fill(''))

    if (index < trackQuestions.length - 1) {
      setIndex(index + 1)
    } else {
      finalizingRef.current = true
      void submitSet(next)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    recordAndNext(false)
  }

  async function handleLogout() {
    await signOut()
  }
  const header = <ExamHeader name={user.display_name} onLogout={handleLogout} />

  // ---- 読み込み中 / エラー ----
  if (status === 'loading') {
    return <div className="page page--center"><p className="muted">読み込み中…</p></div>
  }
  if (status === 'error') {
    return (
      <div className="page">
        {header}
        <div className="card"><p>出題の取得に失敗しました。少し時間をおいて再読み込みしてください。</p></div>
      </div>
    )
  }

  // ---- 出題日でない ----
  if (questions.length === 0) {
    return (
      <div className="page">
        {header}
        <div className="card notice">本日は出題日ではありません。次の出題日にまたお越しください。</div>
      </div>
    )
  }

  // ---- 選択画面 ----
  if (phase === 'select') {
    const allDone = (['joshi', 'vocab'] as Track[]).every((t) => doneResults[t])
    return (
      <div className="page">
        {header}
        <div className="exam__head exam__head--select">
          <span className="kicker">{dayNo ? `DAY ${dayNo}` : "TODAY'S TRAINING"}</span>
          <h2 className="exam__heading">{dayNo ? `トレーニング${dayNo}日目` : '本日のトレーニング'}</h2>
        </div>

        {allDone && (
          <div className="card notice">本日のトレーニングは完了しました。お疲れさまでした。</div>
        )}

        <div className="track-grid">
          {(['joshi', 'vocab'] as Track[]).map((t) => {
            const count = setFor(t).length
            const done = !!doneResults[t]
            return (
              <button
                key={t}
                className={`card track-card track-card--${t}`}
                data-glyph={TRACK_ICON[t]}
                disabled={count === 0}
                onClick={() => (done ? viewResults(t) : startSet(t))}
              >
                <span className="track-card__icon">{TRACK_ABBR[t]}</span>
                <span className="track-card__body">
                  <span className="track-card__title">{TRACK_LABEL[t]}</span>
                  <span className="track-card__desc">{TRACK_DESC[t]}</span>
                  <span className="track-card__meta">全 {count} 問 ・ 1問 {SECONDS_BY_TRACK[t]} 秒</span>
                </span>
                <span className={'track-card__status' + (done ? ' is-done' : '')}>
                  {count === 0 ? '— 準備中' : done ? '結果を見る →' : '開始する →'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- 結果画面 ----
  if (phase === 'done') {
    const correct = results.filter((r) => r.is_correct === true).length
    const graded = results.filter((r) => r.is_correct !== null).length
    return (
      <div className="page">
        {header}
        <div className="card done">
          <div className="done__head">
            <span className="done__check" aria-hidden>✓</span>
            <div>
              <h2 className="done__title">{track && TRACK_LABEL[track]} ・ 結果</h2>
              <p className="done__sub muted">
                {graded > 0
                  ? `自動採点 ${correct} / ${graded} 問正解`
                  : '提出しました（語彙は模範解答例で自己チェック）'}
              </p>
            </div>
          </div>

          {submitError && (
            <p className="login__error" style={{ whiteSpace: 'pre-wrap' }}>
              送信エラー: {submitError}
            </p>
          )}

          <ol className="result-list">
            {results.map((r, i) => (
              <li key={r.question_id} className="result">
                <div className="result__head">
                  <span className="result__q">問{i + 1}</span>
                  {r.is_correct === true && <span className="badge badge--ok">正解</span>}
                  {r.is_correct === false && <span className="badge badge--ng">不正解</span>}
                  {r.is_correct === null && <span className="badge badge--self">自己チェック</span>}
                </div>
                {r.context && <p className="result__context">{r.context}</p>}
                <p className="result__prompt">{r.prompt}</p>
                <p className="result__row">
                  <span className="result__label">あなたの解答</span>
                  <span>
                    {r.is_timeout ? <em className="muted">（時間切れ・未回答）</em> : r.your_answer || <em className="muted">（空欄）</em>}
                  </span>
                </p>
                {r.track === 'vocab' && !r.is_timeout && (() => {
                  const m = vocabMatch(r.your_answer, r.model_answer)
                  if (m.total === 0) return null
                  return (
                    <p className="vocab-match">
                      あなたの {m.total} 語のうち <strong>{m.matched}</strong> 語が模範例と一致しました
                      {m.matched > 0 ? ' 🎉 いいね！' : ''}
                    </p>
                  )
                })()}
                {r.track === 'joshi' && r.accepted_answers?.length > 0 && (
                  <p className="result__row">
                    <span className="result__label">正解</span>
                    <span className="ans-joshi">{r.accepted_answers.join(' / ')}</span>
                  </p>
                )}
                {r.model_answer && (
                  <p className="result__row">
                    <span className="result__label">{r.track === 'vocab' ? '模範解答例' : '解説'}</span>
                    <span className={r.track === 'vocab' ? 'ans-vocab' : ''}>{r.model_answer}</span>
                  </p>
                )}
              </li>
            ))}
          </ol>

          <div className="done__actions">
            <button
              className="btn btn--primary"
              onClick={() => track && retrySet(track)}
              disabled={submitting}
            >
              {submitting ? '準備中…' : 'もう一度挑戦する'}
            </button>
            <button className="btn btn--ghost" onClick={() => setPhase('select')} disabled={submitting}>
              トラック選択へ戻る
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- 受験画面 ----
  return (
    <div className={`page exam--${track ?? 'joshi'}`}>
      {header}
      <div className="exam__head">
        <div className="exam__bar">
          <div className="exam__progress">
            {track && (
              <span className="exam__badge">
                <span className="exam__badge-icon">{TRACK_ICON[track]}</span>
                {TRACK_LABEL[track]}
              </span>
            )}
            <span className="exam__count">
              問 {index + 1} <span className="muted">/ {trackQuestions.length}</span>
            </span>
          </div>
          <div className="steps">
            {trackQuestions.map((q, i) => (
              <span
                key={q.id}
                className={
                  'steps__dot' +
                  (i < index ? ' is-done' : '') +
                  (i === index ? ' is-current' : '')
                }
              />
            ))}
          </div>
        </div>
        <Timer
          seconds={track ? SECONDS_BY_TRACK[track] : 30}
          resetKey={current?.id ?? index}
          onExpire={() => recordAndNext(true)}
        />
      </div>

      <form className="card question" onSubmit={handleSubmit}>
        {current?.context && (
          <p className="question__context">
            <span className="question__context-label">文脈</span>
            {current.context}
          </p>
        )}
        <p className="question__prompt">{current?.prompt}</p>

        {answerCount === 1 ? (
          <input
            className="field__input question__input"
            type="text"
            value={inputs[0] ?? ''}
            onChange={(e) => updateInput(0, e.target.value)}
            placeholder="ここに解答を入力"
            autoFocus
          />
        ) : (
          <div className="answers">
            <p className="answers__hint muted">
              言い換えを最大 {answerCount} 語まで入力できます（1語でも可）。
            </p>
            {inputs.map((v, i) => (
              <input
                key={i}
                className="field__input question__input"
                type="text"
                value={v}
                onChange={(e) => updateInput(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (i < inputs.length - 1) {
                    const fields = e.currentTarget.closest('.answers')?.querySelectorAll('input')
                    ;(fields?.item(i + 1) as HTMLInputElement | null)?.focus()
                  } else {
                    recordAndNext(false)
                  }
                }}
                placeholder={`言い換え ${i + 1}`}
                autoFocus={i === 0}
              />
            ))}
          </div>
        )}

        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting
            ? '送信中…'
            : index < trackQuestions.length - 1
            ? '次の問題へ'
            : '提出する'}
        </button>
      </form>
    </div>
  )
}
