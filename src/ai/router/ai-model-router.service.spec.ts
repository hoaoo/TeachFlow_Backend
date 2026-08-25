import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiModelRouterService } from './ai-model-router.service';

describe('AiModelRouterService', () => {
  let router: AiModelRouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiModelRouterService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GEMMA_MODEL') return 'gemma-4-26b-a4b-it';
              if (key === 'GEMINI_FAST_MODEL') return 'gemini-3.5-flash-lite';
              if (key === 'GEMINI_COMPLEX_MODEL') return 'gemini-3.7-flash';
              if (key === 'GEMINI_IMAGE_MODEL') return 'gemini-3.1-flash-image';
              if (key === 'GEMINI_IMAGE_FALLBACK_MODEL') return 'gemini-3.1-flash-lite-image';
              return null;
            }),
          },
        },
      ],
    }).compile();

    router = module.get(AiModelRouterService);
  });

  describe('Operation to Model Routing', () => {
    it('routes chat, student-comment, questions, and simple PDF to Gemma 4 26B', () => {
      const chatRoute = router.getRouteForOperation('chat');
      expect(chatRoute.primaryModel).toBe('gemma-4-26b-a4b-it');
      expect(chatRoute.taskCategory).toBe('gemma');
      expect(chatRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite']);

      const commentRoute = router.getRouteForOperation('student-comment');
      expect(commentRoute.primaryModel).toBe('gemma-4-26b-a4b-it');
      expect(commentRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite']);

      const questionsRoute = router.getRouteForOperation('questions');
      expect(questionsRoute.primaryModel).toBe('gemma-4-26b-a4b-it');
      expect(questionsRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite']);

      const simplePdfRoute = router.getRouteForOperation('simple-pdf-analysis');
      expect(simplePdfRoute.primaryModel).toBe('gemma-4-26b-a4b-it');
      expect(simplePdfRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite']);

      const activityRoute = router.getRouteForOperation('activity');
      expect(activityRoute.primaryModel).toBe('gemma-4-26b-a4b-it');
      expect(activityRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite']);
    });

    it('routes document extraction, XLSX extraction, and import to Gemini 3.5 Flash Lite', () => {
      const docRoute = router.getRouteForOperation('document-extraction');
      expect(docRoute.primaryModel).toBe('gemini-3.5-flash-lite');
      expect(docRoute.taskCategory).toBe('extraction');
      expect(docRoute.fallbackChain).toEqual(['gemma-4-26b-a4b-it']);

      const xlsxRoute = router.getRouteForOperation('xlsx-extraction');
      expect(xlsxRoute.primaryModel).toBe('gemini-3.5-flash-lite');
      expect(xlsxRoute.fallbackChain).toEqual(['gemma-4-26b-a4b-it']);

      const importRoute = router.getRouteForOperation('import');
      expect(importRoute.primaryModel).toBe('gemini-3.5-flash-lite');
      expect(importRoute.fallbackChain).toEqual(['gemma-4-26b-a4b-it']);

      const batchRoute = router.getRouteForOperation('batch-processing');
      expect(batchRoute.primaryModel).toBe('gemini-3.5-flash-lite');
      expect(batchRoute.fallbackChain).toEqual(['gemma-4-26b-a4b-it']);
    });

    it('routes lesson-plan, worksheet, and homeroom summary to Gemini 3.7 Flash', () => {
      const lessonPlanRoute = router.getRouteForOperation('lesson-plan');
      expect(lessonPlanRoute.primaryModel).toBe('gemini-3.7-flash');
      expect(lessonPlanRoute.taskCategory).toBe('complex');
      expect(lessonPlanRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it']);

      const worksheetRoute = router.getRouteForOperation('worksheet');
      expect(worksheetRoute.primaryModel).toBe('gemini-3.7-flash');
      expect(worksheetRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it']);

      const homeroomSummaryRoute = router.getRouteForOperation('homeroom-summary');
      expect(homeroomSummaryRoute.primaryModel).toBe('gemini-3.7-flash');
      expect(homeroomSummaryRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it']);

      const homeroomWeeklyRoute = router.getRouteForOperation('homeroom-weekly-summary');
      expect(homeroomWeeklyRoute.primaryModel).toBe('gemini-3.7-flash');
      expect(homeroomWeeklyRoute.fallbackChain).toEqual(['gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it']);
    });

    it('prevents circular and duplicate models in fallback chain', () => {
      const route = router.getRouteForOperation('lesson-plan');
      const uniqueModels = new Set([route.primaryModel, ...route.fallbackChain]);
      expect(uniqueModels.size).toBe(1 + route.fallbackChain.length);
      expect(route.fallbackChain).not.toContain(route.primaryModel);
    });
  });
});
