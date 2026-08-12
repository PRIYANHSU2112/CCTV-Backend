import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { swaggerRegistry } from './swagger.config.js';
import { logger } from '../shared/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Automatically discovers and registers module swagger files (*.swagger.js) across all modules
 */
export const loadModuleSwaggerDocs = async () => {
  const modulesDir = path.join(__dirname, '../modules');

  if (!fs.existsSync(modulesDir)) return;

  const moduleFolders = fs.readdirSync(modulesDir);

  for (const folder of moduleFolders) {
    const folderPath = path.join(modulesDir, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath);
    const swaggerFile = files.find((f) => f.endsWith('.swagger.js'));

    if (swaggerFile) {
      try {
        const filePath = path.join(folderPath, swaggerFile);
        const fileUrl = pathToFileURL(filePath).href;
        const moduleExports = await import(fileUrl);

        // Extract exported swagger spec object
        const swaggerSpec = Object.values(moduleExports).find((val) => typeof val === 'object' && val !== null);
        if (swaggerSpec) {
          swaggerRegistry.registerModuleDocs(folder, swaggerSpec);
          logger.info(`Auto-loaded Swagger documentation for module: [${folder}]`);
        }
      } catch (err) {
        logger.error(`Failed to auto-load Swagger docs for module [${folder}]: ${err.message}`);
      }
    }
  }
};
