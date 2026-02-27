/**
 * SmartRecruiters connector (scaffold).
 *
 * SmartRecruiters' Posting API requires an API key (X-SmartToken) and is not purely public.
 * This connector is wired into the registry but will return a clear error until
 * per-company API configuration (e.g. { apiKey, companyId } in connectorConfig) is provided.
 */

import type { Connector, ConnectorResult, ConnectorConfig, TestBudget } from './types';
import type { AtsType } from '../fingerprint';

const SMARTRECRUITERS_ATS: AtsType = 'SMARTRECRUITERS';

export const smartRecruitersConnector: Connector = {
  atsType: SMARTRECRUITERS_ATS,

  async fetch(_config: ConnectorConfig, _budget?: TestBudget | null): Promise<ConnectorResult> {
    return {
      jobs: [],
      evidencePath: '',
      errors: [
        'SmartRecruiters connector is not fully configured. It requires an API key and company configuration to access the Posting API.',
      ],
    };
  },
};
