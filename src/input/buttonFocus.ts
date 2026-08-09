import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Pointer-clicked controls must not retain focus and swallow gameplay keys.
 * Keyboard navigation is unaffected because this runs only after pointer input.
 */
export function releaseGameplayButtonFocus(event: ReactPointerEvent<HTMLElement>): void {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button");
  if (!button || button.classList.contains("key-capture")) return;
  button.blur();
}
