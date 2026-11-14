import { render, screen, within } from '@testing-library/react';
import { PrivacyPolicy } from './privacy-policy';
import { POLICY_VERSION } from '@/lib/policy-version';

describe('PrivacyPolicy', () => {
  it('should open with the training-project note and the policy version', () => {
    render(<PrivacyPolicy />);

    expect(screen.getByRole('heading', { level: 1, name: 'Политика обработки персональных данных' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Учебный проект: оператор и реквизиты вымышлены; вводите только тестовые данные.');
    expect(screen.getByText(new RegExp(`Версия политики ${POLICY_VERSION}`))).toBeInTheDocument();
  });

  it('should cover the operator, purposes with basis, cookies, rights, refusal consequences and cross-border transfer', () => {
    render(<PrivacyPolicy />);

    for (const name of ['Оператор', 'Цели, персональные данные и правовое основание', 'Cookie и данные браузера', 'Права субъекта персональных данных', 'Последствия отказа', 'Трансграничная передача']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('purpose-clinic')).getByText(/ст\. 44 \(ч\. 13\) Закона «О здравоохранении»/)).toBeInTheDocument();
    expect(screen.getByText(/5 рабочих дней/)).toBeInTheDocument();
    expect(screen.getByText('Трансграничная передача не осуществляется.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ЭМК|ЭМД/);
  });

  it('should list every cookie the code sets with its lifetime and no consent banner', () => {
    render(<PrivacyPolicy />);

    const table = within(screen.getByRole('table'));
    for (const name of ['mc_rt', 'mc_at', 'mc_session', 'mc_pkce', 'mc-locale']) expect(table.getByText(name)).toBeInTheDocument();
    expect(table.getByText('mc_rt').closest('tr')).toHaveTextContent('14 суток');
    expect(table.getByText('mc_pkce').closest('tr')).toHaveTextContent('10 минут');
    expect(table.getByText('mc-locale').closest('tr')).toHaveTextContent('1 год');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
