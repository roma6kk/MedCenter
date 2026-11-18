import { screen, within } from '@testing-library/react';
import { renderWithCatalog } from '@/components/catalog/catalog-test-utils';
import { PrivacyPolicy } from './privacy-policy';
import { apiFetch } from '@/lib/api/api-fetch';
import { POLICY_VERSION } from '@/lib/policy-version';

jest.mock('@/lib/api/api-fetch');

describe('PrivacyPolicy', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockRejectedValue(new Error('offline')));


  it('should open with the training-project note and the policy version', () => {
    renderWithCatalog(<PrivacyPolicy />);

    expect(screen.getByRole('heading', { level: 1, name: 'Политика обработки персональных данных' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Учебный проект: оператор и реквизиты вымышлены; вводите только тестовые данные.');
    expect(screen.getByText(new RegExp(`Версия политики ${POLICY_VERSION}`))).toBeInTheDocument();
  });

  it('should cover the operator, purposes with basis, cookies, rights, refusal consequences and cross-border transfer', () => {
    renderWithCatalog(<PrivacyPolicy />);

    for (const name of ['Оператор', 'Цели, персональные данные и правовое основание', 'Cookie и данные браузера', 'Права субъекта персональных данных', 'Последствия отказа', 'Трансграничная передача']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('purpose-clinic')).getByText(/ст\. 44 \(ч\. 13\) Закона «О здравоохранении»/)).toBeInTheDocument();
    expect(screen.getByText(/5 рабочих дней/)).toBeInTheDocument();
    expect(screen.getByText('Трансграничная передача не осуществляется.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ЭМК|ЭМД/);
  });

  it('should list every cookie the code sets with its lifetime and no consent banner', () => {
    renderWithCatalog(<PrivacyPolicy />);

    const table = within(screen.getByRole('table'));
    for (const name of ['mc_rt', 'mc_at', 'mc_session', 'mc_as_session', 'mc_as_csrf', 'mc_pkce', 'mc-locale']) expect(table.getByText(name)).toBeInTheDocument();
    expect(table.getByText('mc_rt').closest('tr')).toHaveTextContent('14 суток');
    expect(table.getByText('mc_as_session').closest('tr')).toHaveTextContent('5 минут');
    expect(table.getByText('mc_as_csrf').closest('tr')).toHaveTextContent('30 минут');
    expect(table.getByText('mc_pkce').closest('tr')).toHaveTextContent('10 минут');
    expect(table.getByText('mc-locale').closest('tr')).toHaveTextContent('1 год');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should describe the browser storage the app really uses as technical and kept in the browser', () => {
    renderWithCatalog(<PrivacyPolicy />);

    const storage = screen.getByText(/Кроме cookie, браузер хранит/);
    expect(storage).toHaveTextContent('mc-last-activity');
    expect(storage).toHaveTextContent('черновик записи на приём');
    expect(storage).toHaveTextContent('не передаются третьим лицам');
  });

  it('should say the data of a closed account is kept for the configured period and then reviewed by the operator', () => {
    renderWithCatalog(<PrivacyPolicy />);

    const first = screen.getByTestId('purpose-account');
    expect(first).toHaveTextContent('Данные закрытой учётной записи хранятся в течение срока, заданного оператором');
    expect(first).toHaveTextContent('затем оператор принимает решение');
    expect(first).toHaveTextContent('Медицинские записи не затрагиваются');
  });
});
