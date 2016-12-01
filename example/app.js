
const feathers = require('feathers');
const hooks = require('feathers-hooks');
const util = require('util');

const { profiler, getProfile, getPending } = require('../lib');

const app = feathers()
  .configure(hooks())
  .configure(services)
  .configure(profiler({ stats: 'detail' }));

function services () {
  this.use('/messages', {
    before: {
      all: () => {},
      create: [
        (hook, cb) => {
          if (hook.data.delay) {
            setTimeout(() => {
              cb(null, hook);
            }, 500);
            return;
          }

          cb(null, hook);
        },
        hook => {
          if (hook.data.throwBefore) {
            throw new Error('..Before throw requested');
          }
        }
      ]
    },
    after: {
      create: [
        hook => {
          if (hook.data.throwAfter) {
            throw new Error('..After throw requested');
          }
        }
      ]
    },
    find (params) {
      if (params.type !== 'paginated') {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([{ a: 1 }, { a: 2 }]);
          }, 200);
        });
      }

      return Promise.resolve({
        total: 3,
        data: [{ a: 1 }, { a: 2 }, { a: 3 }]
      });
    },
    create () {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve();
        }, 100);
      });
    }
  });
}

const service = app.service('messages');

Promise.all([
  service.create({ value: 1 }, { query: {} }),
  service.create({ throwBefore: true }, { query: { throwBefore: true } }) // throw before
    .catch(() => {}),
  service.create({ value: 2, delay: true }, { query: {} }), // delay
  service.create({ value: 3 }, { query: {} }),
  service.create({ throwAfter: true }, { query: { throwAfter: true } }) // throw after
    .catch(() => {}),
  service.create({ value: 4 }, { query: {} }),
  
  service.find({ query: { name: 'John Doe' }, type: 'paginated' }),
  service.find({ query: { name: 'Jane Doe' } })
])
  .then(() => {
    console.log('\n\npending', getPending());
    console.log(util.inspect(getProfile(), { depth: 5, colors: true }));
  });
