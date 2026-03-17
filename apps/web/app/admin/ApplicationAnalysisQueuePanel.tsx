'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Trash2 } from 'lucide-react';

type QueueUser = {
  userId: string;
  email: string | null;
  name: string | null;
  priority: boolean;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
};

export function ApplicationAnalysisQueuePanel() {
  const [users, setUsers] = useState<QueueUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [priorityActionUserId, setPriorityActionUserId] = useState<string | null>(null);
  const [priorityPlayLoading, setPriorityPlayLoading] = useState(false);
  const [clearPriorityLoading, setClearPriorityLoading] = useState(false);

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/application-analysis-queue');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleStart(userId: string) {
    setActionUserId(userId);
    try {
      const res = await fetch('/api/admin/application-analysis-queue/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? 'Failed to start');
        return;
      }
      await fetchUsers();
    } finally {
      setActionUserId(null);
    }
  }

  async function handleStop(userId: string) {
    setActionUserId(userId);
    try {
      const res = await fetch('/api/admin/application-analysis-queue/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Failed to stop');
        return;
      }
      await fetchUsers();
    } finally {
      setActionUserId(null);
    }
  }

  async function handleTogglePriority(userId: string, nextPriority: boolean) {
    setPriorityActionUserId(userId);
    try {
      const res = await fetch('/api/admin/application-analysis-queue/priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, priority: nextPriority }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? 'Failed to update priority');
        return;
      }
      await fetchUsers();
    } finally {
      setPriorityActionUserId(null);
    }
  }

  async function handleStartPriorityRotation() {
    setPriorityPlayLoading(true);
    try {
      const res = await fetch('/api/admin/application-analysis-queue/start-priority', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? 'Failed to start priority rotation');
        return;
      }
    } finally {
      setPriorityPlayLoading(false);
    }
  }

  async function handleClearPriorityPending() {
    if (!window.confirm('Clear all pending items for priority users and stop the automation?')) {
      return;
    }
    setClearPriorityLoading(true);
    try {
      const res = await fetch('/api/admin/application-analysis-queue/clear-priority-pending', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? 'Failed to clear pending items');
        return;
      }
      await fetchUsers();
    } finally {
      setClearPriorityLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Application analysis (per user)</CardTitle>
          <p className="text-muted-foreground text-sm">
            Users who have uploaded a CSV of job URLs appear here. Use Play to start (or resume)
            processing their queue; use Hard stop to abort after the current job.
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No users with queue items yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Application analysis (per user)</CardTitle>
            <p className="text-muted-foreground text-sm">
              One row per user with at least one queue item. Play starts (or resumes) processing;
              Hard stop aborts after the current URL. Use priority controls to rotate across
              selected users.
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={priorityPlayLoading}
                  onClick={handleStartPriorityRotation}
                  aria-label="Play priority users"
                >
                  <Play className="h-4 w-4" />
                </Button>
                <span>Priority</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                disabled={clearPriorityLoading}
                onClick={handleClearPriorityPending}
                aria-label="Clear pending for priority users"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">User</th>
                <th className="text-right py-2 px-2">Pending</th>
                <th className="text-right py-2 px-2">Running</th>
                <th className="text-right py-2 px-2">Completed</th>
                <th className="text-right py-2 px-2">Failed</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-left py-2 pl-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-lg leading-none disabled:opacity-50"
                        disabled={priorityActionUserId === u.userId}
                        onClick={() => handleTogglePriority(u.userId, !u.priority)}
                        aria-label={u.priority ? 'Unset priority' : 'Set priority'}
                      >
                        {u.priority ? '★' : '☆'}
                      </button>
                      <span className="font-medium">{u.email ?? u.name ?? u.userId}</span>
                    </div>
                    {u.name && u.email && (
                      <span className="text-muted-foreground ml-1">({u.name})</span>
                    )}
                  </td>
                  <td className="text-right py-2 px-2">{u.pending}</td>
                  <td className="text-right py-2 px-2">{u.running}</td>
                  <td className="text-right py-2 px-2">{u.completed}</td>
                  <td className="text-right py-2 px-2">{u.failed}</td>
                  <td className="text-right py-2 px-2">{u.total}</td>
                  <td className="py-2 pl-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={(u.pending === 0 && u.running === 0) || actionUserId === u.userId}
                      onClick={() => handleStart(u.userId)}
                    >
                      Play
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={u.running === 0 || actionUserId === u.userId}
                      onClick={() => handleStop(u.userId)}
                    >
                      Hard stop
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
