import { selfRatingLabel } from '../lib/rewrite'
import type { Review } from '../types'

// 推敲の講評を表示する（受講画面・ダッシュボード共通）。Claude の講評 → 上長の一言 の順。
export default function ReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null
  const sorted = [...reviews].sort((a, b) => (a.reviewer === 'claude' ? -1 : 1) - (b.reviewer === 'claude' ? -1 : 1))
  return (
    <div className="review-list">
      {sorted.map((rv) => (
        <div key={rv.reviewer} className={`review review--${rv.reviewer}`}>
          <div className="review__head">
            <span className="review__who">
              {rv.reviewer === 'claude' ? '講評（Claude）' : `上長の一言${rv.reviewer_name ? `（${rv.reviewer_name}）` : ''}`}
            </span>
            {rv.verdict && (
              <span className={`review__verdict review__verdict--${rv.verdict}`}>{selfRatingLabel(rv.verdict)}</span>
            )}
            <span className="review__date">{rv.created_at.slice(5, 10).replace('-', '/')}</span>
          </div>
          {rv.comment && <p className="review__comment">{rv.comment}</p>}
          {rv.suggestion && (
            <p className="review__suggestion">
              <span className="review__suggestion-label">改善例</span>
              {rv.suggestion}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
