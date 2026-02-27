import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin</CardTitle>
        <p className="text-muted-foreground text-sm">
          Admin area. Scope is now Application Assistant, Profile, and Preferences only.
        </p>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
