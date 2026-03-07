import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeepCompanyResearchPanel } from './DeepCompanyResearchPanel';
import { ContactOutreachPanel } from './ContactOutreachPanel';
import { ApplicationAnalysisQueuePanel } from './ApplicationAnalysisQueuePanel';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin</CardTitle>
          <p className="text-muted-foreground text-sm">
            Admin area. Scope is now Application Assistant, Profile, and Preferences only.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="deep-company-research" className="w-full">
            <TabsList className="w-full max-w-2xl flex-wrap">
              <TabsTrigger value="deep-company-research">Deep company research</TabsTrigger>
              <TabsTrigger value="contact-outreach">Contact / Outreach agent</TabsTrigger>
              <TabsTrigger value="application-analysis-queue">
                Application analysis (per user)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="deep-company-research" className="mt-6">
              <DeepCompanyResearchPanel />
            </TabsContent>
            <TabsContent value="contact-outreach" className="mt-6">
              <ContactOutreachPanel />
            </TabsContent>
            <TabsContent value="application-analysis-queue" className="mt-6">
              <ApplicationAnalysisQueuePanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
