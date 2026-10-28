import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Trash2 } from 'lucide-react';
import { DropdownMenu, type MenuItem } from './dropdown-menu';

function renderMenu(overrides: { readonly onEdit?: () => void; readonly onDelete?: () => void } = {}): void {
  const items: ReadonlyArray<MenuItem> = [
    { key: 'edit', label: 'Изменить', icon: Pencil, onSelect: overrides.onEdit ?? jest.fn() },
    { key: 'open', label: 'Открыть', href: '/somewhere' },
    { key: 'delete', label: 'Удалить', icon: Trash2, destructive: true, onSelect: overrides.onDelete ?? jest.fn() },
  ];
  render(<><button type="button">До</button><DropdownMenu label="Действия: Иванов" items={items} /><button type="button">После</button></>);
}

describe('DropdownMenu', () => {
  it('should offer a button with an accessible name that announces a menu and is collapsed at first', () => {
    renderMenu();

    const button = screen.getByRole('button', { name: 'Действия: Иванов' });

    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should open a menu of items and focus the first one when the button is pressed', async () => {
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    expect(screen.getByRole('menu', { name: 'Действия: Иванов' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Изменить', 'Открыть', 'Удалить']);
    expect(screen.getByRole('menuitem', { name: 'Изменить' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Действия: Иванов' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('should open with the arrow key on the button', async () => {
    renderMenu();
    screen.getByRole('button', { name: 'Действия: Иванов' }).focus();

    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('menuitem', { name: 'Изменить' })).toHaveFocus();
  });

  it('should move between the items with the arrow keys and wrap around at the ends', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Открыть' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Изменить' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Изменить' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toHaveFocus();
  });

  it('should close on Escape and return the focus to the button', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Действия: Иванов' })).toHaveFocus();
  });

  it('should close when a click lands outside the menu', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    await userEvent.click(screen.getByRole('button', { name: 'После' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should run the action after the menu closed and the focus is back on the button when an item is chosen', async () => {
    const onEdit = jest.fn(() => expect(screen.getByRole('button', { name: 'Действия: Иванов' })).toHaveFocus());
    renderMenu({ onEdit });
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    await userEvent.click(screen.getByRole('menuitem', { name: 'Изменить' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should activate an item with Enter', async () => {
    const onDelete = jest.fn();
    renderMenu({ onDelete });
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    await userEvent.keyboard('{End}{Enter}');

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('should render a link item as a menu item that points at its address', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    expect(screen.getByRole('menuitem', { name: 'Открыть' })).toHaveAttribute('href', '/somewhere');
  });

  it('should write a destructive item in red with an icon so the meaning is not only a colour', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    const item = screen.getByRole('menuitem', { name: 'Удалить' });

    expect(item).toHaveClass('text-destructive');
    expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('menu')).toHaveClass('shadow-elev-2');
  });

  it('should close the menu and hand the focus back to the button when Tab is pressed inside it', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    await userEvent.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Действия: Иванов' })).toHaveFocus();
  });
});

describe('DropdownMenu and the viewport', () => {
  it('should stay open and follow its button when the page scrolls', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Действия: Иванов' }));

    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

describe('DropdownMenu as a profile menu', () => {
  function renderProfileMenu(onChoose: (value: string) => void = jest.fn()): void {
    const items: ReadonlyArray<MenuItem> = [
      { key: 'ru', label: 'Русский', heading: 'Язык', checked: true, onSelect: () => onChoose('ru') },
      { key: 'en', label: 'English', checked: false, onSelect: () => onChoose('en') },
      { key: 'out', label: 'Выйти', heading: 'Сеанс', onSelect: () => onChoose('out') },
    ];
    render(<DropdownMenu label="Профиль" items={items} trigger={<span>Иванова М.</span>} align="start" width={260} />);
  }

  it('should show the given content on the button instead of the dots and not force the square size on it', () => {
    renderProfileMenu();

    const button = screen.getByRole('button', { name: 'Профиль' });

    expect(button).toHaveTextContent('Иванова М.');
    expect(button).not.toHaveClass('size-11');
  });

  it('should offer a group as menu radios with the chosen one ticked and a caption above the group', async () => {
    renderProfileMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }));

    expect(screen.getByRole('menuitemradio', { name: 'Русский' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menu')).toHaveTextContent('Язык');
    expect(screen.getByRole('menu')).toHaveTextContent('Сеанс');
    expect(screen.getByRole('menu')).toHaveStyle({ width: '260px' });
  });

  it('should reach the radio items with the arrow keys and run the chosen one', async () => {
    const onChoose = jest.fn();
    renderProfileMenu(onChoose);
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }));

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onChoose).toHaveBeenCalledWith('en');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
