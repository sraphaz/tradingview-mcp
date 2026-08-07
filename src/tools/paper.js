import { jsonResult } from './_format.js';
import * as core from '../core/paper.js';

export function registerPaperTools(server) {
  server.tool('paper_get_status', 'Report the current observability status of TradingView\'s native Paper Trading: desktop CDP connection and Trading Panel button state. Read-only. Facts that still require runtime discovery (session, provider identity, accounts) are returned as unknown/null, and safe_for_paper_mutation is false until the native Paper Trading provider can be positively identified.', {}, async () => {
    try { return jsonResult(await core.getStatus()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
