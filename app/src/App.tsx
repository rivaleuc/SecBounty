import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import {
  ShieldHalf, Wallet, Loader2, Plus, Coins, Bug, Gavel, ChevronDown, Send,
} from 'lucide-react'
import { read, write, connectWallet, isWalletConnected, CONTRACT } from './genlayer'
import { Button } from './components/ui'
import { NumberTicker } from './components/magic'

const EXPLORER = `https://explorer-bradbury.genlayer.com/contract/${CONTRACT}`
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const toGen = (wei: string | number) => Number(BigInt(wei || '0')) / 1e18

type Scope = { id: string; owner: string; target: string; scope: string; pool_wei: string; remaining_wei: string; report_count: number }
type Report = { idx: string; researcher: string; title: string; poc_url: string; state: string; valid: boolean; severity: string; reason: string; paid_wei: string }

const SEV: Record<string, string> = { critical: 'text-red-400 border-red-400/40 bg-red-400/10', high: 'text-orange-400 border-orange-400/40 bg-orange-400/10', medium: 'text-amber-400 border-amber-400/40 bg-amber-400/10', low: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10', none: 'text-slate-400 border-slate-400/20 bg-slate-400/10' }

export default function App() {
  const [wallet, setWallet] = useState<string | null>(null)
  const [stats, setStats] = useState({ total_scopes: 0, valid_reports: 0, paid_wei: '0' })
  const [scopes, setScopes] = useState<Scope[]>([])
  const [reps, setReps] = useState<Record<string, Report[]>>({})
  const [open, setOpen] = useState(false); const [sel, setSel] = useState<string | null>(null)
  const [target, setTarget] = useState(''); const [scopeTxt, setScopeTxt] = useState(''); const [pool, setPool] = useState('0.05')
  const [rt, setRt] = useState<Record<string, { title: string; poc: string }>>({})
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    try {
      const s = (await read('stats')) as any
      setStats({ total_scopes: Number(s?.total_scopes ?? 0), valid_reports: Number(s?.valid_reports ?? 0), paid_wei: String(s?.paid_wei ?? '0') })
      const total = Number(s?.total_scopes ?? 0); const out: Scope[] = []
      for (let i = total - 1; i >= 0 && i >= total - 10; i--) { try { const sc = (await read('get_scope', [String(i)])) as any; if (sc?.exists) out.push({ ...sc, id: String(i) }) } catch {} }
      setScopes(out)
    } catch (e) { console.warn(e) }
  }
  useEffect(() => { load(); setWallet(isWalletConnected() ? 'connected' : null) /* eslint-disable-next-line */ }, [])
  async function loadReps(s: Scope) { const out: Report[] = []; for (let i = 0; i < Number(s.report_count); i++) { try { const r = (await read('get_report', [s.id, String(i)])) as any; if (r?.exists) out.push({ ...r, idx: String(i) }) } catch {} } setReps((p) => ({ ...p, [s.id]: out })) }
  function toggle(s: Scope) { const n = sel === s.id ? null : s.id; setSel(n); if (n) loadReps(s) }

  async function connect() { try { const a = await connectWallet(); setWallet(a); toast.success(`Connected · ${short(a)}`) } catch (e: any) { toast.error(e?.message ?? 'Failed') } }
  function wei(g: string) { return BigInt(Math.round((Number(g) || 0) * 1e18)) }
  async function post() { if (!target.trim() || !scopeTxt.trim()) return toast.error('Target + scope.'); const g = Number(pool); if (!(g >= 0.001)) return toast.error('Pool ≥ 0.001 GEN'); setCreating(true); const t = toast.loading('Funding bounty pool…'); try { await write('post_scope', [target.trim(), scopeTxt.trim()], wei(pool)); toast.success('Program live.', { id: t }); setTarget(''); setScopeTxt(''); setOpen(false); await load() } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setCreating(false) } }
  async function submitReport(s: Scope) { const r = rt[s.id] ?? { title: '', poc: '' }; if (!r.title.trim()) return toast.error('Report title.'); setBusy(s.id); const t = toast.loading('Submitting report…'); try { await write('submit_report', [s.id, r.title.trim(), r.poc.trim()]); setRt({ ...rt, [s.id]: { title: '', poc: '' } }); toast.success('Submitted.', { id: t }); await loadReps({ ...s, report_count: s.report_count + 1 }) } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }
  async function triage(s: Scope, r: Report) { setBusy(s.id + r.idx); const t = toast.loading('Validators triaging severity… (30–60s)'); try { const out = (await write('triage', [s.id, r.idx])) as any; toast.success('Triaged.', { id: t }); await load(); await loadReps(s) } catch (e: any) { toast.error(`Failed: ${e?.shortMessage ?? e?.message ?? e}`, { id: t }) } finally { setBusy(null) } }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(720px_circle_at_50%_-5%,#fb923c1c,transparent_60%)]" />

      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-2.5 px-5">
          <ShieldHalf className="h-5 w-5 text-primary" /><span className="text-[15px] font-bold tracking-tight">SecBounty</span>
          <div className="ml-4 hidden font-mono text-xs text-muted md:block"><b className="text-foreground"><NumberTicker value={stats.total_scopes} /></b> programs · <b className="text-accent"><NumberTicker value={Number(toGen(stats.paid_wei).toFixed(3))} decimalPlaces={3} /></b> GEN paid</div>
          <Button size="sm" className="ml-auto" variant={wallet ? 'outline' : 'primary'} onClick={connect}><Wallet className="h-4 w-4" />{wallet && wallet !== 'connected' ? short(wallet) : wallet ? 'Connected' : 'Connect'}</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-black tracking-tight md:text-3xl">Bounties paid by graded severity</h1>
        <p className="mt-1 text-sm text-muted">Fund a pool, researchers report, validators agree on a severity tier — payout scales with how bad the bug is.</p>

        <div className="mt-5"><Button onClick={() => setOpen(!open)} variant={open ? 'ghost' : 'primary'}><Plus className="h-4 w-4" />{open ? 'Cancel' : 'Post a program'}</Button></div>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mt-3 grid gap-2 rounded-xl border border-border bg-card/60 p-3">
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target (domain / repo / contract)" className="rounded-md border border-border bg-background/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50" />
              <textarea value={scopeTxt} onChange={(e) => setScopeTxt(e.target.value)} rows={2} placeholder="Scope / rules of engagement" className="resize-none rounded-md border border-border bg-background/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50" />
              <div className="flex gap-2"><div className="relative flex-1"><input value={pool} onChange={(e) => setPool(e.target.value)} className="w-full rounded-md border border-border bg-background/70 px-3 py-2.5 pr-12 text-sm outline-none focus:border-primary/50" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent">GEN</span></div><Button size="sm" onClick={post} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />} Fund pool</Button></div>
            </div>
          </motion.div>
        )}

        <div className="mt-6 space-y-3">
          {scopes.length === 0 && <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">No programs yet.</div>}
          {scopes.map((s) => {
            const paid = Number(toGen(s.pool_wei)) - Number(toGen(s.remaining_wei)); const pool = Number(toGen(s.pool_wei)) || 1
            const list = reps[s.id] ?? []; const r = rt[s.id] ?? { title: '', poc: '' }
            return (
              <div key={s.id} className="rounded-2xl border border-border bg-card/50">
                <button onClick={() => toggle(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <ShieldHalf className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1"><div className="truncate font-mono text-sm font-semibold">{s.target}</div><div className="text-[11px] text-muted">{s.report_count} reports · {toGen(s.remaining_wei)} / {toGen(s.pool_wei)} GEN left</div></div>
                  <div className="hidden w-24 sm:block"><div className="h-1.5 w-full overflow-hidden rounded-full bg-border"><div className="h-full bg-primary" style={{ width: `${(paid / pool) * 100}%` }} /></div></div>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${sel === s.id ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {sel === s.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-border/60">
                      <div className="space-y-2 p-4">
                        <p className="text-xs text-muted">{s.scope}</p>
                        {list.map((rep) => (
                          <div key={rep.idx} className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-2.5">
                            <Bug className="h-4 w-4 shrink-0 text-muted" />
                            <div className="min-w-0 flex-1"><div className="truncate text-sm">{rep.title}</div>{rep.state === 'triaged' && rep.reason && <div className="truncate text-[11px] text-muted">{rep.reason}</div>}</div>
                            {rep.state === 'triaged' ? <>
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${SEV[rep.severity] ?? SEV.none}`}>{rep.severity}</span>
                              {Number(rep.paid_wei) > 0 && <span className="font-mono text-[11px] text-accent">+{toGen(rep.paid_wei)}</span>}
                            </> : <Button size="sm" disabled={busy === s.id + rep.idx} onClick={() => triage(s, rep)}>{busy === s.id + rep.idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} Triage</Button>}
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <input value={r.title} onChange={(e) => setRt({ ...rt, [s.id]: { ...r, title: e.target.value } })} placeholder="Vulnerability title" className="flex-1 rounded-md border border-border bg-background/70 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                          <input value={r.poc} onChange={(e) => setRt({ ...rt, [s.id]: { ...r, poc: e.target.value } })} placeholder="PoC URL" className="w-32 rounded-md border border-border bg-background/70 px-2 py-2 text-xs outline-none focus:border-primary/50" />
                          <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => submitReport(s)}><Send className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </main>

      <footer className="border-t border-border"><div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6 text-xs text-muted"><span>SecBounty · severity-graded vulnerability bounties on GenLayer</span><a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-primary">{short(CONTRACT)} ↗</a></div></footer>
    </div>
  )
}
