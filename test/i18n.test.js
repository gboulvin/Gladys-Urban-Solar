// Every user-facing text exists in the four languages of the Gladys UI:
// English, French, German and Spanish — in the code, the manifest and the docs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, MESSAGES, t } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

test('every message of the code carries the four languages', () => {
  for (const [key, message] of Object.entries(MESSAGES)) {
    assert.deepEqual(Object.keys(message).sort(), [...LANGUAGES].sort(), `message "${key}"`);
    for (const lang of LANGUAGES) {
      assert.ok(message[lang].trim(), `message "${key}" has an empty ${lang} text`);
    }
    // Every language uses the same placeholders.
    const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join();
    for (const lang of LANGUAGES) {
      assert.equal(placeholders(message[lang]), placeholders(message.en), `"${key}".${lang}`);
    }
  }
});

test('t() fills the placeholders in every language', () => {
  const message = t('calibrated', { stock: 12.5 });
  for (const lang of LANGUAGES) {
    assert.match(message[lang], /12\.5/);
  }
  assert.throws(() => t('no_such_key'), /Unknown message key/);
});

test('every multi-language text of the manifest carries the four languages', () => {
  const missing = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      if (typeof node.en === 'string') {
        for (const lang of LANGUAGES) {
          if (typeof node[lang] !== 'string' || !node[lang].trim()) missing.push(`${path}.${lang}`);
        }
        return;
      }
      for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`);
    }
  };
  walk(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('the user documentation exists in the four languages', async () => {
  for (const lang of LANGUAGES) {
    const doc = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    // The store re-hosts a doc of at least 300 characters.
    assert.ok(doc.length >= 300, `docs/${lang}.md is too short`);
  }
});
