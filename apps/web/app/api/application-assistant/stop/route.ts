import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import {
  getAssistantStatus,
  clearAssistantRunning,
  setAssistantStep,
} from '@/lib/application-assistant-state';

export async function POST() {
  try {
    await getRequiredUserId();
    const status = getAssistantStatus();
    if (!status.running) {
      return NextResponse.json({ ok: false, message: 'Not running' });
    }
    setAssistantStep('idle');
    clearAssistantRunning();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
