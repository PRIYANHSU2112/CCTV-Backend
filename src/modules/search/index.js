import { createContainer, asClass, asValue } from 'awilix';
import { SearchRepository } from './search.repository.js';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';
import { createSearchRouter } from './search.routes.js';
import { searchSwaggerDocs } from './search.swagger.js';
import { swaggerRegistry } from '../../config/swagger.config.js';

export const initSearchModule = ({ redisService = null } = {}) => {
  const container = createContainer();

  container.register({
    searchRepository: asClass(SearchRepository).singleton(),
    redisService: asValue(redisService),
    searchService: asClass(SearchService).singleton(),
    searchController: asClass(SearchController).singleton(),
  });

  const searchController = container.resolve('searchController');
  const router = createSearchRouter(searchController);

  return {
    router,
    container,
  };
};

export { SearchRepository, SearchService, SearchController };
