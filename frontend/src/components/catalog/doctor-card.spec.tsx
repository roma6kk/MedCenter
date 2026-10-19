import { render, screen } from '@testing-library/react';
import { DoctorCard } from './doctor-card';
import { doctorInitials } from './doctor-initials';
import type { Doctor } from './catalog-types';

const DOCTOR: Doctor = { id: 'd-1', firstName: 'Мария', lastName: 'Иванова', name: 'Мария Иванова', specialty: 'Терапевт' };

describe('doctorInitials', () => {
  it('should take the first letters of first and last name when the doctor has both', () => {
    expect(doctorInitials(DOCTOR)).toBe('МИ');
  });

  it('should fall back to the display name when the parts are blank', () => {
    expect(doctorInitials({ firstName: ' ', lastName: '', name: 'ольга' })).toBe('О');
  });
});

describe('DoctorCard', () => {
  it('should show name and specialty under a heading when the doctor has a specialty', () => {
    render(<DoctorCard doctor={DOCTOR} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Мария Иванова' })).toBeInTheDocument();
    expect(screen.getByText('Терапевт')).toBeInTheDocument();
  });

  it('should say so when the doctor has no specialty', () => {
    render(<DoctorCard doctor={{ ...DOCTOR, specialty: undefined }} />);

    expect(screen.getByText('Специальность не указана')).toBeInTheDocument();
  });

  it('should use the requested heading level when one is given', () => {
    render(<DoctorCard doctor={DOCTOR} headingLevel={3} />);

    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('should render the actions when children are given', () => {
    render(<DoctorCard doctor={DOCTOR}><a href="/doctors/d-1">Профиль</a></DoctorCard>);

    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('href', '/doctors/d-1');
  });

  it('should hide the decorative initials from assistive technology when the card is rendered', () => {
    render(<DoctorCard doctor={DOCTOR} />);

    expect(screen.getByText('МИ')).toHaveAttribute('aria-hidden', 'true');
  });
});
