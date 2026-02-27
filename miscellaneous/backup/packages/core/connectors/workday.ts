/**
 * Workday connector (scaffold).
 *
 * Official Workday Recruiting APIs require authentication and tenant-specific configuration.
 * Some public job boards on myworkdayjobs.com can be scraped via HTML/JSON, but this requires
 * per-tenant heuristics. For now this connector is a placeholder that returns a descriptive error
 * until a concrete strategy is chosen.
 */

import type { Connector, ConnectorResult, ConnectorConfig, TestBudget } from './types';
import type { AtsType } from '../fingerprint';

const WORKDAY_ATS: AtsType = 'WORKDAY';

export const workdayConnector: Connector = {
  atsType: WORKDAY_ATS,

  async fetch(_config: ConnectorConfig, _budget?: TestBudget | null): Promise<ConnectorResult> {
    return {
      jobs: [],
      evidencePath: '',
      errors: [
        'Workday connector is not implemented yet. It requires tenant-specific configuration and/or an authenticated API strategy.',
      ],
    };
  },
};
