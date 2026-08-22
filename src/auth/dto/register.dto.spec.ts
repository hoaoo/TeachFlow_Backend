import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

async function validatePayload(payload: Record<string, unknown>) {
  return validate(plainToInstance(RegisterDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('RegisterDto', () => {
  it('accepts and normalizes a valid teacher registration', async () => {
    const dto = plainToInstance(RegisterDto, {
      fullName: '  Nguyễn Văn A ', email: ' Teacher@Example.com ', password: 'Strong@123',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.fullName).toBe('Nguyễn Văn A');
    expect(dto.email).toBe('teacher@example.com');
  });

  it.each([
    ['invalid email', { fullName: 'Teacher', email: 'invalid', password: 'Strong@123' }],
    ['weak password', { fullName: 'Teacher', email: 'teacher@example.com', password: 'password' }],
    ['missing full name', { email: 'teacher@example.com', password: 'Strong@123' }],
  ])('rejects %s', async (_label, payload) => {
    expect((await validatePayload(payload)).length).toBeGreaterThan(0);
  });

  it('rejects role mass assignment instead of allowing ADMIN', async () => {
    const errors = await validatePayload({
      fullName: 'Hacker', email: 'x@example.com', password: 'Strong@123', role: 'ADMIN',
    });
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });
});
