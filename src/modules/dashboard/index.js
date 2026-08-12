import { createContainer, asClass, asValue } from 'awilix';
import { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardController } from './dashboard.controller.js';
import { createDashboardRouter } from './dashboard.routes.js';
import { dashboardSwaggerDocs } from './dashboard.swagger.js';

export const initDashboardModule = ({ redisService = null }) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    redisService: asValue(redisService),
    dashboardRepository: asClass(DashboardRepository).singleton(),
    dashboardService: asClass(DashboardService).scoped(),
    dashboardController: asClass(DashboardController).scoped(),
  });

  const dashboardController = moduleContainer.resolve('dashboardController');
  const router = createDashboardRouter(dashboardController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: dashboardSwaggerDocs,
  };
};

export {
  DashboardService,
  DashboardController,
  DashboardRepository,
};
