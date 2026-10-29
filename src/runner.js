import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { pointerParts } from './config.js';

class ResponseLimitError extends Error {}

function publicUrl(value) {
  const url = new URL(value);
  // Nilai query, header, body permintaan, dan body respons tidak disalin ke laporan.
  return `${url.origin}${url.pathname}${url.search ? '?[query disembunyikan]' : ''}`;
}

function lookup(value, pointer) {
  for (const part of pointerParts(pointer)) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return { found: false };
    value = value[part];
  }
  return { found: true, value };
}

async function readBounded(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new ResponseLimitError();
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function runTest(test, maxResponseBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), test.timeoutMs);
  const start = performance.now();
  const result = {
    name: test.name, method: test.method, url: publicUrl(test.url),
    status: null, durationMs: 0, passed: false, checks: []
  };
  const check = (type, passed, message) => result.checks.push({ type, passed, message });
  try {
    const response = await fetch(test.url, {
      method: test.method, headers: test.headers, body: test.body,
      signal: controller.signal, redirect: 'manual'
    });
    result.status = response.status;
    const body = await readBounded(response, maxResponseBytes);
    const elapsed = performance.now() - start;
    const expected = test.expect;
    if (Object.hasOwn(expected, 'status')) {
      const accepted = Array.isArray(expected.status) ? expected.status : [expected.status];
      check('status', accepted.includes(response.status), 'Status HTTP sesuai daftar yang diharapkan.');
    }
    for (const [name, value] of Object.entries(expected.headers ?? {})) {
      check('header', response.headers.get(name) === value, `Header ${JSON.stringify(name)} cocok.`);
    }
    if (Object.hasOwn(expected, 'bodyIncludes')) {
      check('text', body.includes(expected.bodyIncludes), 'Respons mengandung teks yang diharapkan.');
    }
    if (Object.hasOwn(expected, 'json')) {
      let parsed;
      let valid = true;
      try { parsed = JSON.parse(body); } catch { valid = false; }
      if (!valid) check('json', false, 'Respons harus berupa JSON yang valid.');
      else for (const [pointer, value] of Object.entries(expected.json)) {
        const actual = lookup(parsed, pointer);
        check('json', actual.found && isDeepStrictEqual(actual.value, value), `Nilai JSON pada ${JSON.stringify(pointer)} cocok.`);
      }
    }
    if (Object.hasOwn(expected, 'maxDurationMs')) {
      check('duration', elapsed <= expected.maxDurationMs, 'Durasi menerima seluruh respons memenuhi batas.');
    }
    result.passed = result.checks.every(item => item.passed);
  } catch (error) {
    result.error = error instanceof ResponseLimitError
      ? { code: 'RESPONSE_TOO_LARGE', message: `Respons melebihi ${maxResponseBytes} byte.` }
      : controller.signal.aborted
        ? { code: 'TIMEOUT', message: `Permintaan melewati timeout ${test.timeoutMs} ms.` }
        : { code: 'NETWORK_ERROR', message: 'Permintaan gagal karena koneksi, TLS, atau protokol HTTP.' };
  } finally {
    clearTimeout(timer);
    result.durationMs = Math.round(performance.now() - start);
  }
  return result;
}

export async function runSuite(config) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const results = [];
  for (const test of config.tests) results.push(await runTest(test, config.maxResponseBytes));
  const passed = results.filter(test => test.passed).length;
  return {
    schemaVersion: 1, name: config.name, startedAt, finishedAt: new Date().toISOString(),
    summary: { total: results.length, passed, failed: results.length - passed, durationMs: Math.round(performance.now() - start) },
    results
  };
}
