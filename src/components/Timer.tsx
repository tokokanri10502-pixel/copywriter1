import { useEffect, useRef, useState } from 'react'

interface TimerProps {
  seconds: number
  // この値が変わるとタイマーをリセット（=次の問題へ移ったとき）。
  resetKey: string | number
  onExpire: () => void
}

// 1問単位のカウントダウン（仕様 5.3: 30秒/問）。
export default function Timer({ seconds, resetKey, onExpire }: TimerProps) {
  const [remaining, setRemaining] = useState(seconds)
  // onExpire を ref 経由で呼び、stale closure と再購読を避ける。
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    setRemaining(seconds)
    const start = Date.now()
    const id = setInterval(() => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - start) / 1000))
      setRemaining(left)
      if (left <= 0) {
        clearInterval(id)
        onExpireRef.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [resetKey, seconds])

  const pct = (remaining / seconds) * 100
  const low = remaining <= 5

  return (
    <div className="timer">
      <div className="timer__track">
        <div
          className={'timer__bar' + (low ? ' timer__bar--low' : '')}
          style={{ width: pct + '%' }}
        />
      </div>
      <span className={'timer__num' + (low ? ' timer__num--low' : '')}>
        残り {remaining} 秒
      </span>
    </div>
  )
}
