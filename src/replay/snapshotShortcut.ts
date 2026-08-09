import { createBinding, type BindingModifiers } from "../input/settings";

export interface SnapshotShortcutEvent extends BindingModifiers {
  code: string;
}

export function matchesSnapshotExitBinding(
  configured: string,
  event: SnapshotShortcutEvent,
): boolean {
  const pressed = createBinding(event.code, event);
  return configured === pressed || configured === event.code;
}
