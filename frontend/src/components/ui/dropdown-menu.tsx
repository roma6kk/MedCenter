'use client';

import { Fragment, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { useFloatingPosition, type FloatingAlign } from './floating';

export interface MenuItem {
  readonly key: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly destructive?: boolean;
  readonly onSelect?: () => void;
  readonly href?: string;
  readonly ariaLabel?: string;
  readonly checked?: boolean;
  readonly heading?: string;
}

interface DropdownMenuProps {
  readonly label: string;
  readonly items: ReadonlyArray<MenuItem>;
  readonly className?: string;
  readonly trigger?: ReactNode;
  readonly align?: FloatingAlign;
  readonly width?: number;
}

const DEFAULT_MENU_WIDTH_PX = 224;
const ITEM_BASE =
  'flex min-h-[44px] w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium outline-none transition-[background-color,color] duration-fast ease-out focus-visible:bg-secondary hover:bg-secondary';

function itemsOf(menu: HTMLElement | null): ReadonlyArray<HTMLElement> {
  return menu === null ? [] : Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'));
}

function focusAt(items: ReadonlyArray<HTMLElement>, index: number): void {
  items[(index + items.length) % items.length]?.focus();
}

function handleMenuKey(event: KeyboardEvent<HTMLElement>, menu: HTMLElement | null, close: (restoreFocus: boolean) => void): void {
  const items: ReadonlyArray<HTMLElement> = itemsOf(menu);
  const index: number = items.findIndex((item) => item === document.activeElement);
  const keyTarget: Readonly<Record<string, number>> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 };
  const target: number | undefined = keyTarget[event.key];
  if (target !== undefined) {
    event.preventDefault();
    focusAt(items, target);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  } else if (event.key === 'Tab') {
    // The menu lives at the end of body: native Tab would leave the page, so focus goes back to the button.
    event.preventDefault();
    close(true);
  }
}

interface MenuPanelProps {
  readonly id: string;
  readonly triggerId: string;
  readonly trigger: HTMLElement | null;
  readonly items: ReadonlyArray<MenuItem>;
  readonly onClose: (restoreFocus: boolean) => void;
  readonly onSelect: (item: MenuItem) => void;
  readonly align: FloatingAlign;
  readonly width: number;
}

function MenuItemView({ item, onSelect }: { readonly item: MenuItem; readonly onSelect: (item: MenuItem) => void }): ReactNode {
  const Icon = item.icon;
  const isChoice: boolean = item.checked !== undefined;
  const className: string = cn(ITEM_BASE, item.destructive ? 'text-destructive hover:bg-destructive-soft focus-visible:bg-destructive-soft' : 'text-foreground');
  const content: ReactNode = (
    <>
      {Icon === undefined ? null : <Icon aria-hidden="true" className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1">{item.label}</span>
      {isChoice ? <Check aria-hidden="true" className={cn('size-4 shrink-0 text-primary', item.checked ? 'opacity-100' : 'opacity-0')} /> : null}
    </>
  );
  if (item.href !== undefined) {
    return (
      <Link href={item.href} role="menuitem" tabIndex={-1} aria-label={item.ariaLabel} onClick={() => onSelect(item)} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role={isChoice ? 'menuitemradio' : 'menuitem'}
      aria-checked={isChoice ? item.checked : undefined}
      tabIndex={-1}
      aria-label={item.ariaLabel}
      onClick={() => onSelect(item)}
      className={className}
    >
      {content}
    </button>
  );
}

function MenuPanel({ id, triggerId, trigger, items, onClose, onSelect, align, width }: MenuPanelProps): ReactNode {
  const menu = useRef<HTMLDivElement>(null);
  const position = useFloatingPosition({ anchor: trigger, panel: menu, align, width, onOutsidePress: () => onClose(false) });
  useLayoutEffect(() => {
    itemsOf(menu.current)[0]?.focus();
  }, []);
  return createPortal(
    <div
      ref={menu}
      id={id}
      role="menu"
      aria-labelledby={triggerId}
      onKeyDown={(event) => handleMenuKey(event, menu.current, onClose)}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, width }}
      className={cn('fixed z-50 animate-menu-in rounded-card border border-border bg-card p-1 shadow-elev-2', position === null && 'opacity-0')}
    >
      {items.map((item) => (
        <Fragment key={item.key}>
          {item.heading === undefined ? null : (
            <div role="presentation" className="mt-1 border-t border-border-soft px-3 pb-1 pt-2.5 text-xs font-semibold text-muted-foreground first:mt-0 first:border-t-0">
              {item.heading}
            </div>
          )}
          <MenuItemView item={item} onSelect={onSelect} />
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}

export function DropdownMenu({ label, items, className, trigger: triggerContent, align = 'end', width = DEFAULT_MENU_WIDTH_PX }: DropdownMenuProps): ReactNode {
  const menuId = useId();
  const triggerId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback((restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  const select = (item: MenuItem): void => {
    close(item.href === undefined);
    item.onSelect?.();
  };
  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
    }
  };
  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={onTriggerKey}
        className={cn(
          'inline-flex items-center justify-center rounded-control text-muted-foreground transition-[background-color,color] duration-fast ease-out hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground',
          triggerContent === undefined && 'size-11',
          className,
        )}
      >
        {triggerContent ?? <MoreHorizontal aria-hidden="true" className="size-5" />}
      </button>
      {isOpen ? <MenuPanel id={menuId} triggerId={triggerId} trigger={trigger.current} items={items} onClose={close} onSelect={select} align={align} width={width} /> : null}
    </>
  );
}
