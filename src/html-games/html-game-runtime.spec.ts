import { TEACHFLOW_GAME_RUNTIME_SOURCE } from './html-game-runtime';

describe('TeachFlow game runtime bridge', () => {
  it('uses the versioned init/ready/result protocol', () => {
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('TEACHFLOW_GAME_INIT');
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('TEACHFLOW_GAME_READY');
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('TEACHFLOW_GAME_RESULT');
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('gameInstanceId');
  });

  it('validates parent source, schema version, instance id and payload size', () => {
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('event.source !== window.parent');
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('data.version !== VERSION');
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('data.gameInstanceId !== gameInstanceId');
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('messageSize(data) > MAX_BYTES');
  });

  it('only uses wildcard before the sandboxed game learns its parent origin', () => {
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain("parentOrigin = event.origin");
    expect(TEACHFLOW_GAME_RUNTIME_SOURCE).toContain('postMessage(payload, parentOrigin)');
  });
});
