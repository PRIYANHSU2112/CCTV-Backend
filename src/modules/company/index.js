import { createContainer, asClass, asValue } from 'awilix';
import { CompanyRepository } from './company.repository.js';
import { CompanyService } from './company.service.js';
import { CompanyController } from './company.controller.js';
import { createCompanyRouter } from './company.routes.js';
import { companySwaggerDocs } from './company.swagger.js';

export const initCompanyModule = ({ redisService }) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    redisService: asValue(redisService)
  });

  moduleContainer.register({
    companyRepository: asClass(CompanyRepository).singleton(),
    companyService: asClass(CompanyService).scoped(),
    companyController: asClass(CompanyController).scoped()
  });

  const companyController = moduleContainer.resolve('companyController');
  const router = createCompanyRouter(companyController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: companySwaggerDocs
  };
};

export { CompanyService, CompanyController, CompanyRepository };
