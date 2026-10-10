import { useEffect, useRef, useState, type CSSProperties } from 'react';

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
  const [currentValue, setCurrentValue] = useState(selectedValue);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const current = MEMBER_COLOUR_OPTIONS.find((option) => option.value === currentValue);

  useEffect(() => {
    const form = disclosure.current?.closest('form');
    if (!form) return;
    // Restore the colour draft when its owning form resets (for example Add someone).
    const reset = () => setCurrentValue(selectedValue);
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [selectedValue]);

  return (
    <details className="member-colour-disclosure" ref={disclosure}>
      <summary>
        <span>Colour</span>
        <span className="member-colour-disclosure__current">
          <span
            aria-hidden="true"
            className="member-colour-disclosure__swatch"
            style={{ '--member-colour': currentValue } as CSSProperties}
          />
          <span>{current?.name}</span>
        </span>
        <Icon name="chevron-down" />
      </summary>
      <fieldset className="member-colour-picker">
        <legend className="sr-only">Colour</legend>
        <div className="member-colour-picker__grid">
          {MEMBER_COLOUR_OPTIONS.map((option) => (
            <label className="member-colour-picker__option" key={option.value}>
              <input
                aria-label={option.name}
                checked={option.value === currentValue}
                name="color"
                onChange={() => setCurrentValue(option.value)}
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
    </details>
  );
}
