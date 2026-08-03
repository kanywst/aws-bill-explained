/**
 * The three meters — identity and order only.
 *
 * All wording lives in src/i18n/strings.ts so the model stays language-neutral:
 * a meter is the same meter in every locale, and only its label changes.
 */
export type MeterId = 'time' | 'egress' | 'calls';

export const METER_ORDER: MeterId[] = ['time', 'egress', 'calls'];
