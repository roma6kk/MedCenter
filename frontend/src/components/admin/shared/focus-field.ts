/** Puts the keyboard focus on the control with this id, so a failed submit lands the user on what to fix (WCAG 3.3.1). */
export function focusField(id: string): void {
  document.getElementById(id)?.focus();
}
