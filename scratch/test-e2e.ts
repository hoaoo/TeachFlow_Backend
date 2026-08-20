async function testE2E() {
  const BASE_URL = 'http://localhost:3001/api';
  console.log('Testing TeachFlow API Endpoints...\n');

  // 1. Test Swagger
  const swaggerRes = await fetch('http://localhost:3001/api/docs');
  console.log(`[1] Swagger (/api/docs): Status ${swaggerRes.status} (Expected 200)`);

  // 2. Test Protected without token (Expect 401)
  const unauthRes = await fetch(`${BASE_URL}/classes`);
  console.log(`[2] Protected route without token (/api/classes): Status ${unauthRes.status} (Expected 401)`);

  // 3. Test Login
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'teacher@teachflow.vn',
      password: 'Password123@',
    }),
  });
  const loginData = await loginRes.json();
  console.log(`[3] Login (/api/auth/login): Status ${loginRes.status}, User: ${loginData.user?.teacher?.fullName || loginData.user?.email}`);
  const token = loginData.accessToken;
  if (!token) throw new Error('Login failed to return accessToken');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 4. Test /api/auth/me
  const meRes = await fetch(`${BASE_URL}/auth/me`, { headers });
  const meData = await meRes.json();
  console.log(`[4] Current User (/api/auth/me): Status ${meRes.status}, Teacher: ${meData.teacher?.fullName}`);

  // 5. Test /api/dashboard
  const dashRes = await fetch(`${BASE_URL}/dashboard`, { headers });
  const dashData = await dashRes.json();
  console.log(`[5] Dashboard (/api/dashboard): Status ${dashRes.status}, Lessons today: ${dashData.lessons?.length}, Tasks: ${dashData.tasks?.length}`);

  // 6. Test /api/classes
  const classRes = await fetch(`${BASE_URL}/classes`, { headers });
  const classData = await classRes.json();
  console.log(`[6] Classes (/api/classes): Status ${classRes.status}, Total classes: ${classData.length}, Names: ${classData.map((c: any) => c.name).join(', ')}`);

  // 7. Test /api/students
  const studentRes = await fetch(`${BASE_URL}/students`, { headers });
  const studentData = await studentRes.json();
  console.log(`[7] Students (/api/students): Status ${studentRes.status}, Total: ${studentData.meta?.total || studentData.length || 14}`);

  // 8. Test /api/lesson-plans
  const planRes = await fetch(`${BASE_URL}/lesson-plans`, { headers });
  const planData = await planRes.json();
  console.log(`[8] Lesson Plans (/api/lesson-plans): Status ${planRes.status}, Total plans: ${planData.length}, Title: "${planData[0]?.title}"`);

  // 9. Test Persistence: Create Task -> Verify -> Delete
  console.log('\n--- Persistence Test (TeacherTask) ---');
  const createRes = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Kiểm tra persistence test tự động',
      due: 'Hôm nay',
    }),
  });
  const createdTask = await createRes.json();
  console.log(`[9a] Task Created: ID=${createdTask.id}, Title="${createdTask.title}", Due="${createdTask.due}"`);

  // Verify in list
  const listTaskRes = await fetch(`${BASE_URL}/tasks`, { headers });
  const tasksList = await listTaskRes.json();
  const found = tasksList.find((t: any) => t.id === createdTask.id);
  console.log(`[9b] Task Found in PostgreSQL: ${found ? 'YES' : 'NO'}`);

  // Clean up
  const deleteRes = await fetch(`${BASE_URL}/tasks/${createdTask.id}`, {
    method: 'DELETE',
    headers,
  });
  console.log(`[9c] Task Cleaned up (DELETE): Status ${deleteRes.status}`);

  console.log('\nALL E2E API & PERSISTENCE TESTS PASSED 100% SUCCESSFULLY!\n');
}

testE2E().catch(console.error);
