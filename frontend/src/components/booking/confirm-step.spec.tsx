import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { ConfirmStep } from './confirm-step';

jest.mock('@/components/catalog/use-catalog', () => ({ useDoctor: () => ({ data: undefined }), useService: () => ({ data: undefined }) }));

const DRAFT = { serviceId: null, doctorId: 'doc-1', slotStart: '2026-11-02T08:00:00.000Z', slotEnd: '2026-11-02T08:30:00.000Z' };

describe('ConfirmStep', () => {
  beforeEach(() => resetCabinetState());

  it('should offer no field for a reason of the visit, so that no health text is collected', () => {
    renderWithClient(<ConfirmStep draft={DRAFT} onEdit={jest.fn()} booking={{ submit: jest.fn(), isPending: false, problem: null }} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Причина/)).not.toBeInTheDocument();
  });

  it('should book when the visitor confirms', async () => {
    const submit = jest.fn();
    renderWithClient(<ConfirmStep draft={DRAFT} onEdit={jest.fn()} booking={{ submit, isPending: false, problem: null }} />);

    await userEvent.click(screen.getByTestId('booking-confirm'));

    expect(submit).toHaveBeenCalledTimes(1);
  });
});
