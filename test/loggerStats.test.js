require('babel-polyfill');

const feathers = require('feathers');
const hooks = require('feathers-hooks');
const assert = require('chai').assert;

const { profiler, getProfile, clearProfile, getPending } = require('../src');

const logger = (cache) => ({ log: msg => { cache.push(msg); } });

const logMsg = hook => {
  hook._log = hook._log || {};

  return {
    route: hook._log.route,
    method: hook.method,
    provider: hook.params.provider || 'server',
    elapsed: Math.round(hook._log.elapsed / 1e5) / 10,
    pending: getPending(),
    original: null,
    error: null
  };
};

function services1 () {
  this.use('/messages', {
    create: data => Promise.resolve(data),
    find: params => Promise.resolve([
      { text: 'message a' },
      { text: 'message b' },
      { text: 'message c' }
    ])
  });

  this.use('/users', {
    create: data => Promise.resolve(data)
  });
}

describe('profiler', () => {
  describe('Calls are logged & stats created', () => {
    let app;
    let users;
    let messages;
    let logCache;

    beforeEach(() => {
      logCache = [];
      clearProfile();

      app = feathers()
        .configure(hooks())
        .configure(services1)
        .configure(profiler({ logger: logger(logCache) }));

      users = app.service('users');
      messages = app.service('messages');
    });

    it('Handles 1 call', (done) => {
      messages.create({ name: 'John Doe' })
        .then(() => {
          const stats = getProfile();

          assert.isArray(logCache, 'log cache is not an array');
          assert.equal(logCache.length, 1, 'log cache is not length 1');

          assert.equal(stats.messages.create._total.calledCount, 1);

          done();
        })
        .catch(err => {
          console.log(err);
          assert.fail(false, true, 'unexpected catch');
          done();
        });
    });

    it('Handles multiple calls on a method', (done) => {
      Promise.all([
        messages.create({ text: 'message 1' }),
        messages.create({ text: 'message 2' })
      ])
        .then(() => {
          const stats = getProfile();

          assert.isArray(logCache, 'log cache is not an array');
          assert.equal(logCache.length, 2, 'log cache is not length 2');

          assert.equal(stats.messages.create._total.calledCount, 2);

          done();
        })
        .catch(err => {
          console.log(err);
          assert.fail(false, true, 'unexpected catch');
          done();
        });
    });

    it('Handles multiple calls on multiple methods', (done) => {
      Promise.all([
        messages.create({ text: 'message 1' }),
        messages.create({ text: 'message 2' }),
        users.create({ name: 'John Doe' })
      ])
        .then(() => {
          const stats = getProfile();

          assert.isArray(logCache, 'log cache is not an array');
          assert.equal(logCache.length, 3, 'log cache is not length 3');

          assert.equal(stats.users.create._total.calledCount, 1);
          assert.equal(stats.messages.create._total.calledCount, 2);

          done();
        })
        .catch(err => {
          console.log(err);
          assert.fail(false, true, 'unexpected catch');
          done();
        });
    });
  });

  describe('Logs and stats are OK', () => {
    let app;
    let users;
    let messages;
    let logCache;

    beforeEach(() => {
      logCache = [];
      clearProfile();

      app = feathers()
        .configure(hooks())
        .configure(services1)
        .configure(profiler({ logger: logger(logCache), logMsg, stats: 'detail' }));

      users = app.service('users');
      messages = app.service('messages');
    });

    it('Handles multiple calls on multiple methods', (done) => {
      Promise.all([
        messages.create({ text: 'message 1' }),
        messages.create({ text: 'message 2' }),
        users.create({ name: 'John Doe' }),
        messages.find({ query: { code: 'a' } }),
        messages.find({ query: { code: 'b' } })
      ])
        .then(() => {
          const stats = getProfile();

          let logResults = [
            { route: 'messages',
              method: 'create',
              provider: 'server',
              elapsed: 1.4,
              pending: 4,
              original: null,
              error: null },
            { route: 'messages',
              method: 'create',
              provider: 'server',
              elapsed: 1.7,
              pending: 3,
              original: null,
              error: null },
            { route: 'users',
              method: 'create',
              provider: 'server',
              elapsed: 2.2,
              pending: 2,
              original: null,
              error: null },
            { route: 'messages',
              method: 'find',
              provider: 'server',
              elapsed: 2.3,
              pending: 1,
              original: null,
              error: null },
            { route: 'messages',
              method: 'find',
              provider: 'server',
              elapsed: 2.4,
              pending: 0,
              original: null,
              error: null }
          ];

          let statsResults = {
            messages: {
              create: {
                'id:undefined, params:{}':
                { calledCount: 2,
                  pendingTotal: 1,
                  pendingAvg: 0.5,
                  resolvedCount: 2,
                  nanoTotal: 8744678,
                  avgMs: 4.372339,
                  nanoMin: 4213409,
                  nanoMax: 4531269,
                  resultItemsCount: 0 },
                _total:
                { calledCount: 2,
                  pendingTotal: 1,
                  pendingAvg: 0.5,
                  resolvedCount: 2,
                  nanoTotal: 8744678,
                  avgMs: 4.372339,
                  nanoMin: 4213409,
                  nanoMax: 4531269,
                  resultItemsCount: 0 }
              },
              find: {
                'id:undefined, params:{"query":{"code":"a"}}':
                { calledCount: 1,
                  pendingTotal: 3,
                  pendingAvg: 3,
                  resolvedCount: 1,
                  nanoTotal: 5058431,
                  avgMs: 5.058431,
                  nanoMin: 5058431,
                  nanoMax: 5058431,
                  resultItemsCount: 3 },
                'id:undefined, params:{"query":{"code":"b"}}':
                { calledCount: 1,
                  pendingTotal: 4,
                  pendingAvg: 4,
                  resolvedCount: 1,
                  nanoTotal: 5154055,
                  avgMs: 5.154055,
                  nanoMin: 5154055,
                  nanoMax: 5154055,
                  resultItemsCount: 3 },
                _total:
                { calledCount: 2,
                  pendingTotal: 7,
                  pendingAvg: 3.5,
                  resolvedCount: 2,
                  nanoTotal: 10212486,
                  avgMs: 5.106243,
                  nanoMin: 5058431,
                  nanoMax: 5154055,
                  resultItemsCount: 6 } } },
            users: {
              create: {
                'id:undefined, params:{}':
                { calledCount: 1,
                  pendingTotal: 2,
                  pendingAvg: 2,
                  resolvedCount: 1,
                  nanoTotal: 4999784,
                  avgMs: 4.999784,
                  nanoMin: 4999784,
                  nanoMax: 4999784,
                  resultItemsCount: 0 },
                _total:
                { calledCount: 1,
                  pendingTotal: 2,
                  pendingAvg: 2,
                  resolvedCount: 1,
                  nanoTotal: 4999784,
                  avgMs: 4.999784,
                  nanoMin: 4999784,
                  nanoMax: 4999784,
                  resultItemsCount: 0 }
              }
            }
          };

          assert.isArray(logCache, 'log cache is not an array');
          assert.deepEqual(sanitizeLogs(logCache), sanitizeLogs(logResults));
          assert.deepEqual(sanitizeStats(stats), sanitizeStats(statsResults));

          const total = statsResults.messages.find._total;
          assert.equal(
            total.avgMs,
            !total.resolvedCount ? 0 : total.nanoTotal / total.resolvedCount / 1e6
          );

          done();
        })
        .catch(err => {
          console.log(err);
          assert.fail(false, true, 'unexpected catch');
          done();
        });
    });
  });

  describe('Stats collection can be turned off', () => {
    let app;
    let users;
    let messages;
    let logCache;

    beforeEach(() => {
      logCache = [];
      clearProfile();

      app = feathers()
        .configure(hooks())
        .configure(services1)
        .configure(profiler({ logger: logger(logCache), logMsg, stats: null }));

      users = app.service('users');
      messages = app.service('messages');
    });

    it('Handles multiple calls on multiple methods', (done) => {
      Promise.all([
        messages.create({ text: 'message 1' }),
        messages.create({ text: 'message 2' }),
        users.create({ name: 'John Doe' }),
        messages.find({ query: { code: 'a' } }),
        messages.find({ query: { code: 'b' } })
      ])
        .then(() => {
          const stats = getProfile();

          let logResults = [
            { route: 'messages',
              method: 'create',
              provider: 'server',
              elapsed: 1.4,
              pending: 4,
              original: null,
              error: null },
            { route: 'messages',
              method: 'create',
              provider: 'server',
              elapsed: 1.7,
              pending: 3,
              original: null,
              error: null },
            { route: 'users',
              method: 'create',
              provider: 'server',
              elapsed: 2.2,
              pending: 2,
              original: null,
              error: null },
            { route: 'messages',
              method: 'find',
              provider: 'server',
              elapsed: 2.3,
              pending: 1,
              original: null,
              error: null },
            { route: 'messages',
              method: 'find',
              provider: 'server',
              elapsed: 2.4,
              pending: 0,
              original: null,
              error: null }
          ];

          assert.isArray(logCache, 'log cache is not an array');
          assert.deepEqual(sanitizeLogs(logCache), sanitizeLogs(logResults));
          assert.deepEqual(sanitizeStats(stats), {});

          done();
        })
        .catch(err => {
          console.log(err);
          assert.fail(false, true, 'unexpected catch');
          done();
        });
    });
  });

  describe('Stats categories can be customized', () => {
    let app;
    let users;
    let messages;
    let logCache;

    const statsDetail = hook => `q`;

    beforeEach(() => {
      logCache = [];
      clearProfile();

      app = feathers()
        .configure(hooks())
        .configure(services1)
        .configure(profiler({ logger: logger(logCache), logMsg, stats: 'detail', statsDetail }));

      users = app.service('users');
      messages = app.service('messages');
    });

    it('Handles multiple calls on multiple methods', (done) => {
      Promise.all([
        messages.create({ text: 'message 1' }),
        messages.create({ text: 'message 2' }),
        users.create({ name: 'John Doe' }),
        messages.find({ query: { code: 'a' } }),
        messages.find({ query: { code: 'b' } })
      ])
        .then(() => {
          const stats = getProfile();

          let logResults = [
            { route: 'messages',
              method: 'create',
              provider: 'server',
              elapsed: 1.4,
              pending: 4,
              original: null,
              error: null },
            { route: 'messages',
              method: 'create',
              provider: 'server',
              elapsed: 1.7,
              pending: 3,
              original: null,
              error: null },
            { route: 'users',
              method: 'create',
              provider: 'server',
              elapsed: 2.2,
              pending: 2,
              original: null,
              error: null },
            { route: 'messages',
              method: 'find',
              provider: 'server',
              elapsed: 2.3,
              pending: 1,
              original: null,
              error: null },
            { route: 'messages',
              method: 'find',
              provider: 'server',
              elapsed: 2.4,
              pending: 0,
              original: null,
              error: null }
          ];

          let statsResults = {
            messages: {
              create: {
                q:
                { calledCount: 2,
                  pendingTotal: 1,
                  pendingAvg: 0.5,
                  resolvedCount: 2,
                  nanoTotal: 7385770,
                  avgMs: 3.692885,
                  nanoMin: 3679845,
                  nanoMax: 3705925,
                  resultItemsCount: 0 },
                _total:
                { calledCount: 2,
                  pendingTotal: 1,
                  pendingAvg: 0.5,
                  resolvedCount: 2,
                  nanoTotal: 7385770,
                  avgMs: 3.692885,
                  nanoMin: 3679845,
                  nanoMax: 3705925,
                  resultItemsCount: 0 } },
              find: {
                q:
                { calledCount: 2,
                  pendingTotal: 7,
                  pendingAvg: 3.5,
                  resolvedCount: 2,
                  nanoTotal: 7358761,
                  avgMs: 3.6793805,
                  nanoMin: 3679317,
                  nanoMax: 3679444,
                  resultItemsCount: 6 },
                _total:
                { calledCount: 2,
                  pendingTotal: 7,
                  pendingAvg: 3.5,
                  resolvedCount: 2,
                  nanoTotal: 7358761,
                  avgMs: 3.6793805,
                  nanoMin: 3679317,
                  nanoMax: 3679444,
                  resultItemsCount: 6
                }
              }
            },
            users: {
              create: {
                q:
                { calledCount: 1,
                  pendingTotal: 2,
                  pendingAvg: 2,
                  resolvedCount: 1,
                  nanoTotal: 3689297,
                  avgMs: 3.689297,
                  nanoMin: 3689297,
                  nanoMax: 3689297,
                  resultItemsCount: 0 },
                _total:
                { calledCount: 1,
                  pendingTotal: 2,
                  pendingAvg: 2,
                  resolvedCount: 1,
                  nanoTotal: 3689297,
                  avgMs: 3.689297,
                  nanoMin: 3689297,
                  nanoMax: 3689297,
                  resultItemsCount: 0
                }
              }
            }
          };

          assert.isArray(logCache, 'log cache is not an array');
          assert.deepEqual(sanitizeLogs(logCache), sanitizeLogs(logResults));
          assert.deepEqual(sanitizeStats(stats), sanitizeStats(statsResults));

          const total = statsResults.messages.find._total;
          assert.equal(
            total.avgMs,
            !total.resolvedCount ? 0 : total.nanoTotal / total.resolvedCount / 1e6
          );

          done();
        })
        .catch(err => {
          console.log(err);
          assert.fail(false, true, 'unexpected catch');
          done();
        });
    });
  });

  describe('Does not fail with no options', () => {
    let app;
    let messages;

    beforeEach(() => {
      clearProfile();

      app = feathers()
        .configure(hooks())
        .configure(services1)
        .configure(profiler());

      messages = app.service('messages');
    });

    it('Handles multiple calls on multiple methods', (done) => {
      Promise.all([
        messages.create({ text: 'message 1' })
      ])
        .then(() => {
          done();
        })
        .catch(err => {
          console.log(err);
          assert.fail(false, true, 'unexpected catch');
          done();
        });
    });
  });
});

function sanitizeLogs (logs1) {
  const logs = logs1.slice(0);

  logs.forEach(log => {
    delete log.elapsed;
  });

  return logs;
}

function sanitizeStats (stats1) {
  const stats = JSON.parse(JSON.stringify(stats1));

  Object.keys(stats).forEach(service => {
    Object.keys(stats[service]).forEach(method => {
      Object.keys(stats[service][method]).forEach(key => {
        const data = stats[service][method][key];

        delete data.nanoTotal;
        delete data.avgMs;
        delete data.nanoMin;
        delete data.nanoMax;
      });
    });
  });

  return stats;
}
