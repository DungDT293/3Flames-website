import { Queue, Worker, QueueEvents } from 'bullmq';
import { config } from '../../config';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls ? {} : undefined,
};

export function createQueue(name: string): Queue {
  return new Queue(name, { connection });
}

export function createWorker<T>(
  name: string,
  processor: (job: { data: T; id?: string }) => Promise<void>,
  concurrency = 1,
): Worker {
  return new Worker(name, processor, {
    connection,
    concurrency,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  });
}

export function createQueueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection });
}
