import type { AtsType } from '../fingerprint';
import type { Connector } from './types';
import { greenhouseConnector } from './greenhouse';
import { leverConnector } from './lever';
import { ashbyConnector } from './ashby';
import { smartRecruitersConnector } from './smartrecruiters';
import { recruiteeConnector } from './recruitee';
import { personioConnector } from './personio';
import { workdayConnector } from './workday';

const registry: Partial<Record<AtsType, Connector>> = {
  GREENHOUSE: greenhouseConnector,
  LEVER: leverConnector,
  ASHBY: ashbyConnector,
  SMARTRECRUITERS: smartRecruitersConnector,
  RECRUITEE: recruiteeConnector,
  PERSONIO: personioConnector,
  WORKDAY: workdayConnector,
};

export function getConnector(atsType: AtsType): Connector | null {
  return registry[atsType] ?? null;
}

export function getConnectorOrThrow(atsType: AtsType): Connector {
  const c = getConnector(atsType);
  if (!c) throw new Error(`No connector for ATS type: ${atsType}`);
  return c;
}
