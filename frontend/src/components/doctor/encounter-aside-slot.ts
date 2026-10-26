'use client';

import { createContext } from 'react';

/**
 * The element at the top of the encounter screen's side column. The form owns the state the section navigator shows, but the
 * column is laid out by the screen around it, so the screen offers this element and the form draws the navigator into it
 * (a portal keeps the form's context). `null` where there is no column (the form on its own, the narrow layout).
 */
export const EncounterAsideSlotContext = createContext<HTMLElement | null>(null);
