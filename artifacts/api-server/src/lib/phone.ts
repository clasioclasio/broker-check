import { getCountries, parsePhoneNumberFromString } from 'libphonenumber-js/max';

export const PHONE_COUNTRY_IDS = getCountries();

export function isSupportedPhone(value: string): boolean {
  if (!/^\+[1-9][0-9]{3,14}$/.test(value)) return false;
  const phone = parsePhoneNumberFromString(value);
  return !!phone?.isValid() && !!phone.country && PHONE_COUNTRY_IDS.includes(phone.country);
}
