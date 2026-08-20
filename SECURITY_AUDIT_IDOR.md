# BÁO CÁO AUDIT & REMEDIATION BẢO MẬT CHUYÊN SÂU: IDOR / BROKEN ACCESS CONTROL / DATA ISOLATION
**Dự án**: TeachFlow Backend API  
**Mục tiêu**: Kiểm tra toàn diện và khắc phục triệt để nguy cơ Insecure Direct Object References (IDOR), Broken Access Control, rò rỉ dữ liệu giữa các giáo viên (Data Isolation) và leo thang đặc quyền.  
**Ngày thực hiện**: 20/08/2026  
**Trạng thái kiểm thử**: **100% PASS - TẤT CẢ 5 VULNERABILITIES ĐÃ ĐƯỢC KHẮC PHỤC VÀ KIỂM THỬ HỒI QUY**  
**Phạm vi**: Toàn bộ Controller, Service, Guard, DTO và Prisma Queries trong `d:\Backend_teachflow\src`.

---

## 1. Threat Model (Mô hình đe dọa)

Mô hình giả định kiểm thử gồm 3 chủ thể:
- **Teacher A (Attacker hợp lệ)**: Giáo viên đã xác thực hợp lệ bằng JWT token (`role = TEACHER`).
- **Teacher B (Nạn nhân)**: Giáo viên hợp lệ khác, sở hữu các lớp học, học sinh, giáo án, phiếu học tập, tài nguyên riêng.
- **Admin**: Quản trị viên hệ thống (`role = ADMIN`).

Mục tiêu đánh giá & bảo vệ:
1. Teacher A không thể đọc/sửa/xóa tài nguyên trực tiếp của Teacher B thông qua việc đoán/thay thế UUID ID.
2. Teacher A không thể đính kèm tài nguyên/hoạt động của Teacher B vào giáo án/lớp học của mình.
3. Teacher A không thể chèn học sinh, nhận xét hoặc điểm danh vào lớp học của Teacher B.
4. Teacher A không thể sửa/xóa các hoạt động dùng chung của hệ thống (`teacherId: null`).
5. Teacher A không thể giả mạo `teacherId`, `userId`, `role` qua Body, Query hoặc Route Parameter.

---

## 2. Bảng Ma Trận Bảo Mật Sau Khắc Phục (Security Matrix - Post Remediation)

| Module | List Isolation | Get by ID | Create Spoof | Update Isolation | Delete Isolation | Nested Ownership | Trạng Thái |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Classrooms** (`/classes`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **SECURE** |
| **Students** (`/students`) | ✅ PASS | ✅ PASS | ✅ PASS (Fixed) | ✅ PASS | ✅ PASS | ✅ PASS | **SECURE** |
| **Lesson Plans** (`/lesson-plans`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **SECURE** |
| **Teaching Plans** (`/teaching-plans`) | ✅ PASS | ✅ PASS | ✅ PASS (Fixed) | ✅ PASS | ✅ PASS | N/A | **SECURE** |
| **Worksheets** (`/worksheets`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **SECURE** |
| **Attendance** (`/attendance`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | N/A | ✅ PASS | **SECURE** |
| **Assessments** (`/assessments`) | ✅ PASS | ✅ PASS | ✅ PASS (Fixed) | ✅ PASS | ✅ PASS | ✅ PASS | **SECURE** |
| **Student Comments** (`/student-comments`) | N/A | N/A | ✅ PASS (Fixed) | ✅ PASS | ✅ PASS | N/A | **SECURE** |
| **Resources** (`/resources`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **SECURE** |
| **Activity Library** (`/activities`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS (Fixed) | ✅ PASS (Fixed) | ✅ PASS | **SECURE** |
| **Tasks** (`/tasks`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | N/A | **SECURE** |
| **Dashboard** (`/dashboard`) | ✅ PASS | N/A | N/A | N/A | N/A | N/A | **SECURE** |
| **Export** (`/lesson-plans/:id/export`, `/worksheets/:id/export`) | N/A | ✅ PASS | N/A | N/A | N/A | N/A | **SECURE** |
| **AI Assistant** (`/ai/*`) | ✅ PASS | N/A | ✅ PASS | N/A | N/A | N/A | **SECURE** |
| **Admin** (`/admin/teachers/*`) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | **SECURE** |

---

## 3. Danh Mục Chi Tiết Toàn Bộ Endpoints (API Inventory)

| METHOD | ROUTE | Auth | Role | Ownership Mechanism | Đánh Giá Rủi Ro |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/classes` | JWT | TEACHER/ADMIN | `where.teacherId = teacherId` | ✅ An toàn |
| `GET` | `/api/classes/:id` | JWT | TEACHER/ADMIN | `classroom.teacherId === teacherId` | ✅ An toàn |
| `POST` | `/api/classes` | JWT | TEACHER | Gán `teacherId` từ JWT | ✅ An toàn |
| `PATCH` | `/api/classes/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu trước khi cập nhật | ✅ An toàn |
| `DELETE` | `/api/classes/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu trước khi soft-delete | ✅ An toàn |
| `GET` | `/api/classes/:id/students` | JWT | TEACHER | `findOne(classId, teacherId)` | ✅ An toàn |
| `POST` | `/api/classes/:id/students` | JWT | TEACHER | `findOne(classId, teacherId)` | ✅ An toàn |
| `DELETE` | `/api/classes/:id/students/:studentId` | JWT | TEACHER | `findOne` + xác thực `classroomId_studentId` | ✅ An toàn |
| `GET` | `/api/students` | JWT | TEACHER/ADMIN | `where.classStudents.some.classroom.teacherId` | ✅ An toàn |
| `GET` | `/api/students/:id` | JWT | TEACHER/ADMIN | Kiểm tra student thuộc lớp của `teacherId` | ✅ An toàn |
| `POST` | `/api/students` | JWT | TEACHER | Kiểm tra `classroom.teacherId === teacherId` trước khi ghi DB | ✅ **SECURE (Fixed VULN-IDOR-002)** |
| `PATCH` | `/api/students/:id` | JWT | TEACHER | `findOne(id, teacherId)` | ✅ An toàn |
| `DELETE` | `/api/students/:id` | JWT | TEACHER | `findOne(id, teacherId)` | ✅ An toàn |
| `GET` | `/api/students/:id/overview` | JWT | TEACHER | `findOne(id, teacherId)` | ✅ An toàn |
| `GET` | `/api/students/:id/attendance` | JWT | TEACHER | `findOne(id, teacherId)` | ✅ An toàn |
| `GET` | `/api/students/:id/assessments` | JWT | TEACHER | `findOne(id, teacherId)` | ✅ An toàn |
| `GET` | `/api/students/:id/comments` | JWT | TEACHER | `findOne(id, teacherId)` | ✅ An toàn |
| `POST` | `/api/students/:studentId/comments` | JWT | TEACHER | Xác minh student thuộc active class của `teacherId` trước khi ghi DB | ✅ **SECURE (Fixed VULN-IDOR-001)** |
| `PATCH` | `/api/student-comments/:id` | JWT | TEACHER | `comment.teacherId === teacherId` | ✅ An toàn |
| `DELETE` | `/api/student-comments/:id` | JWT | TEACHER | `comment.teacherId === teacherId` | ✅ An toàn |
| `GET` | `/api/lesson-plans` | JWT | TEACHER | `where.teacherId = teacherId` | ✅ An toàn |
| `GET` | `/api/lesson-plans/:id` | JWT | TEACHER | `plan.teacherId === teacherId` | ✅ An toàn |
| `POST` | `/api/lesson-plans` | JWT | TEACHER | Gán `teacherId` từ JWT | ✅ An toàn |
| `PATCH` | `/api/lesson-plans/:id` | JWT | TEACHER | `existing.teacherId === teacherId` | ✅ An toàn |
| `DELETE` | `/api/lesson-plans/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `POST` | `/api/lesson-plans/:id/duplicate` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `POST` | `/api/lesson-plans/:id/activities` | JWT | TEACHER | `findOne(lessonPlanId, teacherId)` | ✅ An toàn |
| `PATCH` | `/api/lesson-plans/:id/activities/:activityId` | JWT | TEACHER | `findOne` + `activity.lessonPlanId === lessonPlanId` | ✅ An toàn |
| `DELETE` | `/api/lesson-plans/:id/activities/:activityId` | JWT | TEACHER | `findOne` + `activity.lessonPlanId === lessonPlanId` | ✅ An toàn |
| `PUT` | `/api/lesson-plans/:id/activities/reorder` | JWT | TEACHER | `findOne` + `where: { id, lessonPlanId }` | ✅ An toàn |
| `GET` | `/api/lesson-plans/:id/resources` | JWT | TEACHER | `findOne(lessonPlanId, teacherId)` | ✅ An toàn |
| `POST` | `/api/lesson-plans/:id/resources/:resourceId` | JWT | TEACHER | `findOne(planId)` + `resource.teacherId === teacherId` | ✅ An toàn |
| `DELETE` | `/api/lesson-plans/:id/resources/:resourceId` | JWT | TEACHER | `findOne(lessonPlanId, teacherId)` | ✅ An toàn |
| `GET` | `/api/lesson-plans/:id/export/docx` | JWT | TEACHER/ADMIN | `plan.teacherId === currentTeacherId` | ✅ An toàn |
| `GET` | `/api/lesson-plans/:id/export/pdf` | JWT | TEACHER/ADMIN | `plan.teacherId === currentTeacherId` | ✅ An toàn |
| `GET` | `/api/teaching-plans` | JWT | TEACHER | `where.teacherId = teacherId` | ✅ An toàn |
| `GET` | `/api/teaching-plans/:id` | JWT | TEACHER | `plan.teacherId === teacherId` | ✅ An toàn |
| `POST` | `/api/teaching-plans` | JWT | TEACHER | Xác thực `classroomId` thuộc `teacherId` trước khi tạo | ✅ **SECURE (Fixed VULN-IDOR-003)** |
| `PATCH` | `/api/teaching-plans/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `DELETE` | `/api/teaching-plans/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `GET` | `/api/worksheets` | JWT | TEACHER | `where.teacherId = teacherId` | ✅ An toàn |
| `GET` | `/api/worksheets/:id` | JWT | TEACHER | `worksheet.teacherId === teacherId` | ✅ An toàn |
| `POST` | `/api/worksheets` | JWT | TEACHER | Gán `teacherId` từ JWT | ✅ An toàn |
| `PATCH` | `/api/worksheets/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `DELETE` | `/api/worksheets/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `POST` | `/api/worksheets/:id/duplicate` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `GET` | `/api/worksheets/:id/export/docx` | JWT | TEACHER/ADMIN | `worksheet.teacherId === currentTeacherId` | ✅ An toàn |
| `GET` | `/api/worksheets/:id/export/pdf` | JWT | TEACHER/ADMIN | `worksheet.teacherId === currentTeacherId` | ✅ An toàn |
| `GET` | `/api/attendance` | JWT | TEACHER | `classroom.teacherId === teacherId` | ✅ An toàn |
| `PUT` | `/api/attendance` | JWT | TEACHER | `classroom.teacherId === teacherId` + kiểm tra HS thuộc lớp | ✅ An toàn |
| `GET` | `/api/attendance/history` | JWT | TEACHER | `where.teacherId = teacherId` | ✅ An toàn |
| `GET` | `/api/assessments` | JWT | TEACHER | `where.teacherId = teacherId` | ✅ An toàn |
| `GET` | `/api/assessments/:id` | JWT | TEACHER | `assessment.teacherId === teacherId` | ✅ An toàn |
| `POST` | `/api/assessments` | JWT | TEACHER | Xác thực `classroomId` thuộc `teacherId` trước khi tạo | ✅ **SECURE (Fixed VULN-IDOR-004)** |
| `PATCH` | `/api/assessments/:id` | JWT | TEACHER | `existing.teacherId === teacherId` | ✅ An toàn |
| `DELETE` | `/api/assessments/:id` | JWT | TEACHER | `existing.teacherId === teacherId` | ✅ An toàn |
| `PUT` | `/api/assessments/:id/students` | JWT | TEACHER | `assessment.teacherId === teacherId` + kiểm tra HS thuộc lớp | ✅ An toàn |
| `POST` | `/api/resources/upload` | JWT | TEACHER | Gán `teacherId` từ JWT, lưu đĩa an toàn (UUID) | ✅ An toàn |
| `GET` | `/api/resources` | JWT | TEACHER/ADMIN | `where.teacherId = teacherId` | ✅ An toàn |
| `GET` | `/api/resources/:id` | JWT | TEACHER/ADMIN | `res.teacherId === teacherId` | ✅ An toàn |
| `GET` | `/api/resources/:id/download` | JWT | TEACHER/ADMIN | `res.teacherId === teacherId` | ✅ An toàn |
| `GET` | `/api/resources/:id/file` | JWT | TEACHER/ADMIN | `res.teacherId === teacherId` | ✅ An toàn |
| `PATCH` | `/api/resources/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu | ✅ An toàn |
| `DELETE` | `/api/resources/:id` | JWT | TEACHER | `findOne` kiểm tra quyền sở hữu + xóa file đĩa | ✅ An toàn |
| `GET` | `/api/activities` | JWT | PUBLIC/TEACHER | `where: { isPublic: true }` | ✅ An toàn |
| `GET` | `/api/activities/:id` | JWT | PUBLIC/TEACHER | Public activity read | ✅ An toàn |
| `POST` | `/api/activities` | JWT | TEACHER | Gán `teacherId` từ JWT | ✅ An toàn |
| `PATCH` | `/api/activities/:id` | JWT | TEACHER | Chặn sửa activity hệ thống (`teacherId: null`) và của GV khác | ✅ **SECURE (Fixed VULN-AUTH-005)** |
| `DELETE` | `/api/activities/:id` | JWT | TEACHER | Chặn xóa activity hệ thống (`teacherId: null`) và của GV khác | ✅ **SECURE (Fixed VULN-AUTH-005)** |
| `POST` | `/api/activities/:id/add-to-lesson-plan` | JWT | TEACHER | `lessonPlan.teacherId === teacherId` | ✅ An toàn |
| `GET` | `/api/tasks` | JWT | TEACHER | `where.teacherId = teacherId` | ✅ An toàn |
| `POST` | `/api/tasks` | JWT | TEACHER | Gán `teacherId` từ JWT | ✅ An toàn |
| `PATCH` | `/api/tasks/:id` | JWT | TEACHER | `existing.teacherId === teacherId` | ✅ An toàn |
| `DELETE` | `/api/tasks/:id` | JWT | TEACHER | `existing.teacherId === teacherId` | ✅ An toàn |
| `GET` | `/api/dashboard` | JWT | TEACHER | `where.teacherId = teacherId` | ✅ An toàn |
| `POST` | `/api/ai/*` | JWT | TEACHER | AI Throttler + JWT Auth | ✅ An toàn |
| `GET` | `/api/admin/teachers` | JWT | ADMIN | `RolesGuard` (`role === 'ADMIN'`) | ✅ An toàn |
| `POST` | `/api/admin/teachers` | JWT | ADMIN | `RolesGuard` + Transaction User & Teacher | ✅ An toàn |
| `PATCH` | `/api/admin/teachers/:id` | JWT | ADMIN | `RolesGuard` | ✅ An toàn |
| `PATCH` | `/api/admin/teachers/:id/status` | JWT | ADMIN | `RolesGuard` + Chống Admin tự khóa | ✅ An toàn |
| `POST` | `/api/admin/teachers/:id/reset-password` | JWT | ADMIN | `RolesGuard` + Invalidate Refresh Token | ✅ An toàn |

---

## 4. Chi Tiết Kết Quả Khắc Phục (Remediation Details)

### 1. VULN-IDOR-001 (P0 HIGH): Cross-Tenant Student Comment Injection
- **Endpoint**: `POST /api/students/:studentId/comments`
- **File**: `src/student-comments/student-comments.service.ts`
- **Trạng thái**: ✅ **FIXED & VERIFIED**
- **Giải pháp**: Truy vấn `student.classStudents` kèm `classroom` và xác minh `student.classStudents.some(cs => cs.classroom.teacherId === teacherId)`. Nếu không có quyền, ném `ForbiddenException('Bạn không có quyền nhận xét học sinh này')` TRƯỚC khi thực hiện bất kỳ lệnh ghi database nào.
- **Kết quả kiểm thử**:
  - Unit Test (`src/common/security-idor.spec.ts`): PASS (Ném `ForbiddenException`, `mockPrisma.studentComment.create` không được gọi).
  - Live E2E (`scratch/test-security-idor-e2e.ts`): PASS (HTTP 403 Forbidden).

---

### 2. VULN-IDOR-002 (P0 HIGH): Cross-Teacher Classroom Injection in Student Creation
- **Endpoint**: `POST /api/students`
- **File**: `src/students/students.service.ts`
- **Trạng thái**: ✅ **FIXED & VERIFIED**
- **Giải pháp**: Nếu `dto.classId` được cung cấp, kiểm tra `classroom.teacherId === teacherId` và `classroom.deletedAt === null` TRƯỚC khi tạo `Student` hoặc `ClassStudent`. Bao bọc toàn bộ thao tác trong `prisma.$transaction`.
- **Kết quả kiểm thử**:
  - Unit Test (`src/common/security-idor.spec.ts`): PASS (Ném `ForbiddenException`, không tạo `Student` hay `ClassStudent`).
  - Live E2E (`scratch/test-security-idor-e2e.ts`): PASS (HTTP 403 Forbidden).

---

### 3. VULN-IDOR-003 (P1 MEDIUM): Cross-Teacher Classroom Injection in Teaching Plans
- **Endpoint**: `POST /api/teaching-plans`
- **File**: `src/teaching-plans/teaching-plans.service.ts`
- **Trạng thái**: ✅ **FIXED & VERIFIED**
- **Giải pháp**: Nếu `dto.classroomId` được cung cấp từ body, xác thực `classroom.teacherId === teacherId` trước khi tạo kế hoạch dạy học.
- **Kết quả kiểm thử**:
  - Unit Test (`src/common/security-idor.spec.ts`): PASS (Ném `ForbiddenException`, không gọi `teachingPlan.create`).
  - Live E2E (`scratch/test-security-idor-e2e.ts`): PASS (HTTP 403 Forbidden).

---

### 4. VULN-IDOR-004 (P1 MEDIUM): Cross-Teacher Classroom Injection in Assessments
- **Endpoint**: `POST /api/assessments`
- **File**: `src/assessments/assessments.service.ts`
- **Trạng thái**: ✅ **FIXED & VERIFIED**
- **Giải pháp**: Nếu `dto.classroomId` được cung cấp từ body, xác thực `classroom.teacherId === teacherId` trước khi tạo đợt đánh giá.
- **Kết quả kiểm thử**:
  - Unit Test (`src/common/security-idor.spec.ts`): PASS (Ném `ForbiddenException`, không gọi `assessment.create`).
  - Live E2E (`scratch/test-security-idor-e2e.ts`): PASS (HTTP 403 Forbidden).

---

### 5. VULN-AUTH-005 (P2 LOW): Broken Authorization on System Activities
- **Endpoint**: `PATCH /api/activities/:id` & `DELETE /api/activities/:id`
- **File**: `src/activity-library/activity-library.service.ts`
- **Trạng thái**: ✅ **FIXED & VERIFIED**
- **Giải pháp**: Sửa điều kiện phân quyền: `if (!existing.teacherId || existing.teacherId !== teacherId) throw new ForbiddenException(...)`. Giáo viên chỉ được sửa/xóa hoạt động do chính mình tạo ra, cấm can thiệp hoạt động hệ thống (`teacherId === null`).
- **Kết quả kiểm thử**:
  - Unit Test (`src/common/security-idor.spec.ts`): PASS (Chặn sửa/xóa hoạt động hệ thống; cho phép sửa/xóa hoạt động của chính mình).
  - Live E2E (`scratch/test-security-idor-e2e.ts`): PASS (Sửa/xóa activity của GV khác bị 403; tự sửa/xóa activity của mình trả về 200 OK).

---

## 5. Bằng Chứng Kiểm Thử Hồi Quy (Verification Proofs)

### A. Jest Unit & Regression Tests:
```text
Test Suites: 15 passed, 15 total
Tests:       85 passed, 85 total
Snapshots:   0 total
Time:        22.57 s
```

### B. Live Adversarial E2E Tests (`scratch/test-security-idor-e2e.ts`):
```text
1️⃣ Xác thực Teacher A (Mai) và Teacher B (Lan)... OK
2️⃣ Khởi tạo tài nguyên mẫu của Teacher B (Lan)... OK
3️⃣ Kiểm tra tấn công IDOR trực tiếp (Teacher A -> Dữ liệu của Teacher B)...
   - [PASS ✅] 24/24 endpoint IDOR trực tiếp trả về HTTP 403 Forbidden
4️⃣ Kiểm tra tấn công Cross-Parent & Resource Hijacking...
   - [PASS ✅] Đính kèm tài nguyên của Lan vào giáo án Mai -> HTTP 403
   - [PASS ✅] Điểm danh trái phép cho lớp của Lan -> HTTP 403
5️⃣ Kiểm tra hồi quy 5 lỗi bảo mật đã khắc phục...
   - [PASS ✅] VULN-IDOR-001 (POST /students/:studentId/comments): Status 403
   - [PASS ✅] VULN-IDOR-002 (POST /students with classId_B): Status 403
   - [PASS ✅] VULN-IDOR-003 (POST /teaching-plans with classroomId_B): Status 403
   - [PASS ✅] VULN-IDOR-004 (POST /assessments with classroomId_B): Status 403
   - [PASS ✅] VULN-AUTH-005 (Teacher A sửa/xóa activity của Teacher B): PATCH=403, DELETE=403
   - [PASS ✅] Teacher A tự sửa/xóa hoạt động của mình: PATCH=200, DELETE=200

🎉 TẤT CẢ CÁC BÀI KIỂM THỬ BẢO MẬT & IDOR ĐÃ PASS 100%!
```
