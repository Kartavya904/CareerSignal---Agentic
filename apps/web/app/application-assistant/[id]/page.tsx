import ApplicationAssistantPage from '../page';

export default function ApplicationAssistantAnalysisPage({ params }: { params: { id: string } }) {
  return <ApplicationAssistantPage initialAnalysisId={params.id} />;
}
