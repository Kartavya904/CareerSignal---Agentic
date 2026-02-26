import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user || !user.admin) {
    redirect('/');
  }

  return (
    <div className="page-head">
      <h1>Admin</h1>
      <p>
        Admin-only area. You&apos;ll implement new admin tools and source-by-source testing here as
        part of the new scope.
      </p>
    </div>
  );
}
