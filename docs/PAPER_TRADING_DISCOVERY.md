# Paper Trading Discovery

Status: **awaiting runtime evidence** — this document is the procedure and the
evidence template. No runtime finding below is confirmed until it carries a
filled-in evidence row captured from a live TradingView Desktop session.

## Purpose and scope

Map how TradingView Desktop represents its **native Paper Trading**
environment (Trading Panel → Paper Trading provider) so the MCP can later
expose safe `paper_*` tools. This effort supports **only** TradingView's
native Paper Trading. It will never support Binance, Interactive Brokers
(live, demo or paper), any other broker, or any real-money account. Every
future `paper_*` mutation must positively identify the native Paper Trading
provider and fail closed otherwise.

## Authentication model

The human authenticates in TradingView Desktop normally. The MCP never
accepts or automates usernames, passwords, cookies, tokens or API keys. If a
probe shows that TradingView requires login, record that state — do not work
around it.

## Security rules for evidence collection

- Never paste cookies, tokens, authorization headers or storage contents into
  this document, into issues, or into test fixtures.
- `scripts/paper_discovery.js` only reports structural knowledge (names,
  attributes, booleans). It inspects runtime objects through property
  descriptors so accessor getters are never executed, collects no free-form
  element text (only `aria-label` / `data-name` / `role` values), and redacts
  secret-looking keys, token-like strings and email addresses before printing.
  Do not bypass it with ad-hoc probes that dump storage or headers.
- Screenshots attached as evidence must not show account emails or personal
  data. Paper account balances/IDs are acceptable.
- Record structural knowledge only, e.g. "connection state is readable from
  service X", never the secret material itself.

## What the repository already knows (static baseline)

| Touchpoint | Mechanism | Source |
|------------|-----------|--------|
| Open/close Trading Panel button | C — semantic DOM: `data-name="trading-button"`, `aria-label="Trading Panel"` | `src/core/ui.js` |
| Replay-mode simulated trades (NOT Paper Trading) | A — internal API: `window.TradingViewApi._replayApi.buy()/sell()/closePosition()` | `src/core/replay.js` |
| Internal API discovery pattern | method enumeration via `tv_discover` | `src/core/health.js` |

No broker/paper-trading runtime path is currently known to this repository.
Everything in the evidence tables below starts as **unknown**.

## Mechanism classification

| Class | Meaning |
|-------|---------|
| A | Internal structured API (e.g. a service method returning data) |
| B | Internal model/store (observable structured state) |
| C | Semantic DOM (`data-name`, `aria-label`, `role`) |
| D | UI automation (clicks/typing on discovered elements) |
| E | Unsupported / unreliable — do not build on it |

Absolute coordinates are for exploration only and are never an acceptable
production mechanism.

## Environment record

Fill this in for every discovery session. Findings are only comparable when
the environment is recorded.

| Field | Value |
|-------|-------|
| TradingView Desktop version | _fill in (Help → About)_ |
| Install type (installer / MSIX / dmg / AppImage) | _fill in_ |
| Operating system + version | _fill in_ |
| CDP endpoint | _default 127.0.0.1:9222_ |
| TradingView session state | _authenticated / login required_ |
| Paper Trading account state | _fresh / has history / reset recently_ |
| Trading Panel state during capture | _closed / open-disconnected / open-connected_ |
| Probe report file | _e.g. paper-discovery-connected.json_ |

## Discovery procedure

Run this on a machine with TradingView Desktop. Total hands-on time is a few
minutes per capture.

1. Launch TradingView Desktop with CDP enabled — use the matching script in
   `scripts/` (`launch_tv_debug.bat`, `launch_tv_debug_mac.sh`,
   `launch_tv_debug_linux.sh`) or add `--remote-debugging-port=9222` yourself.
2. Log in normally (human at the keyboard). Open any chart.
3. Verify the bridge works: `npm run tv -- status` (or `tv status` if linked).
4. Capture the baseline state (Trading Panel closed):

   ```bash
   node scripts/paper_discovery.js > paper-discovery-panel-closed.json
   ```

5. Open the Trading Panel (bottom of the chart), but do not connect a broker
   yet. Capture again:

   ```bash
   node scripts/paper_discovery.js > paper-discovery-disconnected.json
   ```

6. Select **Paper Trading** in the panel and connect. Capture again:

   ```bash
   node scripts/paper_discovery.js > paper-discovery-connected.json
   ```

7. Optional but valuable: place one small Paper order manually (e.g. 1 share
   market order with an attached stop loss and take profit), then capture
   `paper-discovery-with-position.json`. This makes position/order/exit
   structures visible to the service scan.
8. While the panel is open, note down manually (plain observation, no tools):
   - the tabs shown in the panel (e.g. Positions, Orders, Account Summary...);
   - the columns of each tab;
   - the fields of the order ticket (side, quantity, order type, TP/SL
     controls, and how TP/SL amounts are expressed — price, ticks, currency,
     percentage);
   - the account selector contents and the exact provider name displayed;
   - anything the UI calls funds/margin/leverage/commission in
     account settings (exact wording).
9. Attach the JSON reports and notes to the tracking issue/PR. The reports
   are already sanitized, but skim them before sharing anyway.

The probe report files match `paper-discovery-*.json` and are gitignored so
raw captures are never committed by accident.

### What the probe collects

`scripts/paper_discovery.js` connects through the same CDP bridge as the MCP
(`src/connection.js`) and captures four read-only sections:

| Section | Question it answers |
|---------|---------------------|
| `namespaces` | Which keys exist on `window.TradingViewApi` / `window.TradingView`, and which window globals have trading-suggestive names |
| `trading_like_services` | Which objects in those namespaces expose methods with names like order/position/account/broker/margin/leverage/commission |
| `bottom_widget_bar` | Whether the bottom widget bar knows a trading widget (would allow API-based panel open like `showWidget('backtesting')`) |
| `trading_panel_dom` | Trading Panel button state and the `data-name`/`role`/button-`aria-label` inventory of the bottom and right layout areas |

### Follow-up probes (after the first captures)

Once the service scan reveals candidate paths, target them individually with
`tv ui evaluate`. Enumerate first, through property descriptors
(`Object.getOwnPropertyDescriptor` / `Object.getOwnPropertyNames`), the way
the probe itself does — property reads and getter access can execute code, so
do not invoke any method or accessor getter until its name and context have
been classified as a safe read from prior evidence. Never call methods whose
names suggest mutation (`place*`, `cancel*`, `modify*`, `reset*`, `create*`,
`close*`) during discovery.

## Evidence tables

Every row starts as `unknown`. Only fill a row from a captured report or a
directly observed session, and cite the capture file.

### A. Trading session

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Detect authenticated session | unknown | — | — | — | must not read secrets |
| Detect login-required state | unknown | — | — | — | maps to `TRADINGVIEW_AUTH_REQUIRED` |
| Detect expired session | unknown | — | — | — | |

### B. Trading Panel

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Panel availability | unknown | — | — | — | |
| Panel open/closed state | partially | static | `data-name="trading-button"` + layout area size (`src/core/ui.js`) | untested for content | button click only; no content verification today |
| Active provider name | unknown | — | — | — | |
| Provider list | unknown | — | — | — | |
| Connection state | unknown | — | — | — | |
| Account selector | unknown | — | — | — | |

### C. Native Paper Trading connection

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Positive identification of native Paper Trading (stable id, not display string) | unknown | — | — | — | REQUIRED before any mutation tool ships |
| disconnected state | unknown | — | — | — | |
| connecting state | unknown | — | — | — | |
| connected state | unknown | — | — | — | |
| reconnecting state | unknown | — | — | — | |
| failed state | unknown | — | — | — | |
| authentication-required state | unknown | — | — | — | |

### D. Paper accounts

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| List accounts | unknown | — | — | — | |
| Active account id | unknown | — | — | — | |
| Display name | unknown | — | — | — | |
| Currency | unknown | — | — | — | |
| Balance | unknown | — | — | — | |
| Equity | unknown | — | — | — | |
| Realized P&L | unknown | — | — | — | |
| Unrealized P&L | unknown | — | — | — | |
| Available funds | unknown | — | — | — | record TradingView's exact term |
| Used funds / margin used | unknown | — | — | — | |
| Borrowed funds | unknown | — | — | — | |
| Buying power | unknown | — | — | — | |
| Leverage | unknown | — | — | — | |

Terminology note: a previously mentioned concept resembling "collective
funds" is NOT an API name. Record the exact TradingView wording observed in
the account summary and map it to one of the rows above (or add a row with
the literal term) before any public API field is named after it.

### E. Account configuration

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Create Paper account | unknown | — | — | — | mutation — later increment |
| Switch account | unknown | — | — | — | |
| Currency setting | unknown | — | — | — | |
| Initial/reset balance setting | unknown | — | — | — | |
| Account reset | unknown | — | — | — | destructive — READ-ONLY documentation only; no mutation tool in early PRs |
| Leverage settings (global / per asset class) | unknown | — | — | — | |
| Commission settings | unknown | — | — | — | |

### F. Positions

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Stable position identity | unknown | — | — | — | |
| Symbol / side / quantity | unknown | — | — | — | |
| Average fill price | unknown | — | — | — | |
| Current price / unrealized P&L | unknown | — | — | — | |
| Realized P&L | unknown | — | — | — | |
| Margin per position | unknown | — | — | — | |
| Attached protective orders | unknown | — | — | — | |
| Partial positions / multiple positions per symbol | unknown | — | — | — | |

### G. Orders

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Market orders | unknown | — | — | — | |
| Limit orders | unknown | — | — | — | |
| Stop orders | unknown | — | — | — | |
| Stop-limit orders | unknown | — | — | — | |
| Order states (pending/working/filled/partial/cancelled/rejected) | unknown | — | — | — | record exact state strings |

### H. Stop Loss / Take Profit (first-class requirement)

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| SL attached at order creation | unknown | — | — | — | |
| TP attached at order creation | unknown | — | — | — | |
| Add/change exits on an open position | unknown | — | — | — | |
| OCO / bracket semantics | unknown | — | — | — | |
| Price-based SL/TP | unknown | — | — | — | |
| Monetary / percentage-based SL/TP | unknown | — | — | — | |
| Multiple TP levels | unknown | — | — | — | |
| Multiple SL levels | unknown | — | — | — | |
| Per-exit quantity | unknown | — | — | — | |

### I. Trailing stop

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Trailing stop supported by native Paper Trading | unknown | — | — | — | verify in Paper specifically, not the generic UI |
| Distance representation (price/percent/ticks) | unknown | — | — | — | |
| Modification behavior | unknown | — | — | — | |

### J. Margin / funds / leverage

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Margin required (pre-trade) | unknown | — | — | — | |
| Margin used | unknown | — | — | — | |
| Insufficient-funds behavior | unknown | — | — | — | record the rejection surface |
| Per-asset-class leverage | unknown | — | — | — | |

### K. Commissions

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| No commission mode | unknown | — | — | — | |
| Fixed commission | unknown | — | — | — | |
| Percentage commission | unknown | — | — | — | |
| Per-contract commission | unknown | — | — | — | |
| Commission currency | unknown | — | — | — | |

## Known risks and unknowns

- Internal runtime paths (`window.TradingViewApi.*`) are undocumented and can
  change between Desktop versions; every confirmed row must state the version
  it was captured on.
- The Trading Panel may be implemented as a bottom widget, a right-rail
  widget, or an iframe depending on version — the DOM probe reports both
  layout areas to disambiguate.
- Paper Trading state may be partly server-backed; if reads require
  authenticated REST calls (as alerts do), that is a design decision to record
  here, not to improvise.
- Provider display names are localized; positive identification must rely on
  a stable internal identifier, never on the display string containing
  "Paper".

## What happens next

Once evidence is captured, the tables above get filled in, each capability is
classified A–E, and only then are the `paper_*` MCP tool names and schemas
frozen for implementation (read-only observability first; mutations in later
increments, each guarded by positive native-Paper identification that fails
closed).
