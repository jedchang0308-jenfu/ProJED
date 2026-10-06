import { guardTaskAction, type TaskActionGuardInput } from './taskActionGuards';
import type { InteractionContext, TaskActionId, TaskCommandOutcome, TaskCommandStatus } from './types';

export type TaskCommandHandler = (
  context: InteractionContext,
) => void | TaskCommandStatus | Promise<void | TaskCommandStatus>;

export type TaskCommandDependencies = Partial<Record<TaskActionId, TaskCommandHandler>>;

export type TaskCommandExecutor = {
  execute: (
    context: InteractionContext,
    actionId: TaskActionId,
    guardInput?: TaskActionGuardInput,
  ) => Promise<TaskCommandOutcome>;
  clear: () => void;
};

const DEFAULT_DEDUPE_TTL_MS = 30_000;
const DEFAULT_DEDUPE_LIMIT = 512;

export const createTaskCommandExecutor = (
  dependencies: TaskCommandDependencies,
  options: { now?: () => number; ttlMs?: number; maxEntries?: number } = {},
): TaskCommandExecutor => {
  const now = options.now || (() => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_DEDUPE_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_DEDUPE_LIMIT;
  const executedInteractions = new Map<string, number>();

  const prune = (timestamp: number) => {
    for (const [key, createdAt] of executedInteractions) {
      if (timestamp - createdAt > ttlMs) executedInteractions.delete(key);
    }
    while (executedInteractions.size > maxEntries) {
      const oldestKey = executedInteractions.keys().next().value;
      if (!oldestKey) break;
      executedInteractions.delete(oldestKey);
    }
  };

  const execute = async (
    context: InteractionContext,
    actionId: TaskActionId,
    guardInput: TaskActionGuardInput = {},
  ): Promise<TaskCommandOutcome> => {
    const timestamp = now();
    prune(timestamp);
    const dedupeKey = `${context.interactionId}:${actionId}`;
    if (executedInteractions.has(dedupeKey)) {
      return { interactionId: context.interactionId, actionId, status: 'noop', reason: 'duplicate-interaction' };
    }

    const guardResult = guardTaskAction(actionId, guardInput);
    if (!guardResult.allowed) {
      return { interactionId: context.interactionId, actionId, status: 'denied', reason: guardResult.reason };
    }

    const handler = dependencies[actionId];
    if (!handler) {
      return { interactionId: context.interactionId, actionId, status: 'noop', reason: 'no-command-handler' };
    }

    executedInteractions.set(dedupeKey, timestamp);
    try {
      const result = await handler(context);
      return {
        interactionId: context.interactionId,
        actionId,
        status: result || 'executed',
      };
    } catch (error) {
      executedInteractions.delete(dedupeKey);
      return {
        interactionId: context.interactionId,
        actionId,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'command-failed',
      };
    }
  };

  return {
    execute,
    clear: () => executedInteractions.clear(),
  };
};
