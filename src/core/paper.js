/**
 * TradingView native Paper Trading — read-only observability.
 *
 * Built on runtime paths evidenced in docs/PAPER_TRADING_DISCOVERY.md
 * (Capture 1, TradingView Desktop 3.3.0): window.user session markers, the
 * bottom-bar widget named 'paper_trading', and the trading service reached
 * through its widget controller (connectStatus() enum, activeBroker()).
 *
 * Facts that cannot be verified are reported as null/'unknown' instead of
 * being guessed, and safe_for_paper_mutation stays false until the native
 * Paper Trading provider can be positively identified by its stable id
 * (pending an authenticated capture). No function in this module mutates
 * anything.
 */
import { evaluate as _evaluate } from '../connection.js';
import { RIGHT_RAIL_PANEL_SELECTORS } from './ui.js';

function _resolve(deps) {
  return { evaluate: deps?.evaluate || _evaluate };
}

// connectStatus() values observed/documented: 3 confirmed while disconnected
// (Capture 1); 1/2/4 follow TradingView's public Broker API enum and still
// need live confirmation.
const CONNECTION_STATES = {
  1: 'connected',
  2: 'connecting',
  3: 'disconnected',
  4: 'error',
};

// One read-only IIFE: internal API first, semantic DOM button as fallback.
// Session classification never returns user identity, only the state.
function statusProbe() {
  const { dataNames, ariaLabels } = RIGHT_RAIL_PANEL_SELECTORS.trading;
  return `
    (function () {
      function unwrap(v) {
        try { return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; } catch (e) { return null; }
      }
      function classifySession() {
        try {
          var u = window.user;
          if (!u || typeof u !== 'object') return 'unknown';
          if (!u.id || u.username === 'Guest') return 'unauthenticated';
          return 'authenticated';
        } catch (e) { return 'unknown'; }
      }
      function describeBroker(broker) {
        if (!broker || typeof broker !== 'object') return null;
        function short(v) { return (typeof v === 'string' || typeof v === 'number') ? String(v).slice(0, 80) : null; }
        return { id: short(broker.id !== undefined ? broker.id : broker.brokerId), name: short(broker.name) };
      }
      var session = classifySession();
      var bwb = window.TradingView && window.TradingView.bottomWidgetBar;
      var controllers = bwb && bwb._widgetControllers instanceof Map ? bwb._widgetControllers : null;
      if (!bwb || !controllers || typeof bwb.isWidgetEnabled !== 'function') {
        var dataNames = ${JSON.stringify(dataNames)};
        var ariaLabels = ${JSON.stringify(ariaLabels)};
        var btn = null;
        for (var d = 0; d < dataNames.length && !btn; d++) btn = document.querySelector('[data-name="' + dataNames[d] + '"]');
        for (var a = 0; a < ariaLabels.length && !btn; a++) btn = document.querySelector('[aria-label="' + ariaLabels[a] + '"]');
        if (!btn) return { source: 'dom_fallback', session: session, button_found: false };
        var classes = btn.classList.toString();
        var isActive = btn.getAttribute('aria-pressed') === 'true'
          || btn.classList.contains('isActive')
          || classes.indexOf('active') !== -1
          || classes.indexOf('Active') !== -1;
        return { source: 'dom_fallback', session: session, button_found: true, button_active: isActive };
      }
      var out = {
        source: 'internal_api',
        session: session,
        paper_widget_registered: controllers.has('paper_trading'),
        paper_widget_enabled: !!unwrap(bwb.isWidgetEnabled('paper_trading')),
        bottom_bar_visible: !!unwrap(typeof bwb.isVisible === 'function' ? bwb.isVisible() : null),
        active_widget: unwrap(typeof bwb.activeWidgetName === 'function' ? bwb.activeWidgetName() : null) || null,
        trading_service_found: false,
        connect_status_raw: null,
        active_broker: null,
      };
      try {
        var ctl = controllers.get('paper_trading');
        var trading = ctl && ctl._trading;
        if (trading) {
          out.trading_service_found = true;
          if (typeof trading.connectStatus === 'function') out.connect_status_raw = unwrap(trading.connectStatus());
          if (typeof trading.activeBroker === 'function') out.active_broker = describeBroker(unwrap(trading.activeBroker()));
        }
      } catch (e) { /* trading service unreachable — fields stay null */ }
      return out;
    })()
  `;
}

export async function getStatus({ _deps } = {}) {
  const { evaluate } = _resolve(_deps);
  let probe;
  try {
    probe = await evaluate(statusProbe());
  } catch {
    return desktopDisconnectedStatus();
  }
  if (!probe || typeof probe !== 'object') return baseStatus();
  return probe.source === 'dom_fallback' ? domFallbackStatus(probe) : internalApiStatus(probe);
}

function baseStatus() {
  return {
    success: true,
    desktop_connected: true,
    source: null,
    tradingview_session: 'unknown',
    trading_panel_available: null,
    trading_panel_open: null,
    paper_available: null,
    paper_connected: null,
    connection_state: 'unknown',
    connection_state_raw: null,
    active_provider: null,
    // Stays 'unknown' until the native Paper broker's stable id is captured
    // and identification is implemented (fail closed).
    provider_type: 'unknown',
    active_account_id: null,
    safe_for_paper_mutation: false,
    discovery_status: 'partial',
  };
}

function desktopDisconnectedStatus() {
  return { ...baseStatus(), desktop_connected: false };
}

function domFallbackStatus(probe) {
  return {
    ...baseStatus(),
    source: 'dom_fallback',
    tradingview_session: probe.session ?? 'unknown',
    trading_panel_available: !!probe.button_found,
    trading_panel_open: probe.button_found ? !!probe.button_active : null,
  };
}

function internalApiStatus(probe) {
  const connectionState = CONNECTION_STATES[probe.connect_status_raw] ?? 'unknown';
  return {
    ...baseStatus(),
    source: 'internal_api',
    tradingview_session: probe.session ?? 'unknown',
    trading_panel_available: !!probe.paper_widget_registered,
    trading_panel_open: probe.bottom_bar_visible === true && probe.active_widget === 'paper_trading',
    paper_available: !!probe.paper_widget_enabled,
    paper_connected: paperConnected(probe, connectionState),
    connection_state: connectionState,
    connection_state_raw: probe.connect_status_raw ?? null,
    active_provider: probe.active_broker ?? null,
  };
}

// false only when provably nothing is connected; null (not true) while a
// connected provider cannot yet be verified as native Paper Trading.
function paperConnected(probe, connectionState) {
  if (!probe.active_broker || connectionState === 'disconnected') return false;
  return null;
}
