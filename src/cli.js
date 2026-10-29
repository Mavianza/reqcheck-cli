import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigError, loadConfig } from './config.js';
import { runSuite } from './runner.js';
import { terminalReport, junitReport, writeReport } from './reporters.js';

const HELP = `ReqCheck 1.0.0 — penguji API dari JSON

Penggunaan:
  node bin/reqcheck.js init [berkas.json]
  node bin/reqcheck.js run [berkas.json] [--report hasil.json] [--junit hasil.xml]
  node bin/reqcheck.js --help
  node bin/reqcheck.js --version

Berkas default: reqcheck.json. Tidak membutuhkan npm install.
Exit code: 0 semua lulus, 1 ada pemeriksaan gagal, 2 konfigurasi/IO/argumen gagal.
`;

function parse(argv) {
  if (argv.length === 0 || (argv.length === 1 && ['--help', '-h'].includes(argv[0]))) return { command: 'help' };
  if (argv.length === 1 && argv[0] === '--version') return { command: 'version' };
  const command = argv[0];
  if (!['run', 'init'].includes(command)) throw new ConfigError('Perintah tidak dikenal. Gunakan --help.');
  if (argv.length === 2 && ['--help', '-h'].includes(argv[1])) return { command: 'help' };
  let config;
  const options = {};
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (command === 'run' && ['--report', '--junit'].includes(argument)) {
      if (Object.hasOwn(options, argument)) throw new ConfigError(`Opsi ${argument} tidak boleh diulang.`);
      const path = argv[++index];
      if (!path || path.startsWith('-')) throw new ConfigError(`Opsi ${argument} membutuhkan lokasi berkas.`);
      options[argument] = path;
    } else if (argument.startsWith('-')) throw new ConfigError('Opsi tidak dikenal. Gunakan --help.');
    else if (config !== undefined) throw new ConfigError('Hanya satu berkas konfigurasi yang dapat dipilih.');
    else config = argument;
  }
  return { command, config: config ?? 'reqcheck.json', report: options['--report'], junit: options['--junit'] };
}

async function distinctPaths(paths) {
  const seen = new Set();
  for (const path of paths.filter(Boolean)) {
    const absolute = resolve(path);
    let canonical;
    try { canonical = await realpath(absolute); }
    catch (error) { if (error.code !== 'ENOENT') throw error; canonical = absolute; }
    if (seen.has(canonical)) throw new ConfigError('Konfigurasi dan setiap laporan harus menggunakan berkas yang berbeda.');
    seen.add(canonical);
  }
}

export async function main(argv, io = { out: text => process.stdout.write(text), err: text => process.stderr.write(text) }) {
  try {
    const args = parse(argv);
    if (args.command === 'help') { io.out(HELP); return 0; }
    if (args.command === 'version') { io.out('1.0.0\n'); return 0; }
    if (args.command === 'init') {
      const template = await readFile(new URL('../examples/reqcheck.json', import.meta.url), 'utf8');
      await writeFile(args.config, template, { flag: 'wx', mode: 0o600 });
      io.out(`Konfigurasi dibuat: ${args.config}\nJalankan npm run demo, lalu node bin/reqcheck.js run ${JSON.stringify(args.config)}\n`);
      return 0;
    }
    await distinctPaths([args.config, args.report, args.junit]);
    const config = await loadConfig(args.config);
    const report = await runSuite(config);
    io.out(terminalReport(report));
    if (args.report) await writeReport(args.report, JSON.stringify(report, null, 2) + '\n');
    if (args.junit) await writeReport(args.junit, junitReport(report));
    return report.summary.failed ? 1 : 0;
  } catch (error) {
    const message = error instanceof ConfigError ? error.message
      : error.code === 'EEXIST' ? 'Berkas sudah ada; init tidak menimpanya.'
        : `Operasi berkas gagal (${error.code ?? 'INTERNAL_ERROR'}).`;
    io.err(`Kesalahan: ${message}\n`);
    return 2;
  }
}
