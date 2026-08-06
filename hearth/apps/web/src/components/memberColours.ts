export const MEMBER_COLOUR_OPTIONS = [
  { name: 'Sky', value: '#1668b7' },
  { name: 'Ocean', value: '#287e9a' },
  { name: 'Lagoon', value: '#2f7c76' },
  { name: 'Eucalyptus', value: '#3f7251' },
  { name: 'Sage', value: '#718778' },
  { name: 'Ochre', value: '#c97900' },
  { name: 'Clay', value: '#c66c4e' },
  { name: 'Brick', value: '#a83b31' },
  { name: 'Berry', value: '#a54f6f' },
  { name: 'Plum', value: '#75506f' },
  { name: 'Indigo', value: '#5d62a4' },
  { name: 'Slate', value: '#536f7c' },
] as const;

export const DEFAULT_MEMBER_COLOUR = '#718778';

export const MEMBER_COLOUR_VALUES = new Set<string>(
  MEMBER_COLOUR_OPTIONS.map((option) => option.value),
);
