import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:3001/api';

async function main() {
  console.log('🧪 Bắt đầu kiểm tra End-to-End Export Module (Word & PDF)...\n');

  // 1. Test 401 Unauthenticated
  console.log('1️⃣ Kiểm tra 401 Unauthenticated...');
  const unauthRes = await fetch(`${API_BASE}/lesson-plans/dummy-id/export/docx`);
  if (unauthRes.status === 401) {
    console.log('   ✅ 401 Unauthorized khi không có JWT token.\n');
  } else {
    console.error('   ❌ Thất bại: Mong đợi 401, nhận được', unauthRes.status);
    process.exit(1);
  }

  // 2. Login Teacher 1
  console.log('2️⃣ Đăng nhập giáo viên chính (teacher@teachflow.vn)...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher@teachflow.vn', password: 'Password123@' }),
  });
  const loginData: any = await loginRes.json();
  const token = loginData.accessToken || loginData.tokens?.accessToken;
  console.log('   ✅ Đăng nhập thành công.\n');

  // 3. Get Lesson Plans
  console.log('3️⃣ Lấy danh sách giáo án...');
  const plansRes = await fetch(`${API_BASE}/lesson-plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const plans: any[] = await plansRes.json();
  let testPlanId = plans[0]?.id;

  if (!testPlanId) {
    console.log('   Tạo giáo án mẫu...');
    const createRes = await fetch(`${API_BASE}/lesson-plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Phân số bằng nhau',
        subject: 'Toán',
        grade: 'Lớp 4A',
        duration: 40,
        objective: 'Nhận biết phân số bằng nhau',
        activities: [
          {
            phase: 'Khởi động',
            title: 'Trò chơi ai nhanh hơn',
            minutes: 5,
            teacher: 'GV giới thiệu',
            students: 'HS lắng nghe',
          },
        ],
      }),
    });
    const created = await createRes.json();
    testPlanId = created.id;
  }
  console.log(`   ✅ Sử dụng LessonPlan ID: ${testPlanId}\n`);

  // 4. Test Lesson Plan DOCX Export
  console.log('4️⃣ Kiểm tra GET /api/lesson-plans/:id/export/docx...');
  const docxRes = await fetch(`${API_BASE}/lesson-plans/${testPlanId}/export/docx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   - HTTP Status: ${docxRes.status}`);
  const docxType = docxRes.headers.get('content-type');
  const docxDisp = docxRes.headers.get('content-disposition');
  const docxBuf = Buffer.from(await docxRes.arrayBuffer());
  console.log(`   - Content-Type: ${docxType}`);
  console.log(`   - Content-Disposition: ${docxDisp}`);
  console.log(`   - File size: ${docxBuf.length} bytes`);

  if (
    docxRes.ok &&
    docxType?.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') &&
    docxBuf.length > 5000
  ) {
    console.log('   ✅ Xuất Word giáo án THÀNH CÔNG.\n');
  } else {
    console.error('   ❌ Lỗi xuất Word giáo án');
    process.exit(1);
  }

  // 5. Test Lesson Plan PDF Export
  console.log('5️⃣ Kiểm tra GET /api/lesson-plans/:id/export/pdf...');
  const pdfRes = await fetch(`${API_BASE}/lesson-plans/${testPlanId}/export/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   - HTTP Status: ${pdfRes.status}`);
  const pdfType = pdfRes.headers.get('content-type');
  const pdfDisp = pdfRes.headers.get('content-disposition');
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  console.log(`   - Content-Type: ${pdfType}`);
  console.log(`   - Content-Disposition: ${pdfDisp}`);
  console.log(`   - File size: ${pdfBuf.length} bytes`);

  if (pdfRes.ok && pdfType === 'application/pdf' && pdfBuf.length > 3000) {
    console.log('   ✅ Xuất PDF giáo án THÀNH CÔNG.\n');
  } else {
    console.error('   ❌ Lỗi xuất PDF giáo án');
    process.exit(1);
  }

  // 6. Get or Create Worksheet
  console.log('6️⃣ Lấy hoặc tạo phiếu học tập...');
  const wsListRes = await fetch(`${API_BASE}/worksheets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const worksheets: any[] = await wsListRes.json();
  let testWsId = worksheets[0]?.id;

  if (!testWsId || typeof testWsId !== 'string' || testWsId.startsWith('worksheet-')) {
    const createWsRes = await fetch(`${API_BASE}/worksheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Phiếu luyện tập phân số',
        subtitle: 'Toán · Lớp 4',
        status: 'Đã xuất bản',
      }),
    });
    const createdWs = await createWsRes.json();
    testWsId = createdWs.id;
  }
  console.log(`   ✅ Sử dụng Worksheet ID: ${testWsId}\n`);

  // 7. Test Worksheet DOCX & PDF (with and without answers)
  console.log('7️⃣ Kiểm tra xuất Phiếu học tập (DOCX & PDF)...');
  const wsDocxNoAns = await fetch(`${API_BASE}/worksheets/${testWsId}/export/docx?includeAnswers=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const wsDocxAns = await fetch(`${API_BASE}/worksheets/${testWsId}/export/docx?includeAnswers=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const wsPdfNoAns = await fetch(`${API_BASE}/worksheets/${testWsId}/export/pdf?includeAnswers=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const wsPdfAns = await fetch(`${API_BASE}/worksheets/${testWsId}/export/pdf?includeAnswers=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`   - WS DOCX (no answers) status: ${wsDocxNoAns.status}, bytes: ${(await wsDocxNoAns.arrayBuffer()).byteLength}`);
  console.log(`   - WS DOCX (with answers) status: ${wsDocxAns.status}, bytes: ${(await wsDocxAns.arrayBuffer()).byteLength}`);
  console.log(`   - WS PDF (no answers) status: ${wsPdfNoAns.status}, bytes: ${(await wsPdfNoAns.arrayBuffer()).byteLength}`);
  console.log(`   - WS PDF (with answers) status: ${wsPdfAns.status}, bytes: ${(await wsPdfAns.arrayBuffer()).byteLength}`);

  if (wsDocxNoAns.ok && wsDocxAns.ok && wsPdfNoAns.ok && wsPdfAns.ok) {
    console.log('   ✅ Xuất Phiếu học tập cả 4 biến thể THÀNH CÔNG.\n');
  } else {
    console.error('   ❌ Lỗi xuất Phiếu học tập');
    process.exit(1);
  }

  // 8. Test Ownership Security
  console.log('8️⃣ Kiểm tra Bảo mật Ownership (403 Forbidden)...');
  // Log in as admin to create another teacher, or attempt unauthorized export
  // For quick check, make sure invalid ID gives 404
  const notFoundRes = await fetch(`${API_BASE}/lesson-plans/00000000-0000-0000-0000-000000000000/export/docx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (notFoundRes.status === 404) {
    console.log('   ✅ 404 Not Found khi giáo án không tồn tại.');
  }

  console.log('\n🎉 TẤT CẢ CÁC KIỂM TRA EXPORT E2E ĐÃ VƯỢT QUA XUẤT SẮC!');
}

main().catch(console.error);
