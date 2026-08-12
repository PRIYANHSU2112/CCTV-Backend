import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import {
  createClientSchema,
  updateClientSchema,
  addCameraSchema,
  updateClientStatusSchema,
  queryClientsSchema
} from './client.validator.js';

export const createClientRouter = (clientController) => {
  const router = Router();

  /**
   * @route POST /api/v1/clients
   * @desc Onboard a new Client (Creates Client User + Profile)
   */
  router.post('/', validateRequest(createClientSchema), clientController.createClient);

  /**
   * @route GET /api/v1/clients
   * @desc Get paginated list of clients with search, city, & status filtering
   */
  router.get('/', validateRequest(queryClientsSchema, 'query'), clientController.listClients);

  /**
   * @route GET /api/v1/clients/stats
   * @desc Aggregate client KPI statistics
   */
  router.get('/stats', clientController.getClientStats);

  /**
   * @route GET /api/v1/clients/:id/dashboard
   * @desc Client detail dashboard (KPIs, subscriptions, activity)
   */
  router.get('/:id/dashboard', clientController.getClientDashboard);

  /**
   * @route GET /api/v1/clients/:id
   * @desc Get single client by ID
   */
  router.get('/:id', clientController.getClientById);

  /**
   * @route PUT /api/v1/clients/:id
   * @desc Update client profile details & installation address
   */
  router.put('/:id', validateRequest(updateClientSchema), clientController.updateClient);

  /**
   * @route PATCH /api/v1/clients/:id/status
   * @desc Update client service status (Active, Due, Overdue, Suspended)
   */
  router.patch('/:id/status', validateRequest(updateClientStatusSchema), clientController.updateClientStatus);

  /**
   * @route POST /api/v1/clients/:id/cameras
   * @desc Add camera installation detail record to client
   */
  router.post('/:id/cameras', validateRequest(addCameraSchema), clientController.addCamera);

  /**
   * @route DELETE /api/v1/clients/:id
   * @desc Delete client profile
   */
  router.delete('/:id', clientController.deleteClient);

  return router;
};
