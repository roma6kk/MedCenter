import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { FileDrop, formatFileSize } from './file-drop';
import { createTranslate } from '@/lib/i18n/translate';

const TYPES: ReadonlyArray<string> = ['application/pdf', 'image/png'];
const MAX = 1024 * 1024;

function pdf(name = 'form.pdf', size = 2048): File {
  const file = new File(['%PDF'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function Harness({ onChange }: { readonly onChange?: (file: File | null) => void }): ReactNode {
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <label htmlFor="scan">Скан</label>
      <FileDrop
        id="scan"
        value={file}
        accept={TYPES}
        maxBytes={MAX}
        onChange={(next) => {
          setFile(next);
          onChange?.(next);
        }}
      />
    </>
  );
}

const input = (): HTMLInputElement => screen.getByLabelText('Скан', { selector: 'input' }) as HTMLInputElement;
const zone = (): Element => screen.getByText('Перетащите файл сюда или').closest('div[class*="border-dashed"]')!;
const drop = (file: File): void => {
  fireEvent.drop(zone(), { dataTransfer: { files: [file] } });
};

describe('FileDrop', () => {
  it('should offer the picker through a native file input limited to the accepted types when nothing is chosen', () => {
    render(<Harness />);

    expect(input()).toHaveAttribute('type', 'file');
    expect(input()).toHaveAttribute('accept', 'application/pdf,image/png');
    expect(screen.getByText('Выбрать файл')).toBeInTheDocument();
    expect(screen.getByText('Подходят: PDF, PNG, до 1 МБ.')).toBeInTheDocument();
  });

  it('should show the name, size and type of the file when one is picked', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.upload(input(), pdf('form.pdf', 2048));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText('form.pdf')).toBeInTheDocument();
    expect(screen.getByText(/2 КБ/)).toBeInTheDocument();
    expect(screen.getByText(/· PDF/)).toBeInTheDocument();
  });

  it('should take a dropped file when it is accepted', () => {
    render(<Harness />);

    drop(pdf('dropped.pdf'));

    expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
  });

  it('should refuse a dropped file of a wrong type and say which types fit', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    drop(new File(['x'], 'a.gif', { type: 'image/gif' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Этот тип файла не подходит. Подходят: PDF, PNG.');
    expect(onChange).not.toHaveBeenCalled();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
  });

  it('should refuse a file that is too large and say the limit', () => {
    render(<Harness />);

    drop(pdf('big.pdf', MAX + 1));

    expect(screen.getByRole('alert')).toHaveTextContent('Файл больше 1 МБ.');
  });

  it('should clear the message when a good file is chosen after a refusal', () => {
    render(<Harness />);

    drop(pdf('big.pdf', MAX + 1));
    drop(pdf('ok.pdf'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should remove the file and return to the empty zone when the remove button is pressed', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.upload(input(), pdf());

    await userEvent.click(screen.getByRole('button', { name: 'Убрать файл form.pdf' }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Выбрать файл')).toBeInTheDocument();
  });

  it('should mark the zone while a file is dragged over it', () => {
    render(<Harness />);
    const dropZone = zone();

    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveAttribute('data-dragging', 'true');
    expect(screen.getByText('Отпустите файл, чтобы приложить')).toBeInTheDocument();

    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveAttribute('data-dragging');
  });
});

describe('formatFileSize', () => {
  it.each([
    [512, '512 Б'],
    [2048, '2 КБ'],
    [1536 * 1024, '1,5 МБ'],
    [10 * 1024 * 1024, '10 МБ'],
  ])('should write %i bytes as %s when the UI is Russian', (bytes, text) => {
    expect(formatFileSize(bytes, createTranslate('ru', 'ui.fileDrop'), 'ru')).toBe(text.replace(/ /g, ' '));
  });
});
