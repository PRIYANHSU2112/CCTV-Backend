import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class ClientController extends BaseController {
  constructor({ clientService }) {
    super();
    this.clientService = clientService;

    this.createClient = this.createClient.bind(this);
    this.getClientById = this.getClientById.bind(this);
    this.updateClient = this.updateClient.bind(this);
    this.updateClientStatus = this.updateClientStatus.bind(this);
    this.addCamera = this.addCamera.bind(this);
    this.deleteClient = this.deleteClient.bind(this);
    this.listClients = this.listClients.bind(this);
    this.getClientStats = this.getClientStats.bind(this);
    this.getClientDashboard = this.getClientDashboard.bind(this);
  }

  createClient = this.catchAsync(async (req, res) => {
    const client = await this.clientService.registerClient(req.body);
    return this.sendCreated(res, client, 'Client onboarded successfully');
  });

  getClientById = this.catchAsync(async (req, res) => {
    const client = await this.clientService.getClientById(req.params.id);
    return this.sendResponse(res, client, Messages.FETCHED);
  });

  getClientDashboard = this.catchAsync(async (req, res) => {
    const dashboard = await this.clientService.getClientDashboard(req.params.id);
    return this.sendResponse(res, dashboard, Messages.FETCHED);
  });

  updateClient = this.catchAsync(async (req, res) => {
    const client = await this.clientService.updateClient(req.params.id, req.body);
    return this.sendResponse(res, client, Messages.UPDATED);
  });

  updateClientStatus = this.catchAsync(async (req, res) => {
    const client = await this.clientService.updateClientStatus(req.params.id, req.body.status);
    return this.sendResponse(res, client, 'Client status updated successfully');
  });

  addCamera = this.catchAsync(async (req, res) => {
    const client = await this.clientService.addCameraToClient(req.params.id, req.body);
    return this.sendCreated(res, client, 'Camera detail added successfully');
  });

  deleteClient = this.catchAsync(async (req, res) => {
    const result = await this.clientService.deleteClient(req.params.id);
    return this.sendResponse(res, result, Messages.DELETED);
  });

  listClients = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.clientService.listClients(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  getClientStats = this.catchAsync(async (req, res) => {
    const stats = await this.clientService.getClientStats();
    return this.sendResponse(res, stats, Messages.FETCHED);
  });
}
