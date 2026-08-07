/**
 * Tests for the Paper Trading discovery probe (scripts/paper_discovery.js).
 * Covers the report sanitizer (secret redaction) and a source audit that the
 * injected probes never touch cookies or web storage.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeForReport } from '../scripts/paper_discovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── sanitizeForReport() — secret redaction ──────────────────────────────

describe('sanitizeForReport() — secret redaction', () => {
  it('passes through primitives untouched', () => {
    assert.equal(sanitizeForReport(42), 42);
    assert.equal(sanitizeForReport(true), true);
    assert.equal(sanitizeForReport(null), null);
    assert.equal(sanitizeForReport('short string'), 'short string');
  });

  it('redacts values under secret-looking keys but keeps the key visible', () => {
    const report = sanitizeForReport({
      authToken: 'abc',
      session_id: 'xyz',
      Cookie: 'a=b',
      password: 'hunter2',
      dataName: 'trading-button',
    });
    assert.equal(report.authToken, '[REDACTED]');
    assert.equal(report.session_id, '[REDACTED]');
    assert.equal(report.Cookie, '[REDACTED]');
    assert.equal(report.password, '[REDACTED]');
    assert.equal(report.dataName, 'trading-button');
  });

  it('redacts token-like string values regardless of key name', () => {
    const tokenLike = 'A'.repeat(20) + 'b1-_'.repeat(10);
    const report = sanitizeForReport({ note: tokenLike });
    assert.equal(report.note, '[REDACTED-TOKEN-LIKE]');
  });

  it('does not treat normal sentences as token-like', () => {
    const sentence = 'Paper Trading is currently disconnected from the panel';
    assert.equal(sanitizeForReport(sentence), sentence);
  });

  it('truncates overly long strings', () => {
    const long = 'word '.repeat(100);
    const result = sanitizeForReport(long);
    assert.ok(result.length < long.length);
    assert.ok(result.endsWith('…'));
  });

  it('recurses through nested objects and arrays', () => {
    const report = sanitizeForReport({
      services: [{ path: 'window.TradingViewApi._x', accessToken: 'zzz' }],
    });
    assert.equal(report.services[0].path, 'window.TradingViewApi._x');
    assert.equal(report.services[0].accessToken, '[REDACTED]');
  });
});

// ── Source audit — probes must never read secret material ───────────────

describe('paper_discovery.js — source audit', () => {
  const source = readFileSync(join(__dirname, '..', 'scripts', 'paper_discovery.js'), 'utf8');

  for (const forbidden of ['document.cookie', 'localStorage', 'sessionStorage', 'indexedDB']) {
    it(`never references ${forbidden}`, () => {
      assert.ok(!source.includes(forbidden), `probe script must not access ${forbidden}`);
    });
  }
});
