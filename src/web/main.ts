import "./style.css"
import { NoEntityFoundError } from "@arkiv-network/sdk"
import type { Hex } from "viem"
import deployment from "../deployment.json"
import * as A from "../core/actions"
import { BLOOD_GROUPS, type BloodGroup, COMPONENTS, type Component, isBloodGroup } from "../core/compat"
import { bboxAround, CITY_CENTRES, haversineKm } from "../core/geo"
import * as Q from "../core/queries"
import { attrNum, attrStr, LIFETIMES, STATUS, TYPES, URGENCY, type Urgency } from "../core/schema"
import {
  balanceGLM, connectInjected, connectTestKey, disconnect, EXPLORER, FAUCET, getSession, pub, wsClient,
} from "./chain"
import { getLang, type Lang, setLang, t } from "./i18n"

// ---------------------------------------------------------------- state
const STEWARDS = (deployment.stewards as string[]).map((s) => s.toLowerCase() as Hex)

type Hospital = {
  key: Hex; wallet: Hex; steward: Hex; name: string; city: string; lat: number; lng: number
  address: string; desk: string; licenceRef: string; expiresAt: bigint
}
type Req = {
  key: Hex; creator: Hex; group: BloodGroup; component: Component; unitsNeeded: number; unitsReceived: number
  urgency: Urgency; status: string; city: string; lat: number; lng: number; neededBy: number; ref: string
  hospitalKey: Hex; hospitalName: string; note: string; expiresAt: bigint
}

const hospitalsByWallet = new Map<string, Hospital>()
let head = 0n
let here: { lat: number; lng: number } = CITY_CENTRES.bengaluru
let liveOn = false
const shownKeys = new Set<string>()

const app = document.getElementById("app")!
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`
const link = (kind: "entity" | "address" | "tx", id: string, label?: string) =>
  `<a href="${EXPLORER}/${kind}/${id}" target="_blank" rel="noopener">${esc(label ?? short(id))}</a>`
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString(getLang() === "en" ? "en-IN" : getLang() === "hi" ? "hi-IN" : "kn-IN",
    { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
function fmtLeft(expiresAt: bigint): string {
  const s = Q.secondsUntil(expiresAt, head)
  if (s <= 0) return "0m"
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 48 ? `${Math.floor(h / 24)}d` : h ? `${h}h ${m}m` : `${m}m`
}
const urgencyLabel = (u: number) => (u === 1 ? t("critical") : u === 2 ? t("urgent") : t("planned"))
function toast(msg: string, kind: "ok" | "err" | "info" = "info") {
  const el = document.createElement("div")
  el.className = `toast ${kind}`
  el.innerHTML = msg
  document.body.appendChild(el)
  setTimeout(() => el.remove(), kind === "err" ? 9000 : 5000)
}

// ---------------------------------------------------------------- decoding
// biome-ignore lint: entity shapes vary by selection
function toReq(e: any): Req {
  const a = e.attributes
  let p: { hospitalName?: string; note?: string } = {}
  try { p = e.toJson() } catch { /* payload not selected or not JSON */ }
  return {
    key: e.key, creator: (e.creator ?? "").toLowerCase(),
    group: attrStr(a, "blood_group") as BloodGroup, component: attrStr(a, "component") as Component,
    unitsNeeded: attrNum(a, "units_needed") ?? 0, unitsReceived: attrNum(a, "units_received") ?? 0,
    urgency: (attrNum(a, "urgency") ?? 3) as Urgency, status: attrStr(a, "status") ?? "",
    city: attrStr(a, "city") ?? "", lat: Number(attrStr(a, "lat")), lng: Number(attrStr(a, "lng")),
    neededBy: attrNum(a, "needed_by_ms") ?? 0, ref: attrStr(a, "ref") ?? "",
    hospitalKey: (attrStr(a, "hospital") ?? "0x") as Hex, hospitalName: p.hospitalName ?? "",
    note: p.note ?? "", expiresAt: e.expiresAt ?? 0n,
  }
}

async function loadHospitals() {
  hospitalsByWallet.clear()
  if (!STEWARDS.length) return
  for await (const e of Q.hospitalsQuery(pub, STEWARDS)) {
    const creator = (e.creator ?? "").toLowerCase() as Hex
    if (!STEWARDS.includes(creator)) continue // belt and braces: trust only $creator
    const a = e.attributes
    let p: Record<string, string> = {}
    try { p = e.toJson() } catch { /* ignore */ }
    const wallet = (attrStr(a, "hospital_wallet") ?? "").toLowerCase() as Hex
    hospitalsByWallet.set(wallet, {
      key: e.key!, wallet, steward: creator, name: p.name ?? "?", city: attrStr(a, "city") ?? "",
      lat: Number(attrStr(a, "lat")), lng: Number(attrStr(a, "lng")), address: p.address ?? "",
      desk: p.bloodCentreDesk ?? "", licenceRef: p.licenceRef ?? "", expiresAt: e.expiresAt ?? 0n,
    })
  }
}
const verifiedWallets = () => [...hospitalsByWallet.keys()] as Hex[]

// ---------------------------------------------------------------- shell
function shell(active: string, body: string) {
  const s = getSession()
  const tabs: [string, string][] = [
    ["#/feed", t("tabFeed")], ["#/donations", t("tabDonations")], ["#/hospital", t("tabHospital")],
    ["#/steward", t("tabSteward")], ["#/about", t("tabAbout")],
  ]
  app.innerHTML = `
  <header>
    <div class="brand"><span class="drop">🩸</span> Rakt Relay <small>${t("tagline")}</small></div>
    <div class="right">
      <span class="live ${liveOn ? "on" : ""}" title="WebSocket entity events">${liveOn ? "● live" : "○ live off"}</span>
      <select id="lang">${(["en", "hi", "kn"] as Lang[]).map((l) =>
        `<option value="${l}" ${l === getLang() ? "selected" : ""}>${{ en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ" }[l]}</option>`).join("")}</select>
      ${s ? `<button class="ghost" data-act="wallet">${short(s.address)}</button>` : `<button data-act="wallet">${t("connect")}</button>`}
    </div>
  </header>
  <nav>${tabs.map(([h, l]) => `<a href="${h}" class="${active === h ? "active" : ""}">${l}</a>`).join("")}</nav>
  <div class="banner">Tiramisu testnet demo · all hospitals, requests and donors shown are <b>synthetic</b> · ${t("noMoney")}</div>
  <main>${body}</main>
  <footer>Open source (MIT) · data lives on <a href="https://arkiv.network" target="_blank">Arkiv</a>, the Web3 database · no backend, no server · head block ${head}</footer>`
  ;(document.getElementById("lang") as HTMLSelectElement).onchange = (ev) => {
    setLang((ev.target as HTMLSelectElement).value as Lang); route()
  }
}

// ---------------------------------------------------------------- feed (donor)
let feedState = { group: (localStorage.getItem("rr_group") ?? "") as BloodGroup | "", city: "bengaluru", radius: 25, maxUrg: 3 }

async function viewFeed() {
  const f = feedState
  shell("#/feed", `
  <section class="filters">
    <label>${t("myGroup")}<select id="f-group"><option value="">${t("anyGroup")}</option>${BLOOD_GROUPS.map((g) =>
      `<option ${g === f.group ? "selected" : ""}>${g}</option>`).join("")}</select></label>
    <label>${t("area")}<select id="f-city">${Object.entries(CITY_CENTRES).map(([k, c]) =>
      `<option value="${k}" ${k === f.city ? "selected" : ""}>${c.label}</option>`).join("")}<option value="gps" ${f.city === "gps" ? "selected" : ""}>📍 ${t("useLocation")}</option></select></label>
    <label>${t("radius")}<select id="f-radius">${[5, 10, 25, 50, 100].map((r) => `<option value="${r}" ${r === f.radius ? "selected" : ""}>${r} km</option>`).join("")}</select></label>
    <label>${t("urgencyFilter")}<select id="f-urg">
      <option value="3" ${f.maxUrg === 3 ? "selected" : ""}>${t("all")}</option>
      <option value="2" ${f.maxUrg === 2 ? "selected" : ""}>${t("critical")} + ${t("urgent")}</option>
      <option value="1" ${f.maxUrg === 1 ? "selected" : ""}>${t("critical")}</option></select></label>
    <button data-act="search">${t("search")}</button>
  </section>
  <section id="results" class="cards"><p class="muted">Loading from Arkiv…</p></section>
  <details class="query"><summary>Arkiv query sent by this page</summary><code id="qstr"></code></details>`)
  await runFeed()
}

async function runFeed() {
  const f = feedState
  const out = document.getElementById("results")!
  const wallets = verifiedWallets()
  if (!wallets.length) {
    out.innerHTML = `<p class="muted">No verified blood centres yet. (Run <code>npm run seed</code>, then rebuild.)</p>`; return
  }
  if (f.city !== "gps") here = CITY_CENTRES[f.city] ?? here
  const q = Q.feedQuery(pub, {
    hospitalWallets: wallets, donorGroup: f.group || undefined, maxUrgency: f.maxUrg,
    bbox: bboxAround(here.lat, here.lng, f.radius), limit: 100,
  })
  document.getElementById("qstr")!.textContent = q.toString()
  try {
    const page = await q.fetch()
    let reqs = page.entities.map(toReq).filter((r) => hospitalsByWallet.has(r.creator))
    // Arkiv returns newest-first; we sort by urgency, then distance, on the client.
    reqs = reqs.sort((a, b) => a.urgency - b.urgency ||
      haversineKm(here.lat, here.lng, a.lat, a.lng) - haversineKm(here.lat, here.lng, b.lat, b.lng))
    shownKeys.clear(); reqs.forEach((r) => shownKeys.add(r.key.toLowerCase()))
    const counts = await Promise.all(reqs.map((r) => countPledges(r.key)))
    out.innerHTML = reqs.length ? reqs.map((r, i) => card(r, counts[i]!)).join("") : `<p class="ok-box">${t("noResults")}</p>`
  } catch (e) {
    out.innerHTML = `<p class="err-box">${esc((e as Error).message)}</p>`
  }
}

async function countPledges(key: Hex) {
  try { return (await Q.pledgesQuery(pub, key).fetch()).entities.length } catch { return 0 }
}

function card(r: Req, pledges: number) {
  const h = hospitalsByWallet.get(r.creator)
  const km = haversineKm(here.lat, here.lng, r.lat, r.lng).toFixed(1)
  return `<article class="card u${r.urgency}">
    <div class="row"><span class="bg">${esc(r.group)}</span><span class="pill u${r.urgency}">${urgencyLabel(r.urgency)}</span>
      <span class="muted">${esc(r.component)} · ${r.unitsReceived}/${r.unitsNeeded} ${t("units")}</span></div>
    <h3>${esc(h?.name ?? r.hospitalName)} <span class="tick" title="$creator is a steward-verified wallet">✓ ${t("verifiedBy")}</span></h3>
    <p class="muted">${km} km · ${t("neededBy")} ${fmtTime(r.neededBy)} · ${t("endsIn")} <b>${fmtLeft(r.expiresAt)}</b> · ${pledges} ${t("pledges")}</p>
    <div class="row">
      <a class="btn" href="#/r/${r.key}">${t("open")}</a>
      <button data-act="pledge" data-key="${r.key}" data-group="${r.group}">${t("pledge")}</button>
      <a class="btn ghost" target="_blank" href="${waLink(r)}">${t("share")}</a>
    </div></article>`
}

function waLink(r: Req) {
  const url = `${location.origin}${location.pathname}#/r/${r.key}`
  const msg = `${r.group} ${r.component} needed (${urgencyLabel(r.urgency)}). Live status, verified blood centre, ` +
    `and it auto-expires when the need ends:\n${url}\nDon't forward screenshots, forward this link.`
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------- single request (the forwarded link)
async function viewRequest(key: Hex) {
  shell("", `<section id="req"><p class="muted">Checking Arkiv…</p></section>`)
  const box = document.getElementById("req")!
  shownKeys.clear(); shownKeys.add(key.toLowerCase())
  let r: Req
  try {
    r = toReq(await pub.getEntity(key))
  } catch (e) {
    if (e instanceof NoEntityFoundError) {
      box.innerHTML = `<div class="stop">⛔ ${t("ended")}</div>
        <p class="muted">Arkiv returned no live entity for <code>${esc(key)}</code>: it expired at its "needed by" time, or was never real.
        ${link("entity", key, "Look it up on the explorer")}</p>`
      return
    }
    box.innerHTML = `<p class="err-box">${esc((e as Error).message)}</p>`; return
  }
  const h = hospitalsByWallet.get(r.creator)
  const pledges = (await Q.pledgesQuery(pub, key).fetch()).entities
  const banner = !h ? `<div class="stop">⚠️ ${t("unverified")}</div>`
    : r.status === STATUS.fulfilled ? `<div class="good">✅ ${t("fulfilled")}</div>`
    : r.status === STATUS.cancelled ? `<div class="stop">⛔ ${t("ended")}</div>` : ""
  box.innerHTML = `${banner}
  <article class="card big u${r.urgency}">
    <div class="row"><span class="bg xl">${esc(r.group)}</span><span class="pill u${r.urgency}">${urgencyLabel(r.urgency)}</span>
      <span>${esc(r.component)} · <b>${r.unitsReceived}/${r.unitsNeeded}</b> ${t("units")}</span></div>
    <h2>${esc(h?.name ?? r.hospitalName)}</h2>
    ${h ? `<p>📍 ${t("goTo")}: <b>${esc(h.desk)}</b>, ${esc(h.address)}</p>` : ""}
    <p>🧾 ${t("quoteRef")}: <b class="mono">${esc(r.ref)}</b></p>
    <p>${t("neededBy")}: <b>${fmtTime(r.neededBy)}</b> · ${t("endsIn")}: <b>${fmtLeft(r.expiresAt)}</b></p>
    ${r.note ? `<p class="note">${esc(r.note)}</p>` : ""}
    <p class="warn">${t("noMoney")}</p>
    <div class="row">
      ${r.status === STATUS.open && h ? `<button data-act="pledge" data-key="${r.key}" data-group="${r.group}">${t("pledge")}</button>` : ""}
      ${r.status === STATUS.open && h ? `<a class="btn ghost" target="_blank" href="${waLink(r)}">${t("share")}</a>` : ""}
    </div>
  </article>
  <section class="proof">
    <h3>Why you can trust this page</h3>
    <ul>
      <li>Request entity ${link("entity", r.key)} was created by wallet ${link("address", r.creator)} (<code>$creator</code>, immutable).</li>
      <li>${h ? `That wallet is attested as <b>${esc(h.name)}</b> by steward ${link("address", h.steward)} in readonly entity ${link("entity", h.key)}.`
        : `That wallet is <b>not</b> attested by any steward this app trusts.`}</li>
      <li>Entity Expiration: Arkiv deletes this request at block ${r.expiresAt} (≈ ${fmtLeft(r.expiresAt)}), so a forwarded link can never outlive the need.</li>
      <li>${pledges.length} ${t("pledges")} (pseudonymous pledges, each expires after ${LIFETIMES.pledgeHours}h).</li>
    </ul>
  </section>`
}

// ---------------------------------------------------------------- donor receipts
async function viewDonations() {
  const s = getSession()
  shell("#/donations", s ? `<section id="rc"><p class="muted">Loading…</p></section>`
    : `<p>${t("connect")} to see the donation receipts your wallet owns.</p><button data-act="wallet">${t("connect")}</button>`)
  if (!s) return
  const page = await Q.receiptsQuery(pub, s.address).fetch()
  const rows = page.entities.map((e) => {
    const a = e.attributes
    let p: Record<string, string> = {}
    try { p = e.toJson() } catch { /* */ }
    const creator = (e.creator ?? "").toLowerCase()
    const h = hospitalsByWallet.get(creator)
    return `<article class="card"><div class="row"><span class="bg">${esc(attrStr(a, "blood_group"))}</span>
      <b>${esc(p.hospitalName)}</b> ${h ? `<span class="tick">✓ issued by verified centre</span>` : `<span class="pill u1">issuer not verified</span>`}</div>
      <p class="muted">Donated ${fmtTime(attrNum(a, "donated_at_ms") ?? 0)} · ref ${esc(p.ref)} · ${link("entity", e.key!)}</p>
      <p>${t("eligibleAgain")}: <b>${fmtTime(attrNum(a, "next_eligible_ms") ?? 0)}</b></p></article>`
  })
  document.getElementById("rc")!.innerHTML = rows.length ? rows.join("") : `<p class="muted">No receipts yet for ${short(s.address)}.</p>`
}

// ---------------------------------------------------------------- hospital desk
async function viewHospital() {
  const s = getSession()
  const me = s ? hospitalsByWallet.get(s.address.toLowerCase()) : undefined
  if (!s || !me) {
    shell("#/hospital", `<p>The hospital desk works for wallets a steward has verified.
      ${s ? `Wallet ${short(s.address)} is not verified.` : ""}</p>
      <p class="muted">Verified centres: ${[...hospitalsByWallet.values()].map((h) => `${esc(h.name)} (${short(h.wallet)})`).join(", ") || "none"}</p>
      ${s ? "" : `<button data-act="wallet">${t("connect")}</button>`}`)
    return
  }
  const soon = new Date(Date.now() + 6 * 3600_000)
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  shell("#/hospital", `
  <h2>${esc(me.name)} <span class="tick">✓ verified by ${short(me.steward)}</span></h2>
  <div id="expiring"></div>
  <form id="new-req" class="panel">
    <h3>Post a request</h3>
    <label>Blood group<select name="group">${BLOOD_GROUPS.map((g) => `<option>${g}</option>`).join("")}</select></label>
    <label>Component<select name="component">${COMPONENTS.map((c) => `<option>${c}</option>`).join("")}</select></label>
    <label>Units<input name="units" type="number" min="1" max="20" value="2"></label>
    <label>Urgency<select name="urgency"><option value="1">Critical</option><option value="2" selected>Urgent</option><option value="3">Planned</option></select></label>
    <label>Needed by (IST)<input name="neededBy" type="datetime-local" value="${local}"></label>
    <label>Slip / ref no.<input name="ref" value="RR-${Math.floor(Math.random() * 9000 + 1000)}"></label>
    <label class="wide">Note for donors (no patient names or phone numbers)<input name="note" maxlength="140" placeholder="e.g. Bring any photo ID. Eat a light meal before donating."></label>
    <button type="submit">Publish to Arkiv</button>
  </form>
  <section id="mine" class="cards"><p class="muted">Loading your requests…</p></section>`)
  document.getElementById("new-req")!.addEventListener("submit", async (ev) => {
    ev.preventDefault()
    const fd = new FormData(ev.target as HTMLFormElement)
    const note = String(fd.get("note") ?? "")
    if (/\d{10}|@/.test(note)) { toast("Remove phone numbers / emails from the note. No personal data goes on Arkiv.", "err"); return }
    await tx("Publishing request", () => A.postRequest(s.wallet, {
      hospitalKey: me.key, hospitalName: me.name, bloodGroup: String(fd.get("group")) as BloodGroup,
      component: String(fd.get("component")) as Component, units: Number(fd.get("units")),
      urgency: Number(fd.get("urgency")) as Urgency, city: me.city, lat: me.lat, lng: me.lng,
      neededBy: new Date(String(fd.get("neededBy"))), ref: String(fd.get("ref")), note,
    }))
    viewHospital()
  })
  await renderMine(s.address, me)
}

async function renderMine(addrHex: Hex, me: Hospital) {
  const box = document.getElementById("mine")!
  const page = await Q.hospitalRequestsQuery(pub, addrHex).fetch()
  const reqs = page.entities.map(toReq)
  shownKeys.clear(); reqs.forEach((r) => shownKeys.add(r.key.toLowerCase()))
  const soon = (await Q.expiringSoonQuery(pub, addrHex, head, 5400n).fetch()).entities // 3 hours
  document.getElementById("expiring")!.innerHTML = soon.length
    ? `<div class="warnbox">⏳ ${soon.length} open request(s) disappear within 3 hours. Extend only if still needed.</div>` : ""
  const blocks = await Promise.all(reqs.map(async (r) => {
    const pl = (await Q.pledgesQuery(pub, r.key).fetch()).entities
    const donors = pl.map((p) => `<li>${link("address", p.creator!)} · ETA ${fmtTime(attrNum(p.attributes, "eta_ms") ?? 0)}
      ${r.status === STATUS.open ? `<button class="sm" data-act="confirm" data-key="${r.key}" data-donor="${p.creator}">Confirm donation</button>` : ""}</li>`).join("")
    return `<article class="card u${r.urgency}">
      <div class="row"><span class="bg">${r.group}</span><span class="pill">${r.status}</span>
      <span>${r.component} · ${r.unitsReceived}/${r.unitsNeeded}</span><span class="muted">ref ${esc(r.ref)}</span></div>
      <p class="muted">${t("endsIn")} <b>${fmtLeft(r.expiresAt)}</b> · ${link("entity", r.key)}</p>
      <ul class="pledges">${donors || "<li class='muted'>No pledges yet</li>"}</ul>
      ${r.status === STATUS.open ? `<div class="row">
        <button data-act="extend" data-key="${r.key}">Still needed: extend ${LIFETIMES.extendHours}h</button>
        <button class="ghost" data-act="close" data-status="fulfilled" data-key="${r.key}">Mark fulfilled</button>
        <button class="ghost" data-act="close" data-status="cancelled" data-key="${r.key}">Cancel</button>
        <a class="btn ghost" href="#/r/${r.key}">Public page</a></div>` : ""}
    </article>`
  }))
  box.innerHTML = blocks.join("") || `<p class="muted">No live requests.</p>`
  box.dataset.hospital = me.key
}

// ---------------------------------------------------------------- steward
async function viewSteward() {
  const s = getSession()
  const isSteward = !!s && STEWARDS.includes(s.address.toLowerCase() as Hex)
  const list = [...hospitalsByWallet.values()].map((h) => `<tr><td>${esc(h.name)}</td><td>${esc(h.city)}</td>
    <td>${link("address", h.wallet)}</td><td>${link("entity", h.key)}</td><td>${fmtLeft(h.expiresAt)}</td>
    <td>${isSteward && h.steward === s!.address.toLowerCase() ? `<button class="sm ghost" data-act="revoke" data-key="${h.key}">Revoke</button>` : ""}</td></tr>`).join("")
  shell("#/steward", `
  <p>Stewards (e.g. a State Blood Transfusion Council, an IMA branch, a Red Cross chapter) attest which wallet speaks for which blood centre.
  This deployment trusts: ${STEWARDS.map((x) => link("address", x)).join(", ") || "<i>none configured</i>"}. Anyone can fork the app with a different steward list.</p>
  <table class="tbl"><thead><tr><th>Blood centre</th><th>City</th><th>Wallet</th><th>Attestation</th><th>Valid for</th><th></th></tr></thead><tbody>${list}</tbody></table>
  ${isSteward ? `<form id="verify" class="panel"><h3>Verify a blood centre (synthetic data only)</h3>
    <label>Hospital wallet<input name="wallet" required pattern="^0x[0-9a-fA-F]{40}$"></label>
    <label>Name<input name="name" required></label>
    <label>City slug<input name="city" value="bengaluru"></label><label>State<input name="state" value="KA"></label>
    <label>Lat<input name="lat" value="12.9716"></label><label>Lng<input name="lng" value="77.5946"></label>
    <label class="wide">Institutional address<input name="address"></label>
    <label class="wide">Where donors go<input name="desk" value="Blood Centre, Ground floor"></label>
    <label>Licence ref (synthetic)<input name="licence" value="SYN-"></label>
    <button type="submit">Attest on Arkiv (readonly, 1 year)</button></form>`
    : `<p class="muted">Connect a steward wallet to verify centres.</p>`}`)
  document.getElementById("verify")?.addEventListener("submit", async (ev) => {
    ev.preventDefault()
    const fd = new FormData(ev.target as HTMLFormElement)
    await tx("Attesting blood centre", () => A.verifyHospital(s!.wallet, {
      hospitalWallet: String(fd.get("wallet")) as Hex, name: String(fd.get("name")), city: String(fd.get("city")),
      state: String(fd.get("state")), lat: Number(fd.get("lat")), lng: Number(fd.get("lng")),
      address: String(fd.get("address")), bloodCentreDesk: String(fd.get("desk")), licenceRef: String(fd.get("licence")),
    }))
    await loadHospitals(); viewSteward()
  })
}

// ---------------------------------------------------------------- about
function viewAbout() {
  shell("#/about", `<article class="prose">
  <h2>Why this exists</h2>
  <p>In India, urgent blood requests travel as WhatsApp forwards and social posts. They keep circulating for weeks after the patient
  got blood (or after the need ended), they carry the family's phone number (which scammers harvest to ask for "donor travel money"),
  and nobody can tell a real request from a fake one.</p>
  <h2>What Rakt Relay changes</h2>
  <ol>
    <li><b>Only verified blood centres can post.</b> A steward wallet attests each centre's wallet; the app shows a request only if its immutable
    <code>$creator</code> is an attested wallet. Copying the project's attributes does not help a scammer.</li>
    <li><b>Requests die when the need dies.</b> Each request is an Arkiv entity that expires at its clinical "needed by" time. A forwarded link
    opens a live page; after expiry it says "ended, stop forwarding".</li>
    <li><b>No phone numbers, no names.</b> Donors walk to the named blood centre and quote a slip number. Donors pledge pseudonymously.</li>
    <li><b>Donors get a verifiable receipt</b> that the hospital creates and transfers to the donor's wallet in the same atomic batch that updates the request.</li>
    <li><b>No backend.</b> This page is static files. Anyone can rehost it, or query Arkiv directly, and see the same data.</li>
  </ol>
  <p>Hackathon build for the Arkiv Global Tour Stop (Best Indian Use Case). Testnet only; every record is synthetic.</p></article>`)
}

// ---------------------------------------------------------------- wallet & tx helpers
async function walletDialog() {
  const s = getSession()
  if (s) {
    const bal = await balanceGLM(s.address).catch(() => "?")
    if (confirm(`Connected: ${s.address}\nBalance: ${bal} GLM (testnet)\n\nOK = disconnect, Cancel = keep`)) { disconnect(); route() }
    return
  }
  try {
    if (window.ethereum && confirm("Use your browser wallet (MetaMask etc.)?\nCancel = use a testnet-only key stored in this browser")) {
      await connectInjected()
    } else {
      const pk = prompt("Paste a TESTNET private key to import (e.g. your seeded hospital key), or leave empty to generate a new test key:") ?? ""
      connectTestKey(pk)
    }
    const s2 = getSession()!
    const bal = await balanceGLM(s2.address).catch(() => "0")
    if (Number(bal) === 0) toast(`Wallet ${short(s2.address)} has 0 GLM. Get free test GLM at <a href="${FAUCET}" target="_blank">the faucet</a>.`, "info")
    route()
  } catch (e) { toast(esc((e as Error).message), "err") }
}

async function tx<T extends { txHash?: Hex; receipt?: { transactionHash: Hex } }>(label: string, fn: () => Promise<T>) {
  toast(`${label}… sign in your wallet`, "info")
  try {
    const r = await fn()
    const hash = r.txHash ?? r.receipt?.transactionHash
    toast(`✅ ${label} done ${hash ? link("tx", hash, "view tx") : ""}`, "ok")
    return r
  } catch (e) {
    toast(`❌ ${label} failed: ${esc((e as Error).message.slice(0, 200))}`, "err")
    throw e
  }
}

document.addEventListener("click", async (ev) => {
  const el = (ev.target as HTMLElement).closest("[data-act]") as HTMLElement | null
  if (!el) return
  const act = el.dataset.act!
  const key = el.dataset.key as Hex
  const s = getSession()
  try {
    if (act === "wallet") return walletDialog()
    if (act === "search") {
      feedState = {
        group: (document.getElementById("f-group") as HTMLSelectElement).value as BloodGroup | "",
        city: (document.getElementById("f-city") as HTMLSelectElement).value,
        radius: Number((document.getElementById("f-radius") as HTMLSelectElement).value),
        maxUrg: Number((document.getElementById("f-urg") as HTMLSelectElement).value),
      }
      localStorage.setItem("rr_group", feedState.group)
      if (feedState.city === "gps") {
        await new Promise<void>((res) => navigator.geolocation.getCurrentPosition(
          (p) => { here = { lat: p.coords.latitude, lng: p.coords.longitude }; res() }, () => res(), { timeout: 8000 }))
      }
      return runFeed()
    }
    if (!s) { toast("Connect a wallet first", "err"); return walletDialog() }
    if (act === "pledge") {
      const g = el.dataset.group!
      const mine = feedState.group || prompt(`Your blood group? (${BLOOD_GROUPS.join(", ")})`, g) || ""
      if (!isBloodGroup(mine)) return toast("Unknown blood group", "err")
      const eta = Number(prompt("How many minutes until you reach the blood centre?", "45") ?? "45")
      await tx("Pledging", () => A.pledge(s.wallet, { requestKey: key, bloodGroup: mine, etaMinutes: eta || 45 }))
      return route()
    }
    if (act === "extend") { await tx("Extending (Lifetime Extension)", () => A.extendRequest(s.wallet, key)); return route() }
    if (act === "close") { await tx("Updating status", () => A.closeRequest(s.wallet, key, el.dataset.status as "fulfilled" | "cancelled")); return route() }
    if (act === "revoke") { await tx("Revoking attestation", () => s.wallet.deleteEntity({ entityKey: key })); await loadHospitals(); return route() }
    if (act === "confirm") {
      const r = toReq(await pub.getEntity(key))
      const me = hospitalsByWallet.get(s.address.toLowerCase())!
      await tx("Confirming donation (atomic batch: receipt + counter + transfer)", () => A.confirmDonation(s.wallet, pub, {
        requestKey: key, hospitalKey: me.key, hospitalName: me.name, bloodGroup: r.group, component: r.component, ref: r.ref,
        donor: el.dataset.donor as Hex, unitsReceivedSoFar: r.unitsReceived, unitsNeeded: r.unitsNeeded,
      }))
      return route()
    }
  } catch (e) { console.error(e) }
})

// ---------------------------------------------------------------- live events over WebSocket
function startLive() {
  try {
    const ws = wsClient()
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { void route(true) }, 1200) }
    ws.watchEntityEvents({
      // No fromBlock: with a WebSocket transport this is a real subscription, not polling.
      // Events are chain-wide (≈1/s on Tiramisu from every project), so we classify cheaply:
      //  - a new entity owned by a verified hospital wallet -> refresh (a new request)
      //  - a patch/extension/deletion of an entity on screen -> refresh
      //  - a new entity from anyone else, while a request or the hospital desk is open -> read just
      //    its attributes to see if it is a pledge for something on screen.
      onEvent: async (ev) => {
        liveOn = true
        if (ev.type !== "EntityCreated") { if (shownKeys.has(ev.entityKey.toLowerCase())) refresh(); return }
        if (hospitalsByWallet.has(ev.owner.toLowerCase())) return refresh()
        const h = location.hash
        if (!(h.startsWith("#/r/") || h === "#/hospital") || shownKeys.size === 0) return
        try {
          const e = await pub.getEntity(ev.entityKey)
          if (attrStr(e.attributes, "project") === "rakt-relay" && attrStr(e.attributes, "type") === TYPES.pledge &&
            shownKeys.has(String(attrStr(e.attributes, "request")).toLowerCase())) {
            toast("🩸 A donor just pledged", "ok"); refresh()
          }
        } catch { /* expired or unreadable: ignore */ }
      },
      onError: (e) => { liveOn = false; console.warn("live events", e) },
    })
    liveOn = true
  } catch (e) { console.warn("WebSocket unavailable", e) }
}

// ---------------------------------------------------------------- router
let routing = false
async function route(quiet = false) {
  if (routing) return
  routing = true
  try {
    head = await pub.getBlockNumber().catch(() => head)
    const h = location.hash || "#/feed"
    if (h.startsWith("#/r/")) await viewRequest(h.slice(4) as Hex)
    else if (h === "#/hospital") {
      // live refresh must not wipe a half-typed form: only redraw the request list
      const s = getSession(); const me = s && hospitalsByWallet.get(s.address.toLowerCase())
      if (quiet && s && me && document.getElementById("mine")) await renderMine(s.address, me)
      else await viewHospital()
    }
    else if (h === "#/donations") await viewDonations()
    else if (h === "#/steward") await viewSteward()
    else if (h === "#/about") viewAbout()
    else if (quiet && document.getElementById("results")) await runFeed()
    else await viewFeed()
  } finally { routing = false }
}

window.addEventListener("hashchange", () => void route())
setLang(getLang())
;(async () => {
  app.innerHTML = `<p class="muted center">Loading verified blood centres from Arkiv…</p>`
  if (localStorage.getItem("rr_test_pk")) connectTestKey()
  await loadHospitals().catch((e) => toast(`Could not reach Arkiv: ${esc(e.message)}`, "err"))
  await route()
  startLive()
})()

// re-export for debugging in the console
Object.assign(window, { rakt: { pub, Q, A, TYPES, URGENCY } })
