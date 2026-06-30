import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { ShieldHalf, Wallet, Loader2, Plus, Bug, Gavel, Send, Coins } from 'lucide-react'
import { read, write, connectWallet, isWalletConnected, CONTRACT } from './genlayer'
import { Button } from './components/ui'
import { NumberTicker } from './components/magic'

const EXPLORER = `https://explorer-bradbury.genlayer.com/contract/${CONTRACT}`
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const toGen = (w: string | number) => Number(BigInt(w || '0')) / 1e18
type Scope = { id: string; owner: string; target: string; scope: string; pool_wei: string; remaining_wei: string; report_count: number }
type Report = { idx: string; researcher: string; title: string; poc_url: string; state: string; valid: boolean; severity: string; reason: string; paid_wei: string }
const SEV: Record<string, string> = { critical: 'text-red-400 bg-red-400/10 border-red-400/30', high: 'text-orange-400 bg-orange-400/10 border-orange-400/30', medium: 'text-amber-400 bg-amber-400/10 border-amber-400/30', low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', none: 'text-slate-400 bg-slate-400/10 border-slate-400/20' }

export default function App() {
  const [wallet, setWallet] = useState<string | null>(null)
  const [stats, setStats] = useState({ total_scopes: 0, valid_reports: 0, paid_wei: '0' })
  const [scopes, setScopes] = useState<Scope[]>([]); const [sel, setSel] = useState<string | null>(null)
  const [reps, setReps] = useState<Report[]>([])
  const [showNew, setShowNew] = useState(false)
  const [target, setTarget] = useState(''); const [scopeTxt, setScopeTxt] = useState(''); const [pool, setPool] = useState('0.05')
  const [rt, setRt] = useState({ title: '', poc: '' })
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    try {
      const s = (await read('stats')) as any
      setStats({ total_scopes: Number(s?.total_scopes ?? 0), valid_reports: Number(s?.valid_reports ?? 0), paid_wei: String(s?.paid_wei ?? '0') })
      const total = Number(s?.total_scopes ?? 0); const out: Scope[] = []
      for (let i = total - 1; i >= 0 && i >= total - 16; i--) { try { const sc = (await read('get_scope', [String(i)])) as any; if (sc?.exists) out.push({ ...sc, id: String(i) }) } catch {} }
      setScopes(out); if (!sel && out.length) setSel(out[0].id)
    } catch (e) { console.warn(e) }
  }
  async function loadReps(s: Scope) { const out: Report[] = []; for (let i = 0; i < Number(s.report_count); i++) { try { const r = (await read('get_report', [s.id, String(i)])) as any; if (r?.exists) out.push({ ...r, idx: String(i) }) } catch {} } setReps(out) }
  useEffect(() => { load(); setWallet(isWalletConnected() ? 'connected' : null) /* eslint-disable-next-line */ }, [])
  useEffect(() => { const s = scopes.find((x) => x.id === sel); if (s) loadReps(s) /* eslint-disable-next-line */ }, [sel, scopes])

  async function connect() { try { const a = await connectWallet(); setWallet(a); toast.success(`Connected · ${short(a)}`) } catch (e: any) { toast.error(e?.message ?? 'Failed') } }
  function wei(g: string) { return BigInt(Math.round((Number(g) || 0) * 1e18)) }
  async function post() { if (!target.trim() || !scopeTxt.trim()) return toast.error('Target + scope.'); if (!(Number(pool) >= 0.001)) return toast.error('Pool ≥ 0.001'); setCreating(true); const t = toast.loading('Funding…'); try { const id = (await write('post_scope', [target.trim(), scopeTxt.trim()], wei(pool))) as any; toast.success('Program live.', { id: t }); setTarget(''); setScopeTxt(''); setShowNew(false); await load(); if (typeof id === 'string') setSel(id) } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setCreating(false) } }
  async function submitReport(s: Scope) { if (!rt.title.trim()) return toast.error('Title.'); setBusy('new'); const t = toast.loading('Submitting…'); try { await write('submit_report', [s.id, rt.title.trim(), rt.poc.trim()]); setRt({ title: '', poc: '' }); toast.success('Submitted.', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }
  async function triage(s: Scope, r: Report) { setBusy(r.idx); const t = toast.loading('Triaging severity… (30–60s)'); try { await write('triage', [s.id, r.idx]); toast.success('Triaged.', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }

  const s = scopes.find((x) => x.id === sel) || null
  const paid = s ? Number(toGen(s.pool_wei)) - Number(toGen(s.remaining_wei)) : 0
  const poolG = s ? Number(toGen(s.pool_wei)) || 1 : 1
  const pct = Math.min(100, (paid / poolG) * 100)
  const C = 2 * Math.PI * 34

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(900px_circle_at_50%_-10%,#fb923c1c,transparent_60%)]" />
      <header className="border-b border-border"><div className="mx-auto flex h-16 max-w-5xl items-center gap-2.5 px-5">
        <ShieldHalf className="h-5 w-5 text-primary" /><span className="text-[15px] font-bold tracking-tight">SecBounty</span>
        <div className="ml-4 hidden font-mono text-xs text-muted md:block"><b className="text-accent"><NumberTicker value={Number(toGen(stats.paid_wei).toFixed(3))} decimalPlaces={3} /></b> GEN paid · <b className="text-foreground"><NumberTicker value={stats.valid_reports} /></b> valid</div>
        <Button size="sm" className="ml-auto" variant="outline" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4" /> Program</Button>
        <Button size="sm" className="ml-2" variant={wallet ? 'outline' : 'primary'} onClick={connect}><Wallet className="h-4 w-4" />{wallet && wallet !== 'connected' ? short(wallet) : wallet ? 'Connected' : 'Connect'}</Button>
      </div></header>

      <div className="mx-auto max-w-5xl px-5 pt-5">
        <div className="flex flex-wrap gap-2">
          {scopes.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`rounded-lg border px-3 py-1.5 font-mono text-xs ${sel === x.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:text-foreground'}`}>{x.target}</button>)}
        </div>
        {showNew && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mt-3 grid gap-2 rounded-xl border border-border bg-card/60 p-3 sm:grid-cols-2">
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target (domain/repo/contract)" className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50" />
              <div className="relative"><input value={pool} onChange={(e) => setPool(e.target.value)} className="w-full rounded-md border border-border bg-background/70 px-3 py-2 pr-12 text-sm outline-none focus:border-primary/50" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent">GEN</span></div>
              <input value={scopeTxt} onChange={(e) => setScopeTxt(e.target.value)} placeholder="Scope / rules" className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50 sm:col-span-2" />
              <Button size="sm" onClick={post} disabled={creating} className="sm:col-span-2 sm:justify-self-end">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />} Fund pool</Button>
            </div>
          </motion.div>
        )}
      </div>

      {!s ? <div className="mx-auto max-w-5xl px-5 py-24 text-center text-sm text-muted">No programs yet.</div> : (
        <main className="mx-auto max-w-5xl px-5 py-6">
          {/* program header with pool gauge */}
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-card/50 p-5 sm:flex-row">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90"><circle cx="40" cy="40" r="34" fill="none" stroke="#ffffff12" strokeWidth="7" /><circle cx="40" cy="40" r="34" fill="none" stroke="#fb923c" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} /></svg>
              <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-sm font-black text-accent">{toGen(s.remaining_wei)}</div><div className="text-[9px] text-muted">GEN left</div></div></div>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="font-mono text-lg font-bold">{s.target}</div>
              <p className="mt-1 text-sm text-muted">{s.scope}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">{[['critical', '50%'], ['high', '25%'], ['medium', '10%'], ['low', '5%']].map(([k, v]) => <span key={k} className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${SEV[k]}`}>{k} {v}</span>)}</div>
            </div>
          </div>

          {/* reports leaderboard table */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card/80 text-[11px] uppercase tracking-wider text-muted"><tr><th className="px-4 py-2.5 font-medium">#</th><th className="px-4 py-2.5 font-medium">Report</th><th className="hidden px-4 py-2.5 font-medium sm:table-cell">Researcher</th><th className="px-4 py-2.5 font-medium">Severity</th><th className="px-4 py-2.5 text-right font-medium">Payout</th></tr></thead>
              <tbody className="divide-y divide-border/60">
                {reps.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No reports yet.</td></tr>}
                {reps.map((r) => (
                  <tr key={r.idx} className="bg-background/30 hover:bg-card/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.idx}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><Bug className="h-3.5 w-3.5 text-muted" />{r.title}</div></td>
                    <td className="hidden px-4 py-2.5 font-mono text-xs text-muted sm:table-cell">{short(r.researcher)}</td>
                    <td className="px-4 py-2.5">{r.state === 'triaged' ? <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${SEV[r.severity] ?? SEV.none}`}>{r.severity}</span> : <Button size="sm" disabled={busy === r.idx} onClick={() => triage(s, r)}>{busy === r.idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} triage</Button>}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-accent">{Number(r.paid_wei) > 0 ? `+${toGen(r.paid_wei)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* submit row */}
          <div className="mt-3 flex gap-2">
            <input value={rt.title} onChange={(e) => setRt({ ...rt, title: e.target.value })} placeholder="Vulnerability title" className="flex-1 rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50" />
            <input value={rt.poc} onChange={(e) => setRt({ ...rt, poc: e.target.value })} placeholder="PoC URL" className="w-40 rounded-md border border-border bg-background/70 px-2 py-2 text-xs outline-none focus:border-primary/50" />
            <Button size="sm" disabled={busy === 'new'} onClick={() => submitReport(s)}><Send className="h-4 w-4" /> Report</Button>
          </div>
        </main>
      )}
      <footer className="border-t border-border"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 text-xs text-muted"><span>SecBounty · severity-graded vulnerability bounties</span><a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-primary">{short(CONTRACT)} ↗</a></div></footer>
    </div>
  )
}
