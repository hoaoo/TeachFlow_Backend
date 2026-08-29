import { ParseUUIDPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { AdminHtmlGamesController } from './admin-html-games.controller';
import { HtmlGamesController } from './html-games.controller';
import { TeacherHtmlGamesController } from './teacher-html-games.controller';

function expectUuidParam(
  controller: Function,
  methodName: string,
  parameterName: string,
) {
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) || {};
  const parameter = Object.values(metadata).find(
    (item: any) => item.data === parameterName,
  ) as any;
  expect(parameter).toBeDefined();
  expect(parameter.pipes.some((pipe: unknown) => pipe instanceof ParseUUIDPipe)).toBe(true);
}

describe('HTML game route UUID validation', () => {
  it('rejects malformed master game ids before a service call', () => {
    expectUuidParam(HtmlGamesController, 'play', 'id');
    expectUuidParam(AdminHtmlGamesController, 'updateStatus', 'id');
  });

  it('rejects malformed customization and question ids before ownership checks', () => {
    expectUuidParam(TeacherHtmlGamesController, 'updateQuestion', 'id');
    expectUuidParam(TeacherHtmlGamesController, 'updateQuestion', 'questionId');
  });
});
