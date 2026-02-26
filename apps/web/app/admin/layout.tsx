import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminTabs } from './AdminTabs';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || !user.admin) {
    redirect('/');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      </div>
      <AdminTabs>{children}</AdminTabs>
    </div>
  );
}
