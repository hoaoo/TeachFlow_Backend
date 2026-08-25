export interface ImportStudentPreviewRow {
  fullName: string;
  studentCode?: string;
  gender?: string;
  dob?: string;
  parentName?: string;
  parentPhone?: string;
  note?: string;
  valid: boolean;
  errors: string[];
  warnings?: string[];
  unmappedColumns?: Record<string, string>;
}

export function normalizeFullName(name: string): string {
  return (name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

/**
 * Standardize Vietnamese/ISO birth date to YYYY-MM-DD
 */
export function normalizeDateOfBirth(val: unknown): {
  isoDate?: string;
  formattedDate?: string;
  isValid: boolean;
} {
  if (!val) return { isValid: true };
  const raw = String(val).trim();
  if (!raw || raw === '—' || raw === '-') return { isValid: true };

  // Match DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);

    if (isValidDateComponents(day, month, year)) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        isoDate: `${year}-${pad(month)}-${pad(day)}`,
        formattedDate: `${pad(day)}/${pad(month)}/${year}`,
        isValid: true,
      };
    }
    return { isValid: false };
  }

  // Match YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);

    if (isValidDateComponents(day, month, year)) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        isoDate: `${year}-${pad(month)}-${pad(day)}`,
        formattedDate: `${pad(day)}/${pad(month)}/${year}`,
        isValid: true,
      };
    }
    return { isValid: false };
  }

  // Fallback Date.parse
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    if (isValidDateComponents(day, month, year)) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        isoDate: `${year}-${pad(month)}-${pad(day)}`,
        formattedDate: `${pad(day)}/${pad(month)}/${year}`,
        isValid: true,
      };
    }
  }

  return { isValid: false };
}

function isValidDateComponents(day: number, month: number, year: number): boolean {
  if (year < 1990 || year > new Date().getFullYear() + 2) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

export function normalizeGender(val: unknown): {
  gender: 'Nam' | 'Nữ';
  isValid: boolean;
} {
  if (!val) return { gender: 'Nam', isValid: true };
  const raw = String(val).trim().toLowerCase();
  if (!raw) return { gender: 'Nam', isValid: true };

  if (['nu', 'nữ', 'female', 'f', 'gái', 'gai', '0'].includes(raw)) {
    return { gender: 'Nữ', isValid: true };
  }
  if (['nam', 'male', 'm', 'trai', '1'].includes(raw)) {
    return { gender: 'Nam', isValid: true };
  }

  return { gender: 'Nam', isValid: false };
}

export function normalizePhoneNumber(val: unknown): string | undefined {
  if (!val) return undefined;
  const raw = String(val).trim();
  const cleaned = raw.replace(/[^\d+]/g, '');
  return cleaned || undefined;
}

export function validateAndNormalizeStudentRow(row: {
  fullName?: string;
  studentCode?: string;
  gender?: string;
  dob?: string;
  parentName?: string;
  parentPhone?: string;
  note?: string;
  unmappedColumns?: Record<string, string>;
}): ImportStudentPreviewRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const fullName = normalizeFullName(row.fullName || '');
  if (!fullName) {
    errors.push('Thiếu họ và tên học sinh');
  }

  let standardizedDob: string | undefined;
  if (row.dob && String(row.dob).trim()) {
    const dobResult = normalizeDateOfBirth(row.dob);
    if (!dobResult.isValid) {
      errors.push(`Ngày sinh "${row.dob}" không hợp lệ (định dạng DD/MM/YYYY)`);
      standardizedDob = String(row.dob).trim();
    } else {
      standardizedDob = dobResult.formattedDate;
    }
  }

  let standardizedGender = 'Nam';
  if (row.gender && String(row.gender).trim()) {
    const genderResult = normalizeGender(row.gender);
    if (!genderResult.isValid) {
      errors.push(`Giới tính "${row.gender}" không hợp lệ (chọn Nam hoặc Nữ)`);
    }
    standardizedGender = genderResult.gender;
  }

  const studentCode = row.studentCode ? String(row.studentCode).trim() : undefined;
  const parentName = row.parentName ? normalizeFullName(row.parentName) : undefined;
  const parentPhone = normalizePhoneNumber(row.parentPhone);
  const note = row.note ? String(row.note).trim() : undefined;

  if (row.unmappedColumns && Object.keys(row.unmappedColumns).length > 0) {
    Object.keys(row.unmappedColumns).forEach((k) => {
      warnings.push(`Cột "${k}" không được lưu vào cơ sở dữ liệu`);
    });
  }

  return {
    fullName,
    studentCode: studentCode || undefined,
    gender: standardizedGender,
    dob: standardizedDob || undefined,
    parentName: parentName || undefined,
    parentPhone: parentPhone || undefined,
    note: note || undefined,
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
    unmappedColumns: row.unmappedColumns,
  };
}
