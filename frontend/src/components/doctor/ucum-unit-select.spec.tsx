jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { UCUM_UNITS } from '@/lib/contracts';
import { renderWithClient, routeApi, type ApiMock } from './doctor-test-utils';
import { UcumUnitSelect } from './ucum-unit-select';

const apiFetchMock = apiFetch as ApiMock;
const UCUM = 'http://unitsofmeasure.org';

function optionCodes(): ReadonlyArray<string> {
  return screen.getAllByRole('option').map((option) => (option as HTMLOptionElement).value).filter((value) => value !== '');
}

describe('UcumUnitSelect', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should offer the concepts of the UCUM value set when the terminology service answers', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'ucum', total: 2, items: [{ system: UCUM, code: 'Cel', display: 'градус Цельсия' }, { system: UCUM, code: 'mmHg', display: 'мм рт. ст.' }] }) }]);
    renderWithClient(<UcumUnitSelect id="unit" value="" onChange={() => undefined} />);

    await screen.findByRole('option', { name: /mmHg/ });

    expect(optionCodes()).toEqual(['Cel', 'mmHg']);
  });

  it('should name the options the way a clinician writes the unit and keep the UCUM code as the value', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'ucum', total: 2, items: [{ system: UCUM, code: 'Cel', display: 'градус Цельсия' }, { system: UCUM, code: 'mm[Hg]', display: 'миллиметр ртутного столба' }] }) }]);
    renderWithClient(<UcumUnitSelect id="unit" value="" onChange={() => undefined} />);

    expect(await screen.findByRole('option', { name: '°C — градус Цельсия' })).toHaveValue('Cel');
    expect(screen.getByRole('option', { name: 'мм рт. ст. — миллиметр ртутного столба' })).toHaveValue('mm[Hg]');
  });

  it('should tell a pulse from a breathing rate by the observation the unit belongs to', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'ucum', total: 1, items: [{ system: UCUM, code: '/min', display: 'в минуту' }] }) }]);
    renderWithClient(<UcumUnitSelect id="unit" value="" observationCode="20005" onChange={() => undefined} />);

    expect(await screen.findByRole('option', { name: 'уд/мин — в минуту' })).toHaveValue('/min');
  });

  it('should fall back to the contracts list when the terminology service cannot be reached', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => { throw new Error('offline'); } }]);
    renderWithClient(<UcumUnitSelect id="unit" value="" onChange={() => undefined} />);

    await screen.findByRole('option', { name: 'мг/дл' });

    expect(optionCodes()).toEqual([...UCUM_UNITS]);
  });

  it('should never render a free-text input when the terminology service is down', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => { throw new Error('offline'); } }]);
    renderWithClient(<UcumUnitSelect id="unit" value="" onChange={() => undefined} />);

    await screen.findByRole('option', { name: '°C' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should report the chosen unit code when an option is selected', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'ucum', total: 1, items: [{ system: UCUM, code: 'Cel', display: 'градус Цельсия' }] }) }]);
    const onChange = jest.fn();
    renderWithClient(<UcumUnitSelect id="unit" value="" onChange={onChange} />);
    await screen.findByRole('option', { name: /°C/ });

    await userEvent.selectOptions(screen.getByRole('combobox'), 'Cel');

    expect(onChange).toHaveBeenCalledWith('Cel');
  });

  it('should keep a value that is not in the list visible when it came from the form', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/terminology/expand', respond: () => ({ valueSet: 'ucum', total: 1, items: [{ system: UCUM, code: 'Cel', display: 'градус Цельсия' }] }) }]);
    renderWithClient(<UcumUnitSelect id="unit" value="kg" onChange={() => undefined} />);
    await screen.findByRole('option', { name: /°C/ });

    expect(screen.getByRole('combobox')).toHaveValue('kg');
  });
});
