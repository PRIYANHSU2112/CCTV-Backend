import { Router } from 'express';

export const createHealthRouter = (healthController) => {
  const router = Router();

  /**
   * @route GET /health
   */
  router.get('/health', healthController.getLiveness);

  /**
   * @route GET /ready
   */
  router.get('/ready', healthController.getReadiness);

  return router;
};
