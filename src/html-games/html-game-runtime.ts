export const TEACHFLOW_GAME_RUNTIME_SOURCE = String.raw`(function () {
  'use strict';
  var VERSION = 1;
  var MAX_BYTES = 262144;
  var params = new URLSearchParams(window.location.search);
  var gameInstanceId = params.get('teachflowGameInstanceId') || '';
  var parentOrigin = null;
  var currentConfig = null;
  var handlers = [];

  function messageSize(value) {
    try { return new TextEncoder().encode(JSON.stringify(value)).length; }
    catch (_) { return MAX_BYTES + 1; }
  }

  function ready() {
    if (!gameInstanceId) throw new Error('Missing teachflowGameInstanceId');
    window.parent.postMessage({
      type: 'TEACHFLOW_GAME_READY',
      version: VERSION,
      gameInstanceId: gameInstanceId
    }, '*');
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== window.parent || !data || typeof data !== 'object') return;
    if (messageSize(data) > MAX_BYTES) return;
    if (
      data.type !== 'TEACHFLOW_GAME_INIT' ||
      data.version !== VERSION ||
      data.gameInstanceId !== gameInstanceId ||
      !Array.isArray(data.questions)
    ) return;
    parentOrigin = event.origin;
    currentConfig = Object.freeze({ questions: data.questions.slice() });
    handlers.slice().forEach(function (handler) { handler(currentConfig); });
  });

  window.TeachFlowGame = Object.freeze({
    version: VERSION,
    ready: ready,
    onConfig: function (handler) {
      if (typeof handler !== 'function') throw new TypeError('onConfig requires a function');
      handlers.push(handler);
      if (currentConfig) handler(currentConfig);
      return function () { handlers = handlers.filter(function (item) { return item !== handler; }); };
    },
    submitResult: function (result) {
      if (!parentOrigin) throw new Error('Game has not received TEACHFLOW_GAME_INIT');
      var payload = {
        type: 'TEACHFLOW_GAME_RESULT',
        version: VERSION,
        gameInstanceId: gameInstanceId,
        score: Number(result && result.score),
        total: Number(result && result.total),
        answers: Array.isArray(result && result.answers) ? result.answers : []
      };
      if (!Number.isFinite(payload.score) || !Number.isFinite(payload.total) || messageSize(payload) > MAX_BYTES) {
        throw new Error('Invalid or oversized result payload');
      }
      window.parent.postMessage(payload, parentOrigin);
    }
  });
})();`;
