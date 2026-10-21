// Run: node --experimental-strip-types --test scripts/tests/phone.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { PHONE_COUNTRIES, callingCode, extractNational, formatNational, validatePhone } from '../../artifacts/broker-check/src/lib/phone.ts';
import { PHONE_COUNTRY_IDS, isSupportedPhone } from '../../artifacts/api-server/src/lib/phone.ts';

const require = createRequire(new URL('../../artifacts/broker-check/package.json', import.meta.url));
const examples = require('libphonenumber-js/mobile/examples');
const { getExampleNumber } = require('libphonenumber-js/max');

test('The country selector and server allowlist stay aligned', () => {
  assert.deepEqual([...PHONE_COUNTRY_IDS].sort(), PHONE_COUNTRIES.map((c) => c.id).sort());
  assert.equal(new Set(PHONE_COUNTRY_IDS).size, PHONE_COUNTRY_IDS.length);
  for (const c of PHONE_COUNTRIES) assert.ok(c.label && c.label !== c.id);
});

for (const country of PHONE_COUNTRIES) {
  test(`${country.id}: national, international paste, 00 prefix, formatting and server validation`, () => {
    const example = getExampleNumber(country.id, examples);
    assert.ok(example);
    for (const input of [example.number, example.number.replace('+', '00'), example.nationalNumber]) {
      const national = extractNational(input, country.id);
      assert.equal(validatePhone(national, country.id), example.number);
      assert.equal(extractNational(formatNational(national, country.id), country.id), national);
    }
    assert.ok(isSupportedPhone(example.number));
    assert.ok(callingCode(country.id).startsWith('+'));
  });
}

test('Reject malformed and wrong-country numbers', () => {
  for (const number of ['+33123', '+49000000000', 'abc', '+999123456789', '14155550132']) {
    assert.equal(isSupportedPhone(number), false, number);
  }
  assert.equal(validatePhone(extractNational('+442079460958', 'FR'), 'FR'), null);
  assert.equal(validatePhone('4165550123', 'US'), null);
  assert.equal(validatePhone('4155550132', 'CA'), null);
  assert.equal(validatePhone('123', 'DE'), null);
});

test('Numbers outside North America and Europe are accepted', () => {
  for (const country of ['BS', 'BR', 'IN', 'CN', 'AU', 'JP', 'ZA']) {
    const number = getExampleNumber(country, examples).number;
    assert.equal(isSupportedPhone(number), true, number);
  }
});

test('National trunk prefixes and existing US/Canada numbers normalize to E.164', () => {
  for (const [country, input, expected] of [
    ['DE', '015123456789', '+4915123456789'],
    ['FR', '0612345678', '+33612345678'],
    ['US', '4155550132', '+14155550132'],
    ['CA', '4165550123', '+14165550123'],
  ]) {
    assert.equal(validatePhone(extractNational(input, country), country), expected);
  }
});
