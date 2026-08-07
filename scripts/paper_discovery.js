#!/usr/bin/env node
// Read-only discovery probe for TradingView's native Paper Trading runtime.
//
// Run with TradingView Desktop open (CDP on port 9222), ideally with the
// Trading Panel visible and Paper Trading connected:
//
//   node scripts/paper_discovery.js > paper-discovery-results.json
//
// The probe reports ONLY structural knowledge: property names, method names,
// data-name / aria-label attributes, element presence and booleans. It never
// reads cookies, web storage, or request headers, and it redacts anything in
// the output that looks like secret material before printing.
//
// See docs/PAPER_TRADING_DISCOVERY.md for the full manual procedure and the
// evidence tables this report feeds into.
import { pathToFileURL } from 'url';
import { evaluate, disconnect, getTargetInfo, CDP_HOST, CDP_PORT } from '../src/connection.js';

// --- Injected probes (each is a self-contained read-only IIFE) ---

// Which globals exist, and which window keys hint at a trading domain.
const NAMESPACE_PROBE = `
(function () {
  function describeKeys(obj) {
    var out = [];
    if (!obj) return out;
    var keys = Object.getOwnPropertyNames(obj);
    for (var i = 0; i < keys.length; i++) {
      var type;
      try { type = typeof obj[keys[i]]; } catch (e) { type = 'unreadable'; }
      out.push({ name: keys[i], type: type });
    }
    return out;
  }
  var tradingLike = /trad|brok|order|account|paper|execut/i;
  var windowMatches = [];
  var winKeys = Object.getOwnPropertyNames(window);
  for (var i = 0; i < winKeys.length; i++) {
    if (!tradingLike.test(winKeys[i])) continue;
    var type;
    try { type = typeof window[winKeys[i]]; } catch (e) { type = 'unreadable'; }
    windowMatches.push({ name: winKeys[i], type: type });
  }
  return {
    tradingViewApiKeys: describeKeys(window.TradingViewApi),
    tradingViewKeys: describeKeys(window.TradingView),
    windowKeysMatchingTradingTerms: windowMatches,
  };
})()
`;

// Which members of the known namespaces expose trading-like methods.
const SERVICE_SCAN_PROBE = `
(function () {
  var tradingMethod = /order|position|account|broker|execut|trade|margin|leverage|commission|balance|equity|bracket|stop|profit/i;
  var tradingKey = /trad|brok|order|account|paper|execut/i;
  function methodNames(obj) {
    var names = [];
    for (var k in obj) {
      try { if (typeof obj[k] === 'function') names.push(k); } catch (e) { /* unreadable member */ }
    }
    return names;
  }
  function describeService(path, value) {
    var methods = methodNames(value);
    var matches = methods.filter(function (m) { return tradingMethod.test(m); });
    if (matches.length === 0) return null;
    return {
      path: path,
      methodCount: methods.length,
      tradingLikeMethods: matches.slice(0, 40),
      allMethods: methods.slice(0, 80),
    };
  }
  function scanNamespace(nsName, ns, findings) {
    if (!ns) return;
    var keys = Object.getOwnPropertyNames(ns);
    for (var i = 0; i < keys.length; i++) {
      var value;
      try { value = ns[keys[i]]; } catch (e) { continue; }
      if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
      var found = describeService(nsName + '.' + keys[i], value);
      if (found) findings.push(found);
      // One level deeper, but only under trading-suggestive names, to keep the scan bounded.
      if (typeof value === 'object' && tradingKey.test(keys[i])) {
        var subKeys = Object.getOwnPropertyNames(value);
        for (var j = 0; j < subKeys.length; j++) {
          var sub;
          try { sub = value[subKeys[j]]; } catch (e) { continue; }
          if (!sub || typeof sub !== 'object') continue;
          var subFound = describeService(nsName + '.' + keys[i] + '.' + subKeys[j], sub);
          if (subFound) findings.push(subFound);
        }
      }
    }
  }
  var findings = [];
  scanNamespace('window.TradingViewApi', window.TradingViewApi, findings);
  scanNamespace('window.TradingView', window.TradingView, findings);
  return { services: findings.slice(0, 40) };
})()
`;

// Does the bottom widget bar know about a trading widget?
const BOTTOM_WIDGET_BAR_PROBE = `
(function () {
  var bwb = window.TradingView && window.TradingView.bottomWidgetBar;
  if (!bwb) return { available: false };
  var methods = [];
  var objectMembers = [];
  for (var k in bwb) {
    var value;
    try { value = bwb[k]; } catch (e) { continue; }
    if (typeof value === 'function') {
      methods.push(k);
    } else if (value && typeof value === 'object') {
      objectMembers.push({ name: k, keys: Object.getOwnPropertyNames(value).slice(0, 30) });
    }
  }
  return { available: true, methods: methods, objectMembers: objectMembers.slice(0, 10) };
})()
`;

// What the Trading Panel button and panel areas currently expose in the DOM.
const TRADING_PANEL_DOM_PROBE = `
(function () {
  function attrInventory(root, attr, cap) {
    var seen = {};
    var out = [];
    if (!root) return out;
    var nodes = root.querySelectorAll('[' + attr + ']');
    for (var i = 0; i < nodes.length && out.length < cap; i++) {
      var value = nodes[i].getAttribute(attr);
      if (value && !seen[value]) { seen[value] = true; out.push(value); }
    }
    return out;
  }
  function visibleButtonLabels(root, cap) {
    var out = [];
    if (!root) return out;
    var btns = root.querySelectorAll('button');
    for (var i = 0; i < btns.length && out.length < cap; i++) {
      if (btns[i].offsetParent === null) continue;
      var label = (btns[i].getAttribute('aria-label') || btns[i].textContent || '').trim();
      if (label && label.length <= 60) out.push(label);
    }
    return out;
  }
  var tradingButton = document.querySelector('[data-name="trading-button"]')
    || document.querySelector('[aria-label="Trading Panel"]');
  var bottomArea = document.querySelector('[class*="layout__area--bottom"]');
  var rightArea = document.querySelector('[class*="layout__area--right"]');
  var bottomText = bottomArea ? bottomArea.textContent : '';
  return {
    tradingButton: tradingButton ? {
      found: true,
      dataName: tradingButton.getAttribute('data-name'),
      ariaLabel: tradingButton.getAttribute('aria-label'),
      ariaPressed: tradingButton.getAttribute('aria-pressed'),
    } : { found: false },
    bottomArea: {
      present: !!bottomArea,
      height: bottomArea ? bottomArea.offsetHeight : 0,
      dataNames: attrInventory(bottomArea, 'data-name', 100),
      roles: attrInventory(bottomArea, 'role', 30),
      buttonLabels: visibleButtonLabels(bottomArea, 60),
      mentionsPaperTrading: /paper trading/i.test(bottomText),
    },
    rightArea: {
      present: !!rightArea,
      width: rightArea ? rightArea.offsetWidth : 0,
      dataNames: attrInventory(rightArea, 'data-name', 60),
    },
  };
})()
`;

// --- Output sanitization (keeps the report safe to share and to commit) ---

const SECRET_KEY_PATTERN = /token|cookie|secret|password|auth|session/i;
const TOKEN_LIKE_VALUE = /^[A-Za-z0-9+/=_-]{40,}$/;
const MAX_STRING_LENGTH = 200;

export function sanitizeForReport(value) {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeForReport);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, member] of Object.entries(value)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeForReport(member);
    }
    return out;
  }
  return value;
}

function sanitizeString(str) {
  if (TOKEN_LIKE_VALUE.test(str)) return '[REDACTED-TOKEN-LIKE]';
  if (str.length > MAX_STRING_LENGTH) return str.slice(0, MAX_STRING_LENGTH) + '…';
  return str;
}

// --- Probe execution ---

async function runProbe(expression) {
  try {
    return await evaluate(expression);
  } catch (err) {
    return { error: err.message };
  }
}

async function collectMeta() {
  const target = await getTargetInfo();
  const url = target?.url ? new URL(target.url) : null;
  return {
    generated_at: new Date().toISOString(),
    cdp_endpoint: `${CDP_HOST}:${CDP_PORT}`,
    target_url: url ? `${url.origin}${url.pathname}` : null,
    user_agent: await runProbe('navigator.userAgent'),
  };
}

async function main() {
  const report = {
    meta: await collectMeta(),
    namespaces: await runProbe(NAMESPACE_PROBE),
    trading_like_services: await runProbe(SERVICE_SCAN_PROBE),
    bottom_widget_bar: await runProbe(BOTTOM_WIDGET_BAR_PROBE),
    trading_panel_dom: await runProbe(TRADING_PANEL_DOM_PROBE),
  };
  process.stdout.write(JSON.stringify(sanitizeForReport(report), null, 2) + '\n');
  await disconnect();
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(async (err) => {
    console.error(`paper_discovery failed: ${err.message}`);
    await disconnect();
    process.exit(1);
  });
}
