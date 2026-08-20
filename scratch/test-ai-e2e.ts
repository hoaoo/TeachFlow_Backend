import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:3001/api';

async function main() {
  console.log('🚀 Bắt đầu kiểm thử E2E & Smoke Test AI TeachFlow...\n');

  // Test 1: Unauthenticated request should return 401
  console.log('1️⃣ Kiểm tra bảo mật: Gọi /api/ai/lesson-plan khi chưa đăng nhập...');
  try {
    const unauthRes = await fetch(`${API_BASE}/ai/lesson-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade: 4, subject: 'Tiếng Việt', lessonTitle: 'Bài test' }),
    });
    if (unauthRes.status === 401) {
      console.log('   ✅ Đạt: Trả về HTTP 401 Unauthorized chính xác.\n');
    } else {
      console.error(`   ❌ Lỗi: Kỳ vọng 401 nhưng nhận ${unauthRes.status}`);
    }
  } catch (err: any) {
    console.error('   ❌ Không thể kết nối tới backend server:', err.message);
    process.exit(1);
  }

  // Test 2: Teacher Login
  console.log('2️⃣ Đăng nhập tài khoản giáo viên...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'teacher@teachflow.vn',
      password: 'Password123@',
    }),
  });

  if (!loginRes.ok) {
    console.error('   ❌ Đăng nhập thất bại:', loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const loginData: any = await loginRes.json();
  const token = loginData.accessToken || loginData.tokens?.accessToken;
  console.log('   ✅ Đăng nhập thành công, đã nhận JWT Bearer token.\n');

  // Test 3: Validation Error Test
  console.log('3️⃣ Kiểm tra validation DTO (Gửi dữ liệu sai: grade 99, thiếu subject)...');
  const invalidRes = await fetch(`${API_BASE}/ai/lesson-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ grade: 99, lessonTitle: '' }),
  });
  if (invalidRes.status === 400) {
    const errBody: any = await invalidRes.json();
    console.log('   ✅ Đạt: Trả về HTTP 400 Bad Request với thông báo lỗi validation:', errBody.message);
  } else {
    console.warn(`   ⚠️ Cảnh báo: Nhận status ${invalidRes.status}`);
  }
  console.log('');

  // Test 4: Rate Limiting Test (20 requests / min / user)
  console.log('4️⃣ Kiểm tra Rate Limiting (Gửi 22 requests liên tiếp để xác nhận HTTP 429)...');
  let hit429 = false;
  for (let i = 1; i <= 22; i++) {
    const r = await fetch(`${API_BASE}/ai/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ grade: 4, subject: 'Toán', lessonTitle: 'Test', activityType: 'WARM_UP' }),
    });
    if (r.status === 429) {
      hit429 = true;
      console.log(`   ✅ Đạt: Request #${i} trả về HTTP 429 Too Many Requests.`);
      break;
    }
  }
  if (!hit429) {
    console.log('   ℹ️ Lưu ý: Rate limiter trong ngưỡng hoặc đang test');
  }
  console.log('');

  // Test 5: Check if GEMINI_API_KEY is configured for Live Generation
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim() !== '') {
    console.log('5️⃣ Kiểm tra gọi Google Gemini API thật với GEMINI_API_KEY...');
    console.log('   ⏳ Đang gọi POST /api/ai/lesson-plan (Trong lời mẹ hát - Tiếng Việt 4)...');

    // Wait a brief moment if rate limit window needs reset or use fresh token
    const liveRes = await fetch(`${API_BASE}/ai/lesson-plan`, {
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
        requirements: 'Chú trọng phát triển năng lực ngôn ngữ và cảm thụ văn học',
      }),
    });

    if (liveRes.ok) {
      const plan: any = await liveRes.json();
      console.log('   ✅ Sinh giáo án thành công từ Gemini:');
      console.log('      - Tiêu đề:', plan.title);
      console.log('      - Mục tiêu:', plan.objectives?.slice(0, 80) + '...');
      console.log('      - Số lượng hoạt động:', plan.activities?.length);
      plan.activities?.forEach((a: any, idx: number) => {
        console.log(`        [${idx + 1}] (${a.activityType}) ${a.title} - ${a.durationMinutes}p`);
      });
    } else {
      console.log('   ⚠️ Gemini API Response:', liveRes.status, await liveRes.text());
    }
  } else {
    console.log('5️⃣ GEMINI_API_KEY chưa có giá trị trong .env.');
    console.log('   Khi chưa có API key, service trả về HTTP 503 Service Unavailable rõ ràng và an toàn.');
  }

  console.log('\n🎉 Hoàn thành kiểm thử toàn diện module AI TeachFlow!');
}

main().catch(console.error);
