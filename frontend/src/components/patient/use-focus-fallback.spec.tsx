import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFocusFallback } from './use-focus-fallback';

function Harness(): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const [hasTrigger, setHasTrigger] = useState(true);
  const fallback = useRef<HTMLHeadingElement>(null);
  useFocusFallback(isOpen, fallback);
  return (
    <div>
      <h1 ref={fallback} tabIndex={-1}>Заголовок</h1>
      {hasTrigger ? <button type="button" onClick={() => setIsOpen(true)}>Открыть</button> : null}
      {isOpen ? <button type="button" onClick={() => { setIsOpen(false); setHasTrigger(false); }}>Закрыть</button> : null}
    </div>
  );
}

describe('useFocusFallback', () => {
  it('should not take the focus when the page first appears', () => {
    render(<Harness />);

    expect(document.body).toHaveFocus();
  });

  it('should hand the focus to the fallback when the dialog closes and the trigger is gone', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Закрыть' }));

    expect(screen.getByRole('heading', { name: 'Заголовок' })).toHaveFocus();
  });
});
