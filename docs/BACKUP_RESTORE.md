# HƯỚNG DẪN SAO LƯU VÀ KHÔI PHỤC DỮ LIỆU – TEACHFLOW PRODUCTION

Tài liệu này quy định quy trình chuẩn để sao lưu (Backup) và phục hồi (Restore/Disaster Recovery) cho hệ thống **TeachFlow**.

Do TeachFlow lưu trữ kết hợp **Cơ sở dữ liệu quan hệ (PostgreSQL)** và **Tệp tin vật lý (Kho tài nguyên dạy học `uploads/resources`)**, quy trình sao lưu và phục hồi bắt buộc phải bao gồm cả 2 thành phần để bảo toàn tính toàn vẹn dữ liệu.

---

## 1. CÁC BIẾN MÔI TRƯỜNG THAM CHIẾU

Trước khi thực thi lệnh, thiết lập các biến môi trường cần thiết:

```bash
export DB_HOST="127.0.0.1"
export DB_PORT="5432"
export DB_NAME="teachflow_db"
export DB_USER="postgres"
export PGPASSWORD="your_db_password"

export APP_ROOT="/app"
export UPLOADS_DIR="${APP_ROOT}/uploads"
export BACKUP_DIR="/var/backups/teachflow"
export TIMESTAMP=$(date +%Y%m%d_%H%M%S)
```

---

## 2. QUY TRÌNH SAO LƯU (BACKUP PROCEDURE)

### 2.1 Tạo thư mục chứa bản sao lưu
```bash
mkdir -p "${BACKUP_DIR}"
```

### 2.2 Sao lưu Cơ sở dữ liệu PostgreSQL (`pg_dump`)
Sử dụng định dạng Custom Archive (`-F c`) có nén, hỗ trợ khôi phục song song và lọc bảng:

```bash
pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -F c \
  -b \
  -v \
  -f "${BACKUP_DIR}/db_${TIMESTAMP}.dump"
```

### 2.3 Sao lưu Kho tệp tin tài nguyên (`tar`)
Nén toàn bộ thư mục `uploads/resources` thành tệp `.tar.gz`:

```bash
tar -czvf "${BACKUP_DIR}/resources_${TIMESTAMP}.tar.gz" -C "${UPLOADS_DIR}" resources
```

### 2.4 Kiểm tra tính toàn vẹn của tệp backup
```bash
# Kiểm tra dung lượng
ls -lh "${BACKUP_DIR}"/*_${TIMESTAMP}.*

# Kiểm tra tính toàn vẹn tệp dump
pg_restore -l "${BACKUP_DIR}/db_${TIMESTAMP}.dump" > /dev/null && echo "✓ Database dump valid"

# Kiểm tra tính toàn vẹn tệp tar.gz
tar -tzf "${BACKUP_DIR}/resources_${TIMESTAMP}.tar.gz" > /dev/null && echo "✓ Resource archive valid"
```

---

## 3. QUY TRÌNH KHÔI PHỤC DỮ LIỆU (RESTORE PROCEDURE)

> [!CAUTION]
> Quá trình khôi phục sẽ ghi đè dữ liệu hiện có trong Database và kho file. Cần đảm bảo đã dừng các dịch vụ ghi hoặc chuyển ứng dụng sang chế độ bảo trì trước khi thực hiện.

### 3.1 Khôi phục Cơ sở dữ liệu PostgreSQL (`pg_restore`)
Lệnh `--clean` và `--if-exists` sẽ xóa các bảng cũ trước khi nạp lại:

```bash
export RESTORE_FILE="${BACKUP_DIR}/db_YYYYMMDD_HHMMSS.dump"

pg_restore \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v \
  --clean \
  --if-exists \
  "${RESTORE_FILE}"
```

### 3.2 Khôi phục Kho tệp tin tài nguyên
Giải nén tệp lưu trữ vào đúng đường dẫn `uploads/`:

```bash
export RESTORE_TAR="${BACKUP_DIR}/resources_YYYYMMDD_HHMMSS.tar.gz"

tar -xzvf "${RESTORE_TAR}" -C "${UPLOADS_DIR}"
```

### 3.3 Phân quyền thư mục file
```bash
# Đảm bảo tiến trình backend (user: node) có quyền đọc ghi
chown -R node:node "${UPLOADS_DIR}"
chmod -R 755 "${UPLOADS_DIR}"
```

---

## 4. CHECKLIST XÁC MINH SAU PHỤC HỒI (VERIFICATION CHECKLIST)

Sau khi khôi phục, kiểm tra theo các bước sau:

1. **Kiểm tra Healthcheck**:
   ```bash
   curl -i http://localhost:3001/api/health
   # Kỳ vọng: HTTP 200 OK, {"status":"ok","database":"up"}
   ```
2. **Kiểm tra Migrations**:
   ```bash
   npx prisma migrate status
   # Kỳ vọng: Database schema is up to date!
   ```
3. **Kiểm tra đăng nhập Admin/Teacher**:
   - Gửi yêu cầu `POST /api/auth/login`.
4. **Kiểm tra tải tệp tin tài nguyên**:
   - Truy cập danh sách tài nguyên và thực hiện tải xuống một file PDF/DOCX đã upload để xác nhận file vật lý tồn tại và khớp với metadata trong cơ sở dữ liệu.
