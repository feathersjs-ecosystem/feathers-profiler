
const debug = require('debug')('feathers-profiler');

let app;
let options;
let pending = 0;
let cache = {};

const cacheEntry = {
  // sum all calls
  calledCount: 0,       // #times service called
  pendingTotal: 0,      // total #pending service calls at start of these calls
  pendingAvg: 0,        // average #pending service calls at start of a call
  // sum successful calls
  resolvedCount: 0,     // #times service call completed successfully
  nanoTotal: 0,         // total nano-secs (sec/1e9) spent on successful calls
  avgMs: 0,             // average milli-sec per successful call
  nanoMin: Infinity,    // shortest successful call
  nanoMax: -1,          // longest successful call
  resultItemsCount: 0   // #items read in find and get calls
};

export function profiler (options1 = {}) {
  options = Object.assign({}, {
    logger: { log: msg => console.log(msg) },
    logMsg: defaultLogMsg,
    stats: 'total',
    statsDetail: hook => `id:${typeof hook.id}, params:${JSON.stringify(hook.params)}`
  },
    options1);

  options.stats = options.stats || 'none';

  if (!['detail', 'total', 'none'].includes(options.stats)) {
    throw new Error('stats option invalid. (profiler)');
  }
  if (options.logger && typeof options.logger.log !== 'function') {
    throw new Error('Logger.log is not a function. (feathers-profiler)');
  }
  if (typeof options.logMsg !== 'function') {
    throw new Error('logMsg is not a function. (feathers-profiler)');
  }
  if (typeof options.statsDetail !== 'function') {
    throw new Error('statsDetail is not a function. (feathers-profiler)');
  }

  return function () {
    debug('Initializing logger-stats plugin');
    app = this;

    if (typeof app.hooks !== 'function') {
      throw new Error('feathers-hooks >= 1.6.0 is needed. (logger-stats)');
    }

    instrumentServices();
  };
}

export function defaultLogMsg (hook) {
  hook._log = hook._log || {};
  const elapsed = Math.round(hook._log.elapsed / 1e5) / 10;
  const header = `${timestamp()} ${hook._log.route}::${hook.method}`;
  const trailer = `(${hook.params.provider || 'server'}) ${elapsed} ms - ${pending} pending`;

  return `${header} ${trailer}` +
    (hook.error ? ` - FAILED ${(hook.original || {}).type} ${hook.error.message || ''}` : '');
}

function instrumentServices () {
  debug('Creating app.hooks');
  app.hooks({
    before: { all: timeStart },
    after: { all: timeEnd },
    error: {
      all: (hook) => {
        hook._log = hook._log || { route: '', key: '', hrtime: [0, 0], elapsed: 0 };

        if (hook._log.hrtime !== 0) {
          const diff = process.hrtime(hook._log.hrtime || [0, 0]);
          hook._log.elapsed = diff[0] * 1e9 + diff[1];
        }

        pending += -1;

        if (options.logger) {
          options.logger.log(options.logMsg(hook));
        }
      }
    }
  });
}

export function timeStart (hook) {
  const route = hook.path; // feathers-hooks v1.7.0 required
  let key = '';

  debug(`timeStart ${route} ${hook.method} ${hook.params.provider}`);

  if (options.stats !== 'none') {
    cache[route] = cache[route] || {};
    cache[route][hook.method] = cache[route][hook.method] || {};

    key = getKey(options);

    const routeMethod = cache[route][hook.method];
    routeMethod[key] = routeMethod[key] || Object.assign({}, cacheEntry);
    routeMethod[key].calledCount += 1;
    routeMethod[key].pendingTotal += pending;
  }

  pending += 1;

  hook._log = {
    route,
    key,
    hrtime: [0, 0],
    elapsed: 0
  };
  hook._log.hrtime = process.hrtime(); // V8 bug: breaks if inside the above object literal

  return hook;

  function getKey (options) { // to reduce complexity for code climate
    return options.stats === 'detail' ? (options.statsDetail(hook) || '_misc') : '_total';
  }
}

export function timeEnd (hook) {
  const diff = process.hrtime(hook._log.hrtime);
  pending += -1;
  debug(`timeEnd ${hook._log.route} ${hook.method} ${hook.params.provider}`);

  hook._log.elapsed = diff[0] * 1e9 + diff[1];

  if (options.stats !== 'none') {
    const entry = cache[hook._log.route][hook.method][hook._log.key];
    const nano = hook._log.elapsed;

    entry.resolvedCount += 1;
    entry.nanoTotal += nano;
    entry.nanoMin = Math.min(entry.nanoMin, nano);
    entry.nanoMax = Math.max(entry.nanoMax, nano);

    if (hook.method === 'find' || hook.method === 'get') {
      const items = getItems(hook);
      entry.resultItemsCount += Array.isArray(items) ? items.length : 1;
    }
  }

  if (options.logger) {
    options.logger.log(options.logMsg(hook));
  }

  function getItems (hook) { // to reduce complexity for code climate
    const result = hook.result;
    return result ? result.data || result : result;
  }
}

export function getProfile () {
  debug('Get timings');

  if (options.stats !== 'none') {
    Object.keys(cache).forEach(route => {
      Object.keys(cache[route]).forEach(method => {
        if (options.stats === 'detail') {
          const total = Object.assign({}, cacheEntry);
          const rM = cache[route][method];

          Object.keys(rM).forEach(key => {
            const rMK = rM[key];
            rMK.avgMs = !rMK.resolvedCount ? 0 : rMK.nanoTotal / rMK.resolvedCount / 1e6;
            rMK.pendingAvg = !rMK.resolvedCount ? 0 : rMK.pendingTotal / rMK.resolvedCount;

            total.calledCount += rMK.calledCount;
            total.resolvedCount += rMK.resolvedCount;
            total.nanoTotal += rMK.nanoTotal;
            total.nanoMin = Math.min(total.nanoMin, rMK.nanoMin);
            total.nanoMax = Math.max(total.nanoMax, rMK.nanoMax);
            total.resultItemsCount += rMK.resultItemsCount;
            total.pendingTotal += rMK.pendingTotal;
          });

          total.avgMs = !total.resolvedCount ? 0 : total.nanoTotal / total.resolvedCount / 1e6;
          total.pendingAvg = !total.calledCount ? 0 : total.pendingTotal / total.calledCount;

          cache[route][method]._total = total;
        } else {
          const total2 = cache[route][method]._total;

          total2.avgMs = !total2.resolvedCount ? 0 : total2.nanoTotal / total2.resolvedCount / 1e6;
          total2.pendingAvg = !total2.calledCount ? 0 : total2.pendingTotal / total2.calledCount;

          cache[route][method]._total = total2;
        }
      });
    });
  }

  return cache;
}

export function getPending () {
  debug('getPending', pending);
  return pending;
}

export function clearProfile () {
  debug('Clearing cache');
  cache = {};
}

export function timestamp () {
  const date = new Date();
  const last2 = (numb) => `0${numb}`.slice(-2);
  return `${last2(date.getHours())}:${last2(date.getMinutes())}:${last2(date.getSeconds())}`;
}
