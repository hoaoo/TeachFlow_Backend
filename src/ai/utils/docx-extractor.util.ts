import * as zlib from 'zlib';

export interface DocxExtractedContent {
  tables: string[][][];
  text: string;
  hasTables: boolean;
}

export interface ExtractedStudentRow {
  fullName: string;
  studentCode?: string;
  gender?: string;
  dob?: string;
  parentName?: string;
  parentPhone?: string;
  note?: string;
  unmappedColumns?: Record<string, string>;
}

/**
 * Extracts raw tables and paragraphs from a .docx buffer without external dependencies
 */
export function extractDocxTablesAndText(buffer: Buffer): DocxExtractedContent {
  try {
    const xml = extractFileFromZip(buffer, 'word/document.xml');
    if (!xml) {
      return { tables: [], text: '', hasTables: false };
    }

    return parseDocxDocumentXml(xml);
  } catch {
    return { tables: [], text: '', hasTables: false };
  }
}

function extractFileFromZip(buffer: Buffer, targetPath: string): string | null {
  let offset = 0;
  const targetLower = targetPath.toLowerCase().replace(/^\//, '');

  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      const nextHeader = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset + 1);
      if (nextHeader === -1) break;
      offset = nextHeader;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > buffer.length) break;

    const fileName = buffer.toString('utf8', fileNameStart, fileNameEnd).toLowerCase();
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (fileName === targetLower) {
      const compressedData = buffer.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) {
        return compressedData.toString('utf8');
      } else if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressedData).toString('utf8');
      }
    }

    offset = dataEnd;
  }
  return null;
}

function parseDocxDocumentXml(xml: string): DocxExtractedContent {
  const tables: string[][][] = [];

  const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;
  while ((tblMatch = tblRegex.exec(xml)) !== null) {
    const tblXml = tblMatch[0];
    const rows: string[][] = [];
    const trRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(tblXml)) !== null) {
      const trXml = trMatch[0];
      const cells: string[] = [];
      const tcRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRegex.exec(trXml)) !== null) {
        const tcXml = tcMatch[0];
        const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
        let tMatch: RegExpExecArray | null;
        let cellText = '';
        while ((tMatch = tRegex.exec(tcXml)) !== null) {
          cellText += tMatch[1];
        }
        cells.push(cellText.trim());
      }
      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    }
    if (rows.length > 0) {
      tables.push(rows);
    }
  }

  const paragraphs: string[] = [];
  const pRegex = /<w:p[\s\S]*?<\/w:p>/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pXml = pMatch[0];
    const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    let pText = '';
    while ((tMatch = tRegex.exec(pXml)) !== null) {
      pText += tMatch[1];
    }
    const clean = pText.trim();
    if (clean) {
      paragraphs.push(clean);
    }
  }

  return {
    tables,
    text: paragraphs.join('\n'),
    hasTables: tables.length > 0,
  };
}

export function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Deterministically parse student rows from extracted docx tables
 */
export function parseDocxStudentTables(tables: string[][][]): {
  rows: ExtractedStudentRow[];
  unmappedWarnings: string[];
} {
  const allRows: ExtractedStudentRow[] = [];
  const unmappedWarnings: string[] = [];

  for (const table of tables) {
    if (table.length < 2) continue;

    // Find the header row (first row or row containing key keywords)
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(table.length, 3); r++) {
      const rowNormalized = table[r].map(normalizeHeaderKey);
      if (
        rowNormalized.some((k) =>
          ['hoten', 'fullname', 'ten', 'hovaten', 'tenhocsinh', 'mahs', 'studentcode', 'ngaysinh', 'gioitinh'].includes(
            k,
          ),
        )
      ) {
        headerRowIdx = r;
        break;
      }
    }

    const rawHeaders = table[headerRowIdx];
    const headers = rawHeaders.map(normalizeHeaderKey);

    // Identify indices for columns
    const colIndex = {
      stt: headers.findIndex((h) => ['stt', 'no', 'tt'].includes(h)),
      fullName: headers.findIndex((h) =>
        ['fullname', 'hoten', 'ten', 'hovaten', 'studentname', 'tenhocsinh', 'hoitenten', 'hotenhocsinh'].includes(h),
      ),
      studentCode: headers.findIndex((h) =>
        ['studentcode', 'mahs', 'mahocsinh', 'ma', 'code', 'sothe', 'maso', 'masohs', 'masohocsinh', 'sbd', 'id'].includes(h),
      ),
      gender: headers.findIndex((h) => ['gender', 'gioitinh', 'sex', 'phai', 'namnu'].includes(h)),
      dob: headers.findIndex((h) =>
        ['dob', 'ngaysinh', 'dateofbirth', 'birthdate', 'ns', 'namsinh', 'ngaythangnamsinh'].includes(h),
      ),
      parentName: headers.findIndex((h) =>
        ['parentname', 'phuhuynh', 'hotenphuhuynh', 'cha', 'me', 'tencha', 'tenme', 'nguoigiamho', 'nguoidamho', 'ph', 'tenphuhuynh'].includes(h),
      ),
      parentPhone: headers.findIndex((h) =>
        ['parentphone', 'sodienthoai', 'sdt', 'dienthoai', 'phone', 'tel', 'lienhe', 'sdtphuhuynh', 'sdtph', 'sdtlienhe'].includes(
          h,
        ),
      ),
      note: headers.findIndex((h) => ['note', 'ghichu', 'nhanxet', 'luuy', 'thongtinkhac'].includes(h)),
    };

    // Detect unmapped columns to notify teacher
    const recognizedIndices = new Set(Object.values(colIndex).filter((idx) => idx !== -1));
    rawHeaders.forEach((h, idx) => {
      if (!recognizedIndices.has(idx) && h.trim()) {
        unmappedWarnings.push(`Cột "${h.trim()}" không nằm trong hệ thống`);
      }
    });

    // Parse data rows
    for (let r = headerRowIdx + 1; r < table.length; r++) {
      const row = table[r];
      if (row.length === 0 || row.every((c) => !c.trim())) continue;

      let fullName = '';
      if (colIndex.fullName !== -1) {
        fullName = row[colIndex.fullName] || '';
      } else {
        // Fallback positional
        fullName = row[0] === '1' || /^\d+$/.test(row[0]) ? row[1] || '' : row[0] || '';
      }

      if (!fullName.trim()) continue;

      const studentCode = colIndex.studentCode !== -1 ? row[colIndex.studentCode] : undefined;
      const gender = colIndex.gender !== -1 ? row[colIndex.gender] : undefined;
      const dob = colIndex.dob !== -1 ? row[colIndex.dob] : undefined;
      const parentName = colIndex.parentName !== -1 ? row[colIndex.parentName] : undefined;
      const parentPhone = colIndex.parentPhone !== -1 ? row[colIndex.parentPhone] : undefined;
      const note = colIndex.note !== -1 ? row[colIndex.note] : undefined;

      // Extract unmapped fields
      const unmappedColumns: Record<string, string> = {};
      rawHeaders.forEach((h, idx) => {
        if (!recognizedIndices.has(idx) && row[idx]?.trim()) {
          unmappedColumns[h.trim()] = row[idx].trim();
        }
      });

      allRows.push({
        fullName: fullName.trim(),
        studentCode: studentCode?.trim() || undefined,
        gender: gender?.trim() || undefined,
        dob: dob?.trim() || undefined,
        parentName: parentName?.trim() || undefined,
        parentPhone: parentPhone?.trim() || undefined,
        note: note?.trim() || undefined,
        unmappedColumns: Object.keys(unmappedColumns).length > 0 ? unmappedColumns : undefined,
      });
    }
  }

  return {
    rows: allRows,
    unmappedWarnings: Array.from(new Set(unmappedWarnings)),
  };
}
