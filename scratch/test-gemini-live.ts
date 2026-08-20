import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:3001/api';

async function main() {
  console.log('🧪 Bắt đầu kiểm tra trực tiếp Gemini Endpoints...\n');

  // 1. Login
  console.log('1️⃣ Đăng nhập...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher@teachflow.vn', password: 'Password123@' }),
  });
  if (!loginRes.ok) {
    console.error('❌ Đăng nhập thất bại:', loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const loginData: any = await loginRes.json();
  const token = loginData.accessToken || loginData.tokens?.accessToken;
  console.log('✅ Đăng nhập thành công.\n');

  // 2. Test POST /api/ai/activity first
  console.log('2️⃣ Kiểm tra POST /api/ai/activity trước (Light request - timeout 30s)...');
  const actStart = Date.now();
  try {
    const actRes = await fetch(`${API_BASE}/ai/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        grade: 4,
        subject: 'Toán',
        lessonTitle: 'Phân số bằng nhau',
        activityType: 'WARM_UP',
        durationMinutes: 5,
        requirement: 'Trò chơi nhận diện nhanh 2 phân số bằng nhau',
      }),
    });
    const actElapsed = Date.now() - actStart;
    console.log(`   ⏱️ Thời gian thực thi: ${actElapsed}ms | HTTP Status: ${actRes.status}`);

    if (actRes.ok) {
      const actData = await actRes.json();
      console.log('   ✅ POST /api/ai/activity THÀNH CÔNG:');
      console.log('      - Tên hoạt động:', actData.title);
      console.log('      - Thời lượng:', actData.durationMinutes, 'phút');
      console.log('      - Mục tiêu:', actData.objective);
      console.log('      - GV:', actData.teacherActivity?.slice(0, 100) + '...');
      console.log('      - HS:', actData.studentActivity?.slice(0, 100) + '...');
    } else {
      const errText = await actRes.text();
      console.error(`   ❌ POST /api/ai/activity thất bại (${actRes.status}):`, errText);
    }
  } catch (err: any) {
    const actElapsed = Date.now() - actStart;
    console.error(`   ❌ Lỗi kết nối activity sau ${actElapsed}ms:`, err.message);
  }
  console.log('');

  // 3. Test POST /api/ai/lesson-plan
  console.log('3️⃣ Kiểm tra POST /api/ai/lesson-plan (Heavy request - timeout 60s)...');
  const planStart = Date.now();
  try {
    const planRes = await fetch(`${API_BASE}/ai/lesson-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        grade: 4,
        subject: 'Tiếng Việt',
        lessonTitle: 'Trong lời mẹ hát',
        durationMinutes: 35,
        requirements: 'Chú trọng phát triển năng lực cảm thụ văn học',
      }),
    });
    const planElapsed = Date.now() - planStart;
    console.log(`   ⏱️ Thời gian thực thi: ${planElapsed}ms | HTTP Status: ${planRes.status}`);

    if (planRes.ok) {
      const planData = await planRes.json();
      console.log('   ✅ POST /api/ai/lesson-plan THÀNH CÔNG:');
      console.log('      - Tiêu đề:', planData.title);
      console.log('      - Mục tiêu:', planData.objectives?.slice(0, 100) + '...');
      console.log('      - Thiết bị:', planData.teachingEquipment);
      console.log('      - Số hoạt động:', planData.activities?.length);
      planData.activities?.forEach((a: any, idx: number) => {
        console.log(`        [${idx + 1}] (${a.activityType}) ${a.title} - ${a.durationMinutes}p`);
      });
    } else {
      const errText = await planRes.text();
      console.error(`   ❌ POST /api/ai/lesson-plan thất bại (${planRes.status}):`, errText);
    }
  } catch (err: any) {
    const planElapsed = Date.now() - planStart;
    console.error(`   ❌ Lỗi kết nối lesson-plan sau ${planElapsed}ms:`, err.message);
  }

  console.log('\n🏁 Hoàn tất kiểm tra.');
}

main().catch(console.error);
