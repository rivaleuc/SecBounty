import { useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { ShieldHalf, Wallet, Loader2, Plus, Bug, Gavel, Send } from 'lucide-react'
import { read, write, connectWallet, isWalletConnected, CONTRACT } from './genlayer'
import { Button } from './components/ui'

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
  const [reps, setReps] = useState<Report[]>([]); const [showNew, setShowNew] = useState(false)
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
  async function post() { if (!target.trim() || !scopeTxt.trim()) return toast.error('Target + scope.'); if (!(Number(pool) >= 0.001)) return toast.error('≥ 0.001'); setCreating(true); const t = toast.loading('Funding…'); try { const id = (await write('post_scope', [target.trim(), scopeTxt.trim()], wei(pool))) as any; toast.success('Live.', { id: t }); setTarget(''); setScopeTxt(''); setShowNew(false); await load(); if (typeof id === 'string') setSel(id) } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setCreating(false) } }
  async function submitReport(s: Scope) { if (!rt.title.trim()) return toast.error('Title.'); setBusy('new'); const t = toast.loading('Submitting…'); try { await write('submit_report', [s.id, rt.title.trim(), rt.poc.trim()]); setRt({ title: '', poc: '' }); toast.success('Submitted.', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }
  async function triage(s: Scope, r: Report) { setBusy(r.idx); const t = toast.loading('Triaging severity… (30–60s)'); try { await write('triage', [s.id, r.idx]); toast.success('Triaged.', { id: t }); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }

  const s = scopes.find((x) => x.id === sel) || null
  const paid = s ? Number(toGen(s.pool_wei)) - Number(toGen(s.remaining_wei)) : 0
  const poolG = s ? Number(toGen(s.pool_wei)) || 1 : 1; const pct = Math.min(100, (paid / poolG) * 100); const C = 2 * Math.PI * 34

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground" style={{ fontFamily: 'Chakra Petch, ui-monospace, monospace' }}>
      <Toaster theme="dark" position="bottom-right" richColors />
      {/* LEFT PROGRAM RAIL */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4"><ShieldHalf className="h-5 w-5 text-primary" /><span className="text-sm font-bold uppercase tracking-wider">SecBounty</span></div>
        <div className="px-3 py-3"><button onClick={() => setShowNew(!showNew)} className="w-full rounded-md border border-dashed border-border py-2 text-xs uppercase text-muted hover:border-primary hover:text-primary"><Plus className="inline h-3.5 w-3.5" /> new program</button></div>
        {showNew && (
          <div className="mx-3 mb-2 grid gap-2 rounded-lg border border-border bg-card p-2.5">
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="target" className="rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/60" />
            <input value={scopeTxt} onChange={(e) => setScopeTxt(e.target.value)} placeholder="scope" className="rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/60" />
            <div className="flex gap-1.5"><input value={pool} onChange={(e) => setPool(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary/60" /><Button size="sm" onClick={post} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'fund'}</Button></div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2">
          {scopes.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`mb-0.5 block w-full truncate rounded-md px-2.5 py-2 text-left text-xs ${sel === x.id ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-card'}`}>▸ {x.target}</button>)}
        </div>
        <div className="border-t border-border p-3"><button onClick={connect} className="w-full rounded border border-border py-1.5 text-[11px] hover:border-primary"><Wallet className="mr-1 inline h-3.5 w-3.5" />{wallet && wallet !== 'connected' ? short(wallet) : wallet ? 'connected' : 'connect'}</button><div className="mt-2 text-center text-[10px] text-muted">{toGen(stats.paid_wei)} GEN paid · {stats.valid_reports} valid</div></div>
      </aside>

      {/* MAIN */}
      <section className="flex-1 overflow-y-auto p-6">
        {!s ? <div className="grid h-full place-items-center text-sm text-muted">No programs — fund one.</div> : (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-5 rounded-2xl border border-border bg-card/50 p-5">
              <div className="relative h-24 w-24 shrink-0"><svg viewBox="0 0 80 80" className="h-full w-full -rotate-90"><circle cx="40" cy="40" r="34" fill="none" stroke="#ffffff12" strokeWidth="7" /><circle cx="40" cy="40" r="34" fill="none" stroke="#fb923c" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} /></svg><div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-sm font-bold text-accent">{toGen(s.remaining_wei)}</div><div className="text-[9px] text-muted">left</div></div></div></div>
              <div className="min-w-0 flex-1"><div className="text-lg font-bold">{s.target}</div><p className="mt-1 text-sm text-muted">{s.scope}</p><div className="mt-2 flex flex-wrap gap-1.5">{[['critical', '50%'], ['high', '25%'], ['medium', '10%'], ['low', '5%']].map(([k, v]) => <span key={k} className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${SEV[k]}`}>{k} {v}</span>)}</div></div>
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-sm"><thead className="bg-card/80 text-[11px] uppercase tracking-wider text-muted"><tr><th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Report</th><th className="hidden px-4 py-2.5 sm:table-cell">By</th><th className="px-4 py-2.5">Severity</th><th className="px-4 py-2.5 text-right">Payout</th></tr></thead>
                <tbody className="divide-y divide-border/60">
                  {reps.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No reports.</td></tr>}
                  {reps.map((r) => <tr key={r.idx} className="bg-background/30 hover:bg-card/40"><td className="px-4 py-2.5 text-xs text-muted">{r.idx}</td><td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><Bug className="h-3.5 w-3.5 text-muted" />{r.title}</div></td><td className="hidden px-4 py-2.5 text-xs text-muted sm:table-cell">{short(r.researcher)}</td><td className="px-4 py-2.5">{r.state === 'triaged' ? <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${SEV[r.severity] ?? SEV.none}`}>{r.severity}</span> : <Button size="sm" disabled={busy === r.idx} onClick={() => triage(s, r)}>{busy === r.idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} triage</Button>}</td><td className="px-4 py-2.5 text-right text-accent">{Number(r.paid_wei) > 0 ? `+${toGen(r.paid_wei)}` : '—'}</td></tr>)}
                </tbody></table>
            </div>
            <div className="mt-3 flex gap-2"><input value={rt.title} onChange={(e) => setRt({ ...rt, title: e.target.value })} placeholder="vulnerability title" className="flex-1 rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/60" /><input value={rt.poc} onChange={(e) => setRt({ ...rt, poc: e.target.value })} placeholder="PoC URL" className="w-40 rounded-md border border-border bg-background/70 px-2 py-2 text-xs outline-none focus:border-primary/60" /><Button size="sm" disabled={busy === 'new'} onClick={() => submitReport(s)}><Send className="h-4 w-4" /> report</Button></div>
            <div className="mt-4 text-[11px] text-muted"><a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-primary">{short(CONTRACT)} ↗</a></div>
          </div>
        )}
      </section>
    </div>
  )
}
