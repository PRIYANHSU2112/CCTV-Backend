import { createContainer, asClass, asValue } from 'awilix';
import { SubscriptionRepository } from './subscription.repository.js';
import { SubscriptionService } from './subscription.service.js';
import { SubscriptionController } from './subscription.controller.js';
import { createSubscriptionRouter } from './subscription.routes.js';
import { subscriptionSwaggerDocs } from './subscription.swagger.js';

export const initSubscriptionModule = ({ redisService }) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    redisService: asValue(redisService)
  });

  moduleContainer.register({
    subscriptionRepository: asClass(SubscriptionRepository).singleton(),
    subscriptionService: asClass(SubscriptionService).scoped(),
    subscriptionController: asClass(SubscriptionController).scoped()
  });

  const subscriptionController = moduleContainer.resolve('subscriptionController');
  const router = createSubscriptionRouter(subscriptionController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: subscriptionSwaggerDocs
  };
};

export { SubscriptionService, SubscriptionController, SubscriptionRepository };
