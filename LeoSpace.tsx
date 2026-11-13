import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Leo } from './Leo'
import { PetRoom, type Placed } from './PetRoom'
import { usePet } from './PetContext'
import { useAuth } from './auth'
import { BACKGROUNDS, blip, getPetUi, lastRpcError, MAX_ROOM_ITEMS, needText, ROOM_KINDS, setPetUi, SLOTS, unlockInfo } from './petCore'

const Bar = ({ label, v, c }: { label: string; v: number; c: string }) => (
  <div className="pet-bar" title={`${label}: ${v}/100`}><span>{label}</span><i role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}><b style={{ width: v + '%', background: c }} /></i></div>
)
const Sw = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
  <label className="row flex items-center justify-between py-1.5 text-sm"><span>{label}</span>
    <input type="checkbox" role="switch" checked={on} onChange={e => set(e.target.checked)} aria-label={label} className="h-5 w-5" /></label>
)
const Meter = ({ pct, label }: { pct: number; label: string }) => (
  <i className="pet-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><b style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} /></i>
)

type Tab = 'home' | 'wardrobe' | 'room' | 'settings'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' }, { id: 'wardrobe', label: 'Wardrobe', icon: '👕' }, { id: 'room', label: 'Room', icon: '🛋️' }, { id: 'settings', label: 'Settings', icon: '⚙️' },
]

// ---------------------------------------------------------------- Wardrobe: colour, outfit, glasses, accessory, ability
function Wardrobe({ note }: { note: (t: string) => void }) {
  const { active, items, owns, boot, badgeNames, setLook, busy } = usePet()
  const [slot, setSlot] = useState<string>('outfit')
  if (!active || !boot) return null
  const look = (active.appearance ?? {}) as Record<string, string | undefined>
  const worn = look[slot] ?? ''
  const list = items.filter(i => i.kind === slot).sort((a, b) => a.sort - b.sort)
  const equip = async (code: string) => { const r = await setLook(active.id, { [slot]: code || null }); if (!r.ok) note(r.error ?? 'Could not change that right now.') }
  return (
    <section className="glass p-3" aria-label="Wardrobe">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Wardrobe categories">
        {SLOTS.map(([k, l]) => <button key={k} role="tab" aria-selected={slot === k} className={'pet-chip' + (slot === k ? ' on' : '')} onClick={() => setSlot(k)}>{l}</button>)}
      </div>
      <ul className="grid grid-cols-2 gap-2 mt-3">
        <li><button className={'pet-card2' + (!worn ? ' on' : '')} disabled={busy || !worn} aria-pressed={!worn} onClick={() => equip('')}>
          <span className="text-xl">🚫</span><b>{slot === 'color' ? 'Default colour' : 'None'}</b><small>{!worn ? 'Selected' : 'Take it off'}</small></button></li>
        {list.map(it => {
          const mine = owns(it.code); const on = worn === it.code; const info = unlockInfo(it, boot, badgeNames)
          return (
            <li key={it.code}>
              <button className={'pet-card2' + (on ? ' on' : '') + (mine ? '' : ' locked')} disabled={busy || !mine} aria-pressed={on} title={it.description} onClick={() => equip(it.code)}>
                <span className="text-xl">{mine ? it.emoji : '🔒'}</span><b>{it.name}</b>
                <small>{on ? 'Wearing' : mine ? 'Tap to wear' : info.text}</small>
                {!mine && it.unlock.type === 'glory' && <Meter pct={info.pct} label={`Progress to ${it.name}`} />}
              </button>
            </li>)
        })}
      </ul>
      {!list.length && <p className="text-xs text-gray-400 mt-2">Nothing here yet. Check back soon!</p>}
    </section>
  )
}

// ---------------------------------------------------------------- Room: background + up to 14 placed items
function RoomEditor({ note }: { note: (t: string) => void }) {
  const { active, items, owns, itemMap, boot, badgeNames, setHome, busy, mood } = usePet()
  const [bg, setBg] = useState<string>(active?.home?.background ?? 'bg_day')
  const [placed, setPlaced] = useState<Placed[]>(active?.home?.items ?? [])
  const [adding, setAdding] = useState<string | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  if (!active || !boot) return null
  const edit = (fn: () => void) => { fn(); setDirty(true) }
  const emojiOf = (c: string) => itemMap.get(c)?.emoji ?? '🎁'
  const nameOf = (c: string) => itemMap.get(c)?.name ?? c
  const pick = (x: number, y: number) => {
    if (adding) {
      if (placed.length >= MAX_ROOM_ITEMS) { note(`The room is full (${MAX_ROOM_ITEMS} items). Remove one first.`); return }
      edit(() => { setPlaced(p => [...p, { code: adding, x, y }]); setSel(placed.length); setAdding(null) })
    } else if (sel != null && placed[sel]) edit(() => setPlaced(p => p.map((it, i) => i === sel ? { ...it, x, y } : it)))
  }
  const remove = () => { if (sel == null) return; edit(() => { setPlaced(p => p.filter((_, i) => i !== sel)); setSel(null) }) }
  const save = async () => {
    const r = await setHome(active.id, { background: bg, items: placed })
    if (r.ok) { setDirty(false); note('Room saved 🏠') } else note(r.error ?? 'Could not save the room right now.')
  }
  const reset = () => { setBg(active.home?.background ?? 'bg_day'); setPlaced(active.home?.items ?? []); setSel(null); setAdding(null); setDirty(false) }
  const backgrounds = items.filter(i => i.kind === 'background').sort((a, b) => a.sort - b.sort)
  const stuff = items.filter(i => (ROOM_KINDS as readonly string[]).includes(i.kind)).sort((a, b) => a.sort - b.sort)
  const hint = adding ? `Tap the room to place ${nameOf(adding)}.` : sel != null ? `${nameOf(placed[sel]?.code ?? '')} selected. Tap the room to move it.` : 'Pick something below, then tap the room to place it.'
  return (
    <section className="glass p-3" aria-label="Room editor">
      <PetRoom background={bg} items={placed} emojiOf={emojiOf} nameOf={nameOf} look={active.appearance} variant={active.variant} mood={mood}
        petName={active.name} selected={sel} onSelect={i => { setAdding(null); setSel(i) }} onPick={pick} />
      <p className="text-xs text-gray-300 mt-2" role="status" aria-live="polite">{hint} <span className="text-gray-500">({placed.length}/{MAX_ROOM_ITEMS})</span></p>
      <div className="flex flex-wrap gap-2 mt-2">
        <button className="sym-btn !py-1" disabled={busy || !dirty} onClick={save}>Save room</button>
        <button className="sym-btn !py-1" disabled={sel == null} onClick={remove}>Remove selected</button>
        <button className="text-xs underline text-gray-400" disabled={!dirty} onClick={reset}>Undo changes</button>
      </div>
      <b className="block mt-3 text-sm">Background</b>
      <div className="flex flex-wrap gap-1 mt-1">
        {backgrounds.map(b => { const mine = owns(b.code); return (
          <button key={b.code} className={'pet-chip' + (bg === b.code ? ' on' : '')} disabled={!mine} aria-pressed={bg === b.code} title={mine ? b.description : unlockInfo(b, boot, badgeNames).text}
            onClick={() => edit(() => setBg(b.code))}>
            <span className="pet-bgdot" style={{ background: BACKGROUNDS[b.code] ?? '#444' }} />{mine ? b.name : `🔒 ${b.name}`}</button>) })}
      </div>
      <b className="block mt-3 text-sm">Furniture and decorations</b>
      <div className="flex flex-wrap gap-1 mt-1">
        {stuff.map(s => { const mine = owns(s.code); return (
          <button key={s.code} className={'pet-chip' + (adding === s.code ? ' on' : '')} disabled={!mine} aria-pressed={adding === s.code} title={mine ? s.description : unlockInfo(s, boot, badgeNames).text}
            onClick={() => { setSel(null); setAdding(a => a === s.code ? null : s.code) }}>{mine ? s.emoji : '🔒'} {s.name}</button>) })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Admin: gift an item
function AdminGift({ note }: { note: (t: string) => void }) {
  const { items, adminGrant } = usePet()
  const [user, setUser] = useState(''); const [code, setCode] = useState(''); const [qty, setQty] = useState(1); const [go, setGo] = useState(false)
  const item = items.find(i => i.code === code)
  const send = async () => {
    setGo(true); const r = await adminGrant(user.trim(), code, qty); setGo(false)
    if (r.ok) { note(`Gifted ${item?.emoji ?? '🎁'} ${item?.name ?? code} to ${user.trim()}.`); setUser('') } else note(r.error ?? 'Could not gift that.')
  }
  return (
    <section className="glass p-3" aria-label="Admin gifts">
      <b>Admin: gift an item 🎁</b>
      <p className="text-xs text-gray-400 mt-1">Gives a member any item, including “Gift from an admin” ones. Foods stack; cosmetics are given once.</p>
      <input className="sym-inp mt-2" value={user} onChange={e => setUser(e.target.value)} placeholder="Member username" aria-label="Member username" />
      <select className="sym-inp" value={code} onChange={e => setCode(e.target.value)} aria-label="Item to gift">
        <option value="">Choose an item…</option>
        {items.map(i => <option key={i.code} value={i.code}>{i.emoji} {i.name} ({i.kind})</option>)}
      </select>
      {item?.kind === 'food' && <input className="sym-inp" type="number" min={1} max={99} value={qty} onChange={e => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} aria-label="How many" />}
      <button className="sym-btn" disabled={go || !user.trim() || !code} onClick={send}>{go ? 'Sending…' : 'Gift it'}</button>
    </section>
  )
}

// The member's own LEO space: meet LEO, care for it, dress it, decorate its room, and choose how it behaves.
export function LeoSpace() {
  const { status, error, active, settings, boot, mood, fx, items, inv, owns, badgeNames, care, rename, setSettings, dailyGift, markSeen, deleteMyData, refresh, playFx, say, sayText, quiet, sound, calm, busy, unseen, itemMap } = usePet()
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('home')
  const [name, setName] = useState(''); const [msg, setMsg] = useState(''); const [feed, setFeed] = useState(false); const [confirm, setConfirm] = useState(false); const [retrying, setRetrying] = useState(false)
  const note = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(''), 4500) }
  const retry = async () => { setRetrying(true); try { await refresh() } finally { setRetrying(false) } }

  const next = useMemo(() => {
    if (!boot) return null
    const c = items.filter(i => i.unlock.type === 'glory' && !owns(i.code)).sort((a, b) => (a.unlock.glory ?? 0) - (b.unlock.glory ?? 0))[0]
    return c ? { it: c, info: unlockInfo(c, boot, badgeNames) } : null
  }, [items, boot, inv, badgeNames])

  if (status === 'loading') return <div className="glass p-4 text-center" role="status">LEO is waking up… 💤</div>
  if (status === 'off') return <div className="glass p-4 text-center">LEO is resting for now. Check back later! 🌙</div>
  if (!settings || !boot || !active) return (
    <div className="glass p-4 text-center space-y-2" role="alert">
      <div className="flex justify-center"><Leo emotion="sleepy" size={56} label="LEO is sleeping" /></div>
      <p>{error || 'LEO is taking a nap and cannot be reached right now.'}</p>
      <button className="sym-btn" disabled={retrying} onClick={retry}>{retrying ? 'Trying…' : 'Try again'}</button>
      {lastRpcError && <details className="text-left text-xs text-gray-400 mt-2"><summary className="cursor-pointer">Technical details (for admins)</summary><code className="block break-all mt-1">{lastRpcError}</code></details>}
    </div>)

  const foods = items.filter(i => i.kind === 'food' && owns(i.code))
  const setCalm = (v: boolean) => { setPetUi({ calm: v }); document.documentElement.dataset.petcalm = v ? '1' : '0'; window.dispatchEvent(new Event('sym-petui')) }
  const doRename = async () => { const r = await rename(active.id, name); if (r.ok) { setName(''); note('Name saved 💛') } else note(r.error ?? 'Could not save that name.') }
  const daily = async () => { const r = await dailyGift(); note(r.ok ? 'LEO found a cake for you! 🍰' : r.reason === 'claimed' ? 'You already got today’s treat. Come back tomorrow! 🌅' : r.error ?? 'No treat right now.') }
  const g = boot.glory

  return (
    <div className="space-y-3">
      {status === 'offline' && <div className="pet-warn" role="alert">{error || 'LEO is offline.'} <button className="underline" onClick={retry}>{retrying ? 'Trying…' : 'Retry'}</button></div>}

      <section className="glass p-3" aria-label={`${active.name} and its room`}>
        {tab !== 'room' && <PetRoom background={active.home?.background} items={active.home?.items ?? []} emojiOf={c => itemMap.get(c)?.emoji ?? '🎁'} nameOf={c => itemMap.get(c)?.name ?? c}
          look={active.appearance} variant={active.variant} mood={mood} petName={active.name} fx={fx} />}
        <div className="flex items-center gap-2 mt-2"><b className="text-lg truncate">{active.name}</b><span className="text-xs text-gray-400">{needText(active)}</span></div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
          <Bar label="Tummy" v={active.hunger} c="#f59e0b" /><Bar label="Energy" v={active.energy} c="#22d3ee" />
          <Bar label="Happy" v={active.happiness} c="#f472b6" /><Bar label="Curious" v={active.curiosity} c="#a78bfa" />
          <Bar label="Friendly" v={active.friendliness} c="#34d399" />
        </div>
      </section>

      <div className="pet-tabs" role="tablist" aria-label="LEO space sections">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={'pet-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}><span aria-hidden="true">{t.icon}</span> {t.label}</button>)}
      </div>
      <p className="text-xs text-gray-300 min-h-[1.1rem]" role="status" aria-live="polite">{msg}</p>

      {unseen.length > 0 && <section className="glass p-3"><b>New for you 🎉</b>
        <p className="text-sm mt-1">{unseen.map(u => `${u.emoji} ${u.name}`).join(', ')}</p>
        <div className="flex gap-2 mt-2"><button className="sym-btn !py-1" onClick={() => { setTab('wardrobe'); markSeen() }}>Try it on</button><button className="text-xs underline text-gray-400" onClick={markSeen}>Got it</button></div></section>}

      {tab === 'home' && <>
        <section className="glass p-3" aria-label="Care">
          {!feed ? <div className="grid grid-cols-4 gap-1">
            <button className="pet-act" disabled={busy} onClick={() => setFeed(true)}><span>🍪</span>Feed</button>
            <button className="pet-act" disabled={busy} onClick={() => care(active.id, 'play')}><span>🎮</span>Play</button>
            <button className="pet-act" disabled={busy} onClick={() => care(active.id, 'rest')}><span>😴</span>Rest</button>
            <button className="pet-act" disabled={busy} onClick={() => care(active.id, 'cuddle')}><span>🤗</span>Cuddle</button>
          </div> : <div>
            <div className="flex flex-wrap gap-1">{foods.map(f => { const q = inv.get(f.code)?.qty; return (
              <button key={f.code} className="pet-act !w-auto px-2" disabled={busy} title={f.description} onClick={async () => { await care(active.id, 'feed', f.code); setFeed(false) }}>
                <span>{f.emoji}</span>{f.name}{f.unlock.type !== 'free' && q != null ? ` ×${q}` : ''}</button>) })}</div>
            <button className="text-xs underline text-gray-400 mt-1" onClick={() => setFeed(false)}>Back</button>
          </div>}
          <button className="sym-btn w-full mt-2 !py-1.5" onClick={() => { playFx(); blip('pop', sound); if (!quiet) say('idle', {}, true); else sayText('…', 'normal', true) }}>👋 Say hi</button>
          {boot.config.daily_reward && <button className="sym-btn w-full mt-2 !py-1.5" onClick={daily}>🎁 Today’s treat (optional)</button>}
        </section>

        <section className="glass p-3" aria-label="Your guild progress">
          <b>Your guild progress 🔥</b>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            <div><div className="text-lg font-bold">{(g.lifetime ?? 0).toLocaleString()}</div><small className="text-gray-400">Lifetime glory</small></div>
            <div><div className="text-lg font-bold">{g.rank != null ? '#' + g.rank : '—'}</div><small className="text-gray-400">Overall rank</small></div>
            <div><div className="text-lg font-bold">{(boot.badge_ids ?? []).length}</div><small className="text-gray-400">Achievements</small></div>
          </div>
          {next && <div className="mt-3"><p className="text-xs text-gray-300">Next unlock: <b>{next.it.emoji} {next.it.name}</b> · {next.info.pct}%</p><Meter pct={next.info.pct} label={`Progress to ${next.it.name}`} /><p className="text-[11px] text-gray-500 mt-1">{next.info.text}</p></div>}
          <p className="text-[11px] text-gray-500 mt-2">LEO only reads your glory and achievements to unlock things. It never changes them. <Link to="/leaderboard" className="underline">See the leaderboard</Link></p>
        </section>
      </>}

      {tab === 'wardrobe' && <Wardrobe note={note} />}
      {tab === 'room' && <RoomEditor key={active.id} note={note} />}

      {tab === 'settings' && <>
        <section className="glass p-3" aria-label="Rename">
          <b>Name</b>
          <div className="flex gap-2 mt-2"><input className="sym-inp !mb-0" value={name} maxLength={20} placeholder={active.name} onChange={e => setName(e.target.value)} aria-label="New name for your pet" />
            <button className="sym-btn" disabled={busy || !name.trim()} onClick={doRename}>Save</button></div>
        </section>
        <section className="glass p-3" aria-label="Comfort settings">
          <b>LEO settings</b>
          <Sw label="Show LEO on every page" on={settings.widget_state !== 'hidden'} set={v => setSettings({ widget_state: v ? 'open' : 'hidden' })} />
          <Sw label="Quiet mode (less talking and pop-ups)" on={quiet} set={v => setSettings({ quiet: v })} />
          <Sw label="Sound effects" on={settings.sound} set={v => setSettings({ sound: v })} />
          <Sw label="Calm motion (fewer animations)" on={calm || getPetUi().calm} set={setCalm} />
        </section>
        {isAdmin && <AdminGift note={note} />}
        <section className="glass p-3 text-sm" aria-label="Your data">
          <p className="text-gray-400">Your pet only uses care items and unlocks inside SYMBIOTES. It never changes glory, achievements or rankings.</p>
          {!confirm ? <button className="text-xs underline text-gray-400 mt-2" onClick={() => setConfirm(true)}>Delete my LEO data…</button>
            : <div className="mt-2" role="alertdialog" aria-label="Confirm delete"><p>This removes your pet, items and settings. A fresh LEO will appear next time. Continue?</p>
              <button className="sym-btn !py-1 mr-2" onClick={async () => { const r = await deleteMyData(); setConfirm(false); setTab('home'); note(r.ok ? 'Your LEO data was removed. A fresh LEO is ready.' : r.error ?? 'Could not delete right now.') }}>Yes, delete</button>
              <button className="text-xs underline" onClick={() => setConfirm(false)}>Cancel</button></div>}
        </section>
      </>}

      <p className="text-center"><Link to="/" className="underline text-xs text-gray-400">Back to home</Link></p>
    </div>
  )
}

// small helper so the page title row can show the mascot too
export const LeoSpacePage = () => (
  <div><h1 className="text-xl font-bold mb-2 flex items-center gap-2"><Leo emotion="happy" size={28} /> LEO space</h1><LeoSpace /></div>
)
