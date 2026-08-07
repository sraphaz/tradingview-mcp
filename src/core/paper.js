/**
 * TradingView native Paper Trading — read-only observability.
 *
 * This module reports only facts verifiable through surfaces already
 * evidenced in this repository: CDP liveness and the Trading Panel button's
 * semantic DOM state. Every Paper Trading fact that still requires runtime
 * discovery (see docs/PAPER_TRADING_DISCOVERY.md) is reported as
 * null/'unknown' instead of being guessed, and safe_for_paper_mutation stays
 * false until the native Paper Trading provider can be positively
 * identified. No function in this module mutates anything.
 */
import { evaluate as _evaluate } from '../connection.js';
import { RIGHT_RAIL_PANEL_SELECTORS } from './ui.js';

function _resolve(deps) {
  return { evaluate: deps?.evaluate || _evaluate };
}

// Same button lookup and active-state heuristic as openPanel() in core/ui.js,
// but purely observational: nothing is clicked.
function tradingPanelButtonProbe() {
  const { dataNames, ariaLabels } = RIGHT_RAIL_PANEL_SELECTORS.trading;
  return `
    (function() {
      var dataNames = ${JSON.stringify(dataNames)};
      var ariaLabels = ${JSON.stringify(ariaLabels)};
      var btn = null;
      for (var d = 0; d < dataNames.length && !btn; d++) btn = document.querySelector('[data-name="' + dataNames[d] + '"]');
      for (var a = 0; a < ariaLabels.length && !btn; a++) btn = document.querySelector('[aria-label="' + ariaLabels[a] + '"]');
      if (!btn) return { button_found: false };
      var classes = btn.classList.toString();
      var isActive = btn.getAttribute('aria-pressed') === 'true'
        || btn.classList.contains('isActive')
        || classes.indexOf('active') !== -1
        || classes.indexOf('Active') !== -1;
      return { button_found: true, button_active: isActive };
    })()
  `;
}

export async function getStatus({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  let desktopConnected = false;
  let panelButton = null;
  try {
    panelButton = await evaluate(tradingPanelButtonProbe());
    desktopConnected = true;
  } catch {
    // CDP unreachable — the status reports that instead of failing.
  }
  return {
    success: true,
    desktop_connected: desktopConnected,
    trading_panel_available: desktopConnected ? !!panelButton?.button_found : null,
    trading_panel_open: panelButton?.button_found ? !!panelButton.button_active : null,
    // Pending runtime discovery (docs/PAPER_TRADING_DISCOVERY.md): reported
    // honestly as unknown rather than inferred from names or assumptions.
    tradingview_session: 'unknown',
    paper_available: null,
    paper_connected: null,
    active_provider: null,
    provider_type: 'unknown',
    active_account_id: null,
    // Fail closed: mutation safety requires positive identification of the
    // native Paper Trading provider, which no code can do yet.
    safe_for_paper_mutation: false,
    discovery_status: 'pending',
  };
}
