/**
 * Tests for TradingView native Paper Trading observability (src/core/paper.js).
 * Everything runs offline with mocked CDP evaluation.
 *
 * The status is built on runtime paths evidenced in
 * docs/PAPER_TRADING_DISCOVERY.md (Capture 1): window.user session markers,
 * the bottom-bar widget named 'paper_trading', the trading service's
 * connectStatus() enum and activeBroker(). Facts that cannot be verified are
 * reported as unknown/null, and mutation safety always fails closed while the
 * native Paper Trading provider identity is unverified.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getStatus } from '../src/core/paper.js';

function depsReturning(result) {
  return { evaluate: async () => result };
}

const DISCONNECTED_DEPS = {
  evaluate: async () => { throw new Error('CDP connection failed after 5 attempts'); },
};

// Probe result as evidenced in Capture 1 (anonymous session, nothing connected).
const ANONYMOUS_PROBE = {
  source: 'internal_api',
  session: 'unauthenticated',
  paper_widget_registered: true,
  paper_widget_enabled: false,
  bottom_bar_visible: false,
  active_widget: null,
  trading_service_found: true,
  connect_status_raw: 3,
  active_broker: null,
};

const CONNECTED_PROBE = {
  source: 'internal_api',
  session: 'authenticated',
  paper_widget_registered: true,
  paper_widget_enabled: true,
  bottom_bar_visible: true,
  active_widget: 'paper_trading',
  trading_service_found: true,
  connect_status_raw: 1,
  active_broker: { id: 'some-broker', name: 'Some Broker' },
};

describe('paper getStatus() — session detection', () => {
  it('reports the unauthenticated session state', async () => {
    const status = await getStatus({ _deps: depsReturning(ANONYMOUS_PROBE) });
    assert.equal(status.tradingview_session, 'unauthenticated');
  });

  it('reports the authenticated session state', async () => {
    const status = await getStatus({ _deps: depsReturning(CONNECTED_PROBE) });
    assert.equal(status.tradingview_session, 'authenticated');
  });

  it('reports unknown when the probe cannot classify the session', async () => {
    const status = await getStatus({ _deps: depsReturning({ ...ANONYMOUS_PROBE, session: 'unknown' }) });
    assert.equal(status.tradingview_session, 'unknown');
  });
});

describe('paper getStatus() — panel and availability', () => {
  it('maps widget enablement to paper_available', async () => {
    const anonymous = await getStatus({ _deps: depsReturning(ANONYMOUS_PROBE) });
    assert.equal(anonymous.paper_available, false);
    const connected = await getStatus({ _deps: depsReturning(CONNECTED_PROBE) });
    assert.equal(connected.paper_available, true);
  });

  it('reports the panel open only when the paper_trading widget is the visible active widget', async () => {
    const connected = await getStatus({ _deps: depsReturning(CONNECTED_PROBE) });
    assert.equal(connected.trading_panel_open, true);
    const hidden = await getStatus({
      _deps: depsReturning({ ...CONNECTED_PROBE, bottom_bar_visible: false }),
    });
    assert.equal(hidden.trading_panel_open, false);
    const otherWidget = await getStatus({
      _deps: depsReturning({ ...CONNECTED_PROBE, active_widget: 'backtesting' }),
    });
    assert.equal(otherWidget.trading_panel_open, false);
  });

  it('reports the observation source', async () => {
    const status = await getStatus({ _deps: depsReturning(ANONYMOUS_PROBE) });
    assert.equal(status.source, 'internal_api');
  });

  it('carries DOM fallback observations when internal paths are unavailable', async () => {
    const status = await getStatus({
      _deps: depsReturning({ source: 'dom_fallback', session: 'unknown', button_found: true, button_active: true }),
    });
    assert.equal(status.source, 'dom_fallback');
    assert.equal(status.trading_panel_available, true);
    assert.equal(status.trading_panel_open, true);
    assert.equal(status.paper_available, null);
    assert.equal(status.paper_connected, null);
  });
});

describe('paper getStatus() — connection state mapping', () => {
  const cases = [
    [1, 'connected'],
    [2, 'connecting'],
    [3, 'disconnected'],
    [4, 'error'],
    [99, 'unknown'],
    [null, 'unknown'],
  ];

  for (const [raw, expected] of cases) {
    it(`maps connectStatus ${raw} to '${expected}'`, async () => {
      const status = await getStatus({
        _deps: depsReturning({ ...ANONYMOUS_PROBE, connect_status_raw: raw }),
      });
      assert.equal(status.connection_state, expected);
      assert.equal(status.connection_state_raw, raw);
    });
  }
});

describe('paper getStatus() — paper_connected semantics', () => {
  it('is false when nothing is connected', async () => {
    const status = await getStatus({ _deps: depsReturning(ANONYMOUS_PROBE) });
    assert.equal(status.paper_connected, false);
  });

  it('is null (not true) when connected but the provider is not verified as native Paper', async () => {
    const status = await getStatus({ _deps: depsReturning(CONNECTED_PROBE) });
    assert.equal(status.paper_connected, null);
    assert.equal(status.provider_type, 'unknown');
  });

  it('exposes the active broker structurally without claiming it is Paper', async () => {
    const status = await getStatus({ _deps: depsReturning(CONNECTED_PROBE) });
    assert.deepEqual(status.active_provider, { id: 'some-broker', name: 'Some Broker' });
    assert.equal(status.provider_type, 'unknown');
  });
});

describe('paper getStatus() — desktop disconnected', () => {
  it('reports the desktop as disconnected instead of failing', async () => {
    const status = await getStatus({ _deps: DISCONNECTED_DEPS });
    assert.equal(status.success, true);
    assert.equal(status.desktop_connected, false);
    assert.equal(status.tradingview_session, 'unknown');
    assert.equal(status.paper_available, null);
    assert.equal(status.connection_state, 'unknown');
  });
});

describe('paper getStatus() — mutation safety invariant', () => {
  const scenarios = [
    ['anonymous', depsReturning(ANONYMOUS_PROBE)],
    ['authenticated + connected broker', depsReturning(CONNECTED_PROBE)],
    ['dom fallback', depsReturning({ source: 'dom_fallback', session: 'unknown', button_found: true, button_active: true })],
    ['desktop disconnected', DISCONNECTED_DEPS],
  ];

  for (const [name, deps] of scenarios) {
    it(`never reports safe_for_paper_mutation while the provider is unverified (${name})`, async () => {
      const status = await getStatus({ _deps: deps });
      assert.equal(status.safe_for_paper_mutation, false);
    });
  }
});
