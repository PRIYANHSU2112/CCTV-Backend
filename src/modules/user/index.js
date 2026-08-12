import { createContainer, asClass, asValue } from 'awilix';
import { UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { createUserRouter } from './user.routes.js';
import { userSwaggerDocs } from './user.swagger.js';

export const initUserModule = ({ redisService, hashService }) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    redisService: asValue(redisService),
    hashService: asValue(hashService)
  });

  moduleContainer.register({
    userRepository: asClass(UserRepository).singleton(),
    userService: asClass(UserService).scoped(),
    userController: asClass(UserController).scoped()
  });

  const userController = moduleContainer.resolve('userController');
  const router = createUserRouter(userController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: userSwaggerDocs
  };
};

export { UserService, UserController, UserRepository };
