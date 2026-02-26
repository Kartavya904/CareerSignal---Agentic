/**
 * @careersignal/core — shared constants and utilities
 */

export const APP_NAME = 'CareerSignal';
export const DEFAULT_TOP_K = 15;

export {
  fingerprintFromUrl,
  type AtsType,
  type ScrapeStrategy,
  type FingerprintResult,
} from './fingerprint';
export { normalizeUrlForDedupe, computeDedupeKey } from './dedupe';
export {
  getConnector,
  getConnectorOrThrow,
  greenhouseConnector,
  normalizeGreenhouseJobExport,
  fetchGreenhouseBoardExport,
  type CanonicalJob,
  type Connector,
  type ConnectorResult,
  type ConnectorConfig,
  type TestBudget,
  type JobRemoteType,
  type JobStatus,
} from './connectors';
