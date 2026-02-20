/**
 * Shared types and interfaces for all agents.
 */

import type { ZodType, ZodTypeDef } from 'zod';

export interface AgentContext {
  userId?: string;
  runId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  context: AgentContext;
}

export interface AgentConfig {
  name: string;
  description: string;
  version: string;
  timeout?: number;
  retries?: number;
}

export interface Agent<TInput, TOutput> {
  config: AgentConfig;
  inputSchema: ZodType<TInput, ZodTypeDef, unknown>;
  outputSchema: ZodType<TOutput, ZodTypeDef, unknown>;
  execute(input: TInput, context?: Partial<AgentContext>): Promise<AgentResult<TOutput>>;
}

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface AgentLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
}
