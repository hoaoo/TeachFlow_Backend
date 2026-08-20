import * as fs from 'fs';
import * as path from 'path';

const frontendDir = path.resolve('d:/Fontend_teachflow');

function getAllFrontendFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFrontendFiles(filePath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.env') || file.endsWith('.env.local') || file.endsWith('.env.example')) {
      results.push(filePath);
    }
  }
  return results;
}

const files = getAllFrontendFiles(frontendDir);
console.log(`Found ${files.length} files in frontend.`);

const localhostMatches: Array<{ file: string; line: number; text: string }> = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    if (line.includes('localhost') || line.includes('127.0.0.1')) {
      localhostMatches.push({
        file: path.relative(frontendDir, file),
        line: lineNum,
        text: line.trim(),
      });
    }
  });
}

console.log(`\nLocalhost / 127.0.0.1 occurrences in frontend (${localhostMatches.length}):`);
localhostMatches.forEach((m) => {
  console.log(`[${m.file}:${m.line}] ${m.text}`);
});
