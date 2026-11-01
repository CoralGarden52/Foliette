import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Eye, LogOut, RefreshCw, Users, UserPlus, Activity, Images } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../store/user';
import { Logo, Spinner } from '../components/ui';
import type { AdminStats, StatsDay } from '../lib/adminStats';
import './adminStats.css';

type TrendKey = Exclude<keyof StatsDay, 'date'>;
const trends: { key: TrendKey; label: string; historical?: boolean }[] = [
  { key: 'pageviews', label: '浏览量' }, { key: 'visitors', label: '访客数' },
  { key: 'newUsers', label: '新增用户', historical: true }, { key: 'activeUsers', label: '活跃用户' },
  { key: 'newWorks', label: '新增作品', historical: true }, { key: 'exports', label: '图片导出' },
];
const number = (value: number) => value.toLocaleString('zh-CN');
const dateTime = (value: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value);
const beijingDate = (at: number) => new Date(at + 8 * 3600000).toISOString().slice(0, 10);

function Trend({ data, metric }: { data: AdminStats; metric: typeof trends[number] }) {
  const start = beijingDate(data.startedAt);
  const points = data.days.flatMap((day, i) => metric.historical || day.date >= start ? [{ x: 52 + i / 29 * 896, value: day[metric.key], date: day.date }] : []);
  const max = Math.max(1, ...points.map(point => point.value));
  const ceiling = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const y = (value: number) => 220 - value / ceiling * 176;
  const line = points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${y(point.value)}`).join(' ');
  const area = points.length ? `${line} L${points[points.length - 1].x},220 L${points[0].x},220 Z` : '';
  return <svg className="stats-chart" viewBox="0 0 980 270" role="img" aria-label={`最近30天${metric.label}趋势，具体数据见下方每日明细`}>
    <defs><linearGradient id="stats-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7b9374" stopOpacity=".22" /><stop offset="100%" stopColor="#7b9374" stopOpacity=".02" /></linearGradient></defs>
    {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="52" x2="948" y1={y(ceiling * i / 4)} y2={y(ceiling * i / 4)} stroke="#e6e4da" strokeDasharray="3 5" /><text x="39" y={y(ceiling * i / 4) + 4} textAnchor="end">{number(ceiling * i / 4)}</text></g>)}
    <path d={area} fill="url(#stats-fill)" /><path d={line} fill="none" stroke="#6c8466" strokeWidth="2.5" strokeLinejoin="round" />
    {points.map(point => <circle key={point.date} cx={point.x} cy={y(point.value)} r="4" fill="#fffdf7" stroke="#6c8466" strokeWidth="2"><title>{point.date} · {metric.label} {number(point.value)}</title></circle>)}
    {[0, 7, 14, 21, 29].map(i => <text key={i} x={52 + i / 29 * 896} y="251" textAnchor="middle">{data.days[i].date.slice(5).replace('-', '/')}</text>)}
  </svg>;
}

export default function AdminStatsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TrendKey>('pageviews');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await api.adminStats()); }
    catch (err) { setData(null); setError((err as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function signOut() {
    try { await logout(); navigate('/login?next=/admin/stats', { replace: true }); }
    catch (err) { setData(null); setError((err as Error).message); }
  }
  const metric = trends.find(item => item.key === selected)!;
  const cards = data ? [
    { label: '今日浏览量', value: data.summary.pageviews, hint: '页面浏览次数 · PV', icon: Eye },
    { label: '今日访客', value: data.summary.visitors, hint: '匿名浏览器去重 · UV', icon: Users },
    { label: '累计注册', value: data.summary.totalUsers, hint: '当前注册账号总数', icon: Users },
    { label: '今日新增', value: data.summary.newUsers, hint: '今日注册的账号', icon: UserPlus },
    { label: '今日活跃', value: data.summary.activeUsers, hint: '今日使用的登录账号', icon: Activity },
    { label: '作品总数', value: data.summary.totalWorks, hint: '当前保存的照片手账', icon: Images },
    { label: '图片导出次数', value: data.summary.totalExports, hint: '采集开始后的累计次数', icon: Download },
  ] : [];

  return <div className="stats-page">
    <header className="stats-header"><div className="stats-brand"><Logo size={30} /><small>管理后台</small></div><div className="stats-header-actions"><Link to="/walls"><ArrowLeft size={15} />返回作品</Link><button onClick={() => void signOut()}><LogOut size={15} />退出登录</button></div></header>
    <main className="stats-main">
      {!data ? <section className="stats-state" aria-live="polite">{loading ? <><Spinner className="size-7" /><p>正在验证权限并加载统计…</p></> : <><h1>无法查看统计</h1><p role="alert">{error}</p><button className="stats-refresh" onClick={() => void load()}>重新尝试</button></>}</section> : <>
        <div className="stats-heading"><div><p className="stats-eyebrow">FOLIETTE / OVERVIEW</p><h1>网站统计</h1><p>看看有多少人来，把日子贴成喜欢的样子。</p></div><button className="stats-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{loading ? '刷新中' : '刷新数据'}</button></div>
        <div className="stats-context"><span>{dateTime(data.generatedAt)} 更新 · 北京时间</span><span>管理员 · {user?.username}</span></div>
        <section className="stats-cards" aria-label="网站概况">{cards.map(card => <article className="stats-card" key={card.label}><div className="stats-card-label"><h2>{card.label}</h2><card.icon size={17} /></div><p className="stats-value">{number(card.value)}</p><p className="stats-card-hint">{card.hint}</p></article>)}</section>
        <section className="stats-panel"><div className="stats-panel-heading"><div><h2>最近30天</h2><p>{data.days[0].date} — {data.days[29].date}，含今天</p></div><span className="stats-period">每日趋势</span></div><div className="stats-tabs" role="group" aria-label="选择趋势指标">{trends.map(item => <button key={item.key} aria-pressed={selected === item.key} onClick={() => setSelected(item.key)}>{item.label}</button>)}</div><Trend data={data} metric={metric} /><p className="stats-chart-note">{selected === 'newWorks' ? '新增作品按当前仍保留的作品创建时间计算，删除作品后会相应减少。' : selected === 'newUsers' ? '新增用户按现有账号的注册时间统计。' : `采集从 ${dateTime(data.startedAt)} 开始；之前的日期不代表零访问。`}</p></section>
        <section className="stats-panel"><div className="stats-panel-heading"><div><h2>每日明细</h2><p>按日期倒序查看</p></div></div><div className="stats-table-scroll"><table className="stats-table"><caption className="sr-only">最近30天网站每日统计</caption><thead><tr><th scope="col">日期</th>{trends.map(item => <th scope="col" key={item.key}>{item.label}</th>)}</tr></thead><tbody>{[...data.days].reverse().map(day => <tr key={day.date}><th scope="row">{day.date}{day.date === data.days[29].date && <small>今天</small>}</th>{trends.map(item => <td key={item.key}>{!item.historical && day.date < beijingDate(data.startedAt) ? <span title="尚未开始采集">—</span> : number(day[item.key])}</td>)}</tr>)}</tbody></table></div></section>
        <aside className="stats-notes"><h2>统计口径</h2><p>访客按浏览器匿名标识估算；更换设备或清除 Cookie 可能重复计数。管理员登录后的浏览、活跃与导出不计入流量。活跃用户为当天使用网站的去重登录账号。</p><p>导出统计表示图片已生成并触发浏览器下载，不代表文件一定保存完成。注册和现存作品数据可回溯，其余数据从采集启用后积累。今日为北京时间 00:00 至今。</p></aside>
      </>}
    </main>
  </div>;
}
