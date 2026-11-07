// End-screen mockups for Seerr requests: the captain's log is the most direct place to invite requests. Placeholder
// numbers throughout; the real counts (requests, hours watched, pending) come later. See README.md for the contract.
//
// endScreen() only takes [label, text] rows, so each mock also adds its own block (crates, posters, a bottle, sails)
// after the log, with its own styles injected once. The block is replaced each time the log shows.

const REQUEST_URL = "https://requests.example.com/";  // placeholder for the request site
const N = { requested: 14, hours: 120, pending: 3, watched: 11 };  // placeholder counts

const CSS = `
.seerr { margin: 12px 0 2px; padding-top: 10px; border-top: 1px dashed rgba(90, 67, 39, 0.35); text-align: center; }
.seerr .kicker { margin-bottom: 4px; }
.seerr .line { font-size: 1.02rem; text-wrap: balance; font-variant-numeric: tabular-nums; }
.seerr .line b { font-family: var(--display); font-weight: normal; font-size: 1.3em; line-height: 1; color: #7a3d12; }
.seerr .soft { font-size: 0.85rem; font-style: italic; color: var(--ink-soft); margin-top: 3px; text-wrap: pretty; }
/* Cargo: one crate per request, the opened ones watched */
.seerr .crates { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 3px; margin: 8px auto 2px; max-width: 360px; }
.seerr .crates svg { width: 20px; height: 18px; display: block; }
.seerr .crates .shut { opacity: 0.45; }
/* The top three requested: poster slots */
.seerr .posters { display: flex; justify-content: center; gap: 12px; margin: 10px 0 2px; }
.seerr .poster { position: relative; width: 56px; height: 84px; border: 2px solid var(--brass); border-radius: 3px; box-shadow: 0 3px 10px rgba(60, 40, 10, 0.35); }
.seerr .poster i { position: absolute; top: -9px; left: -9px; width: 22px; height: 22px; border-radius: 50%; background: var(--ink); color: var(--brass-hi);
  font: normal 0.85rem/22px var(--display); text-align: center; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); }
.seerr .poster span { position: absolute; left: 0; right: 0; bottom: -18px; font-size: 0.75rem; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.seerr .posters + .soft { margin-top: 22px; }
/* The bottle washed up */
.seerr.bottle { display: flex; gap: 14px; align-items: center; text-align: left; }
.seerr.bottle svg { width: 92px; height: 70px; flex: none; }
.seerr.bottle .note { margin: 0; font-size: 1rem; color: var(--ink); font-style: italic; }
.seerr .ask { display: inline-block; margin-top: 8px; font-family: var(--display); font-size: 1.15rem; color: #7a3d12; text-decoration: none;
  border: 1.5px solid #7a3d12; border-radius: 6px; padding: 3px 14px; background: rgba(255, 248, 225, 0.5); }
.seerr .ask:hover { background: #fff6dc; color: #4a2208; }
.seerr .ask::after { content: " →"; font-family: var(--serif); }
/* Sails on the horizon */
.seerr .horizon { display: block; width: 100%; max-width: 360px; height: 54px; margin: 6px auto 0; }
/* The combined screen: the two side by side as small panels */
.seerr.pair { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; align-items: start; }
.seerr.pair > div { min-width: 0; }
.seerr.pair .crates { gap: 3px 2px; flex-wrap: nowrap; margin-top: 10px; }
.seerr.pair .crates svg { width: 13px; height: 12px; }
.seerr.pair .horizon { height: 40px; margin-top: 4px; }
.seerr.pair .line { font-size: 0.92rem; }
@media (max-width: 420px) {
  .seerr.bottle svg { width: 70px; height: 54px; }
  .seerr.pair { grid-template-columns: 1fr; gap: 8px; }
}
@media (max-height: 500px) {
  .seerr { margin-top: 8px; padding-top: 6px; }
  .seerr .posters { gap: 10px; margin-top: 8px; }
  .seerr .poster { width: 36px; height: 54px; }
  .seerr .poster span { display: none; }
  .seerr .poster i { top: -7px; left: -7px; width: 16px; height: 16px; font-size: 0.7rem; line-height: 16px; }
  .seerr.req .line { font-size: 0.95rem; }
  .seerr .posters + .soft { margin-top: 4px; }
  .seerr.req { display: grid; grid-template-columns: 1fr auto; gap: 0 14px; align-items: center; text-align: left; }
  .seerr.req .posters { grid-row: 1 / 4; grid-column: 2; }
  .seerr.req .crates { justify-content: flex-start; margin-left: 0; }
  .seerr .horizon { height: 36px; }
  .seerr.bottle svg { width: 64px; height: 48px; }
}
`;

// A crate: shut (requested, not yet watched) or open with its lid propped (watched)
const crate = open => `<svg viewBox="0 0 20 18" class="${open ? "" : "shut"}" aria-hidden="true">` +
  (open ? `<path d="M3 6 L9 1.5 L10.5 3 L4.5 7.5Z" fill="#a8743f" stroke="#3a2a1c" stroke-width="0.8"/>` : "") +
  `<rect x="2" y="${open ? 7 : 5}" width="16" height="${open ? 10 : 12}" rx="1" fill="#b98448" stroke="#3a2a1c" stroke-width="1"/>` +
  `<path d="M2 ${open ? 11.5 : 9} H18 M2 ${open ? 14.5 : 13} H18" stroke="#6b4826" stroke-width="0.8"/>` +
  (open ? `<rect x="4" y="7.6" width="12" height="1.6" fill="#f2c76b" opacity="0.9"/>` : `<path d="M2 5 L18 17 M18 5 L2 17" stroke="#6b4826" stroke-width="0.8"/>`) +
  `</svg>`;

// Placeholder posters for the top three requested: coloured slots with the hours watched under each
const POSTERS = [["#3d5a6c", "#1b2c38", 46], ["#7a3d2a", "#2e1a12", 31], ["#4f6b3a", "#1f2d17", 18]];
const posters = () => `<div class="posters">${POSTERS.map(([a, b, h], k) =>
  `<div class="poster" style="background: linear-gradient(160deg, ${a}, ${b})"><i>${k + 1}</i><span>${h} h</span></div>`).join("")}</div>`;

// Small sails on the horizon at sunset: one per pending request
const horizon = n => {
  const sails = Array.from({ length: n }, (_, k) => {
    const x = 48 + k * (210 / Math.max(1, n - 1 || 1)) + (k % 2 ? 14 : 0), s = 1 - (k % 3) * 0.18;
    return `<g transform="translate(${x} ${33 - 2 * s}) scale(${s})"><path d="M-7 0 H7 L5 3 H-5Z" fill="#3a2a1c"/><path d="M0 0 V-17" stroke="#3a2a1c" stroke-width="1"/>` +
      `<path d="M0.8 -16 Q8 -9 0.8 -2Z" fill="#f6ead0" stroke="#5a4327" stroke-width="0.6"/><path d="M-0.8 -13 Q-5 -8 -0.8 -2Z" fill="#efe0bd" stroke="#5a4327" stroke-width="0.6"/></g>`;
  }).join("");
  return `<svg class="horizon" viewBox="0 0 360 54" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    `<defs><linearGradient id="seerr_sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2c76b" stop-opacity="0"/><stop offset="1" stop-color="#e2a24f" stop-opacity="0.55"/></linearGradient>` +
    `<linearGradient id="seerr_sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d5a6c" stop-opacity="0.65"/><stop offset="1" stop-color="#3d5a6c" stop-opacity="0"/></linearGradient></defs>` +
    `<rect x="0" y="4" width="360" height="30" fill="url(#seerr_sky)"/><circle cx="334" cy="34" r="11" fill="#f2c76b" opacity="0.8"/>` +
    `<rect x="0" y="34" width="360" height="20" fill="url(#seerr_sea)"/><path d="M0 34 H360" stroke="#5a4327" stroke-width="1"/>` +
    `<path d="M40 41 h28 M120 45 h40 M220 40 h24 M286 44 h34" stroke="#f6ead0" stroke-width="1" opacity="0.6"/>${sails}</svg>`;
};

// A corked bottle washed up on a strip of sand, its note half out
const BOTTLE = `<svg viewBox="0 0 92 70" aria-hidden="true">
  <path d="M0 58 Q24 50 46 55 T92 54 V70 H0Z" fill="#e2c48a"/><path d="M0 62 Q30 56 60 61 T92 60" stroke="#c9a96b" fill="none"/>
  <path d="M4 52 Q14 47 24 51" stroke="#6fb7c9" stroke-width="1.4" fill="none" opacity="0.7"/>
  <g transform="rotate(-16 46 40)">
    <path d="M18 34 h36 q8 0 12 4 h10 v6 h-10 q-4 4 -12 4 h-36 q-6 0 -6 -7 t6 -7Z" fill="#4f9a78" fill-opacity="0.55" stroke="#2f6b52" stroke-width="1.2"/>
    <rect x="76" y="37" width="7" height="8" rx="1.5" fill="#9a6a3a"/>
    <rect x="22" y="36.5" width="28" height="9" rx="4" fill="#f2e3b8"/><path d="M34 36.5 v9" stroke="#c8402e" stroke-width="2"/>
    <path d="M22 37 q-3 -1 -5 2" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.7"/>
  </g>
  <g transform="translate(58 18) rotate(10)"><rect width="26" height="16" rx="1.5" fill="#f6e9c9" stroke="#c9a96b"/>
    <path d="M4 5 h18 M4 8.5 h14 M4 12 h16" stroke="#5a4327" stroke-width="0.9" opacity="0.7"/></g>
</svg>`;

// Show a block after the log (and drop any from a previous showing)
function place(api, cls, html) {
  if (!document.getElementById("seerr_css")) document.head.append(Object.assign(document.createElement("style"), { id: "seerr_css", textContent: CSS }));
  api.$("seerr_block")?.remove();
  const el = Object.assign(document.createElement("div"), { id: "seerr_block", className: `seerr ${cls}`, innerHTML: html });
  api.$("log").after(el);
}
const tally = () => `<div class="crates" role="img" aria-label="${N.requested} crates, ${N.watched} opened">` +
  Array.from({ length: N.requested }, (_, k) => crate(k < N.watched)).join("") + `</div>`;

// 1. Someone who requests: the cargo they asked for, and the top three
registerMock({
  id: "end-requester", title: "End screen: your requests (cargo tally)", tier: "end",
  endScreen(api, rows) {
    place(api, "req", `<div class="kicker">Cargo you sent for</div>
      <div class="line">You requested <b>${N.requested}</b> titles; the crew watched them for <b>${N.hours}</b> hours.</div>
      ${tally()}${posters()}
      <div class="soft">Your most-watched requests</div>`);
    return { rows };
  },
});

// 2. Someone who never requested: a message in a bottle washes up, and an invitation
registerMock({
  id: "end-never-requested", title: "End screen: never requested (message in a bottle)", tier: "end",
  endScreen(api, rows) {
    place(api, "bottle", `${BOTTLE}<div><div class="kicker">Washed up on the beach</div>
      <p class="note">“Missing a show or a film? Ask, and the crew will fetch it in for you. Anything at all.”</p>
      <a class="ask" href="${REQUEST_URL}" target="_blank" rel="noopener">Send a request</a></div>`);
    return { rows };
  },
});

// 3. Requests still on their way: sails on the horizon
registerMock({
  id: "end-pending", title: "End screen: pending requests (sails on the horizon)", tier: "end",
  endScreen(api, rows) {
    place(api, "pend", `${horizon(N.pending)}<div class="line"><b>${N.pending}</b> requests still on the horizon</div>
      <div class="soft">The crew will hail you when they reach port.</div>`);
    return { rows };
  },
});

// 4. Both, with the usual log: as two rows in the log, and the two pictures side by side underneath
registerMock({
  id: "end-combined", title: "End screen: requests and pending, with the full log", tier: "end",
  endScreen(api, rows) {
    place(api, "pair", `<div><div class="kicker">Cargo</div>${tally()}</div><div><div class="kicker">On the horizon</div>${horizon(N.pending)}</div>`);
    return { rows: [...rows, ["Requests", `${N.requested} titles, watched for ${N.hours} h`], ["On the horizon", `${N.pending} requests still to come`]] };
  },
});
