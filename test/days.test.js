const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseTrainingDays } = require('../src/days');
const { buildContacts } = require('../src/excel');

describe('parseTrainingDays', () => {
  test('parses Hebrew abbreviations', () => {
    assert.deepEqual(parseTrainingDays('א, ד'), [0, 3]);
    assert.deepEqual(parseTrainingDays('א׳ ו ד׳'), [0, 3]);
  });

  test('parses English names', () => {
    assert.deepEqual(parseTrainingDays('Sunday, Wednesday'), [0, 3]);
  });

  test('empty value returns empty array', () => {
    assert.deepEqual(parseTrainingDays(''), []);
    assert.deepEqual(parseTrainingDays(null), []);
  });
});

describe('buildContacts — training days column', () => {
  test('ימים column is attached to each enrollment', () => {
    const { contacts } = buildContacts([{
      'שם הלקוח': 'דנה',
      'שם קבוצה': 'ג׳וניור',
      'טלפון': '0501111111',
      'ימים': 'א, ג',
    }]);
    assert.equal(contacts.length, 1);
    assert.deepEqual(contacts[0].trainingDays, [0, 2]);
  });

  test('unavailable enrollment keeps training days', () => {
    const { contacts } = buildContacts([{
      'שם הלקוח': 'יואב',
      'שם קבוצה': 'נוער',
      'ימים': 'ד',
    }]);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].unavailable, true);
    assert.deepEqual(contacts[0].trainingDays, [3]);
  });
});
