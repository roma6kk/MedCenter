import { act, render, screen, within } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { ContentSkeleton } from './content-skeleton';
import { SLOW_LOADING_MS } from './loading-note';
import { TableSkeleton } from './states';

function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('lead skeleton', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useUiStore.setState({ locale: 'ru' });
  });
  afterEach(() => jest.useRealTimers());

  it('should keep the status region of a lone skeleton', () => {
    render(<ContentSkeleton shape="list" />);

    expect(screen.getByRole('status')).toHaveTextContent('Загрузка…');
  });

  it('should make one status region of several skeletons, the first one, that says «Загрузка…» once', () => {
    render(
      <>
        <ContentSkeleton shape="detail" />
        <ContentSkeleton shape="timeline" />
        <TableSkeleton />
      </>,
    );

    const regions = screen.getAllByRole('status');

    expect(regions).toHaveLength(1);
    expect(within(regions[0]).getByTestId('content-skeleton-detail')).toBeInTheDocument();
    expect(screen.getAllByText('Загрузка…')).toHaveLength(1);
    expect(screen.getByTestId('content-skeleton-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('should show «Загружаем…» once for all the skeletons when the wait passes three seconds', () => {
    render(
      <>
        <ContentSkeleton shape="detail" />
        <ContentSkeleton shape="cards" />
        <TableSkeleton />
      </>,
    );

    advance(SLOW_LOADING_MS);

    expect(screen.getAllByText('Загружаем…')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем…');
  });

  it('should hand the region over to the next skeleton when the first one goes away, with the note it has already earned', () => {
    const { rerender } = render(
      <>
        <ContentSkeleton key="first" shape="detail" />
        <ContentSkeleton key="second" shape="cards" />
      </>,
    );
    advance(SLOW_LOADING_MS);

    rerender(<ContentSkeleton key="second" shape="cards" />);

    const region = screen.getByRole('status');
    expect(within(region).getByTestId('content-skeleton-cards')).toBeInTheDocument();
    expect(region).toHaveTextContent('Загрузка…');
    expect(region).toHaveTextContent('Загружаем…');
  });

  it('should announce a skeleton that appears later as decoration while an earlier one is still there', () => {
    const { rerender } = render(<ContentSkeleton key="first" shape="detail" />);

    rerender(
      <>
        <ContentSkeleton key="first" shape="detail" />
        <ContentSkeleton key="late" shape="tiles" />
      </>,
    );

    const region = screen.getByRole('status');
    expect(within(region).getByTestId('content-skeleton-detail')).toBeInTheDocument();
    expect(within(region).queryByTestId('content-skeleton-tiles')).not.toBeInTheDocument();
  });

  it('should give the skeletons of a modal dialog a region of their own, since the page behind it is out of reach', () => {
    render(
      <>
        <ContentSkeleton shape="detail" />
        <div role="dialog" aria-modal="true" aria-label="Расписание">
          <TableSkeleton />
          <ContentSkeleton shape="cards" />
        </div>
      </>,
    );

    const regions = screen.getAllByRole('status');

    expect(regions).toHaveLength(2);
    expect(within(screen.getByRole('dialog')).getAllByRole('status')).toHaveLength(1);
    expect(within(screen.getByRole('dialog')).getByRole('status')).toContainElement(screen.getByTestId('table-skeleton'));
  });
});
