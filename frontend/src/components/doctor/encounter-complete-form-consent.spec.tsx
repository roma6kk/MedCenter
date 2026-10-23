jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

jest.setTimeout(30_000);

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { problem } from './doctor-test-utils';
import { apiFetchMock, completeCall, completeRoute, fillRequired, setup, submit } from './encounter-form-test-utils';
import { bodyOf } from './doctor-test-utils';

describe('EncounterCompleteForm without a consent (409 CONSENT_REQUIRED)', () => {
  it('should say the patient has no consent, with the record link and the emergency option, instead of the generic banner', async () => {
    setup(completeRoute(() => { throw problem(409, 'CONSENT_REQUIRED'); }));
    await fillRequired();

    await submit();

    const notice = await screen.findByTestId('consent-required');
    expect(notice).toHaveTextContent('Приём нельзя завершить');
    expect(screen.getByRole('link', { name: 'Внести согласие в карточке пациента' })).toHaveAttribute('href', '/patients/p-1#consent');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Заключение')).toHaveValue('ОРВИ, состояние удовлетворительное');
  });

  it('should resend the same body with the emergency reason when the doctor completes it as emergency care', async () => {
    let attempts = 0;
    setup(completeRoute(() => {
      attempts += 1;
      if (attempts === 1) throw problem(409, 'CONSENT_REQUIRED');
      return { id: 'enc-1', status: 'finished' };
    }));
    await fillRequired();
    await submit();

    await userEvent.click(await screen.findByLabelText('Причина экстренной помощи'));
    await userEvent.paste('Пациент без сознания, ДТП');
    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём как экстренный' }));

    await waitFor(() => expect(apiFetchMock.mock.calls.filter(([path]) => String(path).endsWith('/complete'))).toHaveLength(2));
    const calls = apiFetchMock.mock.calls.filter(([path]) => String(path).endsWith('/complete'));
    const first = bodyOf(completeCall());
    const second = JSON.parse(String(calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(first).not.toHaveProperty('emergencyReason');
    expect(second).toEqual({ ...first, emergencyReason: 'Пациент без сознания, ДТП' });
  });

  it('should not send the emergency request while the reason is too short', async () => {
    setup(completeRoute(() => { throw problem(409, 'CONSENT_REQUIRED'); }));
    await fillRequired();
    await submit();

    await userEvent.click(await screen.findByLabelText('Причина экстренной помощи'));
    await userEvent.paste('коротко');
    await userEvent.click(screen.getByRole('button', { name: 'Завершить приём как экстренный' }));

    expect(await screen.findByText('Опишите причину подробнее: не меньше 10 символов')).toBeInTheDocument();
    expect(apiFetchMock.mock.calls.filter(([path]) => String(path).endsWith('/complete'))).toHaveLength(1);
  });
});
