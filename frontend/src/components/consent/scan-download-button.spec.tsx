import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '@/store/use-ui-store';
import * as api from './consent-api';
import { ScanDownloadButton } from './scan-download-button';

jest.mock('./consent-api');
const mocked = jest.mocked(api);

const SCAN = { id: 'scan-1', contentType: 'application/pdf', hash: 'h' };

describe('ScanDownloadButton', () => {
  let click: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    useUiStore.setState({ locale: 'ru' });
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:scan'), revokeObjectURL: jest.fn() });
    click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('should fetch the scan with the session and save it under a name that tells the form when pressed', async () => {
    mocked.fetchConsentScan.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    render(<ScanDownloadButton patientId="p1" scan={SCAN} formNumber="Ф-12" />);

    await userEvent.click(screen.getByRole('button', { name: 'Скачать скан формы Ф-12' }));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(mocked.fetchConsentScan).toHaveBeenCalledWith('p1', 'scan-1');
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('consent-scan-Ф-12.pdf');
    expect(anchor.href).toBe('blob:scan');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scan');
  });

  it('should pick the extension from the type of the scan', async () => {
    mocked.fetchConsentScan.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    render(<ScanDownloadButton patientId="p1" scan={{ ...SCAN, contentType: 'image/jpeg' }} formNumber="7" />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('consent-scan-7.jpg');
  });

  it('should say the download failed and let the user try again when the server refuses', async () => {
    mocked.fetchConsentScan.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(new Blob(['x']));
    render(<ScanDownloadButton patientId="p1" scan={SCAN} formNumber="Ф-12" />);

    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось скачать скан');
    expect(click).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should keep the button focusable but inert while the scan is downloading', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    mocked.fetchConsentScan.mockReturnValue(new Promise((done) => { finish = done; }));
    render(<ScanDownloadButton patientId="p1" scan={SCAN} formNumber="Ф-12" />);

    await userEvent.click(screen.getByRole('button'));
    const busy = await screen.findByRole('button', { name: /Скачиваем/ });
    await userEvent.click(busy);

    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(mocked.fetchConsentScan).toHaveBeenCalledTimes(1);
    finish(new Blob(['x']));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  });
});
