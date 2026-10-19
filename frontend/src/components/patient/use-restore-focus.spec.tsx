import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRestoreFocus } from './use-restore-focus';

interface HarnessProps {
  readonly withList: boolean;
  /** Whether the refresh removes the pressed button (an item that leaves the "unread" list) or leaves it in place. */
  readonly removesButton: boolean;
}

/** The refresh that follows the action bumps the version, and may remove the button that was pressed. */
function Harness({ withList, removesButton }: HarnessProps): ReactNode {
  const [version, setVersion] = useState(1);
  const [hasButton, setHasButton] = useState(true);
  const list = useRef<HTMLUListElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const begin = useRestoreFocus(version, list, panel);
  const run = (): void => {
    const done = begin();
    setHasButton(!removesButton);
    setVersion(2);
    done();
  };
  const button: ReactNode = hasButton ? <button type="button" onClick={run}>Отметить</button> : 'готово';
  return (
    <div ref={panel} tabIndex={-1} aria-label="panel" role="group">
      {withList ? <ul ref={list} tabIndex={-1} aria-label="list"><li>{button}</li></ul> : <p>{button}</p>}
    </div>
  );
}

describe('useRestoreFocus', () => {
  it('should focus the list when the pressed button is gone after the refresh and the list still exists', async () => {
    render(<Harness withList removesButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Отметить' }));

    expect(screen.getByRole('list', { name: 'list' })).toHaveFocus();
  });

  it('should focus the panel when the pressed button is gone and the list is gone with it', async () => {
    render(<Harness withList={false} removesButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Отметить' }));

    expect(screen.getByRole('group', { name: 'panel' })).toHaveFocus();
  });

  it('should leave the focus alone when it is still on a real element after the refresh', async () => {
    render(<Harness withList removesButton={false} />);
    const button = screen.getByRole('button', { name: 'Отметить' });

    await userEvent.click(button);

    expect(button).toHaveFocus();
  });

  it('should not take the focus when nothing was started', () => {
    render(<Harness withList removesButton />);

    expect(document.body).toHaveFocus();
  });
});
