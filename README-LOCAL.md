# TeachFlow - Hướng dẫn Chạy Local Development

Tài liệu hướng dẫn khởi động và vận hành toàn bộ hệ thống TeachFlow (Backend + Frontend + PostgreSQL) trên môi trường local.

---

## 1. Yêu cầu môi trường

- **Node.js**: >= 18.x (khuyến nghị Node 20.x hoặc 22.x)
- **Docker & Docker Compose** (hoặc PostgreSQL 17/18 chạy local)
- **Hệ điều hành**: Windows 10/11 (hỗ trợ WSL2 / Docker Desktop) hoặc Linux / macOS

---

## 2. Thông số Môi trường (Environment Variables)

### Backend (`D:\Backend_teachflow\.env`)
```env
# Database
POSTGRES_DB=teachflow_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres_secure_password_2026
POSTGRES_PORT=5432
DATABASE_URL="postgresql://postgres:postgres_secure_password_2026@127.0.0.1:5432/teachflow_db?schema=public&sslmode=disable"

# JWT Authentication
JWT_ACCESS_SECRET=d8f1e73a948c2b5091e6b375fc14a608e92f2c8d67b5e4a1936c581e247b901a
JWT_REFRESH_SECRET=7b2c9a63d41e8f5062b1a947ec8305f2b6a19e5d48c3f71a069e2b4d8157ca93
JWT_ISSUER=teachflow
JWT_AUDIENCE=teachflow-web
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### Frontend (`D:\Fontend_teachflow\.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## 3. Khởi động 4 bước nhanh (Quick Start)

### Bước 1: Khởi động PostgreSQL
Tại thư mục `D:\Backend_teachflow`:
```bash
docker compose up -d
```
> Hoặc sử dụng npm script: `npm run db:up`

### Bước 2: Chạy Migration & Seed Dữ liệu
Tại thư mục `D:\Backend_teachflow`:
```bash
npm run prisma:migrate
npm run prisma:seed
```

### Bước 3: Chạy Backend NestJS
Tại thư mục `D:\Backend_teachflow`:
```bash
npm run start:dev
```
- API Endpoint: `http://localhost:3001/api`
- Swagger OpenAPI Docs: `http://localhost:3001/api/docs`

### Bước 4: Chạy Frontend Next.js
Tại thư mục `D:\Fontend_teachflow`:
```bash
npm run dev
```
- Frontend Web App: `http://localhost:3000`

---

## 4. Tài khoản Đăng nhập Mặc định (Seed Account)

| Vai trò | Email | Mật khẩu | Họ và tên | Lớp phụ trách |
| :--- | :--- | :--- | :--- | :--- |
| **Giáo viên chủ nhiệm** | `teacher@teachflow.vn` | `Password123@` | Nguyễn Thị Mai | Lớp 4A, 4B, 3A |

---

## 5. Các lệnh tiện ích (Scripts)

Tại thư mục `D:\Backend_teachflow`:

| Lệnh | Chức năng |
| :--- | :--- |
| `npm run db:up` | Khởi động PostgreSQL container qua Docker Compose |
| `npm run db:down` | Dừng PostgreSQL container |
| `npm run db:migrate` | Deploy migrations vào database |
| `npm run db:seed` | Seed dữ liệu mẫu (giáo viên, lớp 4A/4B/3A, học sinh, giáo án, thời khóa biểu) |
| `npm run db:studio` | Mở giao diện trực quan Prisma Studio trên trình duyệt |
| `npm run build` | Biên dịch TypeScript backend sang `dist/` |
| `npm test` | Chạy bộ kiểm thử unit tests |

---

## 6. Kiểm tra & Verify Hệ thống (E2E Test)

Tại thư mục `D:\Backend_teachflow`:
```bash
npx ts-node scratch/test-e2e.ts
```

Bộ script sẽ tự động kiểm tra:
1. Swagger Docs (`/api/docs` -> 200)
2. Protected Route Guard (`/api/classes` without token -> 401)
3. Đăng nhập JWT (`POST /api/auth/login` -> 200 + trả về Bearer token)
4. Lấy thông tin cá nhân (`GET /api/auth/me` -> 200)
5. Dữ liệu Dashboard (`GET /api/dashboard` -> 200)
6. Danh sách lớp học (`GET /api/classes` -> 200, 3 lớp)
7. Danh sách học sinh (`GET /api/students` -> 200, 14 học sinh)
8. Giáo án điện tử (`GET /api/lesson-plans` -> 200)
9. Persistence Test (`POST /api/tasks` -> ghi vào DB -> kiểm tra danh sách -> `DELETE /api/tasks/:id` -> 200)
