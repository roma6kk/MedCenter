import { render, screen, within } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { ConsentStatusView } from './consent-status-view';
import { NONE, REJECTED, REVOKED, WITH_ACTIVE } from './consent-fixtures';

jest.mock('./consent-api');

describe('ConsentStatusView', () => {
  beforeEach(() => useUiStore.setState({ locale: 'ru' }));

  it('should show an active consent with its date, form number and signer, and the history below', () => {
    render(<ConsentStatusView consent={WITH_ACTIVE} />);

    expect(screen.getByRole('status')).toHaveTextContent('Согласие действует');
    expect(screen.getByRole('status')).toHaveTextContent('Форма № Ф-12');
    expect(screen.getByRole('status')).toHaveTextContent('Подписано 20 октября 2026');
    expect(screen.getByRole('status')).toHaveTextContent('Оформил: Петрова А. И.');
    const history = screen.getByRole('list', { name: 'История' });
    expect(history.children).toHaveLength(2);
    expect(within(history).getByText('Отозвано')).toBeInTheDocument();
    expect(within(history).getByText('Заявление об отзыве № З-77')).toBeInTheDocument();
  });

  it('should say a revoked consent is revoked and keep its history', () => {
    render(<ConsentStatusView consent={REVOKED} />);

    expect(screen.getByRole('status')).toHaveTextContent('Согласие отозвано');
    expect(screen.getByRole('list', { name: 'История' })).toHaveTextContent('Форма № Ф-3');
  });

  it('should say a written refusal is on file', () => {
    render(<ConsentStatusView consent={REJECTED} />);

    expect(screen.getByRole('status')).toHaveTextContent('Оформлен письменный отказ');
  });

  it('should say no consent is on file and show no history list when there is nothing', () => {
    render(<ConsentStatusView consent={NONE} />);

    expect(screen.getByRole('status')).toHaveTextContent('Согласие не оформлено');
    expect(screen.queryByRole('list', { name: 'История' })).not.toBeInTheDocument();
    expect(screen.getByText('Записей о согласии нет.')).toBeInTheDocument();
  });

  it('should offer no scan download unless it is given a patient (the patient does not read the scan)', () => {
    render(<ConsentStatusView consent={WITH_ACTIVE} />);

    expect(screen.queryByRole('button', { name: /Скачать скан/ })).not.toBeInTheDocument();
  });

  it('should offer a scan download for every entry that has a scan when staff open the patient', () => {
    render(<ConsentStatusView consent={WITH_ACTIVE} scanOfPatient="p1" />);

    expect(screen.getByRole('button', { name: 'Скачать скан формы Ф-12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скачать скан формы Ф-3' })).toBeInTheDocument();
  });

  it('should name who signed when someone other than the patient did, with the authority document', () => {
    const representative = { ...WITH_ACTIVE.history[0]!, consenterType: 'guardian' as const, representativeDocument: 'Решение об опеке № 5', performer: { type: 'RelatedPerson' as const, id: 'rp1' } };
    render(<ConsentStatusView consent={{ active: representative, history: [representative] }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Подписал: опекун');
    expect(screen.getByRole('status')).toHaveTextContent('Документ, подтверждающий полномочия: Решение об опеке № 5');
  });
});
