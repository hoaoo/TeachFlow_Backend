import { AcademicCalculationService } from './academic-calculation.service';

describe('AcademicCalculationService', () => {
  let service: AcademicCalculationService;

  beforeEach(() => {
    service = new AcademicCalculationService();
  });

  describe('Rounding', () => {
    it('rounds 8.45 to 8.5 and 8.44 to 8.4 with precision 1', () => {
      expect(service.round(8.45, 1)).toBe(8.5);
      expect(service.round(8.44, 1)).toBe(8.4);
      expect(service.round(8.0, 1)).toBe(8.0);
      expect(service.round(null)).toBeNull();
    });
  });

  describe('Weighting', () => {
    it('returns correct weights for assessment types', () => {
      expect(service.getWeight('THUONG_XUYEN')).toBe(1);
      expect(service.getWeight('GIUA_KY')).toBe(2);
      expect(service.getWeight('CUOI_KY')).toBe(3);
      expect(service.getWeight('OTHER')).toBe(1);
      expect(service.getWeight(undefined, 5)).toBe(5);
    });
  });

  describe('Subject Calculation with Score 0 vs Missing (null)', () => {
    it('score 0 is a valid grade and factored into average', () => {
      const items = [
        { id: '1', score: 0, type: 'THUONG_XUYEN' }, // 0 * 1
        { id: '2', score: 10, type: 'GIUA_KY' },      // 10 * 2 = 20
      ];
      // Weighted avg = 20 / 3 = 6.666... -> 6.7
      const result = service.calculateSubjectResult(items);
      expect(result.averageScore).toBe(6.7);
      expect(result.minScore).toBe(0);
      expect(result.gradedAssessments).toBe(2);
      // Min score is 0 < 3.5, so classification is NEEDS_SUPPORT
      expect(result.classification?.code).toBe('NEEDS_SUPPORT');
    });

    it('null score is ignored in denominator', () => {
      const items = [
        { id: '1', score: null, type: 'THUONG_XUYEN' },
        { id: '2', score: 9, type: 'GIUA_KY' }, // 9 * 2 = 18 / 2 = 9
      ];
      const result = service.calculateSubjectResult(items);
      expect(result.averageScore).toBe(9.0);
      expect(result.minScore).toBe(9.0);
      expect(result.gradedAssessments).toBe(1);
      expect(result.isComplete).toBe(false);
      expect(result.classification?.code).toBe('EXCELLENT');
    });

    it('returns null average when all scores are missing (null)', () => {
      const items = [
        { id: '1', score: null, type: 'THUONG_XUYEN' },
        { id: '2', score: null, type: 'CUOI_KY' },
      ];
      const result = service.calculateSubjectResult(items);
      expect(result.averageScore).toBeNull();
      expect(result.classification).toBeNull();
      expect(result.isComplete).toBe(false);
      expect(result.gradedAssessments).toBe(0);
    });
  });

  describe('Classification Boundaries', () => {
    it('classifies EXCELLENT (Tốt) when avg >= 8.0 and min >= 6.5', () => {
      expect(service.classifyAcademicPerformance(8.5, 7.0)?.code).toBe('EXCELLENT');
      expect(service.classifyAcademicPerformance(8.0, 6.5)?.code).toBe('EXCELLENT');
    });

    it('demotes to GOOD (Khá) if avg >= 8.0 but min < 6.5 (min >= 5.0)', () => {
      expect(service.classifyAcademicPerformance(8.5, 5.5)?.code).toBe('GOOD');
    });

    it('classifies GOOD (Khá) when avg >= 6.5 and min >= 5.0', () => {
      expect(service.classifyAcademicPerformance(7.2, 6.0)?.code).toBe('GOOD');
      expect(service.classifyAcademicPerformance(6.5, 5.0)?.code).toBe('GOOD');
    });

    it('classifies COMPLETED (Đạt) when avg >= 5.0 and min >= 3.5', () => {
      expect(service.classifyAcademicPerformance(5.8, 4.0)?.code).toBe('COMPLETED');
    });

    it('classifies NEEDS_SUPPORT (Cần cố gắng) when avg < 5.0 or min < 3.5', () => {
      expect(service.classifyAcademicPerformance(4.8, 4.0)?.code).toBe('NEEDS_SUPPORT');
      expect(service.classifyAcademicPerformance(7.0, 3.0)?.code).toBe('NEEDS_SUPPORT');
    });

    it('returns null when averageScore is null', () => {
      expect(service.classifyAcademicPerformance(null)).toBeNull();
    });
  });
});
