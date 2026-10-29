import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { temporary, localServer, example } from './helpers.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/reqcheck.js', import.meta.url));
async function invoke(args, cwd) {
  try { return { code: 0, ...await exec(process.execPath, [cli, ...args], { cwd, timeout: 10000 }) }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}

test('CLI bantuan dan versi tersedia tanpa konfigurasi', async t => {
  const dir = await temporary(t);
  assert.match((await invoke(['--help'], dir)).stdout, /Penggunaan/);
  assert.equal((await invoke(['--version'], dir)).stdout.trim(), '1.0.0');
});

test('init membuat konfigurasi lengkap dan menolak menimpa berkas', async t => {
  const dir = await temporary(t);
  assert.equal((await invoke(['init'], dir)).code, 0);
  const before = await readFile(join(dir, 'reqcheck.json'), 'utf8');
  assert.equal(JSON.parse(before).tests.length, 4);
  assert.equal((await invoke(['init'], dir)).code, 2);
  assert.equal(await readFile(join(dir, 'reqcheck.json'), 'utf8'), before);
});

test('CLI menguji API nyata dan menyimpan laporan JSON serta JUnit', async t => {
  const dir = await temporary(t);
  const { url } = await localServer(t, (req, res) => res.end('ok'));
  await writeFile(join(dir, 'config.json'), JSON.stringify({ tests: [example({ url })] }));
  const result = await invoke(['run', 'config.json', '--report', 'reports/a.json', '--junit', 'reports/a.xml'], dir);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /1\/1 lulus/);
  assert.equal(JSON.parse(await readFile(join(dir, 'reports/a.json'))).summary.passed, 1);
  assert.match(await readFile(join(dir, 'reports/a.xml'), 'utf8'), /<testsuite .*failures="0"/);
});

test('kegagalan API memberi exit code 1 dan laporan tetap tersimpan', async t => {
  const dir = await temporary(t);
  const { url } = await localServer(t, (req, res) => { res.writeHead(503); res.end('unavailable'); });
  await writeFile(join(dir, 'config.json'), JSON.stringify({ tests: [example({ url })] }));
  const result = await invoke(['run', 'config.json', '--report', 'failed.json'], dir);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(await readFile(join(dir, 'failed.json'))).summary.failed, 1);
});

test('konfigurasi invalid tidak mengirim permintaan apa pun', async t => {
  const dir = await temporary(t);
  let count = 0;
  const { url } = await localServer(t, (req, res) => { count++; res.end('ok'); });
  await writeFile(join(dir, 'config.json'), JSON.stringify({ tests: [example({ url }), example({ name: 'Invalid', url, expect: {} })] }));
  assert.equal((await invoke(['run', 'config.json'], dir)).code, 2);
  assert.equal(count, 0);
});

test('laporan tidak dapat menimpa konfigurasi atau satu sama lain', async t => {
  const dir = await temporary(t);
  const content = JSON.stringify({ tests: [example()] });
  await writeFile(join(dir, 'config.json'), content);
  for (const args of [ ['--report', 'config.json'], ['--report', 'same.json', '--junit', 'same.json'] ]) {
    assert.equal((await invoke(['run', 'config.json', ...args], dir)).code, 2);
  }
  assert.equal(await readFile(join(dir, 'config.json'), 'utf8'), content);
});

test('argumen invalid dan berkas hilang memberi exit code 2', async t => {
  const dir = await temporary(t);
  for (const args of [['invalid'], ['run', '--report'], ['run', '--report', 'a', '--report', 'b'], ['run', '--invalid'], ['run', 'missing.json']]) {
    assert.equal((await invoke(args, dir)).code, 2, JSON.stringify(args));
  }
});

test('gagal menulis laporan memberi exit code 2 setelah tes terlaksana', async t => {
  const dir = await temporary(t);
  const { url } = await localServer(t, (req, res) => res.end('ok'));
  await writeFile(join(dir, 'config.json'), JSON.stringify({ tests: [example({ url })] }));
  await mkdir(join(dir, 'target'));
  const result = await invoke(['run', 'config.json', '--report', 'target'], dir);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /1\/1 lulus/);
});
