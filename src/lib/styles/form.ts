import type { CSSProperties } from 'react';

/**
 * Shared inline styles for form controls. Inline-style is the project's
 * convention; centralising the repeated input/textarea/select shape keeps
 * forms visually consistent and makes "tweak our input look" a one-edit
 * change instead of an N-edit hunt.
 */

export const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '0.8rem 1.2rem',
  fontSize: '1.4rem',
  border: '1px solid #c4cdd5',
  borderRadius: '4px',
};

export const TEXTAREA_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  resize: 'vertical',
};
