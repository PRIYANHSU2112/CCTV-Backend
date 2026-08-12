import { createContainer, asClass, asValue } from 'awilix';
import { HealthService } from './health.service.js';
import { HealthController } from './health.controller.js';
import { createHealthRouter } from './health.routes.js';
import { healthSwaggerDocs } from './health.swagger.js';

export const initHealthModule = ({ redisService }) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    redisService: asValue(redisService),
    healthService: asClass(HealthService).scoped(),
    healthController: asClass(HealthController).scoped()
  });

  const healthController = moduleContainer.resolve('healthController');
  const router = createHealthRouter(healthController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: healthSwaggerDocs
  };
};

export { HealthService, HealthController };
