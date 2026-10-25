'use client';

import { useId } from 'react';

import {
  HOUSES,
  isHouseId,
  parseHouseFocus,
  type HouseId,
} from '@/lib/connectors/model';

export interface HouseFocusDraft {
  majorHouse: HouseId | null;
  minorHouse: HouseId | null;
}

const FIELDS = [
  {
    key: 'majorHouse',
    other: 'minorHouse',
    label: 'Major house',
    description: 'Primary focus',
  },
  {
    key: 'minorHouse',
    other: 'majorHouse',
    label: 'Minor house',
    description: 'Secondary focus',
  },
] as const;

export function HouseFocusFields({
  value,
  onChange,
  required = true,
  disabled = false,
}: {
  value: HouseFocusDraft;
  onChange: (value: HouseFocusDraft) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="min-w-0">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="min-w-0">
            <label
              htmlFor={`${id}-${field.key}`}
              className="text-pana-ink block text-sm font-extrabold"
            >
              {field.label}
            </label>
            <p
              id={`${id}-${field.key}-description`}
              className="text-pana-ink/60 mt-0.5 text-xs"
            >
              {field.description}
              {required ? ' (required)' : ''}
            </p>
            <select
              id={`${id}-${field.key}`}
              name={field.key}
              aria-describedby={`${id}-${field.key}-description`}
              required={required}
              disabled={disabled}
              value={value[field.key] ?? ''}
              onChange={(event) => {
                const selected = event.target.value;
                onChange({
                  ...value,
                  [field.key]: isHouseId(selected) ? selected : null,
                });
              }}
              className="border-pana-ink/25 text-pana-ink focus:border-pana-indigo mt-1.5 min-h-11 w-full min-w-0 rounded-lg border-2 bg-white px-3 py-2 text-sm outline-none disabled:opacity-60"
            >
              <option value="" disabled={required}>
                Select a {field.label.toLowerCase()}
              </option>
              {HOUSES.map((house) => (
                <option
                  key={house.id}
                  value={house.id}
                  disabled={house.id === value[field.other]}
                >
                  {house.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || !parseHouseFocus(value)}
        onClick={() =>
          onChange({
            majorHouse: value.minorHouse,
            minorHouse: value.majorHouse,
          })
        }
        className="text-pana-indigo mt-1 inline-flex min-h-11 items-center text-xs font-bold underline underline-offset-4 disabled:opacity-40"
      >
        Swap major and minor
      </button>
    </div>
  );
}
