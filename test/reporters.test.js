import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { junitReport, writeReport } from '../src/reporters.js';
import { temporary } from './helpers.js';

test('JUnit melakukan escape nama dan pesan yang mengandung XML', () => {
  const report = {
    name: 'A & "B"', startedAt: '2026-10-28T00:00:00.000Z',
    summary: { total: 1, passed: 0, failed: 1, durationMs: 125 },
    results: [{ name: '<gagal>', passed: false, durationMs: 125, checks: [{ passed: false, message: 'x < y & z\u0001' }] }]
  };
  const xml = junitReport(report);
  assert.match(xml, /A &amp; &quot;B&quot;/);
  assert.match(xml, /&lt;gagal&gt;/);
  assert.match(xml, /x &lt; y &amp; z/);
  assert.ok(!xml.includes('\u0001'));
  assert.match(xml, /time="0.125"/);
});

test('laporan mengganti berkas utuh tanpa menyisakan berkas sementara', async t => {
  const dir = await temporary(t);
  const path = join(dir, 'reports', 'result.json');
  await writeReport(path, '{"run":1}\n');
  await writeReport(path, '{"run":2}\n');
  assert.equal(await readFile(path, 'utf8'), '{"run":2}\n');
  assert.deepEqual(await readdir(join(dir, 'reports')), ['result.json']);
});
