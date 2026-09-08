import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import {
  createReminderSchema,
  updateReminderSchema,
  queryRemindersSchema,
  quickSendReminderSchema,
} from './reminder.validator.js';

export const createReminderRouter = (reminderController) => {
  const router = Router();

  // Lifecycle Schedule Config & Automated Settings
  router.get('/config', reminderController.getReminderConfig);
  router.put('/config', reminderController.updateReminderConfig);

  // Analytics & KPIs
  router.get('/stats', reminderController.getReminderStats);

  // Manual Trigger for Lifecycle Rules (Testing or Admin Action)
  router.post('/lifecycle/trigger', reminderController.triggerDailyLifecycle);

  // Quick Send & Group Broadcast (Phase 1: Instant Dispatch)
  router.post('/quick-send', validateRequest(quickSendReminderSchema), reminderController.sendQuickReminder);

  // Inbound Provider Webhook (MSG91 / WhatsApp DLR Reports)
  router.post('/webhooks/provider', reminderController.handleProviderWebhook);

  // Scheduled / Ad-hoc Rule Management
  router.post('/', validateRequest(createReminderSchema), reminderController.createReminder);
  router.get('/', validateRequest(queryRemindersSchema, 'query'), reminderController.listReminders);

  // Audit Logs & Retries
  router.get('/logs', validateRequest(queryRemindersSchema, 'query'), reminderController.listLogs);
  router.post('/logs/:id/retry', reminderController.retryReminder);

  // Single Rule Operations
  router.put('/:id', validateRequest(updateReminderSchema), reminderController.updateReminder);
  router.patch('/:id/pause', reminderController.pauseReminder);
  router.patch('/:id/resume', reminderController.resumeReminder);
  router.delete('/:id', reminderController.deleteReminder);

  return router;
};
