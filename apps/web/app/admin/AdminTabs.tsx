'use client';

/** Admin layout: no tabs after scope pivot (Companies/Testing removed). */
export function AdminTabs({ children }: { children: React.ReactNode }) {
  return <div className="mt-4">{children}</div>;
}
