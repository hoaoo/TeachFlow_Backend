import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.resolve(__dirname, '../src');

function getAllFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath));
    } else if (file.endsWith('.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

const files = getAllFiles(srcDir);
console.log(`Found ${files.length} TypeScript files in backend src/`);

const sensitiveKeywords = [
  'password',
  'passwordHash',
  'jwt',
  'token',
  'secret',
  'apiKey',
  'authorization',
];

const findings: Array<{ file: string; line: number; text: string; issue: string }> = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Check for console.log
    if (trimmed.startsWith('console.log(') || trimmed.includes('console.log(')) {
      findings.push({
        file: path.relative(srcDir, file),
        line: lineNum,
        text: trimmed,
        issue: 'console.log used in backend source',
      });
    }

    // Check for logging sensitive keywords
    if (
      (trimmed.includes('this.logger.') || trimmed.includes('logger.')) &&
      sensitiveKeywords.some((kw) => line.toLowerCase().includes(kw))
    ) {
      findings.push({
        file: path.relative(srcDir, file),
        line: lineNum,
        text: trimmed,
        issue: 'Potential sensitive keyword in Logger statement',
      });
    }

    // Check for hardcoded secrets
    if (
      line.includes('teachflow_jwt_access_super_secret_key_2026') ||
      line.includes('teachflow_jwt_refresh_super_secret_key_2026')
    ) {
      findings.push({
        file: path.relative(srcDir, file),
        line: lineNum,
        text: trimmed,
        issue: 'Hardcoded default fallback secret string',
      });
    }
  });
}

console.log(`\nScan results (${findings.length} findings):`);
findings.forEach((f) => {
  console.log(`[${f.file}:${f.line}] ${f.issue} -> ${f.text}`);
});
