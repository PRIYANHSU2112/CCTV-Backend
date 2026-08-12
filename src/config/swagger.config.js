import swaggerJsDoc from 'swagger-jsdoc';
import { env } from './env.config.js';

export const getBaseSwaggerSpec = () => {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Modular Monolith API Documentation',
      version: '1.0.0',
      description: 'Industry Standard Modular Monolithic Node.js REST API with Module-Scoped DI, Redis, and Security Controls',
      contact: {
        name: 'API Support',
        email: 'support@cctvbackend.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}${env.API_PREFIX}`,
        description: 'Development Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {}
    },
    paths: {}
  };
};

/**
 * Swagger Registry for managing per-module OpenAPI definitions
 */
export class SwaggerRegistry {
  constructor() {
    this.paths = {};
    this.schemas = {};
    this.moduleSpecs = new Map();
  }

  /**
   * Register a domain module's Swagger documentation spec
   */
  registerModuleDocs(moduleName, docs) {
    if (!docs) return;

    if (docs.paths) {
      this.paths = { ...this.paths, ...docs.paths };
    }
    if (docs.components?.schemas) {
      this.schemas = { ...this.schemas, ...docs.components.schemas };
    }

    this.moduleSpecs.set(moduleName.toLowerCase(), docs);
  }

  /**
   * Generates the aggregated OpenAPI specification containing all modules
   */
  getCombinedSwaggerSpec() {
    const baseSpec = getBaseSwaggerSpec();
    return {
      ...baseSpec,
      paths: { ...this.paths },
      components: {
        ...baseSpec.components,
        schemas: { ...this.schemas }
      }
    };
  }

  /**
   * Generates OpenAPI spec specifically for a single domain module
   */
  getModuleSwaggerSpec(moduleName) {
    const baseSpec = getBaseSwaggerSpec();
    const moduleDocs = this.moduleSpecs.get(moduleName.toLowerCase()) || { paths: {}, components: { schemas: {} } };

    return {
      ...baseSpec,
      info: {
        ...baseSpec.info,
        title: `${moduleName.toUpperCase()} Module API Documentation`,
        description: `Dedicated API documentation for ${moduleName} domain module.`
      },
      paths: moduleDocs.paths || {},
      components: {
        ...baseSpec.components,
        schemas: moduleDocs.components?.schemas || {}
      }
    };
  }
}

export const swaggerRegistry = new SwaggerRegistry();

