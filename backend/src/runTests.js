const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// End-to-end scripts: these need the backend running
const scripts = [
  ['Skip and re-queue', 'testSkip.js'],
  ['Token timeline', 'testTimeline.js'],
  ['CSV export', 'testExport.js'],
  ['Offline sync', 'testOffline.js'],
  ['Patients and phones', 'testPatients.js'],
];

const report = [];
const say = (s = '') => { console.log(s); report.push(s); };
const details = [];

const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' });
say(`HealthQueue test report, ${stamp} (Lusaka time)`);
say('');

let totalPass = 0;
let totalFail = 0;
let notRun = 0;

// 1. Unit tests (no server needed)
const unit = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=tap', path.join(__dirname, '..', 'test', 'ewt.test.js')],
  { encoding: 'utf8' }
);
const unitText = (unit.stdout || '') + (unit.stderr || '');
const unitPass = parseInt((unitText.match(/^# pass (\d+)/m) || [])[1] || '0');
const unitFail = parseInt((unitText.match(/^# fail (\d+)/m) || [])[1] || '0');
const unitRan = /^# tests \d+/m.test(unitText);
totalPass += unitPass;
totalFail += unitFail;
if (!unitRan) notRun++;
say(`${'EWT unit tests'.padEnd(20)} ${String(unitPass).padStart(2)} passed, ${unitFail} failed   ${
  !unitRan ? 'NOT RUN' : unitFail > 0 ? 'FAILED' : 'OK'}`);
for (const line of unitText.split(/\r?\n/)) {
  if (/^not ok /.test(line)) say(`    ${line}`);
}
details.push(`===== test/ewt.test.js =====\n${unitText.trim()}\n`);

// 2. End-to-end scripts
for (const [label, file] of scripts) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  const text = (r.stdout || '') + (r.stderr || '');
  const pass = (text.match(/^PASS /gm) || []).length;
  const fail = (text.match(/^FAIL /gm) || []).length;
  const didNotRun = /Test could not run|^Stop:|No completed token found/m.test(text);

  totalPass += pass;
  totalFail += fail;
  if (didNotRun) notRun++;

  const result = didNotRun ? 'NOT RUN' : fail > 0 ? 'FAILED' : 'OK';
  say(`${label.padEnd(20)} ${String(pass).padStart(2)} passed, ${fail} failed   ${result}`);
  for (const line of text.split(/\r?\n/)) {
    if (/^FAIL /.test(line)) say(`    ${line}`);
  }
  details.push(`===== ${file} =====\n${text.trim()}\n`);
}

say('');
say(`Total: ${totalPass} passed, ${totalFail} failed, ${notRun} script(s) not run`);

const docsDir = path.join(__dirname, '..', '..', 'docs');
fs.mkdirSync(docsDir, { recursive: true });
const file = path.join(docsDir, 'test-report.txt');
fs.writeFileSync(file, report.join('\n') + '\n\n' + details.join('\n'));
console.log(`\nFull report saved to ${file}`);

process.exitCode = totalFail > 0 || notRun > 0 ? 1 : 0;