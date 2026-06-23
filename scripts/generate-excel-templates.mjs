/**
 * Sinh file .xlsx mẫu từ shared/constants/excel-template.js
 * Chạy: npm run generate:templates
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import {
    EXCEL_TEMPLATE_TOPICS,
    EXCEL_TEMPLATE_SAMPLE_ROWS
} from '../shared/constants/excel-template.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'frontend', 'data');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

for (const topic of EXCEL_TEMPLATE_TOPICS) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(EXCEL_TEMPLATE_SAMPLE_ROWS);
    const sheetName = topic.label.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, path.join(outDir, topic.fileName));
    console.log(`[templates] ${topic.fileName}`);
}

console.log(`[templates] Done — ${EXCEL_TEMPLATE_TOPICS.length} file(s) in frontend/data/`);
