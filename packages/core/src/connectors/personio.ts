/**
 * Personio connector (scaffold).
 *
 * Personio offers a public XML feed at https://{account}.jobs.personio.de/xml.
 * Parsing XML and mapping fields can be added later; for now this connector
 * returns a descriptive error until a specific account/feed URL strategy is decided.
 */

import type { Connector, ConnectorResult, ConnectorConfig, TestBudget } from './types';
import type { AtsType } from '../fingerprint';

const PERSONIO_ATS: AtsType = 'PERSONIO';

export const personioConnector: Connector = {
  atsType: PERSONIO_ATS,

  async fetch(_config: ConnectorConfig, _budget?: TestBudget | null): Promise<ConnectorResult> {
    return {
      jobs: [],
      evidencePath: '',
      errors: [
        'Personio connector is not implemented yet. It will need to fetch and parse XML from {account}.jobs.personio.de/xml with a defined mapping.',
      ],
    };
  },
};
