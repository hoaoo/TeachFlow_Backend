import { Injectable } from '@nestjs/common';

export enum AssessmentTypeEnum {
  THUONG_XUYEN = 'THUONG_XUYEN',
  GIUA_KY = 'GIUA_KY',
  CUOI_KY = 'CUOI_KY',
  OTHER = 'OTHER',
}

export interface AssessmentItemForCalc {
  id: string;
  score: number | null | undefined;
  type?: string | AssessmentTypeEnum;
  weight?: number;
}

export interface ClassificationResult {
  code: 'EXCELLENT' | 'GOOD' | 'COMPLETED' | 'NEEDS_SUPPORT' | 'INCOMPLETE';
  label: string;
  color: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
}

export interface SubjectCalculationResult {
  averageScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  totalAssessments: number;
  gradedAssessments: number;
  isComplete: boolean;
  classification: ClassificationResult | null;
}

export interface SemesterCalculationResult {
  averageScore: number | null;
  totalSubjects: number;
  gradedSubjects: number;
  isComplete: boolean;
  classification: ClassificationResult | null;
}

@Injectable()
export class AcademicCalculationService {
  /**
   * Centralized rounding rule: rounds mathematically to given precision (default 1 decimal place).
   * Example: 8.45 -> 8.5, 8.44 -> 8.4
   */
  round(value: number | null, precision = 1): number | null {
    if (value === null || value === undefined || isNaN(value)) {
      return null;
    }
    const factor = Math.pow(10, precision);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  /**
   * Determine assessment weight based on type or explicit weight
   */
  getWeight(type?: string | AssessmentTypeEnum, explicitWeight?: number): number {
    if (explicitWeight && explicitWeight > 0) {
      return explicitWeight;
    }
    if (!type) return 1;

    const normalizedType = type.toUpperCase();
    if (normalizedType.includes('CUOI') || normalizedType === 'CUOI_KY' || normalizedType === 'FINAL') {
      return 3;
    }
    if (normalizedType.includes('GIUA') || normalizedType === 'GIUA_KY' || normalizedType === 'MIDTERM') {
      return 2;
    }
    return 1;
  }

  /**
   * Calculate subject average and classification for a student given their assessment scores
   */
  calculateSubjectResult(assessments: AssessmentItemForCalc[]): SubjectCalculationResult {
    let totalWeightedScore = 0;
    let totalWeight = 0;
    let minScore: number | null = null;
    let maxScore: number | null = null;
    let gradedAssessments = 0;

    for (const item of assessments) {
      if (item.score !== null && item.score !== undefined && !isNaN(item.score)) {
        const score = item.score;
        const weight = this.getWeight(item.type, item.weight);

        totalWeightedScore += score * weight;
        totalWeight += weight;
        gradedAssessments++;

        if (minScore === null || score < minScore) {
          minScore = score;
        }
        if (maxScore === null || score > maxScore) {
          maxScore = score;
        }
      }
    }

    if (totalWeight === 0 || gradedAssessments === 0) {
      return {
        averageScore: null,
        minScore: null,
        maxScore: null,
        totalAssessments: assessments.length,
        gradedAssessments: 0,
        isComplete: false,
        classification: null,
      };
    }

    const rawAverage = totalWeightedScore / totalWeight;
    const averageScore = this.round(rawAverage, 1);
    const classification = this.classifyAcademicPerformance(averageScore, minScore);

    return {
      averageScore,
      minScore,
      maxScore,
      totalAssessments: assessments.length,
      gradedAssessments,
      isComplete: gradedAssessments === assessments.length && assessments.length > 0,
      classification,
    };
  }

  /**
   * Calculate overall semester result across all subject averages
   */
  calculateSemesterResult(subjectAverages: Array<{ subjectId: string; averageScore: number | null }>): SemesterCalculationResult {
    const validScores = subjectAverages
      .map((s) => s.averageScore)
      .filter((s): s is number => s !== null && s !== undefined && !isNaN(s));

    if (validScores.length === 0) {
      return {
        averageScore: null,
        totalSubjects: subjectAverages.length,
        gradedSubjects: 0,
        isComplete: false,
        classification: null,
      };
    }

    const sum = validScores.reduce((acc, curr) => acc + curr, 0);
    const rawAverage = sum / validScores.length;
    const averageScore = this.round(rawAverage, 1);
    const minSubjectScore = Math.min(...validScores);
    const classification = this.classifyAcademicPerformance(averageScore, minSubjectScore);

    return {
      averageScore,
      totalSubjects: subjectAverages.length,
      gradedSubjects: validScores.length,
      isComplete: validScores.length === subjectAverages.length && subjectAverages.length > 0,
      classification,
    };
  }

  /**
   * Centralized academic performance classification based on Bộ GD&ĐT (Thông tư 27/2020 & Thông tư 22/2021)
   */
  classifyAcademicPerformance(
    averageScore: number | null,
    minScore?: number | null,
  ): ClassificationResult | null {
    if (averageScore === null || averageScore === undefined || isNaN(averageScore)) {
      return null;
    }

    const min = minScore !== undefined && minScore !== null ? minScore : averageScore;

    // Tốt / Hoàn thành tốt: TB >= 8.0 và min >= 6.5
    if (averageScore >= 8.0 && min >= 6.5) {
      return {
        code: 'EXCELLENT',
        label: 'Tốt',
        color: 'emerald',
      };
    }

    // Khá / Hoàn thành (loại khá): TB >= 6.5 và min >= 5.0
    if (averageScore >= 6.5 && min >= 5.0) {
      return {
        code: 'GOOD',
        label: 'Khá',
        color: 'blue',
      };
    }

    // Đạt / Hoàn thành: TB >= 5.0 và min >= 3.5
    if (averageScore >= 5.0 && min >= 3.5) {
      return {
        code: 'COMPLETED',
        label: 'Đạt',
        color: 'amber',
      };
    }

    // Cần cố gắng / Chưa hoàn thành: TB < 5.0 hoặc min < 3.5
    return {
      code: 'NEEDS_SUPPORT',
      label: 'Cần cố gắng',
      color: 'rose',
    };
  }
}
