import { createContainer, asClass } from 'awilix';
import { NotificationRepository } from './notification.repository.js';
import { NotificationService } from './notification.service.js';
import { NotificationController } from './notification.controller.js';
import { createNotificationRouter } from './notification.routes.js';
import { notificationSwaggerDocs } from './notification.swagger.js';

export const initNotificationModule = () => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    notificationRepository: asClass(NotificationRepository).singleton(),
    notificationService: asClass(NotificationService).scoped(),
    notificationController: asClass(NotificationController).scoped()
  });

  const notificationController = moduleContainer.resolve('notificationController');
  const router = createNotificationRouter(notificationController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: notificationSwaggerDocs
  };
};

export { NotificationService, NotificationController, NotificationRepository };
