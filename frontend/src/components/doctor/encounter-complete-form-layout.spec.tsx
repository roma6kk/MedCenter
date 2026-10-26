jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { diagnosisInput, fillRequired, pickDiagnosis, setup, submit } from './encounter-form-test-utils';

const SECTION_TITLES: ReadonlyArray<string> = ['Осмотр и показатели', 'Диагнозы', 'Назначения услуг', 'Назначения лекарств', 'Заключение и рекомендации'];

function navigator(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Разделы приёма' });
}

/** The state words a screen reader hears after the section's name in the navigator. */
function stateOf(title: string): string {
  const link = within(navigator()).getByRole('link', { name: new RegExp(`^${title}`) });
  return link.getAttribute('data-state') ?? '';
}

describe('EncounterCompleteForm order of the visit (A6)', () => {
  it('should lay the sections out as the visit goes: examination, diagnoses, services, drugs, conclusion last', () => {
    setup();

    const headings: ReadonlyArray<string> = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '');

    expect(headings).toEqual(SECTION_TITLES);
  });

  it('should put the conclusion and the recommendations in the last section', () => {
    setup();

    const last = within(screen.getByRole('region', { name: 'Заключение и рекомендации' }));

    expect(last.getByLabelText('Заключение')).toBeInTheDocument();
    expect(last.getByLabelText('Рекомендации')).toBeInTheDocument();
  });

  it('should have no browser fieldset or legend: the sections are cards', () => {
    setup();

    expect(document.body.querySelector('fieldset')).toBeNull();
    expect(document.body.querySelector('legend')).toBeNull();
  });
});

describe('EncounterCompleteForm section navigator (A6)', () => {
  it('should list every section as an anchor to its card, in order', () => {
    setup();

    const links = within(navigator()).getAllByRole('link');

    expect(links.map((link) => link.textContent?.replace(/(не заполнен|заполнен|есть ошибки|необязательный|,)/g, '').trim())).toEqual(SECTION_TITLES);
    links.forEach((link) => expect(document.querySelector(link.getAttribute('href') ?? '')).not.toBeNull());
  });

  it('should show an untouched form as empty everywhere, saying which sections are optional', () => {
    setup();

    SECTION_TITLES.forEach((title) => expect(stateOf(title)).toBe('empty'));
    expect(within(navigator()).getByRole('link', { name: /^Осмотр и показатели не заполнен, необязательный$/ })).toBeInTheDocument();
    expect(within(navigator()).getByRole('link', { name: /^Диагнозы не заполнен$/ })).toBeInTheDocument();
  });

  it('should mark a section as filled once it has content', async () => {
    setup();

    await pickDiagnosis();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить услугу' }));
    await userEvent.selectOptions(await screen.findByLabelText(/Услуга 1/), 'A01.001');

    expect(stateOf('Диагнозы')).toBe('filled');
    expect(stateOf('Назначения услуг')).toBe('filled');
    expect(stateOf('Заключение и рекомендации')).toBe('empty');
  });

  it('should call the conclusion filled only when it and the recommendations are both written', async () => {
    setup();

    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    expect(stateOf('Заключение и рекомендации')).toBe('empty');

    await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');
    expect(stateOf('Заключение и рекомендации')).toBe('filled');
  });

  it('should mark the sections that have errors after a failed submit, and only those', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Заключение'), 'ОРВИ, состояние удовлетворительное');
    await userEvent.type(screen.getByLabelText('Рекомендации'), 'Покой, обильное питьё');

    await submit();

    await waitFor(() => expect(stateOf('Диагнозы')).toBe('error'));
    expect(stateOf('Заключение и рекомендации')).toBe('filled');
    expect(stateOf('Осмотр и показатели')).toBe('empty');
    expect(within(navigator()).getByRole('link', { name: /^Диагнозы есть ошибки$/ })).toBeInTheDocument();
  });

  it('should move focus to the heading of the section when its anchor is pressed', async () => {
    setup();

    await userEvent.click(within(navigator()).getByRole('link', { name: /Заключение и рекомендации/ }));

    expect(screen.getByRole('heading', { level: 2, name: 'Заключение и рекомендации' })).toHaveFocus();
  });
});

describe('EncounterCompleteForm empty lists and cards (A9)', () => {
  it('should say an empty list in one line with the way to add to it', () => {
    setup();

    const section = within(screen.getByRole('region', { name: 'Осмотр и показатели' }));

    expect(section.getByText('Наблюдения не добавлены ·')).toBeInTheDocument();
    expect(section.getAllByRole('button', { name: 'Добавить наблюдение' })).toHaveLength(1);
  });

  it('should drop the empty line and offer «Добавить» under the rows once there is a row', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));

    const section = within(screen.getByRole('region', { name: 'Осмотр и показатели' }));
    expect(section.queryByText('Наблюдения не добавлены ·')).toBeNull();
    expect(section.getAllByRole('button', { name: 'Добавить наблюдение' })).toHaveLength(1);
    expect(section.getByRole('button', { name: 'Удалить наблюдение 1' })).toBeInTheDocument();
  });

  it('should offer the units as a clinician writes them while the option value stays the UCUM code', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить наблюдение' }));

    const unit = await screen.findByLabelText(/Единица 1/);

    expect(await within(unit).findByRole('option', { name: '°C — градус Цельсия' })).toHaveValue('Cel');
  });
});

describe('EncounterCompleteForm diagnosis entry (A7)', () => {
  it('should fill the code and the name from one pick, with no separate name field', async () => {
    setup();

    await pickDiagnosis();

    expect(diagnosisInput()).toHaveValue('J06.9 — Острая инфекция верхних дыхательных путей неуточнённая');
    expect(screen.queryByLabelText(/Название диагноза/)).toBeNull();
  });

  it('should offer the verification status as a switch, none by default', () => {
    setup();

    const group = within(screen.getByRole('group', { name: 'Статус подтверждения 1' }));

    expect(group.getAllByRole('button').map((button) => button.textContent)).toEqual(['Не указан', 'Рабочий', 'Предварительный', 'Подтверждённый']);
    expect(group.getByRole('button', { name: 'Не указан' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should keep the status the doctor chose and go back to «не указан»', async () => {
    setup();
    const group = within(screen.getByRole('group', { name: 'Статус подтверждения 1' }));

    await userEvent.click(group.getByRole('button', { name: 'Предварительный' }));
    expect(group.getByRole('button', { name: 'Предварительный' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(group.getByRole('button', { name: 'Не указан' }));
    expect(group.getByRole('button', { name: 'Не указан' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should keep a complete form completable with the new section order', async () => {
    setup();

    await fillRequired();

    expect(stateOf('Диагнозы')).toBe('filled');
    expect(stateOf('Заключение и рекомендации')).toBe('filled');
  });
});
