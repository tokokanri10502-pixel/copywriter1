import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'
import { vocabMatch } from '../lib/vocab'
import { parsePicks } from '../lib/sentence'
import { SELF_RATINGS, isUnchanged, matchesModel, selfRatingLabel, splitRewriteModel } from '../lib/rewrite'
import type { AppUser, SelfRating, SentenceOption, Track } from '../types'

interface QRow {
  id: string
  track: Track
  week: number
  day: number
  order_no: number
  prompt: string
  context: string | null
  target_word: string | null
  model_answer: string | null
  accepted_answers: string[]
  weakness_tags: string[]
  options: SentenceOption[] | null
}

// 自動採点トラック（正誤が出る）= 助詞 と 文章判定。語彙は自己チェック。
const isAuto = (t?: Track) => t === 'joshi' || t === 'sentence'
interface SRow {
  id: string
  user_id: string
  question_id: string
  answer_text: string | null
  elapsed_ms: number | null
  is_timeout: boolean
  self_rating: SelfRating | null
}
interface ScRow {
  submission_id: string
  is_correct: boolean | null
}

const TRACK_LABEL: Record<Track, string> = { joshi: '助詞', sentence: '文章', rewrite: '推敲', vocab: '語彙' }

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Dashboard({ user }: { user: AppUser }) {
  const [trainees, setTrainees] = useState<AppUser[]>([])
  const [questions, setQuestions] = useState<QRow[]>([])
  const [submissions, setSubmissions] = useState<SRow[]>([])
  const [scores, setScores] = useState<ScRow[]>([])
  const [schedule, setSchedule] = useState<{ week: number; day: number; calendar_date: string; is_active: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null) // 通算日番号 1〜10

  const reload = useCallback(async () => {
    const [u, q, s, sc, sch] = await Promise.all([
      supabase.from('users').select('id, login_id, display_name, role').eq('role', 'trainee'),
      supabase.from('questions').select('id, track, week, day, order_no, prompt, context, target_word, model_answer, accepted_answers, weakness_tags, options'),
      supabase.from('submissions').select('id, user_id, question_id, answer_text, elapsed_ms, is_timeout, self_rating'),
      supabase.from('scores').select('submission_id, is_correct'),
      supabase.from('schedule').select('week, day, calendar_date, is_active'),
    ])
    setTrainees((u.data as AppUser[]) ?? [])
    setQuestions((q.data as QRow[]) ?? [])
    setSubmissions((s.data as SRow[]) ?? [])
    setScores((sc.data as ScRow[]) ?? [])
    setSchedule((sch.data as typeof schedule) ?? [])
    const now = new Date()
    setLastSync(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const ch = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [reload])

  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  const scBySub = useMemo(() => new Map(scores.map((s) => [s.submission_id, s.is_correct])), [scores])

  const stats = useMemo(() => {
    const today = todayStr()
    const keyOf = (w: number, d: number) => `${w}-${d}`
    const pastKeys = new Set(schedule.filter((s) => s.calendar_date <= today).map((s) => keyOf(s.week, s.day)))
    const todayKeys = new Set(
      schedule.filter((s) => s.calendar_date === today && s.is_active).map((s) => keyOf(s.week, s.day)),
    )
    const availIds = new Set(questions.filter((q) => pastKeys.has(keyOf(q.week, q.day))).map((q) => q.id))
    const todayIds = new Set(questions.filter((q) => todayKeys.has(keyOf(q.week, q.day))).map((q) => q.id))
    const availByTrack = {
      auto: [...availIds].filter((id) => isAuto(qById.get(id)?.track)).length,
      vocab: [...availIds].filter((id) => qById.get(id)?.track === 'vocab').length,
    }
    const todayTotal = todayIds.size

    // 日別推移用: 出題済み(<=今日)の日を時系列に、各日の助詞設問idを用意
    const pastDayList = [...schedule]
      .filter((s) => s.calendar_date <= today)
      .sort((a, b) => a.calendar_date.localeCompare(b.calendar_date))
    const autoByDay = new Map<string, Set<string>>()
    for (const q of questions) {
      if (!isAuto(q.track)) continue
      const k = keyOf(q.week, q.day)
      if (!autoByDay.has(k)) autoByDay.set(k, new Set())
      autoByDay.get(k)!.add(q.id)
    }

    return trainees.map((t) => {
      const subs = submissions.filter((s) => s.user_id === t.id && availIds.has(s.question_id))
      const todaySubs = subs.filter((s) => todayIds.has(s.question_id))
      const autoSubs = subs.filter((s) => isAuto(qById.get(s.question_id)?.track))
      const vocabSubs = subs.filter((s) => qById.get(s.question_id)?.track === 'vocab')
      const rewriteSubs = subs.filter((s) => qById.get(s.question_id)?.track === 'rewrite')
      const rewriteRating = SELF_RATINGS.map((x) => ({
        ...x,
        n: rewriteSubs.filter((s) => s.self_rating === x.value).length,
      }))

      const graded = autoSubs.map((s) => scBySub.get(s.id)).filter((v) => v === true || v === false)
      const correct = graded.filter((v) => v === true).length
      const accuracy = graded.length > 0 ? Math.round((correct / graded.length) * 100) : null

      const timeouts = subs.filter((s) => s.is_timeout).length
      const elapsedVals = subs.map((s) => s.elapsed_ms).filter((v): v is number => typeof v === 'number')
      const avgSec = elapsedVals.length > 0 ? Math.round(elapsedVals.reduce((a, b) => a + b, 0) / elapsedVals.length / 1000) : null

      const trend = pastDayList.map((d, i) => {
        const qids = autoByDay.get(keyOf(d.week, d.day)) ?? new Set<string>()
        const dSubs = submissions.filter((s) => s.user_id === t.id && qids.has(s.question_id))
        const g = dSubs.map((s) => scBySub.get(s.id)).filter((v) => v === true || v === false)
        const c = g.filter((v) => v === true).length
        return { idx: i + 1, week: d.week, day: d.day, n: g.length, acc: g.length > 0 ? Math.round((c / g.length) * 100) : null }
      })

      return {
        trainee: t,
        autoSubmitted: autoSubs.length, vocabSubmitted: vocabSubs.length,
        rewriteSubmitted: rewriteSubs.length, rewriteRating,
        availAuto: availByTrack.auto, availVocab: availByTrack.vocab,
        todaySubmitted: todaySubs.length, todayTotal,
        accuracy, correct, graded: graded.length, timeouts, avgSec, trend,
      }
    })
  }, [trainees, questions, submissions, qById, scBySub, schedule])

  const overallDay = (q: QRow) => (q.week - 1) * 5 + q.day

  // 受講者を開く（最新の提出日をデフォルト選択）
  function openTrainee(id: string) {
    const days = submissions
      .filter((s) => s.user_id === id)
      .map((s) => qById.get(s.question_id))
      .filter((q): q is QRow => !!q)
      .map(overallDay)
    setSelectedId(id)
    setSelectedDay(days.length ? Math.max(...days) : null)
  }

  // この受講者が提出した「○日目」の一覧（タブ用）
  const dayTabs = useMemo(() => {
    if (!selectedId) return []
    const set = new Set<number>()
    submissions
      .filter((s) => s.user_id === selectedId)
      .forEach((s) => {
        const q = qById.get(s.question_id)
        if (q) set.add(overallDay(q))
      })
    return [...set].sort((a, b) => a - b)
  }, [selectedId, submissions, qById])

  // 個人ドリルダウン: 選択した受講者・選択した日の解答を表示
  const detail = useMemo(() => {
    if (!selectedId) return []
    return submissions
      .filter((s) => s.user_id === selectedId)
      .map((s) => ({ sub: s, q: qById.get(s.question_id), correct: scBySub.get(s.id) }))
      .filter((x): x is { sub: SRow; q: QRow; correct: boolean | null | undefined } => !!x.q)
      .filter((x) => selectedDay === null || overallDay(x.q) === selectedDay)
      .sort((a, b) => a.q.track.localeCompare(b.q.track) || a.q.order_no - b.q.order_no)
  }, [selectedId, selectedDay, submissions, qById, scBySub])

  const selectedName = trainees.find((t) => t.id === selectedId)?.display_name ?? ''

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar__name">{user.display_name} さん（上長）</span>
        <span className="topbar__actions">
          <button className="linkbtn" onClick={() => reload()}>更新</button>
          <Link className="guide-btn" to="/guide">📖 てにをはガイド</Link>
          <button className="linkbtn" onClick={() => signOut()}>ログアウト</button>
        </span>
      </div>

      {!selectedId ? (
        <>
          <div className="exam__head exam__head--select">
            <span className="kicker">MANAGER DASHBOARD</span>
            <h2 className="exam__heading">受講者ダッシュボード</h2>
            <p className="muted dash__sync">最終更新 {lastSync}{loading ? '（読み込み中…）' : ''}</p>
          </div>

          {!loading && trainees.length === 0 && (
            <div className="card notice">受講者（trainee）が登録されていません。</div>
          )}

          <div className="dash-grid">
            {stats.map((row) => (
              <div key={row.trainee.id} className="card dash-card">
                <h3 className="dash-card__name">{row.trainee.display_name}</h3>
                <div className="metric"><span className="metric__label">当日の提出</span>
                  <span className="metric__value">{row.todaySubmitted}<span className="metric__unit"> / {row.todayTotal} 問</span></span></div>
                <div className="metric"><span className="metric__label">累計提出</span>
                  <span className="metric__value">助詞・文章 {row.autoSubmitted}/{row.availAuto}・語彙 {row.vocabSubmitted}/{row.availVocab}</span></div>
                <div className="metric"><span className="metric__label">助詞 正答率</span>
                  <span className="metric__value">{row.accuracy === null ? '—' : `${row.accuracy}%`}{row.graded > 0 && <span className="metric__unit"> （{row.correct}/{row.graded}）</span>}</span></div>
                {row.rewriteSubmitted > 0 && (
                  <div className="metric"><span className="metric__label">推敲 自己採点</span>
                    <span className="metric__value">
                      {row.rewriteRating.map((x) => `${x.mark}${x.n}`).join(' ')}
                      <span className="metric__unit"> （提出 {row.rewriteSubmitted}）</span>
                    </span></div>
                )}
                <div className="metric"><span className="metric__label">時間切れ</span><span className="metric__value">{row.timeouts} 件</span></div>
                <div className="metric"><span className="metric__label">平均所要</span><span className="metric__value">{row.avgSec === null ? '—' : `${row.avgSec} 秒/問`}</span></div>
                <div className="metric metric--col">
                  <span className="metric__label">助詞 正答率の推移（日別）</span>
                  {row.trend.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <div className="trend">
                      {row.trend.map((d) => (
                        <div
                          key={d.idx}
                          className="trend__col"
                          title={`週${d.week}・${d.day}日目: ${d.acc === null ? 'データなし' : `${d.acc}%（${d.n}問）`}`}
                        >
                          <div className="trend__track">
                            <div
                              className={'trend__bar' + (d.acc === null ? ' trend__bar--empty' : '')}
                              style={{ height: `${d.acc ?? 0}%` }}
                            />
                          </div>
                          <span className="trend__lbl">{d.idx}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn--primary dash-card__more" onClick={() => openTrainee(row.trainee.id)}>
                  解答を見る →
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="topbar" style={{ marginTop: '-4px' }}>
            <button className="linkbtn" onClick={() => setSelectedId(null)}>← 一覧へ戻る</button>
            <span />
          </div>
          <div className="exam__head exam__head--select">
            <span className="kicker">DRILL DOWN</span>
            <h2 className="exam__heading">
              {selectedName} さんの解答{selectedDay ? `（${selectedDay}日目）` : ''}
            </h2>
            <p className="muted dash__sync">語彙・推敲は自動採点なし。解答と模範例を見て判断してください（推敲は本人の自己採点つき）。</p>
          </div>

          {dayTabs.length > 0 && (
            <div className="day-tabs">
              {dayTabs.map((d) => (
                <button
                  key={d}
                  className={'day-tab' + (d === selectedDay ? ' is-active' : '')}
                  onClick={() => setSelectedDay(d)}
                >
                  {d}日目
                </button>
              ))}
            </div>
          )}

          {detail.length === 0 ? (
            <div className="card notice">まだ提出がありません。</div>
          ) : (
            <ol className="result-list" style={{ maxWidth: 720, margin: '0 auto' }}>
              {detail.map(({ sub, q, correct }) => (
                <li key={sub.id} className="card result">
                  <div className="result__head">
                    <span className="result__q">{TRACK_LABEL[q.track]}{q.order_no}</span>
                    {isAuto(q.track) && correct === true && <span className="badge badge--ok">正解</span>}
                    {isAuto(q.track) && correct === false && <span className="badge badge--ng">不正解</span>}
                    {q.track === 'vocab' && <span className="badge badge--self">語彙（要確認）</span>}
                    {q.track === 'rewrite' && (
                      <span className="badge badge--self">
                        {selfRatingLabel(sub.self_rating) ? `自己採点 ${selfRatingLabel(sub.self_rating)}` : '自己採点なし'}
                      </span>
                    )}
                  </div>
                  {q.context && <p className="result__context">{q.track === 'rewrite' ? `着目｜${q.context}` : q.context}</p>}
                  {q.track !== 'rewrite' && <p className="result__prompt">{q.prompt}</p>}
                  {q.track === 'rewrite' ? (
                    (() => {
                      const { examples, point } = splitRewriteModel(q.model_answer)
                      return (
                        <>
                          <p className="result__row"><span className="result__label">元の文</span><span className="rewrite-src">{q.prompt}</span></p>
                          <p className="result__row"><span className="result__label">本人の文</span>
                            <span className="rewrite-yours">{sub.is_timeout ? <em className="muted">（時間切れ・未回答）</em> : !sub.answer_text || isUnchanged(sub.answer_text, q.prompt) ? <em className="muted">（書き直しなし）</em> : sub.answer_text}</span></p>
                          {!sub.is_timeout && matchesModel(sub.answer_text, examples) && (
                            <p className="rewrite-match">○ 模範例と一致しています</p>
                          )}
                          {examples && <p className="result__row"><span className="result__label">模範例</span><span className="rewrite-model">{examples}</span></p>}
                          {point && <p className="result__row"><span className="result__label">観点</span><span className="rewrite-point">{point}</span></p>}
                        </>
                      )
                    })()
                  ) : q.track === 'sentence' ? (
                    <ul className="mcq-review">
                      {(q.options ?? []).map((o) => {
                        const chosen = parsePicks(sub.answer_text).includes(o.no)
                        return (
                          <li key={o.no} className={'mcq-opt' + (o.ok ? ' is-correct' : ' is-wrong') + (chosen ? ' is-chosen' : '')}>
                            <span className="mcq-opt__mark">{o.ok ? '○' : '✕'}</span>
                            <span className="mcq-opt__body">
                              <span className="mcq-opt__text">{o.no}. {o.text}{chosen && <span className="mcq-opt__you">本人が選択</span>}</span>
                              {o.reason && <span className="mcq-opt__reason">{o.reason}</span>}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                  <p className="result__row">
                    <span className="result__label">本人の解答</span>
                    <span>{sub.is_timeout ? <em className="muted">（時間切れ・未回答）</em> : sub.answer_text || <em className="muted">（空欄）</em>}</span>
                  </p>
                  )}
                  {q.track === 'vocab' && !sub.is_timeout && (() => {
                    const m = vocabMatch(sub.answer_text, q.model_answer)
                    if (m.total === 0) return null
                    return (
                      <p className="vocab-match">あなたの {m.total} 語のうち <strong>{m.matched}</strong> 語が模範例と一致{m.matched > 0 ? ' 🎉' : ''}</p>
                    )
                  })()}
                  {q.track === 'joshi' && q.accepted_answers?.length > 0 && (
                    <p className="result__row"><span className="result__label">正解</span><span className="ans-joshi">{q.accepted_answers.join(' / ')}</span></p>
                  )}
                  {q.model_answer && q.track !== 'rewrite' && (
                    <p className="result__row"><span className="result__label">{q.track === 'vocab' ? '模範解答例' : '解説'}</span><span className={q.track === 'vocab' ? 'ans-vocab' : ''}>{q.model_answer}</span></p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div className="drill-back">
            <button className="btn btn--primary" onClick={() => setSelectedId(null)}>← 一覧へ戻る</button>
          </div>
        </>
      )}
    </div>
  )
}
