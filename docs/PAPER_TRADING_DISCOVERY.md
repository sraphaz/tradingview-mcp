# Paper Trading Discovery

Status: **partial runtime evidence captured** — the unauthenticated state has
been probed on a live TradingView Desktop 3.3.0 (Linux) session; see
"Runtime evidence" below. Authenticated / Paper-connected states still
require captures from a logged-in session.

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

### Capture 1 — 2026-08-07 (unauthenticated baseline)

| Field | Value |
|-------|-------|
| TradingView Desktop version | 3.3.0 (Electron 38.2.2, Chrome 140) |
| Install type | snap package, extracted with unsquashfs and run directly |
| Operating system + version | Ubuntu Linux (headless VM, Xvfb display :1) |
| CDP endpoint | 127.0.0.1:9222 |
| TradingView session state | **unauthenticated** (`window.user.username === 'Guest'`, no user id) |
| Paper Trading account state | n/a (not logged in) |
| Trading Panel state during capture | widget registered but disabled; `trading-button` absent from DOM |
| Probe report file | paper-discovery-unauthenticated.json + targeted follow-up probes |

## Runtime evidence — confirmed findings (Capture 1)

All findings below were read through property descriptors (no getter or
mutation-suggesting method was invoked; the only methods called were
zero-argument queries classified as safe reads: `isWidgetEnabled`,
`enabledWidgets`, `isAvailable`, `isVisible`, `connectStatus`,
`activeBroker`). Single version/OS tested — reliability is "one capture"
until reproduced elsewhere.

### The Trading Panel is a bottom-bar widget named `paper_trading`

`window.TradingView.bottomWidgetBar._widgetControllers` is a `Map` with keys
`paper_trading`, `backtesting`, `replay_trading`, `scripteditor`. The bottom
widget bar exposes `showWidget(name)`, `isWidgetEnabled(name)`,
`getWidgetByName(name)`, `activateWidget(name)`, `enabledWidgets()` (returns
a WatchedValue), `isVisible()`, `activeWidgetName()`. This means panel
open/close/state is mechanism **A** (internal structured API), not DOM
clicks — the existing `ui_open_panel('trading')` DOM approach is the
fallback, not the primary path.

When unauthenticated: `isWidgetEnabled('paper_trading') === false`,
`enabledWidgets().value() === []`, and the `trading-button` element does not
exist in the DOM.

### The trading service (`controller._trading`)

`bottomWidgetBar._widgetControllers.get('paper_trading')._trading` is the
application-wide trading service. Structural surface (names captured, none
invoked except where noted):

- Provider management: `brokersList`, `brokersMetainfo`, `brokersPlans`,
  `activeBroker()` (WatchedValue → `null` when disconnected — confirmed),
  `selectBroker`, `pickDefaultBroker`, `reconnectCurrentBroker`,
  `_tryReconnectLastBroker`, `brokersRegistry`, `brokerSelectManager`.
- Connection: `connectStatus()` (WatchedValue → numeric enum; value `3`
  confirmed while disconnected), `onConnectionStatusChange`,
  `onBrokerChange`, `onBrokerLoading`, `onNeedSelectBroker`.
  The numeric values are consistent with TradingView's public Broker API
  documentation (`1 = Connected`, `2 = Connecting`, `3 = Disconnected`,
  `4 = Error`) — values 1/2/4 still need live confirmation.
- Account: `accountType`, `_account` (`null` when disconnected — confirmed),
  `verifyBrokerLiveAccount` (live-account distinction exists in the model),
  `_onCurrentAccountUpdate`.
- Orders: `_ordersService`, `orderViewController`, `_checkAndPlaceOrder`,
  `_checkAndOpenOrderDialog`, `toggleOrderDialog`, `_isMarketOrderSupported`,
  `getQtySuggester`.
- Panel/UI: `toggleTradingPanelVisibility`, `toggleTradingWidget`,
  `tradingPanel`, `getAccountManagerVisibilityMode`,
  `setAccountManagerVisibilityMode`, `setDOMPanelVisibility`,
  `setOrderPanelVisibility`.
- Auth: `_subscribeNativeLogin`, `loginDialogVisibility`,
  `_brokerLoginManager`, `brokerLoginEventsBus`, `_logOut`.
- Paper-specific: `_getPaperCompetitions`,
  `_getActivePaperCompetitionsSinceTimestamp`.

### Broker registry

`trading.brokersRegistry` exposes `getBrokers`, `getBrokersMetaInfos`,
`getBrokerMetaInfoById`, `getBrokerPlanByIntegrationId`, `isBrokerFavorite`.
**`getBrokerMetaInfoById` is the expected path for positive identification
of the native Paper Trading provider by a stable internal id** — the actual
id value must be captured from an authenticated session before any mutation
guard is coded.

### Positions service

`trading._positionService` (`_serviceName=PositionsService`): `positions()`,
`find`, `positionUpdate`, `positionsRemoved`, `getCurrency`,
`supportBrackets`, `supportReverse`, `isDisplayModeIndividualPositions`,
`realIdFromBroker`. Data shape pending an authenticated session with an open
position.

### Orders service

`trading._ordersService` (`_serviceName=OrdersService`): `orders()`,
`activeOrders()`, `find`, `activeOrdersUpdated`, `activeOrdersRemoved`,
`orderRejected`, `getCurrency`, and **`getExitLevelOrderId`** — exit levels
(brackets) are modeled with their own order ids, which supports the
multi-level SL/TP requirement. Exact states and shapes pending.

### Session detection (unauthenticated state)

- `window.user` exists with `username === 'Guest'` and no meaningful id →
  reliable anonymous marker (structural check, no secrets).
- `window.TradingView.changeLoginState` / `signOut` functions exist.
- `window.TradingView.isFeatureEnabled('trading_terminal') === false` while
  anonymous.
- The Trading Panel button (`data-name="trading-button"`) is **absent** from
  the DOM when unauthenticated — DOM-based availability checks must not
  confuse "logged out" with "panel closed".

### Trading backend globals

- `window.TRADING_REST_SERVER_URL === 'https://rest-demo.tradingview.com/tradingview/v1'`
  (public endpoint URL, not a secret) — the Paper backend is served from a
  `rest-demo` host, consistent with TradingView's REST broker integration
  model.
- `window.TRADING_SERVER_LOGGER_URL === 'https://trdlg.tradingview.com'`.
- `window.TradingViewApi._getTradingFeatureFlagsService` resolves a service
  from an internal registry (`serviceOrNull(TRADING_FEATURE_FLAGS_SERVICE)`).

### Linux note (how this capture was made)

TradingView for Linux ships as a snap. For discovery in an environment
without snapd: download via the snapcraft API, `unsquashfs` the package, and
run `<extracted>/tradingview --remote-debugging-port=9222 --no-sandbox`
under an X display. Login is a human step; this capture deliberately stayed
anonymous.

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
| Detect authenticated session | likely (inverse of anonymous marker) | Capture 1 | `window.user` (id + non-Guest username) | untested while logged in | must not read secrets; confirm on authenticated capture |
| Detect login-required state | **yes** | Capture 1 | B — `window.user.username === 'Guest'` / missing id; corroborated by `isFeatureEnabled('trading_terminal') === false` and absent `trading-button` | 1 capture (3.3.0/Linux) | maps to `TRADINGVIEW_AUTH_REQUIRED` |
| Detect expired session | unknown | — | — | — | |

### B. Trading Panel

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Panel availability | **yes** | Capture 1 | A — `bottomWidgetBar.isWidgetEnabled('paper_trading')` | 1 capture | `false` while anonymous |
| Panel open/closed state | **yes** | Capture 1 | A — `bottomWidgetBar.isVisible()` / `activeWidgetName()` (WatchedValues); DOM `trading-button` is fallback (C) | 1 capture | widget name is `paper_trading` |
| Panel open/close action | yes (untested) | Capture 1 | A — `bottomWidgetBar.showWidget('paper_trading')` / `toggleWidget` / `hide` | untested | same API family the repo already uses for `backtesting` |
| Active provider name | yes (untested) | Capture 1 | A — `trading.activeBroker()` WatchedValue | `null` confirmed while disconnected | data shape pending connected capture |
| Provider list | yes (untested) | Capture 1 | A — `trading.brokersRegistry.getBrokers()` / `getBrokersMetaInfos()` | untested (calls may fetch) | |
| Connection state | **yes** | Capture 1 | A — `trading.connectStatus()` WatchedValue, numeric enum | `3` confirmed while disconnected | see section C |
| Account selector | unknown | — | — | — | requires connected capture |

### C. Native Paper Trading connection

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Positive identification of native Paper Trading (stable id, not display string) | expected path found, id value unknown | Capture 1 | A — `trading.brokersRegistry.getBrokerMetaInfoById(id)` + `activeBroker()` | untested | REQUIRED before any mutation tool ships; capture the actual Paper broker id while connected |
| disconnected state | **yes** | Capture 1 | A — `connectStatus() === 3` | 1 capture | matches public Broker API enum (Disconnected=3) |
| connecting state | expected `2` | public Broker API docs | A — `connectStatus()` | unconfirmed live | |
| connected state | expected `1` | public Broker API docs | A — `connectStatus()` | unconfirmed live | |
| reconnecting state | unknown | — | — | — | possibly Connecting(2) again; confirm |
| failed state | expected `4` (Error) | public Broker API docs | A — `connectStatus()` | unconfirmed live | |
| authentication-required state | **yes** (session-level) | Capture 1 | B — anonymous marker (section A) gates everything | 1 capture | broker-level login dialog state: `trading.loginDialogVisibility` (untested) |

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
| Stable position identity | service found, shape unknown | Capture 1 | A — `trading._positionService.positions()` / `find` / `realIdFromBroker` | untested | data shape pending connected capture with a position |
| Symbol / side / quantity | unknown (service exists) | Capture 1 | A — PositionsService | — | |
| Average fill price | unknown | — | — | — | |
| Current price / unrealized P&L | likely | Capture 1 | A — `_updatePositionPL` exists in PositionsService | untested | |
| Realized P&L | unknown | — | — | — | |
| Margin per position | unknown | — | — | — | |
| Attached protective orders | likely | Capture 1 | A — `supportBrackets` on PositionsService; `getExitLevelOrderId` on OrdersService | untested | |
| Partial positions / multiple positions per symbol | display mode exists | Capture 1 | A — `isDisplayModeIndividualPositions` (`_displayMode=1`) | untested | semantics pending |

### G. Orders

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| Market orders | supported-check exists | Capture 1 | A — `trading._isMarketOrderSupported` | untested | |
| Limit orders | unknown (service exists) | Capture 1 | A — `trading._ordersService.orders()` / `activeOrders()` | — | |
| Stop orders | unknown | — | — | — | |
| Stop-limit orders | unknown | — | — | — | |
| Order states (pending/working/filled/partial/cancelled/rejected) | unknown | — | — | — | record exact state values; `orderRejected` delegate exists on OrdersService |

### H. Stop Loss / Take Profit (first-class requirement)

| Capability | Available | Source | API/DOM path | Reliability | Notes |
|------------|-----------|--------|--------------|-------------|-------|
| SL attached at order creation | bracket model exists | Capture 1 | A — `supportBrackets` (PositionsService) | untested | |
| TP attached at order creation | bracket model exists | Capture 1 | A — `supportBrackets` (PositionsService) | untested | |
| Add/change exits on an open position | unknown | — | — | — | |
| OCO / bracket semantics | unknown | — | — | — | |
| Price-based SL/TP | unknown | — | — | — | |
| Monetary / percentage-based SL/TP | unknown | — | — | — | |
| Multiple TP levels | exit levels have own order ids | Capture 1 | A — `getExitLevelOrderId` (OrdersService) | untested | strong hint that multi-level exits are modeled |
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

The unauthenticated baseline is captured. The next capture requires a human
to log in to TradingView Desktop and connect Paper Trading, then re-run the
probe plus these targeted reads (all through the paths evidenced above):

1. `bottomWidgetBar.isWidgetEnabled('paper_trading')` and
   `enabledWidgets().value()` while logged in (expect `true` /
   `['paper_trading', ...]`).
2. `trading.activeBroker().value()` while connected — capture the **stable
   Paper broker id** and the metainfo from
   `brokersRegistry.getBrokerMetaInfoById(id)`. This id is the cornerstone
   of the mutation guard.
3. `trading.connectStatus().value()` in each observable state (confirm
   1/2/4).
4. `trading._account` / `_onCurrentAccountUpdate` surface → account shape
   (balance/equity/currency terminology as TradingView names it).
5. With one small manual Paper position open:
   `_positionService.positions()` and `_ordersService.orders()` shapes,
   `supportBrackets()` value, one `getExitLevelOrderId` example.

Only after that evidence lands are the remaining `paper_*` tool names and
schemas frozen (read-only observability first; mutations in later
increments, each guarded by positive native-Paper identification that fails
closed).
