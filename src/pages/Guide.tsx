import { Link } from 'react-router-dom'
import { homePathFor } from '../lib/useSession'
import type { AppUser } from '../types'

// 例文中の *…* で囲んだ助詞を紺色で強調する。
function renderEx(ex: string) {
  return ex.split('*').map((part, i) =>
    i % 2 === 1 ? (
      <span className="ans-joshi" key={i}>
        {part}
      </span>
    ) : (
      part
    ),
  )
}

const PARTICLES: { p: string; role: string; ex: string }[] = [
  { p: 'は', role: '主題（話題を示す）', ex: '私*は*コピーを書く。' },
  { p: 'が', role: '主語（動作・状態の主体）', ex: '売れ行き*が*好調だ。' },
  { p: 'を', role: '対象（動作の目的語）', ex: '資料*を*配る。' },
  { p: 'に', role: '時・帰着点・相手', ex: '棚*に*商品を並べる。' },
  { p: 'で', role: '場所・手段', ex: '会議*で*発表する。' },
  { p: 'へ', role: '方向', ex: '東京*へ*向かう。' },
  { p: 'と', role: '相手・並列', ex: '上司*と*相談する。' },
  { p: 'から', role: '起点・原因', ex: '失敗*から*学ぶ。' },
  { p: 'まで', role: '到達点・範囲', ex: '締め切り*まで*に出す。' },
]

const PITFALLS: { title: string; body: React.ReactNode }[] = [
  {
    title: '「は」と「が」の違い',
    body: (
      <>
        「は」は<strong>話題（すでに分かっていること）</strong>、「が」は
        <strong>新しい情報・主体の強調</strong>。例：{renderEx('私*は*担当です')}（話題）／
        {renderEx('私*が*担当です')}（他でなく私が）。
      </>
    ),
  },
  {
    title: '「を」と「が」の混同',
    body: (
      <>
        他動詞の対象は「を」（{renderEx('本*を*読む')}）。一方、「〜たい」や可能・好悪は「が」
        （{renderEx('水*が*飲みたい')}／{renderEx('英語*が*できる')}）。
      </>
    ),
  },
  {
    title: '主語述語のねじれ',
    body: (
      <>
        主語と述語が噛み合っているか確認。例：「私の夢は、医者です。」→
        「私の夢は、医者に<strong>なることです</strong>。」のように対応させる。
      </>
    ),
  },
]

export default function Guide({ user }: { user: AppUser }) {
  return (
    <div className="page">
      <div className="topbar">
        <Link className="linkbtn" to={homePathFor(user)}>
          ← 戻る
        </Link>
        <span />
      </div>

      <div className="guide">
        <div className="exam__head exam__head--select">
          <span className="kicker">GUIDE</span>
          <h2 className="exam__heading">てにをは ガイド</h2>
        </div>

        <div className="card guide__intro">
          助詞（てにをは）は、<strong>語と語の関係</strong>を示す言葉です。正しく使うと
          <strong>主語と述語が噛み合い</strong>、意味の伝わる一文になります。まずは下の早見表で
          役割と例文をつかみ、間違えやすいポイントを押さえましょう。
        </div>

        <h3 className="guide__section">主要な助詞 早見表</h3>
        <div className="guide__grid">
          {PARTICLES.map((x) => (
            <div key={x.p} className="card guide__particle">
              <span className="guide__p">{x.p}</span>
              <span className="guide__role">{x.role}</span>
              <span className="guide__ex">{renderEx(x.ex)}</span>
            </div>
          ))}
        </div>

        <h3 className="guide__section">間違えやすいポイント</h3>
        <div className="guide__pitfalls">
          {PITFALLS.map((x) => (
            <div key={x.title} className="card guide__pitfall">
              <h4 className="guide__pitfall-title">{x.title}</h4>
              <p className="guide__pitfall-body">{x.body}</p>
            </div>
          ))}
        </div>

        <div className="drill-back">
          <Link className="btn btn--primary" to={homePathFor(user)}>
            トレーニングに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
