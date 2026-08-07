import { jsonResult } from './_format.js';
import * as core from '../core/paper.js';

export function registerPaperTools(server) {
  server.tool('paper_get_status', 'Report the current observability status of TradingView\'s native Paper Trading: desktop CDP connection, session state (authenticated/unauthenticated), paper_trading widget availability, broker connection state, and the active provider (structural info). Read-only. Provider identity is not yet verifiable, so provider_type stays unknown and safe_for_paper_mutation stays false (fail closed).', {}, async () => {
    try { return jsonResult(await core.getStatus()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
