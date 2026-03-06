import { ApplicationAssistantClient } from '../page';

export default function ApplicationAssistantAnalysisPage({ params }: { params: { id: string } }) {
  return <ApplicationAssistantClient initialAnalysisId={params.id} />;
}
