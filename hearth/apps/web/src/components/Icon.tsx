import type { SVGProps } from 'react';

export type IconName =
  | 'calendar'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'chores'
  | 'cloud'
  | 'cloud-rain'
  | 'cloud-sun'
  | 'cloud-off'
  | 'home'
  | 'image'
  | 'leaf'
  | 'link'
  | 'list'
  | 'meal'
  | 'mic'
  | 'moon'
  | 'more'
  | 'plus'
  | 'power'
  | 'refresh'
  | 'shield'
  | 'sun'
  | 'sunrise'
  | 'star'
  | 'television'
  | 'today'
  | 'users'
  | 'warning';

const paths: Record<IconName, React.ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  chores: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  cloud: <path d="M17.5 19H7a5 5 0 0 1-.8-9.9A7 7 0 0 1 19.4 11 4 4 0 0 1 17.5 19Z" />,
  'cloud-rain': (
    <>
      <path d="M17.5 17H7a5 5 0 0 1-.8-9.9A7 7 0 0 1 19.4 9 4 4 0 0 1 17.5 17Z" />
      <path d="m8 21 1-2M12 21l1-2M16 21l1-2" />
    </>
  ),
  'cloud-sun': (
    <>
      <path d="M12 3V1M5.6 5.6 4.2 4.2M18.4 5.6l1.4-1.4M16 3h.01" />
      <path d="M17.5 19H7a5 5 0 0 1-.8-9.9A7 7 0 0 1 19.4 11 4 4 0 0 1 17.5 19Z" />
    </>
  ),
  'cloud-off': (
    <>
      <path d="m2 2 20 20" />
      <path d="M5.8 5.8A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 3.8-6.9M8.7 3.6A7 7 0 0 1 19 9.3" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 4.7 19 2 19 2s2 9-4 14c-1.2 1-2.6 1.4-4 1.4" />
      <path d="M2 21c0-3 1.9-5.4 5.8-7.2" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  meal: (
    <>
      <path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M17 3v18M17 3c3 2 3 7 0 9" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </>
  ),
  moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  power: (
    <>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a8 8 0 1 1-12.8 0" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7h-6V1" />
      <path d="M20 7a9 9 0 1 0 1 8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  sunrise: (
    <>
      <path d="M4 18h16M7 15a5 5 0 0 1 10 0M12 3v3M4.9 7.9l2.1 2.1M19.1 7.9 17 10M2 22h20" />
    </>
  ),
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.3L5.8 21 7 14.1l-5-4.8 6.9-1L12 2Z" />,
  television: (
    <>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 22h8M12 18v4" />
    </>
  ),
  today: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 9h18M8 13h3v3H8z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.4 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
