'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function AdminTabs({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const value = pathname.startsWith('/admin/companies') ? 'companies' : 'testing';

  return (
    <Tabs value={value} className="w-full">
      <TabsList className="bg-muted w-fit">
        <TabsTrigger value="testing" asChild>
          <Link href="/admin">Testing</Link>
        </TabsTrigger>
        <TabsTrigger value="companies" asChild>
          <Link href="/admin/companies">Companies</Link>
        </TabsTrigger>
      </TabsList>
      <div className="mt-4">{children}</div>
    </Tabs>
  );
}
