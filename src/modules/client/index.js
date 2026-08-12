import { asClass } from 'awilix';
import { ClientRepository } from './client.repository.js';
import { ClientService } from './client.service.js';
import { ClientController } from './client.controller.js';
import { createClientRouter } from './client.routes.js';

export const initClientModule = (container) => {
  container.register({
    clientRepository: asClass(ClientRepository).singleton(),
    clientService: asClass(ClientService).scoped(),
    clientController: asClass(ClientController).scoped()
  });

  const clientController = container.resolve('clientController');
  return createClientRouter(clientController);
};
