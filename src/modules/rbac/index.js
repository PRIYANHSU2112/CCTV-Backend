import { createContainer, asClass } from 'awilix';
import { RbacService } from './rbac.service.js';
import { RbacController } from './rbac.controller.js';
import { createRbacRouter } from './rbac.routes.js';

export const initRbacModule = () => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    rbacService: asClass(RbacService).scoped(),
    rbacController: asClass(RbacController).scoped()
  });

  const rbacController = moduleContainer.resolve('rbacController');
  const router = createRbacRouter(rbacController);

  return {
    router,
    container: moduleContainer
  };
};

export { RbacService, RbacController };
