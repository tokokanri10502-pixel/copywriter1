import { useEffect, useRef } from 'react'

// 5日刻みの節目で表示する英語メッセージ。「You got it!」に続く一言。
const LINES: Record<number, string> = {
  5: 'Five days strong — the habit is taking root.',
  10: "Ten days in, and your sentences are getting sharper.",
  15: 'Fifteen days! Consistency is becoming your superpower.',
  20: 'Twenty days down — real progress, one word at a time.',
  25: "Twenty-five! You're writing with new confidence.",
  30: "Thirty days! You've built something that lasts.",
  35: 'Thirty-five and still going — momentum is on your side.',
  40: "Forty days! You're not just practicing; you're mastering it.",
  45: 'Forty-five days of craft. Your instincts are sharpening.',
  50: 'Fifty days! That is dedication most never reach.',
}
function lineFor(day: number): string {
  return LINES[day] ?? `${day} days of steady practice — keep the streak alive!`
}

// 全画面の祝福オーバーレイ。canvas で花火を描き、テキストを重ねる。
export default function Celebration({ day, onClose }: { day: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0
    let H = 0
    const resize = () => {
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const COLORS = ['#b3472d', '#3a47a0', '#0d8a64', '#e0a43b', '#d98324', '#c8506a', '#f4d35e']
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
    let parts: P[] = []

    const burst = (x: number, y: number) => {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      const n = 36 + Math.floor(Math.random() * 22)
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.25
        const sp = 1.5 + Math.random() * 2.8
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 50 + Math.random() * 26, color, size: 1.5 + Math.random() * 2 })
      }
    }

    let raf = 0
    let frame = 0
    const tick = () => {
      frame++
      if (frame % 24 === 1) burst(W * (0.18 + Math.random() * 0.64), H * (0.16 + Math.random() * 0.4))
      ctx.clearRect(0, 0, W, H)
      for (const p of parts) {
        p.life++
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.035
        p.vx *= 0.99
        p.vy *= 0.99
        const t = 1 - p.life / p.max
        if (t > 0) {
          ctx.globalAlpha = Math.max(0, t)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      parts = parts.filter((p) => p.life < p.max)
      raf = requestAnimationFrame(tick)
    }

    // 開幕の同時打ち上げ
    burst(W * 0.5, H * 0.3)
    burst(W * 0.3, H * 0.42)
    burst(W * 0.72, H * 0.36)
    tick()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="celebrate" onClick={onClose} role="dialog" aria-label="達成おめでとう">
      <canvas ref={canvasRef} className="celebrate__canvas" aria-hidden />
      <div className="celebrate__card" onClick={(e) => e.stopPropagation()}>
        <span className="celebrate__spark" aria-hidden>🎆</span>
        <h2 className="celebrate__title">You got it!</h2>
        <p className="celebrate__line">{lineFor(day)}</p>
        <p className="celebrate__day">通算 {day} 日 クリア</p>
        <button className="btn btn--primary celebrate__btn" onClick={onClose}>
          続ける →
        </button>
      </div>
    </div>
  )
}
