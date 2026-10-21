import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

const regionNames = new Intl.DisplayNames(['ru'], { type: 'region' });
export type PhoneCountry = CountryCode;
export const PHONE_COUNTRIES = getCountries()
  .map((id) => ({ id, label: id === 'US' ? 'США' : regionNames.of(id) ?? id }))
  .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
export const callingCode = (country: PhoneCountry) => `+${getCountryCallingCode(country)}`;
export const phoneError = (country: PhoneCountry) => `Введите действующий номер выбранной страны: ${PHONE_COUNTRIES.find((c) => c.id === country)?.label}. Можно вставить полный номер с кодом ${callingCode(country)}.`;

// These territories share mobile numbering plans; metadata may identify the parent region.
const SHARED_PLANS: Partial<Record<PhoneCountry, CountryCode>> = {
  AX: 'FI', VA: 'IT', IM: 'GB', SJ: 'NO', BL: 'GP', MF: 'GP',
  CC: 'AU', CX: 'AU', EH: 'MA',
};
const matchesCountry = (actual: CountryCode | undefined, selected: PhoneCountry) =>
  actual === selected || (SHARED_PLANS[selected] !== undefined && actual === SHARED_PLANS[selected]);

/** Preserve a pasted foreign number so validation rejects it instead of reinterpreting it. */
export function extractNational(raw: string, country: PhoneCountry = 'US'): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    const international = `+${trimmed.startsWith('00') ? digits.slice(2) : digits}`;
    const phone = parsePhoneNumberFromString(international);
    return phone && matchesCountry(phone.country, country) ? phone.nationalNumber : international;
  }
  return digits;
}

export function formatNational(digits: string, country: PhoneCountry = 'US'): string {
  return new AsYouType(country).input(digits);
}

export function validatePhone(value: string, selected: PhoneCountry): string | null {
  if (!/^\+?\d{4,15}$/.test(value)) return null;
  const phone = parsePhoneNumberFromString(value, selected);
  return phone?.isValid() && matchesCountry(phone.country, selected) ? phone.number : null;
}
