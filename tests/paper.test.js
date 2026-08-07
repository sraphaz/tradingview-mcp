/**
 * Tests for TradingView native Paper Trading observability (src/core/paper.js).
 * Everything runs offline with mocked CDP evaluation.
 *
 * At this stage (pre-discovery, see docs/PAPER_TRADING_DISCOVERY.md) the
 * status must report only verifiable facts, mark everything else as
 * unknown/null, and always fail closed on mutation safety.
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

describe('paper getStatus() — Trading Panel observation', () => {
  it('reports the panel button as available when it exists', async () => {
    const status = await getStatus({ _deps: depsReturning({ button_found: true, button_active: false }) });
    assert.equal(status.success, true);
    assert.equal(status.desktop_connected, true);
    assert.equal(status.trading_panel_available, true);
    assert.equal(status.trading_panel_open, false);
  });

  it('reports the panel as open when the button is active', async () => {
    const status = await getStatus({ _deps: depsReturning({ button_found: true, button_active: true }) });
    assert.equal(status.trading_panel_open, true);
  });

  it('reports the panel as unavailable when the button is missing', async () => {
    const status = await getStatus({ _deps: depsReturning({ button_found: false }) });
    assert.equal(status.trading_panel_available, false);
    assert.equal(status.trading_panel_open, null);
  });

  it('reports the desktop as disconnected instead of failing when CDP is unreachable', async () => {
    const status = await getStatus({ _deps: DISCONNECTED_DEPS });
    assert.equal(status.success, true);
    assert.equal(status.desktop_connected, false);
    assert.equal(status.trading_panel_available, null);
    assert.equal(status.trading_panel_open, null);
  });

  it('queries the trading button through its semantic selectors', async () => {
    const expressions = [];
    const deps = { evaluate: async (expr) => { expressions.push(expr); return { button_found: false }; } };
    await getStatus({ _deps: deps });
    assert.ok(expressions[0].includes('trading-button'));
    assert.ok(expressions[0].includes('Trading Panel'));
  });
});

describe('paper getStatus() — honest unknowns before discovery', () => {
  it('reports undiscovered facts as unknown or null, never guessed', async () => {
    const status = await getStatus({ _deps: depsReturning({ button_found: true, button_active: true }) });
    assert.equal(status.tradingview_session, 'unknown');
    assert.equal(status.paper_available, null);
    assert.equal(status.paper_connected, null);
    assert.equal(status.active_provider, null);
    assert.equal(status.provider_type, 'unknown');
    assert.equal(status.active_account_id, null);
    assert.equal(status.discovery_status, 'pending');
  });
});

describe('paper getStatus() — mutation safety invariant', () => {
  const scenarios = [
    ['panel open', depsReturning({ button_found: true, button_active: true })],
    ['panel closed', depsReturning({ button_found: true, button_active: false })],
    ['button missing', depsReturning({ button_found: false })],
    ['desktop disconnected', DISCONNECTED_DEPS],
  ];

  for (const [name, deps] of scenarios) {
    it(`never reports safe_for_paper_mutation while the provider is unverified (${name})`, async () => {
      const status = await getStatus({ _deps: deps });
      assert.equal(status.safe_for_paper_mutation, false);
    });
  }
});
