/**
 * wrap-text — the classes that keep free text a patient (or a doctor) typed from stretching the layout.
 *
 * A reason of 500 characters without a space has no break opportunity, so a grid or flex item grows to its width and pushes
 * every sibling off the screen. `overflow-wrap:anywhere` (unlike `break-word`) also lowers the item's min-content size, and
 * `min-w-0` lets a grid or flex item shrink below that size. Put it on the element that prints the text.
 */
export const WRAP_TEXT = 'min-w-0 break-words [overflow-wrap:anywhere]';
