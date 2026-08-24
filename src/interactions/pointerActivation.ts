/**
 * Shared raw-pointer eligibility guard.
 *
 * Primary semantic actions are only allowed to start from the primary button
 * and the primary pointer contact. Keeping this pure lets mouse, pointer and
 * React synthetic events share exactly the same policy without coupling the
 * guard to React, DOM, stores or command execution.
 */
export type PointerActivationLike = Readonly<{
  button: number;
  isPrimary?: boolean;
}>;

export const isPrimaryPointerActivation = (
  event: PointerActivationLike,
): boolean => event.button === 0 && event.isPrimary !== false;
