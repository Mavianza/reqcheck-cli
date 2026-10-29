import { readFile, stat } from 'node:fs/promises';

export class ConfigError extends Error {}

const own = (value, key) => Object.hasOwn(value, key);
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_HEADERS = new Set(['content-length', 'connection', 'transfer-encoding', 'upgrade']);

function fail(message) { throw new ConfigError(message); }
function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} harus berupa objek.`);
  }
  return value;
}
function keys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label}: kolom ${JSON.stringify(key)} tidak dikenal.`);
  }
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${label} harus berupa teks tidak kosong tanpa karakter kontrol (maksimum 4096 karakter).`);
  }
  return value;
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} harus bilangan bulat ${min}–${max}.`);
  return value;
}
function interpolate(value, env, label) {
  const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  if (value.replace(pattern, '').includes('${')) fail(`${label}: gunakan format variabel lingkungan \${NAMA_VARIABEL}.`);
  return value.replace(pattern, (_, key) => {
    if (!own(env, key) || env[key] === undefined) fail(`${label}: variabel lingkungan ${key} belum diatur.`);
    return String(env[key]);
  });
}
function httpUrl(value, base, label) {
  text(value, label);
  let url;
  try { url = new URL(value, base); } catch { fail(`${label} bukan URL HTTP/HTTPS yang valid.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    fail(`${label} harus HTTP/HTTPS, tanpa kredensial di URL atau fragmen #.`);
  }
  return url;
}
function headers(value, label, env) {
  object(value, label);
  const result = Object.create(null);
  for (const [name, raw] of Object.entries(value)) {
    const lower = name.toLowerCase();
    if (!HEADER_NAME.test(name) || (env && FORBIDDEN_HEADERS.has(lower)) || own(result, lower)) {
      fail(`${label}: nama header tidak valid, duplikat, atau dikelola oleh HTTP.`);
    }
    if (typeof raw !== 'string') fail(`${label}: nilai header harus berupa teks.`);
    const v = env ? interpolate(raw, env, label) : raw;
    // Fetch memakai nilai header ByteString; validasi sebelum mengirim permintaan apa pun.
    if (/[^\t\x20-\x7e\x80-\xff]/.test(v)) fail(`${label}: nilai header mengandung karakter tidak valid.`);
    result[lower] = v.trim();
  }
  return result;
}

export function pointerParts(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/') || /~(?:[^01]|$)/.test(pointer)) {
    fail('Kunci expect.json harus JSON Pointer: kosong untuk akar atau diawali /; escape ~0 dan ~1.');
  }
  return pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function validateConfig(raw, env = process.env) {
  object(raw, 'Konfigurasi');
  keys(raw, ['name', 'baseUrl', 'timeoutMs', 'maxResponseBytes', 'tests'], 'Konfigurasi');
  const name = raw.name === undefined ? 'ReqCheck' : text(raw.name, 'name');
  const timeoutMs = integer(raw.timeoutMs ?? 5000, 1, 120000, 'timeoutMs');
  const maxResponseBytes = integer(raw.maxResponseBytes ?? 1048576, 1, 10485760, 'maxResponseBytes');
  let baseUrl;
  if (raw.baseUrl !== undefined) {
    baseUrl = httpUrl(interpolate(text(raw.baseUrl, 'baseUrl'), env, 'baseUrl'), undefined, 'baseUrl');
    if (baseUrl.search) fail('baseUrl tidak boleh memiliki query; taruh query pada url setiap tes.');
  }
  if (!Array.isArray(raw.tests) || raw.tests.length < 1 || raw.tests.length > 100) {
    fail('tests harus berupa daftar berisi 1–100 tes.');
  }
  const names = new Set();
  const tests = raw.tests.map((item, index) => {
    const label = `tests[${index}]`;
    object(item, label);
    keys(item, ['name', 'url', 'method', 'headers', 'json', 'timeoutMs', 'expect'], label);
    const testName = text(item.name, `${label}.name`);
    if (names.has(testName)) fail(`${label}.name harus unik.`);
    names.add(testName);
    const url = httpUrl(interpolate(text(item.url, `${label}.url`), env, label), baseUrl, `${label}.url`).href;
    const method = (item.method ?? 'GET');
    if (typeof method !== 'string' || !METHODS.has(method.toUpperCase())) fail(`${label}.method tidak didukung.`);
    const normalizedMethod = method.toUpperCase();
    if (own(item, 'json') && ['GET', 'HEAD'].includes(normalizedMethod)) fail(`${label}: GET/HEAD tidak menerima body json.`);
    const requestHeaders = headers(item.headers ?? {}, `${label}.headers`, env);
    if (own(item, 'json') && !own(requestHeaders, 'content-type')) requestHeaders['content-type'] = 'application/json';

    const expect = object(item.expect, `${label}.expect`);
    keys(expect, ['status', 'headers', 'bodyIncludes', 'json', 'maxDurationMs'], `${label}.expect`);
    let assertions = 0;
    if (own(expect, 'status')) {
      const statuses = Array.isArray(expect.status) ? expect.status : [expect.status];
      if (!statuses.length) fail(`${label}.expect.status tidak boleh kosong.`);
      for (const s of statuses) integer(s, 100, 599, `${label}.expect.status`);
      assertions++;
    }
    let expectedHeaders;
    if (own(expect, 'headers')) {
      expectedHeaders = headers(expect.headers, `${label}.expect.headers`);
      if (!Object.keys(expectedHeaders).length) fail(`${label}.expect.headers tidak boleh kosong.`);
      assertions += Object.keys(expectedHeaders).length;
    }
    if (own(expect, 'bodyIncludes')) { text(expect.bodyIncludes, `${label}.expect.bodyIncludes`); assertions++; }
    if (own(expect, 'json')) {
      object(expect.json, `${label}.expect.json`);
      if (!Object.keys(expect.json).length) fail(`${label}.expect.json tidak boleh kosong.`);
      for (const pointer of Object.keys(expect.json)) pointerParts(pointer);
      assertions += Object.keys(expect.json).length;
    }
    if (own(expect, 'maxDurationMs')) {
      integer(expect.maxDurationMs, 1, 120000, `${label}.expect.maxDurationMs`);
      assertions++;
    }
    if (!assertions) fail(`${label}.expect harus memuat setidaknya satu pemeriksaan.`);
    return {
      name: testName, url, method: normalizedMethod, headers: requestHeaders,
      ...(own(item, 'json') ? { body: JSON.stringify(item.json) } : {}),
      timeoutMs: integer(item.timeoutMs ?? timeoutMs, 1, 120000, `${label}.timeoutMs`),
      expect: { ...expect, ...(expectedHeaders ? { headers: expectedHeaders } : {}) }
    };
  });
  return { name, maxResponseBytes, tests };
}

export async function loadConfig(path, env = process.env) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > 1048576) fail('Konfigurasi harus berupa berkas JSON maksimum 1 MiB.');
    const contents = await readFile(path, 'utf8');
    let raw;
    try { raw = JSON.parse(contents.replace(/^\uFEFF/, '')); }
    catch { fail('Konfigurasi bukan JSON yang valid.'); }
    return validateConfig(raw, env);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    fail(`Konfigurasi tidak dapat dibaca (${error.code ?? 'IO_ERROR'}).`);
  }
}
