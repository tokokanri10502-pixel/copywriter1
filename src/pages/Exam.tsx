import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Timer from '../components/Timer'
import Celebration from '../components/Celebration'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'
import { vocabMatch } from '../lib/vocab'
import { parsePicks, picksToText } from '../lib/sentence'
import { SELF_RATINGS, splitRewriteModel } from '../lib/rewrite'
import type { AnswerDraft, AppUser, SelfRating, SetResult, TodayFullRow, TodayQuestion, Track } from '../types'

const SECONDS_BY_TRACK: Record<Track, number> = { joshi: 30, sentence: 60, rewrite: 120, vocab: 60 }
const ANSWERS_BY_TRACK: Record<Track, number> = { joshi: 1, sentence: 1, rewrite: 1, vocab: 5 }
const TRACK_LABEL: Record<Track, string> = {
  joshi: '助詞トレーニング',
  sentence: '文章判定トレーニング',
  rewrite: '推敲トレーニング',
  vocab: '語彙トレーニング',
}
const TRACK_ICON: Record<Track, string> = { joshi: '助', sentence: '文', rewrite: '推', vocab: '語' }
const TRACK_ABBR: Record<Track, string> = { joshi: '助詞トレ', sentence: '文章判定', rewrite: '推敲', vocab: '語彙トレ' }
const TRACK_DESC: Record<Track, string> = {
  joshi: 'てにをはを正確に運用する',
  sentence: '適切な文を見分ける（複数選択）',
  rewrite: '一文を正しく、簡潔に書き直す',
  vocab: '言い換え・連想で語彙を広げる',
}
// トラックの並び順（1日の出題は「助詞 or 文章 or 推敲」＋語彙）。
const TRACK_ORDER: Track[] = ['joshi', 'sentence', 'rewrite', 'vocab']
const EMPTY_DONE: Record<Track, SetResult[] | null> = { joshi: null, sentence: null, rewrite: null, vocab: null }
// 「着目」タグを出すトラック（context=着目ラベル）。
const hasFocus = (t: Track | null | undefined) => t === 'sentence' || t === 'rewrite'

type Phase = 'select' | 'running' | 'done'

// 出題日ナビ状態（get_demo_state が返す）。
//   current = 現在の通算日番号 / available = 選択可能な通算日（本番は過去〜当日のみ）。
interface NavState {
  demo_mode: boolean
  current: number | null
  available: number[]
}

function ExamHeader({ name, onLogout }: { name: string; onLogout: () => void }) {
  return (
    <div className="topbar">
      <span className="topbar__name">{name} さん</span>
      <span className="topbar__actions">
        <Link className="guide-btn" to="/guide">📖 てにをはガイド</Link>
        <button className="linkbtn" onClick={onLogout}>ログアウト</button>
      </span>
    </div>
  )
}

export default function Exam({ user }: { user: AppUser }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [questions, setQuestions] = useState<TodayQuestion[]>([])
  const [doneResults, setDoneResults] = useState<Record<Track, SetResult[] | null>>(EMPTY_DONE)

  const [phase, setPhase] = useState<Phase>('select')
  const [track, setTrack] = useState<Track | null>(null)
  const [index, setIndex] = useState(0)
  const [inputs, setInputs] = useState<string[]>([''])
  // 文章判定（選択式）で選んだ選択肢番号。設問ごとにリセットする。
  const [picked, setPicked] = useState<number[]>([])
  const [runAnswers, setRunAnswers] = useState<AnswerDraft[]>([])
  const [results, setResults] = useState<SetResult[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [demo, setDemo] = useState<NavState | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  // 出題日が多いとき、10日ごと（1〜10 / 11〜20 …）に畳んで表示する。
  // 開いている範囲の先頭日番号（1, 11, 21 …）。null のときは選択中の日の範囲を開く。
  const [openDecade, setOpenDecade] = useState<number | null>(null)
  // 5日刻みの節目（通算5・10・15…）を達成した瞬間に花火演出を出す。表示中の通算日を保持。
  const [celebrateDay, setCelebrateDay] = useState<number | null>(null)

  const startRef = useRef(Date.now())
  // 最終問題の提出が始まったら多重実行を防ぐ（タイマー満了/Enter連打対策）。
  const finalizingRef = useRef(false)
  useEffect(() => {
    if (phase === 'running') startRef.current = Date.now()
  }, [phase, index])

  // 当日の出題＋自分の既提出結果（get_today_full）と、テスト用のデモ状態（get_demo_state）を
  // 並列で読み込む。日付切替後にも呼ぶので useCallback で再利用する。
  const load = useCallback(async (day?: number) => {
    setStatus('loading')
    const [today, navRes] = await Promise.all([
      day != null
        ? supabase.rpc('get_today_full', { p_day: day })
        : supabase.rpc('get_today_full'),
      supabase.rpc('get_demo_state'),
    ])
    if (today.error) {
      setStatus('error')
      return
    }
    const rows = (today.data ?? []) as TodayFullRow[]

    // 出題リスト（正解抜き）
    setQuestions(
      rows.map((r) => ({
        id: r.id,
        track: r.track,
        week: r.week,
        day: r.day,
        order_no: r.order_no,
        prompt: r.prompt,
        context: r.context,
        target_word: r.target_word,
        options: r.options ?? null,
      })),
    )

    // 既提出のトラックは結果として束ねる（submitted=true の行だけ）
    const grouped: Record<Track, SetResult[] | null> = { ...EMPTY_DONE }
    for (const t of TRACK_ORDER) {
      const done = rows
        .filter((r) => r.track === t && r.submitted)
        .map((r) => ({
          question_id: r.id,
          track: r.track,
          order_no: r.order_no,
          prompt: r.prompt,
          context: r.context,
          target_word: r.target_word,
          your_answer: r.your_answer,
          is_timeout: r.is_timeout,
          is_correct: r.is_correct,
          model_answer: r.model_answer,
          accepted_answers: r.accepted_answers ?? [],
          scoring_method: r.scoring_method,
          options: r.options ?? null,
          self_rating: r.self_rating ?? null,
        }))
      if (done.length > 0) grouped[t] = done
    }
    setDoneResults(grouped)
    const nav = (navRes.data as NavState | null) ?? null
    setDemo(nav)
    // 初回ロード時は現在日を選択状態にする（切替時は呼び出し側で設定済み）。
    if (day == null) setSelectedDay(nav?.current ?? null)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 出題日を切り替える（本番でも有効。過去〜当日を復習・再挑戦できる）。
  // 日指定で get_today_full(p_day) を取り直す。未来日はサーバ側で弾かれる。
  async function switchDay(n: number) {
    setPhase('select')
    setTrack(null)
    setSelectedDay(n)
    await load(n)
  }

  // テスト用オールクリア: 自分の全提出を削除して最初からやり直す（demo_mode のみ有効）。
  async function resetAll() {
    if (!window.confirm('テスト用：あなたの全ての解答を消去して最初からやり直します。よろしいですか？')) {
      return
    }
    setSubmitting(true)
    const { error } = await supabase.rpc('reset_all')
    setSubmitting(false)
    if (error) {
      setSubmitError(error.message ?? JSON.stringify(error))
      return
    }
    setSubmitError(null)
    setPhase('select')
    setTrack(null)
    await load(selectedDay ?? undefined)
  }

  const setFor = (t: Track) => questions.filter((q) => q.track === t).sort((a, b) => a.order_no - b.order_no)
  const trackQuestions = track ? setFor(track) : []
  const current = trackQuestions[index]
  const answerCount = track ? ANSWERS_BY_TRACK[track] : 1
  // その日に含まれるトラック（助詞 or 文章 ＋ 語彙）を出題から判定。
  const presentTracks = TRACK_ORDER.filter((t) => questions.some((q) => q.track === t))
  // 通算の日番号（週1日1=1日目 … 週2日5=10日目）。当日の出題から算出。
  const dayNo = questions[0] ? (questions[0].week - 1) * 5 + questions[0].day : null

  // 推敲は元の文を入力欄に入れておき、直す形で書けるようにする。
  const initialInputs = (t: Track, q?: TodayQuestion) =>
    t === 'rewrite' ? [q?.prompt ?? ''] : Array(ANSWERS_BY_TRACK[t]).fill('')

  function startSet(t: Track) {
    finalizingRef.current = false
    setTrack(t)
    setIndex(0)
    setInputs(initialInputs(t, setFor(t)[0]))
    setPicked([])
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

  // 文章判定の選択肢トグル。
  function togglePick(no: number) {
    setPicked((prev) => (prev.includes(no) ? prev.filter((n) => n !== no) : [...prev, no]))
  }

  // 推敲の自己採点を保存（本人の提出にだけ書き込まれる）。失敗したら表示を元に戻す。
  async function rate(questionId: string, rating: SelfRating) {
    const apply = (list: SetResult[] | null, v: SelfRating | null) =>
      list?.map((r) => (r.question_id === questionId ? { ...r, self_rating: v } : r)) ?? null
    const prevRating = results.find((r) => r.question_id === questionId)?.self_rating ?? null
    setResults((prev) => apply(prev, rating) ?? [])
    setDoneResults((prev) => ({ ...prev, rewrite: apply(prev.rewrite, rating) }))
    const { error } = await supabase.rpc('set_self_rating', { p_question_id: questionId, p_rating: rating })
    if (error) {
      setSubmitError(error.message ?? JSON.stringify(error))
      setResults((prev) => apply(prev, prevRating) ?? [])
      setDoneResults((prev) => ({ ...prev, rewrite: apply(prev.rewrite, prevRating) }))
    }
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
      if (track) {
        const nextDone = { ...doneResults, [track]: rows.filter((r) => r.track === track) }
        setDoneResults(nextDone)
        // この提出で当日の全トラックが揃い、かつ通算日が5の倍数なら節目の演出を出す。
        const allDone = presentTracks.every((t) => nextDone[t])
        if (allDone && dayNo != null && dayNo % 5 === 0) setCelebrateDay(dayNo)
      }
    }
    setPhase('done')
  }

  function recordAndNext(timedOut: boolean) {
    if (!current || finalizingRef.current) return
    // 文章判定は選んだ番号（"3,4"）、それ以外は入力欄を「、」連結。
    const answerText =
      track === 'sentence' ? picksToText(picked) : inputs.map((s) => s.trim()).filter(Boolean).join('、')
    const draft: AnswerDraft = {
      question_id: current.id,
      answer_text: timedOut ? '' : answerText,
      elapsed_ms: Date.now() - startRef.current,
      is_timeout: timedOut,
    }
    const next = [...runAnswers, draft]
    setRunAnswers(next)
    setInputs(track ? initialInputs(track, trackQuestions[index + 1]) : [''])
    setPicked([])

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

  // 出題日スイッチャ。選択できる日が2つ以上あるとき表示（本番でも過去〜当日を切替可）。
  // 日数が10を超えたら 10日ごと（1〜10 / 11〜20 …）にまとめ、選んだ範囲の日だけを開く。
  const daySwitcher = (() => {
    if (!demo || demo.available.length <= 1) return null
    const days = demo.available
    const decadeOf = (n: number) => Math.floor((n - 1) / 10) * 10 + 1
    const decadeStarts = Array.from(new Set(days.map(decadeOf))).sort((a, b) => a - b)
    const grouped = decadeStarts.length > 1
    // 開く範囲: ユーザーが選んだ範囲があればそれ、なければ選択中の日（＝当日）の範囲。
    const activeDecade =
      openDecade != null && decadeStarts.includes(openDecade)
        ? openDecade
        : decadeOf(selectedDay ?? demo.current ?? days[0])
    const shownDays = grouped ? days.filter((n) => decadeOf(n) === activeDecade) : days
    const decadeLabel = (start: number) => {
      const end = Math.max(...days.filter((n) => decadeOf(n) === start))
      return start === end ? `${start}日目` : `${start}〜${end}`
    }
    return (
      <div className="demo-switch">
        <span className="demo-switch__label">
          {demo.demo_mode ? 'テスト：出題日を切り替え' : '出題日（過去分も復習できます）'}
        </span>
        {grouped && (
          <div className="decade-tabs">
            {decadeStarts.map((start) => (
              <button
                key={start}
                className={'decade-tab' + (start === activeDecade ? ' is-active' : '')}
                onClick={() => setOpenDecade(start)}
              >
                {decadeLabel(start)}
              </button>
            ))}
          </div>
        )}
        <div className="day-tabs">
          {shownDays.map((n) => (
            <button
              key={n}
              className={'day-tab' + (n === selectedDay ? ' is-active' : '')}
              onClick={() => switchDay(n)}
            >
              {n}日目
            </button>
          ))}
          {demo.demo_mode && (
            <button className="day-tab day-tab--reset" onClick={resetAll} disabled={submitting}>
              オールクリア
            </button>
          )}
        </div>
      </div>
    )
  })()

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
        {daySwitcher}
        <div className="card notice">本日は出題日ではありません。次の出題日にまたお越しください。</div>
      </div>
    )
  }

  // ---- 選択画面 ----
  if (phase === 'select') {
    const allDone = presentTracks.every((t) => doneResults[t])
    return (
      <div className="page">
        {header}
        {daySwitcher}
        <div className="exam__head exam__head--select">
          <span className="kicker">{dayNo ? `DAY ${dayNo}` : "TODAY'S TRAINING"}</span>
          <h2 className="exam__heading">{dayNo ? `トレーニング${dayNo}日目` : '本日のトレーニング'}</h2>
        </div>

        {allDone && (
          <div className="card notice">本日のトレーニングは完了しました。お疲れさまでした。</div>
        )}

        <div className="track-grid">
          {presentTracks.map((t) => {
            const count = setFor(t).length
            const done = !!doneResults[t]
            const cardBody = (
              <>
                <span className="track-card__icon">{TRACK_ABBR[t]}</span>
                <span className="track-card__body">
                  <span className="track-card__title">{TRACK_LABEL[t]}</span>
                  <span className="track-card__desc">{TRACK_DESC[t]}</span>
                  <span className="track-card__meta">全 {count} 問 ・ 1問 {SECONDS_BY_TRACK[t]} 秒</span>
                </span>
              </>
            )

            // 完了済み: カードを div にして「解答を見る」「もう一度挑戦する」を並べる
            // （ボタンの入れ子を避けるため未完了カードとは構造を分ける）。
            if (done) {
              return (
                <div
                  key={t}
                  className={`card track-card track-card--${t} track-card--done`}
                  data-glyph={TRACK_ICON[t]}
                >
                  {cardBody}
                  <span className="track-card__status is-done">提出済み</span>
                  <div className="track-card__actions">
                    <button className="btn btn--ghost" onClick={() => viewResults(t)} disabled={submitting}>
                      解答を見る
                    </button>
                    <button className="btn btn--primary" onClick={() => retrySet(t)} disabled={submitting}>
                      {submitting ? '準備中…' : 'もう一度挑戦する'}
                    </button>
                  </div>
                </div>
              )
            }

            // 未完了: カード全体が開始ボタン。
            return (
              <button
                key={t}
                className={`card track-card track-card--${t}`}
                data-glyph={TRACK_ICON[t]}
                disabled={count === 0}
                onClick={() => startSet(t)}
              >
                {cardBody}
                <span className="track-card__status">
                  {count === 0 ? '— 準備中' : '開始する →'}
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
        {celebrateDay != null && (
          <Celebration day={celebrateDay} onClose={() => setCelebrateDay(null)} />
        )}
        <div className="card done">
          <div className="done__head">
            <span className="done__check" aria-hidden>✓</span>
            <div>
              <h2 className="done__title">{track && TRACK_LABEL[track]} 結果</h2>
              <p className="done__sub muted">
                {graded > 0
                  ? `自動採点 ${correct} / ${graded} 問正解`
                  : track === 'rewrite'
                  ? '提出しました。模範例と観点を読んで、1問ずつ自己採点してください'
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
                {r.context &&
                  (hasFocus(r.track) ? (
                    <p className="focus-tag">
                      <span className="focus-tag__label">着目</span>
                      {r.context}
                    </p>
                  ) : (
                    <p className="result__context">{r.context}</p>
                  ))}
                {r.track !== 'rewrite' && <p className="result__prompt">{r.prompt}</p>}
                {r.track === 'rewrite' ? (
                  (() => {
                    const { examples, point } = splitRewriteModel(r.model_answer)
                    return (
                      <>
                        <p className="result__row">
                          <span className="result__label">元の文</span>
                          <span className="rewrite-src">{r.prompt}</span>
                        </p>
                        <p className="result__row">
                          <span className="result__label">あなたの文</span>
                          <span>
                            {r.is_timeout ? <em className="muted">（時間切れ・未回答）</em> : r.your_answer || <em className="muted">（空欄）</em>}
                          </span>
                        </p>
                        {examples && (
                          <p className="result__row">
                            <span className="result__label">模範例</span>
                            <span className="rewrite-model">{examples}</span>
                          </p>
                        )}
                        {point && (
                          <p className="result__row">
                            <span className="result__label">観点</span>
                            <span className="rewrite-point">{point}</span>
                          </p>
                        )}
                        <div className="self-rate">
                          <span className="self-rate__label">自己採点</span>
                          <div className="self-rate__btns">
                            {SELF_RATINGS.map((x) => (
                              <button
                                key={x.value}
                                type="button"
                                className={'self-rate__btn self-rate__btn--' + x.value + (r.self_rating === x.value ? ' is-on' : '')}
                                onClick={() => rate(r.question_id, x.value)}
                              >
                                <span className="self-rate__mark">{x.mark}</span>
                                {x.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )
                  })()
                ) : r.track === 'sentence' ? (
                  <>
                    <p className="result__row">
                      <span className="result__label">選んだ文</span>
                      <span>
                        {r.is_timeout ? (
                          <em className="muted">（時間切れ・未選択）</em>
                        ) : parsePicks(r.your_answer).length > 0 ? (
                          parsePicks(r.your_answer).map((n) => `${n}番`).join('・')
                        ) : (
                          <em className="muted">（未選択）</em>
                        )}
                      </span>
                    </p>
                    <ul className="mcq-review">
                      {(r.options ?? []).map((o) => {
                        const chosen = parsePicks(r.your_answer).includes(o.no)
                        return (
                          <li
                            key={o.no}
                            className={'mcq-opt' + (o.ok ? ' is-correct' : ' is-wrong') + (chosen ? ' is-chosen' : '')}
                          >
                            <span className="mcq-opt__mark">{o.ok ? '○' : '✕'}</span>
                            <span className="mcq-opt__body">
                              <span className="mcq-opt__text">
                                {o.no}. {o.text}
                                {chosen && <span className="mcq-opt__you">あなたの選択</span>}
                              </span>
                              {o.reason && <span className="mcq-opt__reason">{o.reason}</span>}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </li>
            ))}
          </ol>

          <button className="btn btn--primary" onClick={() => setPhase('select')}>
            トラック選択へ戻る
          </button>
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
      </div>

      <form className="card question" onSubmit={handleSubmit}>
        {current?.context &&
          (hasFocus(track) ? (
            <p className="focus-tag">
              <span className="focus-tag__label">着目</span>
              {current.context}
            </p>
          ) : (
            <p className="question__context">
              <span className="question__context-label">文脈</span>
              {current.context}
            </p>
          ))}
        {track === 'rewrite' ? (
          <>
            <p className="answers__hint muted">次の文を、正しく読みやすい文に書き直してください。</p>
            <p className="question__prompt rewrite-src">{current?.prompt}</p>
          </>
        ) : (
          <p className="question__prompt">{current?.prompt}</p>
        )}

        {/* タイマーは入力欄の真上（通常フロー内）に置く。iOS Safari は keyboard 表示中に
            position:fixed が表示領域へ追従しないため、入力欄の近くに置いて常に見えるようにする。 */}
        <Timer
          seconds={track ? SECONDS_BY_TRACK[track] : 30}
          resetKey={current?.id ?? index}
          onExpire={() => recordAndNext(true)}
        />

        {track === 'sentence' ? (
          <div className="mcq-options">
            <p className="answers__hint muted">適切なものを、すべて選んでください（複数可）。</p>
            {(current?.options ?? []).map((o) => {
              const on = picked.includes(o.no)
              return (
                <label key={o.no} className={'mcq-opt-input' + (on ? ' is-on' : '')}>
                  <input type="checkbox" checked={on} onChange={() => togglePick(o.no)} />
                  <span className="mcq-opt-input__no">{o.no}</span>
                  <span className="mcq-opt-input__text">{o.text}</span>
                </label>
              )
            })}
          </div>
        ) : track === 'rewrite' ? (
          <div className="answers">
            <p className="answers__hint muted">下の欄の文を直して提出してください（元の文が入っています）。</p>
            <textarea
              key={current?.id}
              className="field__input question__input rewrite-input"
              rows={3}
              value={inputs[0] ?? ''}
              onChange={(e) => updateInput(0, e.target.value)}
              autoFocus
            />
          </div>
        ) : answerCount === 1 ? (
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
                placeholder={
                  current?.target_word
                    ? `「${current.target_word}」の言い換え ${i + 1}`
                    : `言い換え ${i + 1}`
                }
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
