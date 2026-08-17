import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TodaySectionVisibility } from '@hearth/shared';

import { TodayConfigurationPreview } from './TodayConfigurationPreview';
import type { TodayPreviewData } from './todayPreviewData';

afterEach(cleanup);

const data: TodayPreviewData = {
  displayTime: '07:42',
  displayDate: 'Monday 3 August',
  weather: { temperature: '16°', condition: 'Clear' },
  events: [
    {
      id: 'event_school',
      title: 'School drop-off',
      time: '8:15 am',
      color: '#1668b7',
      person: { avatarUrl: '/demo/ezra.webp', initial: 'E' },
    },
  ],
  chores: [
    {
      id: 'chore_school_bag',
      title: 'Pack school bag',
      person: { avatarUrl: '/demo/ezra.webp', initial: 'E' },
    },
  ],
  dinner: 'Lemon chicken',
  listSummary: 'Groceries · 6 left',
  notice: 'Bins go out tonight',
  photo: { url: '/demo/family.webp', alt: 'Family breakfast' },
};

const allSections: TodaySectionVisibility = {
  dinner: true,
  listSummary: true,
  notice: true,
  photo: true,
};

describe('TodayConfigurationPreview', () => {
  it('shows real household content in the default television composition', () => {
    const { container } = render(<TodayConfigurationPreview data={data} sections={allSections} />);

    expect(screen.getByRole('img', { name: /TV Today preview/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'TV' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.today-configuration-preview--television')).toBeVisible();
    expect(screen.getByText('School drop-off')).toBeVisible();
    expect(screen.getByText('Lemon chicken')).toBeVisible();
    expect(container.querySelector('.today-configuration-preview__photo')).toBeVisible();
  });

  it('switches to the phone preview and describes the enabled optional sections', () => {
    const { container } = render(<TodayConfigurationPreview data={data} sections={allSections} />);

    fireEvent.click(screen.getByRole('button', { name: 'Phone' }));

    expect(screen.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.today-configuration-preview--phone')).toBeVisible();
    expect(screen.getByRole('img', { name: /Optional sections shown: Dinner/ })).toBeVisible();
  });

  it('removes optional regions without hiding the stable plans and chores core', () => {
    const { container } = render(
      <TodayConfigurationPreview
        data={data}
        sections={{ dinner: false, listSummary: false, notice: false, photo: false }}
      />,
    );

    expect(screen.getByRole('img', { name: /Only plans and chores are shown/ })).toBeVisible();
    expect(screen.getByText('School drop-off')).toBeVisible();
    expect(screen.getByText('Pack school bag')).toBeVisible();
    expect(container.querySelector('.today-configuration-preview__summary')).toBeNull();
  });

  it('keeps section settings usable when preview data is unavailable', () => {
    render(<TodayConfigurationPreview data={data} sections={allSections} status="unavailable" />);

    expect(screen.getByRole('img', { name: /preview is temporarily unavailable/ })).toBeVisible();
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    expect(screen.getByText('Your visibility choices can still be saved')).toBeVisible();
  });
});
