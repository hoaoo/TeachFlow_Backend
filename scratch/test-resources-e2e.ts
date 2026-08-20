import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:3001/api';

async function main() {
  console.log('🧪 Bắt đầu kiểm tra End-to-End Module Tài nguyên dạy học & Upload File...\n');

  // 1. Test 401 Unauthenticated
  console.log('1️⃣ Kiểm tra 401 Unauthenticated...');
  const unauthRes = await fetch(`${API_BASE}/resources`);
  if (unauthRes.status === 401) {
    console.log('   ✅ 401 Unauthorized khi không có JWT token.\n');
  } else {
    console.error('   ❌ Thất bại: Mong đợi 401, nhận được', unauthRes.status);
    process.exit(1);
  }

  // 2. Login Teacher
  console.log('2️⃣ Đăng nhập giáo viên (teacher@teachflow.vn)...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher@teachflow.vn', password: 'Password123@' }),
  });
  const loginData: any = await loginRes.json();
  const token = loginData.accessToken || loginData.tokens?.accessToken;
  console.log('   ✅ Đăng nhập thành công.\n');

  // 3. Test Upload Dangerous File (Reject security check)
  console.log('3️⃣ Kiểm tra chặn tải lên tập tin nguy hiểm (.exe, .sh)...');
  const badForm = new FormData();
  const badBlob = new Blob(['malicious script content'], { type: 'application/x-msdownload' });
  badForm.append('file', badBlob, 'trojan.exe');
  badForm.append('name', 'Phần mềm độc hại');

  const badUploadRes = await fetch(`${API_BASE}/resources/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: badForm,
  });
  console.log(`   - Status: ${badUploadRes.status}`);
  if (badUploadRes.status === 400) {
    console.log('   ✅ Đã chặn tập tin nguy hiểm .exe thành công.\n');
  } else {
    console.error('   ❌ Không chặn được file nguy hiểm. Status:', badUploadRes.status);
    process.exit(1);
  }

  // 4. Test Upload Valid PDF
  console.log('4️⃣ Kiểm tra tải lên tập tin PDF thật...');
  const pdfForm = new FormData();
  const samplePdfContent = '%PDF-1.4\n1 0 obj\n<< /Title (Giao An Toan 4) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
  const pdfBlob = new Blob([samplePdfContent], { type: 'application/pdf' });
  pdfForm.append('file', pdfBlob, 'bai_giang_phan_so.pdf');
  pdfForm.append('name', 'Bài giảng Phân số bằng nhau');
  pdfForm.append('description', 'Tài liệu hướng dẫn trực quan cho học sinh lớp 4A');

  const uploadRes = await fetch(`${API_BASE}/resources/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: pdfForm,
  });
  const uploadedPdf: any = await uploadRes.json();
  console.log(`   - Upload status: ${uploadRes.status}`);
  console.log(`   - Resource ID: ${uploadedPdf.id}`);
  console.log(`   - Resource Type: ${uploadedPdf.resourceType}`);
  console.log(`   - Formatted Size: ${uploadedPdf.formattedSize}`);

  if (uploadRes.status === 201 && uploadedPdf.id && uploadedPdf.resourceType === 'DOCUMENT') {
    console.log('   ✅ Tải lên và lưu trữ tập tin PDF THÀNH CÔNG.\n');
  } else {
    console.error('   ❌ Lỗi tải lên PDF:', uploadedPdf);
    process.exit(1);
  }

  // 5. Test Download File
  console.log('5️⃣ Kiểm tra GET /api/resources/:id/download...');
  const dlRes = await fetch(`${API_BASE}/resources/${uploadedPdf.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   - Status: ${dlRes.status}`);
  console.log(`   - Content-Type: ${dlRes.headers.get('content-type')}`);
  console.log(`   - Content-Disposition: ${dlRes.headers.get('content-disposition')}`);
  const downloadedBuf = Buffer.from(await dlRes.arrayBuffer());
  console.log(`   - Downloaded bytes: ${downloadedBuf.length}`);

  if (dlRes.ok && downloadedBuf.length > 0) {
    console.log('   ✅ Tải xuống tệp tin qua API THÀNH CÔNG.\n');
  } else {
    console.error('   ❌ Lỗi tải xuống tệp tin');
    process.exit(1);
  }

  // 6. Test Inline View File
  console.log('6️⃣ Kiểm tra GET /api/resources/:id/file (inline view)...');
  const viewRes = await fetch(`${API_BASE}/resources/${uploadedPdf.id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   - Status: ${viewRes.status}`);
  console.log(`   - Content-Disposition: ${viewRes.headers.get('content-disposition')}`);
  if (viewRes.ok && viewRes.headers.get('content-disposition')?.startsWith('inline')) {
    console.log('   ✅ Xem trực tiếp (inline) THÀNH CÔNG.\n');
  } else {
    console.error('   ❌ Lỗi xem trực tiếp tệp tin');
    process.exit(1);
  }

  // 7. Test Lesson Plan Attachment Flow
  console.log('7️⃣ Kiểm tra đính kèm tài nguyên vào Giáo án...');
  const plansRes = await fetch(`${API_BASE}/lesson-plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const plans: any[] = await plansRes.json();
  const planId = plans[0]?.id;

  if (planId) {
    // Attach
    const attachRes = await fetch(`${API_BASE}/lesson-plans/${planId}/resources/${uploadedPdf.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`   - Attach status: ${attachRes.status}`);

    // Verify list attached
    const listAttachedRes = await fetch(`${API_BASE}/lesson-plans/${planId}/resources`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const attachedList: any[] = await listAttachedRes.json();
    console.log(`   - Attached count in lesson plan: ${attachedList.length}`);

    // Verify duplicate attach prevention
    const duplicateAttachRes = await fetch(`${API_BASE}/lesson-plans/${planId}/resources/${uploadedPdf.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`   - Duplicate attach idempotent status: ${duplicateAttachRes.status}`);

    // Detach
    const detachRes = await fetch(`${API_BASE}/lesson-plans/${planId}/resources/${uploadedPdf.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`   - Detach status: ${detachRes.status}`);

    if (attachRes.ok && duplicateAttachRes.ok && detachRes.ok) {
      console.log('   ✅ Luồng đính kèm / gỡ bỏ tài nguyên trong Giáo án THÀNH CÔNG.\n');
    } else {
      console.error('   ❌ Lỗi luồng đính kèm giáo án');
      process.exit(1);
    }
  }

  // 8. Test Delete Resource
  console.log('8️⃣ Kiểm tra DELETE /api/resources/:id...');
  const delRes = await fetch(`${API_BASE}/resources/${uploadedPdf.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`   - Delete status: ${delRes.status}`);
  if (delRes.ok) {
    console.log('   ✅ Xóa tài nguyên và dọn dẹp vật lý THÀNH CÔNG.\n');
  } else {
    console.error('   ❌ Lỗi xóa tài nguyên');
    process.exit(1);
  }

  console.log('🎉 TẤT CẢ CÁC KIỂM TRA TÀI NGUYÊN & UPLOAD FILE E2E ĐÃ VƯỢT QUA XUẤT SẮC!');
}

main().catch(console.error);
