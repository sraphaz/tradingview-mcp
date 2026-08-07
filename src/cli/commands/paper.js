import { register } from '../router.js';
import * as core from '../../core/paper.js';

register('paper', {
  description: 'TradingView native Paper Trading (read-only observability)',
  subcommands: new Map([
    ['status', {
      description: 'Show Paper Trading observability status (desktop, Trading Panel, discovery state)',
      handler: () => core.getStatus(),
    }],
  ]),
});
