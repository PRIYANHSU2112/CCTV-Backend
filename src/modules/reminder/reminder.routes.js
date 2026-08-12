import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import {
  createReminderSchema,
  updateReminderSchema,
  queryRemindersSchema
} from './reminder.validator.js';

export const createReminderRouter = (reminderController) => {
  const router = Router();

  router.get('/config', reminderController.getReminderConfig);
  router.put('/config', reminderController.updateReminderConfig);
  router.post('/', validateRequest(createReminderSchema), reminderController.createReminder);
  router.get('/', validateRequest(queryRemindersSchema, 'query'), reminderController.listReminders);
  router.get('/logs', validateRequest(queryRemindersSchema, 'query'), reminderController.listLogs);
  router.put('/:id', validateRequest(updateReminderSchema), reminderController.updateReminder);
  router.patch('/:id/pause', reminderController.pauseReminder);
  router.patch('/:id/resume', reminderController.resumeReminder);
  router.delete('/:id', reminderController.deleteReminder);

  return router;
};
