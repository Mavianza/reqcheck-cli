import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function terminalReport(report) {
  const lines = [report.name];
  for (const result of report.results) {
    lines.push(`[${result.passed ? 'LULUS' : 'GAGAL'}] ${result.name} (HTTP ${result.status ?? '-'}, ${result.durationMs} ms)`);
    if (result.error) lines.push(`  ${result.error.code}: ${result.error.message}`);
    for (const check of result.checks.filter(check => !check.passed)) lines.push(`  Tidak terpenuhi: ${check.message}`);
  }
  const s = report.summary;
  lines.push(`${s.passed}/${s.total} lulus; ${s.failed} gagal. Durasi ${s.durationMs} ms.`);
  return lines.join('\n') + '\n';
}

function xml(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function junitReport(report) {
  const seconds = ms => (ms / 1000).toFixed(3);
  const s = report.summary;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${xml(report.name)}" tests="${s.total}" failures="${s.failed}" errors="0" skipped="0" time="${seconds(s.durationMs)}" timestamp="${xml(report.startedAt)}">`
  ];
  for (const result of report.results) {
    lines.push(`  <testcase name="${xml(result.name)}" classname="ReqCheck" time="${seconds(result.durationMs)}">`);
    if (!result.passed) {
      const messages = result.error ? [`${result.error.code}: ${result.error.message}`] : [];
      messages.push(...result.checks.filter(check => !check.passed).map(check => `Tidak terpenuhi: ${check.message}`));
      lines.push(`    <failure message="Pemeriksaan API gagal">${xml(messages.join('\n'))}</failure>`);
    }
    lines.push('  </testcase>');
  }
  lines.push('</testsuite>');
  return lines.join('\n') + '\n';
}

export async function writeReport(path, contents) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(contents, 'utf8'); } finally { await file.close(); }
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
