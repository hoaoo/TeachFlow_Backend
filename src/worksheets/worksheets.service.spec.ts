import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WorksheetsService } from './worksheets.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WorksheetsService', () => {
  let service: WorksheetsService;
  const mockPrisma: any = {
    worksheet: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    worksheetQuestion: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorksheetsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(WorksheetsService);
  });

  it('persists structured questions on create', async () => {
    mockPrisma.worksheet.create.mockResolvedValue({
      id: 'ws-1',
      teacherId: 't1',
      title: 'Phiếu phân số',
      questions: [
        {
          id: 'q1',
          questionType: 'MULTIPLE_CHOICE',
          content: '1/2 = ?',
          optionsJson: ['2/4'],
          correctAnswerJson: '2/4',
          sortOrder: 0,
        },
      ],
    });

    const created = await service.create(
      {
        title: 'Phiếu phân số',
        questions: [
          {
            questionType: 'MULTIPLE_CHOICE',
            content: '1/2 = ?',
            options: ['2/4'],
            correctAnswer: '2/4',
          },
        ],
      },
      't1',
    );

    expect(created.questionsCount).toBe(1);
    expect(created.questions[0].questionType).toBe('MULTIPLE_CHOICE');
    expect(mockPrisma.worksheet.create).toHaveBeenCalled();
  });

  it('blocks update of another teacher worksheet', async () => {
    mockPrisma.worksheet.findUnique.mockResolvedValue({
      id: 'ws-B',
      teacherId: 'teacher-B',
      deletedAt: null,
      questions: [],
    });

    await expect(
      service.update('ws-B', { title: 'hack' }, 'teacher-A'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rolls back question rewrite when transaction throws', async () => {
    mockPrisma.worksheet.findUnique.mockResolvedValue({
      id: 'ws-1',
      teacherId: 't1',
      deletedAt: null,
      questions: [],
    });
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('db fail'));

    await expect(
      service.update(
        'ws-1',
        {
          questions: [{ questionType: 'ESSAY', content: 'Giải thích phân số bằng nhau' }],
        },
        't1',
      ),
    ).rejects.toThrow('db fail');
  });

  it('builds a preview render model from unsaved draft', () => {
    const preview = service.previewDraft({
      title: 'Phiếu nháp',
      questions: [{ questionType: 'TRUE_FALSE', content: '1/2 = 2/4' }],
    });
    expect(preview.title).toBe('Phiếu nháp');
    expect(preview.questions).toHaveLength(1);
    expect(preview.questions[0].questionType).toBe('TRUE_FALSE');
  });
});
