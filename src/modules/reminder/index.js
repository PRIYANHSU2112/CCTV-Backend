import { createContainer, asClass, asValue } from 'awilix';
import { ReminderRepository } from './reminder.repository.js';
import { ReminderService } from './reminder.service.js';
import { ReminderQueueService } from './reminder-queue.service.js';
import { ReminderWorker } from './reminder.worker.js';
import { ReminderController } from './reminder.controller.js';
import { createReminderRouter } from './reminder.routes.js';
import { reminderSwaggerDocs } from './reminder.swagger.js';

export const initReminderModule = ({ redisClient, clientRepository, isWorker = true }) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    redisClient: asValue(redisClient),
    clientRepository: asValue(clientRepository)
  });

  moduleContainer.register({
    reminderRepository: asClass(ReminderRepository).singleton(),
    reminderQueueService: asClass(ReminderQueueService).singleton(),
    reminderService: asClass(ReminderService).scoped(),
    reminderController: asClass(ReminderController).scoped()
  });

  if (isWorker && redisClient) {
    try {
      moduleContainer.register({
        reminderWorker: asClass(ReminderWorker).singleton()
      });
      moduleContainer.resolve('reminderWorker');
    } catch (err) {
      // Safe fallback if redis connection isn't ready
    }
  }

  const reminderController = moduleContainer.resolve('reminderController');
  const router = createReminderRouter(reminderController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: reminderSwaggerDocs
  };
};

export { ReminderService, ReminderRepository, ReminderController, ReminderQueueService, ReminderWorker };
