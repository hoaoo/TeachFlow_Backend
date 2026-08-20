import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:3001/api';

async function main() {
  console.log('🛡️ BẮT ĐẦU KIỂM THỬ XÁC NHẬN BẢO MẬT (SECURITY REGRESSION & IDOR VERIFICATION)...\n');

  // Helper login
  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data: any = await res.json();
    return { status: res.status, token: data.tokens?.accessToken || data.accessToken, user: data.user };
  }

  // 1. Authenticate Teacher A (Mai) and Teacher B (Lan)
  console.log('1️⃣ Xác thực Teacher A (Mai) và Teacher B (Lan)...');
  const mai = await login('teacher@teachflow.vn', 'Password123@');
  if (!mai.token) throw new Error('Cannot login Teacher A');
  console.log(`   - Teacher A (Mai) Token OK, Teacher ID: ${mai.user.teacher?.id}`);

  let lan = await login('lan@teachflow.vn', 'NewPassword456@');
  if (!lan.token) {
    lan = await login('lan@teachflow.vn', 'Password123@');
  }
  if (!lan.token) {
    const admin = await login('admin@teachflow.vn', 'Admin@123456');
    await fetch(`${API_BASE}/admin/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({
        fullName: 'Nguyễn Thị Lan',
        email: 'lan_audit@teachflow.vn',
        password: 'Password123@',
      }),
    });
    lan = await login('lan_audit@teachflow.vn', 'Password123@');
  }
  console.log(`   - Teacher B (Lan) Token OK, Teacher ID: ${lan.user.teacher?.id}\n`);

  // 2. Setup Resources for Teacher B (Lan)
  console.log('2️⃣ Khởi tạo tài nguyên mẫu của Teacher B (Lan)...');
  
  // Lan creates a Classroom
  const classBRes = await fetch(`${API_BASE}/classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lan.token}` },
    body: JSON.stringify({ name: 'Lớp 5B (Lan)', room: 'P502', schedule: 'Chiều' }),
  });
  const classB: any = await classBRes.json();

  // Lan adds a student to her class
  const studentBRes = await fetch(`${API_BASE}/classes/${classB.id}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lan.token}` },
    body: JSON.stringify({ fullName: 'Trần Văn Bảo (HS Lớp 5B)', gender: 'Nam', dob: '10/10/2015' }),
  });
  const classBWithStudent: any = await studentBRes.json();
  const studentB = classBWithStudent.students?.[0];

  // Lan creates a LessonPlan
  const planBRes = await fetch(`${API_BASE}/lesson-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lan.token}` },
    body: JSON.stringify({
      title: 'Giáo án Khoa học 5 (Lan)',
      subject: 'Khoa học',
      grade: 'Lớp 5B',
      duration: 40,
      activities: [{ phase: 'Khởi động', title: 'Đố vui khoa học', minutes: 5 }],
    }),
  });
  const planB: any = await planBRes.json();

  // Lan creates a Worksheet
  const worksheetBRes = await fetch(`${API_BASE}/worksheets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lan.token}` },
    body: JSON.stringify({ title: 'Phiếu học tập Khoa học 5 (Lan)' }),
  });
  const worksheetB: any = await worksheetBRes.json();

  // Lan creates a Task
  const taskBRes = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lan.token}` },
    body: JSON.stringify({ title: 'Nhiệm vụ riêng của Lan' }),
  });
  const taskB: any = await taskBRes.json();

  // Lan uploads a Resource
  const formB = new FormData();
  formB.append('file', new Blob(['sample content'], { type: 'application/pdf' }), 'tai_lieu_lan.pdf');
  formB.append('name', 'Tài liệu riêng của Lan');
  const resBRes = await fetch(`${API_BASE}/resources/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${lan.token}` },
    body: formB,
  });
  const resourceB: any = await resBRes.json();

  console.log(`   ✅ Dữ liệu mẫu của Lan: Class ID=${classB.id}, Student ID=${studentB?.id}, Plan ID=${planB.id}, Worksheet ID=${worksheetB.id}, Resource ID=${resourceB.id}\n`);

  // 3. Test Direct IDOR: Teacher A attempts to access Teacher B's records
  console.log('3️⃣ Kiểm tra tấn công IDOR trực tiếp (Teacher A -> Dữ liệu của Teacher B)...');

  const testCases = [
    { name: 'GET /api/classes/:id_B', url: `${API_BASE}/classes/${classB.id}`, method: 'GET' },
    { name: 'PATCH /api/classes/:id_B', url: `${API_BASE}/classes/${classB.id}`, method: 'PATCH', body: { name: 'Hacked Class' } },
    { name: 'DELETE /api/classes/:id_B', url: `${API_BASE}/classes/${classB.id}`, method: 'DELETE' },
    { name: 'GET /api/lesson-plans/:id_B', url: `${API_BASE}/lesson-plans/${planB.id}`, method: 'GET' },
    { name: 'PATCH /api/lesson-plans/:id_B', url: `${API_BASE}/lesson-plans/${planB.id}`, method: 'PATCH', body: { title: 'Hacked Plan' } },
    { name: 'DELETE /api/lesson-plans/:id_B', url: `${API_BASE}/lesson-plans/${planB.id}`, method: 'DELETE' },
    { name: 'POST /api/lesson-plans/:id_B/duplicate', url: `${API_BASE}/lesson-plans/${planB.id}/duplicate`, method: 'POST' },
    { name: 'GET /api/lesson-plans/:id_B/export/docx', url: `${API_BASE}/lesson-plans/${planB.id}/export/docx`, method: 'GET' },
    { name: 'GET /api/lesson-plans/:id_B/export/pdf', url: `${API_BASE}/lesson-plans/${planB.id}/export/pdf`, method: 'GET' },
    { name: 'GET /api/worksheets/:id_B', url: `${API_BASE}/worksheets/${worksheetB.id}`, method: 'GET' },
    { name: 'PATCH /api/worksheets/:id_B', url: `${API_BASE}/worksheets/${worksheetB.id}`, method: 'PATCH', body: { title: 'Hacked' } },
    { name: 'DELETE /api/worksheets/:id_B', url: `${API_BASE}/worksheets/${worksheetB.id}`, method: 'DELETE' },
    { name: 'GET /api/worksheets/:id_B/export/docx', url: `${API_BASE}/worksheets/${worksheetB.id}/export/docx`, method: 'GET' },
    { name: 'GET /api/resources/:id_B', url: `${API_BASE}/resources/${resourceB.id}`, method: 'GET' },
    { name: 'GET /api/resources/:id_B/download', url: `${API_BASE}/resources/${resourceB.id}/download`, method: 'GET' },
    { name: 'GET /api/resources/:id_B/file', url: `${API_BASE}/resources/${resourceB.id}/file`, method: 'GET' },
    { name: 'DELETE /api/resources/:id_B', url: `${API_BASE}/resources/${resourceB.id}`, method: 'DELETE' },
    { name: 'PATCH /api/tasks/:id_B', url: `${API_BASE}/tasks/${taskB.id}`, method: 'PATCH', body: { title: 'Hacked' } },
    { name: 'DELETE /api/tasks/:id_B', url: `${API_BASE}/tasks/${taskB.id}`, method: 'DELETE' },
    { name: 'GET /api/students/:id_B', url: `${API_BASE}/students/${studentB?.id}`, method: 'GET' },
    { name: 'PATCH /api/students/:id_B', url: `${API_BASE}/students/${studentB?.id}`, method: 'PATCH', body: { fullName: 'Hacked' } },
    { name: 'DELETE /api/students/:id_B', url: `${API_BASE}/students/${studentB?.id}`, method: 'DELETE' },
    { name: 'GET /api/students/:id_B/overview', url: `${API_BASE}/students/${studentB?.id}/overview`, method: 'GET' },
    { name: 'GET /api/students/:id_B/attendance', url: `${API_BASE}/students/${studentB?.id}/attendance`, method: 'GET' },
  ];

  for (const tc of testCases) {
    const res = await fetch(tc.url, {
      method: tc.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mai.token}`,
      },
      body: tc.body ? JSON.stringify(tc.body) : undefined,
    });
    const passed = res.status === 403 || res.status === 404;
    console.log(`   - [${passed ? 'PASS ✅' : 'FAIL ❌'}] ${tc.name} -> HTTP ${res.status}`);
    if (!passed) {
      throw new Error(`🚨 Thất bại bảo mật tại: ${tc.name}`);
    }
  }

  // 4. Test Cross-Parent & Resource Linking Attacks
  console.log('\n4️⃣ Kiểm tra tấn công Cross-Parent & Resource Hijacking...');

  const planARes = await fetch(`${API_BASE}/lesson-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({ title: 'Giáo án Toán của Mai', subject: 'Toán', grade: 'Lớp 4A' }),
  });
  const planA: any = await planARes.json();

  const hijackRes = await fetch(`${API_BASE}/lesson-plans/${planA.id}/resources/${resourceB.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mai.token}` },
  });
  console.log(`   - [${hijackRes.status === 403 ? 'PASS ✅' : 'FAIL ❌'}] Đính kèm tài nguyên của Lan vào giáo án Mai -> HTTP ${hijackRes.status} (Kỳ vọng: 403)`);
  if (hijackRes.status !== 403) throw new Error('Failed cross-resource hijack test');

  const attHijackRes = await fetch(`${API_BASE}/attendance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({
      classId: classB.id,
      date: '2026-08-20',
      attendances: [{ studentId: studentB?.id, status: 'PRESENT' }],
    }),
  });
  console.log(`   - [${attHijackRes.status === 403 ? 'PASS ✅' : 'FAIL ❌'}] Điểm danh trái phép cho lớp của Lan -> HTTP ${attHijackRes.status} (Kỳ vọng: 403)`);
  if (attHijackRes.status !== 403) throw new Error('Failed cross-attendance hijack test');

  // 5. Verify the 5 Remediated Vulnerabilities
  console.log('\n5️⃣ Kiểm tra hồi quy 5 lỗi bảo mật đã khắc phục (Remediation Verifications)...');

  // VULN-IDOR-001: Commenting on Lan's student MUST be 403
  const commentRes = await fetch(`${API_BASE}/students/${studentB?.id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({ content: 'Nhận xét từ Giáo viên Mai (Cross-tenant)' }),
  });
  const pass1 = commentRes.status === 403;
  console.log(`   - [${pass1 ? 'PASS ✅' : 'FAIL ❌'}] VULN-IDOR-001 (POST /students/:studentId/comments): Status ${commentRes.status} (Kỳ vọng: 403)`);
  if (!pass1) throw new Error('VULN-IDOR-001 fix failed');

  // VULN-IDOR-002: Creating student directly into Lan's classroom MUST be 403
  const crossStudentRes = await fetch(`${API_BASE}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({
      fullName: 'Học sinh thêm trái phép vào lớp Lan',
      classId: classB.id,
    }),
  });
  const pass2 = crossStudentRes.status === 403;
  console.log(`   - [${pass2 ? 'PASS ✅' : 'FAIL ❌'}] VULN-IDOR-002 (POST /students with classId_B): Status ${crossStudentRes.status} (Kỳ vọng: 403)`);
  if (!pass2) throw new Error('VULN-IDOR-002 fix failed');

  // VULN-IDOR-003: Creating teaching plan with Lan's classroom MUST be 403
  const crossPlanRes = await fetch(`${API_BASE}/teaching-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({
      title: 'Lịch dạy trái phép',
      classroomId: classB.id,
    }),
  });
  const pass3 = crossPlanRes.status === 403;
  console.log(`   - [${pass3 ? 'PASS ✅' : 'FAIL ❌'}] VULN-IDOR-003 (POST /teaching-plans with classroomId_B): Status ${crossPlanRes.status} (Kỳ vọng: 403)`);
  if (!pass3) throw new Error('VULN-IDOR-003 fix failed');

  // VULN-IDOR-004: Creating assessment with Lan's classroom MUST be 403
  const crossAssessRes = await fetch(`${API_BASE}/assessments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({
      title: 'Đánh giá trái phép',
      classroomId: classB.id,
    }),
  });
  const pass4 = crossAssessRes.status === 403;
  console.log(`   - [${pass4 ? 'PASS ✅' : 'FAIL ❌'}] VULN-IDOR-004 (POST /assessments with classroomId_B): Status ${crossAssessRes.status} (Kỳ vọng: 403)`);
  if (!pass4) throw new Error('VULN-IDOR-004 fix failed');

  // VULN-AUTH-005: Activity authorization test
  // 1. Lan creates an activity (belonging to Lan)
  const actBRes = await fetch(`${API_BASE}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lan.token}` },
    body: JSON.stringify({ title: 'Hoạt động mẫu của Lan' }),
  });
  const actB: any = await actBRes.json();

  // Mai tries to PATCH & DELETE Lan's activity -> MUST be 403
  const patchLanActRes = await fetch(`${API_BASE}/activities/${actB.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({ title: 'Hacked Lan Activity' }),
  });
  const deleteLanActRes = await fetch(`${API_BASE}/activities/${actB.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${mai.token}` },
  });
  const passLanAct = patchLanActRes.status === 403 && deleteLanActRes.status === 403;
  console.log(`   - [${passLanAct ? 'PASS ✅' : 'FAIL ❌'}] VULN-AUTH-005 (Teacher A sửa/xóa activity của Teacher B): PATCH=${patchLanActRes.status}, DELETE=${deleteLanActRes.status} (Kỳ vọng: 403/403)`);
  if (!passLanAct) throw new Error('VULN-AUTH-005 cross-teacher activity fix failed');

  // 2. Check system activity if any exists in DB with teacherId === null
  const actListRes = await fetch(`${API_BASE}/activities`, {
    headers: { Authorization: `Bearer ${mai.token}` },
  });
  const activities: any[] = await actListRes.json();
  const systemAct = activities.find((a) => !a.teacherId);

  if (systemAct && !systemAct.id.startsWith('act-')) {
    const patchSysActRes = await fetch(`${API_BASE}/activities/${systemAct.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
      body: JSON.stringify({ title: 'Hacked System Activity' }),
    });
    const deleteSysActRes = await fetch(`${API_BASE}/activities/${systemAct.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${mai.token}` },
    });
    const passSys = patchSysActRes.status === 403 && deleteSysActRes.status === 403;
    console.log(`   - [${passSys ? 'PASS ✅' : 'FAIL ❌'}] VULN-AUTH-005 (PATCH/DELETE system activity): PATCH=${patchSysActRes.status}, DELETE=${deleteSysActRes.status} (Kỳ vọng: 403/403)`);
    if (!passSys) throw new Error('VULN-AUTH-005 system activity fix failed');
  }

  // 3. Teacher A creates own activity -> PATCH & DELETE own activity MUST be 200
  const myActRes = await fetch(`${API_BASE}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({ title: 'Hoạt động riêng của Mai' }),
  });
  const myAct: any = await myActRes.json();

  const patchMyActRes = await fetch(`${API_BASE}/activities/${myAct.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mai.token}` },
    body: JSON.stringify({ title: 'Hoạt động riêng của Mai (Đã sửa)' }),
  });
  const delMyActRes = await fetch(`${API_BASE}/activities/${myAct.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${mai.token}` },
  });
  const passOwn = patchMyActRes.status === 200 && delMyActRes.status === 200;
  console.log(`   - [${passOwn ? 'PASS ✅' : 'FAIL ❌'}] Teacher A tự sửa/xóa hoạt động của mình: PATCH=${patchMyActRes.status}, DELETE=${delMyActRes.status} (Kỳ vọng: 200/200)`);
  if (!passOwn) throw new Error('Own activity modification failed');

  console.log('\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ BẢO MẬT & IDOR ĐÃ PASS 100%!');
}

main().catch((err) => {
  console.error('❌ Lỗi kiểm thử:', err);
  process.exit(1);
});
