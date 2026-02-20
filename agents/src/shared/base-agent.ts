/**
 * Base agent class providing common functionality for all agents.
 */

import type { ZodType, ZodTypeDef } from 'zod';
import type { Agent, AgentConfig, AgentContext, AgentResult, AgentLog } from './types.js';

export abstract class BaseAgent<TInput, TOutput> implements Agent<TInput, TOutput> {
  abstract config: AgentConfig;
  abstract inputSchema: ZodType<TInput, ZodTypeDef, unknown>;
  abstract outputSchema: ZodType<TOutput, ZodTypeDef, unknown>;

  protected logs: AgentLog[] = [];

  protected log(level: AgentLog['level'], message: string, data?: unknown): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
      data,
    });

    if (process.env.LOG_LEVEL === 'debug' || level === 'error') {
      console.log(`[${this.config.name}] [${level.toUpperCase()}] ${message}`, data ?? '');
    }
  }

  protected debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  protected info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  protected warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  protected error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  async execute(input: TInput, context?: Partial<AgentContext>): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    this.logs = [];

    const fullContext: AgentContext = {
      timestamp: new Date(),
      ...context,
    };

    this.info(`Starting execution`, { input });

    try {
      // Validate input
      const validatedInput = this.inputSchema.parse(input);

      // Run the agent's main logic
      const output = await this.run(validatedInput, fullContext);

      // Validate output
      const validatedOutput = this.outputSchema.parse(output);

      const duration = Date.now() - startTime;
      this.info(`Completed successfully`, { duration });

      return {
        success: true,
        data: validatedOutput,
        duration,
        context: fullContext,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.error(`Execution failed: ${errorMessage}`, err);

      return {
        success: false,
        error: errorMessage,
        duration,
        context: fullContext,
      };
    }
  }

  /**
   * Abstract method to be implemented by each agent.
   * Contains the core agent logic.
   */
  protected abstract run(input: TInput, context: AgentContext): Promise<TOutput>;

  /**
   * Get execution logs.
   */
  getLogs(): AgentLog[] {
    return [...this.logs];
  }
}
