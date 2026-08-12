import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class ReminderController extends BaseController {
  constructor({ reminderService }) {
    super();
    this.reminderService = reminderService;
  }

  createReminder = this.catchAsync(async (req, res) => {
    const result = await this.reminderService.createReminder({
      ...req.body,
      createdBy: req.user?.id
    });
    return this.sendCreated(res, result, 'Reminder rule created & scheduled');
  });

  listReminders = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.reminderService.listReminders(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  updateReminder = this.catchAsync(async (req, res) => {
    const result = await this.reminderService.updateReminder(req.params.id, req.body);
    return this.sendResponse(res, result, 'Reminder rule updated & rescheduled');
  });

  pauseReminder = this.catchAsync(async (req, res) => {
    const result = await this.reminderService.pauseReminder(req.params.id);
    return this.sendResponse(res, result, 'Reminder paused');
  });

  resumeReminder = this.catchAsync(async (req, res) => {
    const result = await this.reminderService.resumeReminder(req.params.id);
    return this.sendResponse(res, result, 'Reminder resumed');
  });

  deleteReminder = this.catchAsync(async (req, res) => {
    const result = await this.reminderService.deleteReminder(req.params.id);
    return this.sendResponse(res, result, Messages.DELETED);
  });

  listLogs = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.reminderService.listLogs(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  getReminderConfig = this.catchAsync(async (req, res) => {
    const config = await this.reminderService.getReminderConfig();
    return this.sendResponse(res, config, Messages.FETCHED);
  });

  updateReminderConfig = this.catchAsync(async (req, res) => {
    const config = await this.reminderService.updateReminderConfig(req.body);
    return this.sendResponse(res, config, 'Reminder schedule config updated');
  });
}
