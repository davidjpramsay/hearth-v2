import type { CSSProperties } from 'react';

import { Icon } from './Icon';
import {
  DEFAULT_MEMBER_COLOUR,
  MEMBER_COLOUR_OPTIONS,
  MEMBER_COLOUR_VALUES,
} from './memberColours';

export function MemberColourPicker({ defaultValue }: { defaultValue: string }) {
  const normalizedValue = defaultValue.toLowerCase();
  const selectedValue = MEMBER_COLOUR_VALUES.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_MEMBER_COLOUR;

  return (
    <fieldset className="member-colour-picker">
      <legend>Colour</legend>
      <div className="member-colour-picker__grid">
        {MEMBER_COLOUR_OPTIONS.map((option) => (
          <label className="member-colour-picker__option" key={option.value}>
            <input
              aria-label={option.name}
              defaultChecked={option.value === selectedValue}
              name="color"
              type="radio"
              value={option.value}
            />
            <span
              aria-hidden="true"
              className="member-colour-picker__swatch"
              style={{ '--member-colour': option.value } as CSSProperties}
            >
              <Icon name="check" />
            </span>
            <span className="member-colour-picker__name">{option.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
