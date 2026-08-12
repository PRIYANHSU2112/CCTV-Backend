import { NotFoundError } from '../../shared/errors/not-found.error.js';
import { ReminderStatus } from './reminder.model.js';

export class ReminderService {
  constructor({ reminderRepository, reminderQueueService }) {
    this.reminderRepository = reminderRepository;
    this.queueService = reminderQueueService;
  }

  /**
   * Create Reminder Rule & Schedule in BullMQ
   */
  async createReminder(payload) {
    const rule = await this.reminderRepository.createRule(payload);

    // Sync with BullMQ
    const jobId = await this.queueService.scheduleJob(rule);
    rule.bullmqJobId = jobId;
    await rule.save();

    return rule;
  }

  /**
   * Update & Reschedule Reminder
   */
  async updateReminder(id, updateData) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    Object.assign(rule, updateData);
    await rule.save();

    // Reschedule in BullMQ if active
    if (rule.status === ReminderStatus.ACTIVE) {
      const jobId = await this.queueService.scheduleJob(rule);
      rule.bullmqJobId = jobId;
      await rule.save();
    } else {
      await this.queueService.pauseJob(rule.bullmqJobId || `reminder_rule_${rule._id}`);
    }

    return rule;
  }

  /**
   * Pause Reminder
   */
  async pauseReminder(id) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    rule.status = ReminderStatus.PAUSED;
    await rule.save();

    await this.queueService.pauseJob(rule.bullmqJobId || `reminder_rule_${rule._id}`);
    return rule;
  }

  /**
   * Resume Reminder
   */
  async resumeReminder(id) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    rule.status = ReminderStatus.ACTIVE;
    const jobId = await this.queueService.scheduleJob(rule);
    rule.bullmqJobId = jobId;
    await rule.save();

    return rule;
  }

  /**
   * Delete Reminder & Remove BullMQ Job
   */
  async deleteReminder(id) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    await this.queueService.removeJob(rule.bullmqJobId || `reminder_rule_${rule._id}`);
    await this.reminderRepository.deleteRule(id);

    return { success: true, message: 'Reminder deleted successfully' };
  }

  async listReminders(queryParams) {
    const page = parseInt(queryParams.page || 1, 10);
    const limit = parseInt(queryParams.limit || 10, 10);
    const skip = (page - 1) * limit;

    const { items, total } = await this.reminderRepository.findPaginatedRules({
      skip,
      limit,
      status: queryParams.status,
      search: queryParams.search
    });

    return { items, page, limit, total };
  }

  async getReminderConfig() {
    return this.reminderRepository.getConfig();
  }

  async updateReminderConfig(config) {
    return this.reminderRepository.saveConfig(config);
  }

  async listLogs(queryParams) {
    const page = parseInt(queryParams.page || 1, 10);
    const limit = parseInt(queryParams.limit || 10, 10);
    const skip = (page - 1) * limit;

    const { items, total } = await this.reminderRepository.findPaginatedLogs({
      skip,
      limit,
      status: queryParams.status,
      channel: queryParams.channel
    });

    return { items, page, limit, total };
  }
}
