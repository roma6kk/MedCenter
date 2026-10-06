import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { Icd10Combobox } from './icd10-combobox';
import { apiFetch } from '@/lib/api/api-fetch';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const TERMS = [
  { code: 'J06.9', display: 'Острый назофарингит' },
  { code: 'J06.0', display: 'Острый ларингофарингит' },
  { code: 'K21.0', display: 'ГЭРБ с эзофагитом' },
];

function renderCombobox(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  function Controlled(): React.JSX.Element {
    return <Icd10Combobox id="icd10-test" value="" onChange={() => undefined} />;
  }
  render(<Controlled />, { wrapper: Wrapper });
}

describe('Icd10Combobox keyboard navigation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    apiFetchMock.mockResolvedValue({ items: TERMS });
  });

  it('should move the active option with ArrowDown and expose aria-activedescendant', async () => {
    renderCombobox();
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'J0');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-0');

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-1');
  });

  it('should jump to first and last options with Home and End', async () => {
    renderCombobox();
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'J0');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{End}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-2');

    await userEvent.keyboard('{Home}');
    expect(input).toHaveAttribute('aria-activedescendant', 'icd10-test-option-0');
  });

  it('should select the active option with Enter', async () => {
    const onChange = jest.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    render(<Icd10Combobox id="icd10-enter" value="" onChange={onChange} />, { wrapper: Wrapper });
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'J0');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('J06.0');
  });
});
