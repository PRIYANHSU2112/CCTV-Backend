import { ClientModel } from '../client/client.model.js';
import { InvoiceModel } from '../invoice/invoice.model.js';
import { PaymentTransactionModel } from '../payment/payment-transaction.model.js';
import { ClientSubscriptionModel } from '../subscription/client-subscription.model.js';
import { UserModel } from '../user/user.model.js';
import { SubscriptionPlanModel } from '../subscription/plan.model.js';

export class SearchRepository {
  /**
   * Escape regex special characters to prevent regex injection / syntax crashes
   */
  #escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  /**
   * Search Clients
   */
  async searchClients(query, limit = 5) {
    const escaped = this.#escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    return ClientModel.find({
      $or: [
        { businessName: regex },
        { email: regex },
        { gstin: regex },
        { 'installationAddress.city': regex },
        { 'installationAddress.address': regex },
        { 'installationAddress.pincode': regex },
      ],
    })
      .populate('userId', 'name email phone role status')
      .populate('currentSubscriptionId', 'packageTier status totalPlanPrice')
      .select('businessName email gstin installationAddress status totalCamerasInstalled createdAt')
      .limit(limit)
      .lean()
      .exec();
  }

  /**
   * Search Invoices
   */
  async searchInvoices(query, limit = 5) {
    const escaped = this.#escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    return InvoiceModel.find({
      $or: [
        { invoiceNumber: regex },
        { status: regex },
        { notes: regex },
      ],
    })
      .populate({
        path: 'clientId',
        select: 'businessName email installationAddress',
        populate: { path: 'userId', select: 'name phone' },
      })
      .select('invoiceNumber clientId totalAmount amountPaid amountDue status invoiceDate dueDate pdfUrl createdAt')
      .limit(limit)
      .lean()
      .exec();
  }

  /**
   * Search Payment Transactions
   */
  async searchPayments(query, limit = 5) {
    const escaped = this.#escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    const numAmount = Number(query.replace(/[^0-9.]/g, ''));
    const orConditions = [
      { receiptNo: regex },
      { transactionId: regex },
      { invoiceId: regex },
      { method: regex },
      { note: regex },
    ];

    if (!isNaN(numAmount) && numAmount > 0) {
      orConditions.push({ amount: numAmount });
    }

    return PaymentTransactionModel.find({ $or: orConditions })
      .populate({
        path: 'clientId',
        select: 'businessName',
        populate: { path: 'userId', select: 'name phone' },
      })
      .select('receiptNo transactionId invoiceId amount method status paidAt note createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  /**
   * Search Subscriptions & Plans
   */
  async searchSubscriptions(query, limit = 5) {
    const escaped = this.#escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    const [subs, plans] = await Promise.all([
      ClientSubscriptionModel.find({
        $or: [
          { packageTier: regex },
          { status: regex },
        ],
      })
        .populate({
          path: 'clientId',
          select: 'businessName',
          populate: { path: 'userId', select: 'name phone' },
        })
        .select('packageTier billingCycle monthlyCharge totalPlanPrice paidAmount remainingAmount status startDate endDate')
        .limit(limit)
        .lean()
        .exec(),

      SubscriptionPlanModel.find({
        $or: [
          { name: regex },
          { code: regex },
          { tier: regex },
          { description: regex },
        ],
      })
        .select('name code tier basePrice totalPrice gstPercentage billingCycle isPopular isActive')
        .limit(limit)
        .lean()
        .exec(),
    ]);

    return { subscriptions: subs, plans };
  }

  /**
   * Search Users / Staff
   */
  async searchUsers(query, limit = 5) {
    const escaped = this.#escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    return UserModel.find({
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { role: regex },
        { username: regex },
      ],
    })
      .select('name email phone role status createdAt')
      .limit(limit)
      .lean()
      .exec();
  }
}
