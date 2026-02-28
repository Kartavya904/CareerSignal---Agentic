import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeepCompanyResearchPanel } from './DeepCompanyResearchPanel';
import { ContactOutreachPanel } from './ContactOutreachPanel';

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
            <TabsList className="w-full max-w-md">
              <TabsTrigger value="deep-company-research">Deep company research</TabsTrigger>
              <TabsTrigger value="contact-outreach">Contact / Outreach agent</TabsTrigger>
            </TabsList>
            <TabsContent value="deep-company-research" className="mt-6">
              <DeepCompanyResearchPanel />
            </TabsContent>
            <TabsContent value="contact-outreach" className="mt-6">
              <ContactOutreachPanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
