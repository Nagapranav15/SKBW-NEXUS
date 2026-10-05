/**
 * In-memory FIFO Execution Queue for strict sequential processing.
 * Guarantees that concurrent requests for the same company and entity
 * are processed strictly in the order they are received by the server.
 */

const queues = new Map();

/**
 * Enqueues an async task to be executed sequentially based on arrival order.
 * @param {string} key - e.g. `PO_companyId` or `companyId`
 * @param {Function} taskFn - The async function to execute
 * @returns {Promise<any>}
 */
function enqueue(key, taskFn) {
  const currentQueue = queues.get(key) || Promise.resolve();

  let resolveTask, rejectTask;
  const taskPromise = new Promise((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });

  const nextQueue = currentQueue
    .then(async () => {
      try {
        const result = await taskFn();
        resolveTask(result);
      } catch (err) {
        rejectTask(err);
      }
    })
    .catch((err) => {
      // In case previous task threw, don't break the chain for this task
      try {
        return taskFn().then(resolveTask, rejectTask);
      } catch (innerErr) {
        rejectTask(innerErr);
      }
    });

  queues.set(key, nextQueue);

  // Clean up idle queue entry once settled to prevent memory leak
  nextQueue.finally(() => {
    if (queues.get(key) === nextQueue) {
      queues.delete(key);
    }
  });

  return taskPromise;
}

const transactionQueue = { enqueue };

module.exports = {
  enqueue,
  transactionQueue
};
