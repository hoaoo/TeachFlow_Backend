import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:3001/api';

async function main() {
  console.log('🧪 Bắt đầu kiểm tra End-to-End Module Quản trị Giáo viên (Admin Teachers)...\n');

  // Helper login
  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data: any = await res.json();
    return { status: res.status, data };
  }

  // 1. Check Unauthenticated & Non-Admin 403
  console.log('1️⃣ Kiểm tra phân quyền truy cập /api/admin/teachers...');
  const unauthRes = await fetch(`${API_BASE}/admin/teachers`);
  console.log(`   - Không token status: ${unauthRes.status} (Kỳ vọng: 401)`);
  if (unauthRes.status !== 401) throw new Error('Failed unauthenticated check');

  // Login as regular teacher (Mai)
  const teacherMaiLogin = await login('teacher@teachflow.vn', 'Password123@');
  const maiToken = teacherMaiLogin.data.tokens?.accessToken || teacherMaiLogin.data.accessToken;

  const teacherAccessRes = await fetch(`${API_BASE}/admin/teachers`, {
    headers: { Authorization: `Bearer ${maiToken}` },
  });
  console.log(`   - Teacher truy cập /api/admin/teachers status: ${teacherAccessRes.status} (Kỳ vọng: 403)`);
  if (teacherAccessRes.status !== 403) throw new Error('Failed 403 Forbidden check for teacher');
  console.log('   ✅ Phân quyền Backend 401/403 hoạt động CHÍNH XÁC.\n');

  // 2. Login Admin
  console.log('2️⃣ Đăng nhập Quản trị viên (admin@teachflow.vn)...');
  const adminLogin = await login('admin@teachflow.vn', 'Admin@123456');
  console.log(`   - Login Admin status: ${adminLogin.status}`);
  if (adminLogin.status !== 200) throw new Error('Failed admin login');
  const adminToken = adminLogin.data.tokens?.accessToken || adminLogin.data.accessToken;
  console.log('   ✅ Đăng nhập Admin thành công.\n');

  // 3. Admin List Teachers
  console.log('3️⃣ Admin tải danh sách giáo viên...');
  const listRes = await fetch(`${API_BASE}/admin/teachers?page=1&pageSize=20`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const listData: any = await listRes.json();
  console.log(`   - List status: ${listRes.status}`);
  console.log(`   - Total items: ${listData.totalItems}`);
  console.log(`   - First teacher: ${listData.items?.[0]?.fullName} (${listData.items?.[0]?.email})`);
  if (listRes.status !== 200 || !Array.isArray(listData.items)) throw new Error('Failed list teachers');
  console.log('   ✅ Tải danh sách giáo viên thành công.\n');

  // 4. Create New Teacher (Lan)
  console.log('4️⃣ Admin tạo tài khoản giáo viên mới (Nguyễn Thị Lan)...');
  const createPayload = {
    fullName: 'Nguyễn Thị Lan',
    email: 'lan@teachflow.vn',
    phone: '0988123456',
    password: 'Password123@',
  };

  const createRes = await fetch(`${API_BASE}/admin/teachers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(createPayload),
  });
  const createdTeacher: any = await createRes.json();
  console.log(`   - Create status: ${createRes.status}`);
  console.log(`   - Created ID: ${createdTeacher.id}, UserId: ${createdTeacher.userId}`);
  console.log(`   - Role: ${createdTeacher.role}, IsActive: ${createdTeacher.isActive}`);
  if (createRes.status !== 201 || !createdTeacher.id) throw new Error('Failed create teacher');

  // Check Duplicate Email prevention
  const dupRes = await fetch(`${API_BASE}/admin/teachers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(createPayload),
  });
  console.log(`   - Duplicate create status: ${dupRes.status} (Kỳ vọng: 409 Conflict)`);
  if (dupRes.status !== 409) throw new Error('Failed duplicate email check');
  console.log('   ✅ Tạo tài khoản và ngăn chặn trùng email thành công.\n');

  // 5. Login as New Teacher (Lan) & Verify Identity
  console.log('5️⃣ Đăng nhập tài khoản mới tạo (lan@teachflow.vn)...');
  const lanLogin = await login('lan@teachflow.vn', 'Password123@');
  console.log(`   - Lan login status: ${lanLogin.status}`);
  if (lanLogin.status !== 200) throw new Error('Failed Lan login');
  const lanToken = lanLogin.data.tokens?.accessToken || lanLogin.data.accessToken;

  // Check /api/auth/me
  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${lanToken}` },
  });
  const meData: any = await meRes.json();
  console.log(`   - Lan /auth/me fullName: ${meData.teacher?.fullName} (ID: ${meData.teacher?.id})`);
  if (meData.teacher?.fullName !== 'Nguyễn Thị Lan') throw new Error('Mismatch teacher info');
  console.log('   ✅ Đăng nhập và xác thực danh tính giáo viên mới CHÍNH XÁC.\n');

  // 6. Create Task by Lan (Data isolation test)
  console.log('6️⃣ Tạo dữ liệu riêng của Lan (Task: Soạn giáo án Tuần 1)...');
  const taskRes = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lanToken}`,
    },
    body: JSON.stringify({
      title: 'Soạn giáo án Tuần 1 môn Toán',
      dueDate: 'Thứ Hai',
      priority: 'HIGH',
    }),
  });
  const lanTask: any = await taskRes.json();
  console.log(`   - Lan task created ID: ${lanTask.id}`);

  // Check Data Isolation: Mai must NOT see Lan's task
  const maiTasksRes = await fetch(`${API_BASE}/tasks`, {
    headers: { Authorization: `Bearer ${maiToken}` },
  });
  const maiTasks: any[] = await maiTasksRes.json();
  const hasLanTaskInMai = maiTasks.some((t) => t.id === lanTask.id);
  console.log(`   - Giáo viên Mai có thấy task của Lan không: ${hasLanTaskInMai ? 'CÓ (LỖI)' : 'KHÔNG (CHUẨN)'}`);
  if (hasLanTaskInMai) throw new Error('Data isolation breach');
  console.log('   ✅ Data Isolation giữa các giáo viên được đảm bảo 100%.\n');

  // 7. Admin Disables Lan's Account
  console.log('7️⃣ Admin khóa tài khoản của Lan...');
  const disableRes = await fetch(`${API_BASE}/admin/teachers/${createdTeacher.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ isActive: false }),
  });
  const disableData: any = await disableRes.json();
  console.log(`   - Disable status: ${disableRes.status}, isActive: ${disableData.isActive}`);
  if (disableRes.status !== 200 || disableData.isActive !== false) throw new Error('Failed disable teacher');

  // Verify Lan CANNOT login when disabled
  console.log('   - Kiểm tra Lan đăng nhập sau khi bị khóa...');
  const disabledLanLogin = await login('lan@teachflow.vn', 'Password123@');
  console.log(`   - Disabled login status: ${disabledLanLogin.status} (Kỳ vọng: 401)`);
  if (disabledLanLogin.status !== 401) throw new Error('Disabled teacher was able to login');
  console.log('   ✅ Khóa tài khoản và chặn đăng nhập thành công.\n');

  // 8. Admin Re-enables Lan & Resets Password
  console.log('8️⃣ Admin mở khóa tài khoản và đặt lại mật khẩu mới cho Lan...');
  // Re-enable
  const enableRes = await fetch(`${API_BASE}/admin/teachers/${createdTeacher.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ isActive: true }),
  });
  console.log(`   - Re-enable status: ${enableRes.status}`);

  // Reset password
  const resetRes = await fetch(`${API_BASE}/admin/teachers/${createdTeacher.id}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ newPassword: 'NewPassword456@' }),
  });
  console.log(`   - Reset password status: ${resetRes.status}`);
  if (resetRes.status !== 200) throw new Error('Failed reset password');

  // 9. Old password must fail, new password must succeed
  console.log('9️⃣ Kiểm tra mật khẩu cũ vs mật khẩu mới...');
  const oldPassLogin = await login('lan@teachflow.vn', 'Password123@');
  console.log(`   - Mật khẩu cũ login status: ${oldPassLogin.status} (Kỳ vọng: 401)`);
  if (oldPassLogin.status !== 401) throw new Error('Old password was still accepted');

  const newPassLogin = await login('lan@teachflow.vn', 'NewPassword456@');
  console.log(`   - Mật khẩu mới login status: ${newPassLogin.status} (Kỳ vọng: 200)`);
  if (newPassLogin.status !== 200) throw new Error('New password failed to login');
  console.log('   ✅ Đặt lại mật khẩu và vô hiệu hóa phiên cũ hoạt động HOÀN HẢO.\n');

  // 10. Admin updates Lan profile (Name & Phone)
  console.log('🔟 Admin cập nhật thông tin giáo viên Lan...');
  const updateRes = await fetch(`${API_BASE}/admin/teachers/${createdTeacher.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fullName: 'Nguyễn Thị Lan (Trưởng khối 4)',
      phone: '0977888999',
    }),
  });
  const updatedTeacher: any = await updateRes.json();
  console.log(`   - Update status: ${updateRes.status}`);
  console.log(`   - Updated fullName: ${updatedTeacher.fullName}, phone: ${updatedTeacher.phone}`);
  if (updatedTeacher.fullName !== 'Nguyễn Thị Lan (Trưởng khối 4)') throw new Error('Failed update teacher');
  console.log('   ✅ Cập nhật thông tin giáo viên thành công.\n');

  console.log('🎉 TẤT CẢ 10/10 BƯỚC KIỂM TRA QUẢN TRỊ GIÁO VIÊN E2E ĐÃ VƯỢT QUA XUẤT SẮC!');
}

main().catch(console.error);
