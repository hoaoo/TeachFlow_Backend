import * as fs from 'fs';
import * as path from 'path';

function walk(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.next' || file === '.git' || file === 'dist') continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, fileList);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const frontendFiles = walk('d:/Fontend_teachflow');
const backendFiles = walk('d:/Backend_teachflow/src');

console.log(`Found ${frontendFiles.length} frontend files and ${backendFiles.length} backend source files.\n`);

const patterns = [
  { name: 'TODO / FIXME', regex: /\b(TODO|FIXME)\b/i },
  { name: 'Mock / Dummy / Fake Data', regex: /\b(mockData|mockClasses|mockStudents|fallbackRecords|fallbackStudents|fallbackActivities|fallbackTasks)\b/i },
  { name: 'Native alert / confirm', regex: /\b(window\.alert|window\.confirm|alert\(|confirm\()\b/ },
  { name: 'Dead Buttons / Empty Handlers', regex: /onClick=\{?\(\)\s*=>\s*\{\}\}?/ },
  { name: 'Coming soon / Placeholder text', regex: /(coming soon|chưa hỗ trợ|tính năng đang phát triển)/i },
  { name: 'Math.random ID generators', regex: /Math\.random/ },
];

console.log('================ SCANNING FRONTEND ================');
for (const file of frontendFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const rel = path.relative('d:/Fontend_teachflow', file);

  lines.forEach((line, idx) => {
    for (const pat of patterns) {
      if (pat.regex.test(line)) {
        console.log(`[${pat.name}] ${rel}:${idx + 1} -> ${line.trim()}`);
      }
    }
  });
}

console.log('\n================ SCANNING BACKEND ================');
for (const file of backendFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const rel = path.relative('d:/Backend_teachflow', file);

  lines.forEach((line, idx) => {
    for (const pat of patterns) {
      if (pat.regex.test(line)) {
        console.log(`[${pat.name}] ${rel}:${idx + 1} -> ${line.trim()}`);
      }
    }
  });
}
