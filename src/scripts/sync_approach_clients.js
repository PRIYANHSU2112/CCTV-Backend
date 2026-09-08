import { connectDatabase } from '../config/database.config.js';
import { ClientStatus, CheckoutSessionStatus, PaymentStatus } from '../shared/constants/enum.constant.js';
import '../modules/client/client.model.js';
import '../modules/payment/checkout-session.model.js';
import '../modules/payment/payment-transaction.model.js';
import '../modules/subscription/client-subscription.model.js';
import mongoose from 'mongoose';

async function main() {
  await connectDatabase();
  const Client = mongoose.model('Client');
  const CheckoutSession = mongoose.model('CheckoutSession');
  const PaymentTransaction = mongoose.model('PaymentTransaction');

  const clients = await Client.find();
  console.log(`Analyzing ${clients.length} clients...`);

  let approachCount = 0;
  let activeCount = 0;
  let unchangedCount = 0;

  for (const client of clients) {
    const clientId = client._id;
    // Check if client has any successful payment
    const successfulPayment = await PaymentTransaction.findOne({
      clientId,
      status: PaymentStatus.PAID,
    });

    const paidCheckout = await CheckoutSession.findOne({
      clientId,
      status: CheckoutSessionStatus.PAID,
    });

    const hasAttemptedCheckout = await CheckoutSession.findOne({
      clientId,
      status: { $in: [CheckoutSessionStatus.FAILED, CheckoutSessionStatus.PENDING, CheckoutSessionStatus.EXPIRED] },
    });

    const hasFailedPayment = await PaymentTransaction.findOne({
      clientId,
      status: { $in: [PaymentStatus.FAILED, PaymentStatus.PENDING] },
    });

    const hasSuccessfulPayment = !!(successfulPayment || paidCheckout);
    const hasIncompleteOrFailedPayment = !!(hasAttemptedCheckout || hasFailedPayment);

    if (!hasSuccessfulPayment && hasIncompleteOrFailedPayment) {
      if (client.status !== ClientStatus.APPROACH_CLIENT) {
        console.log(`-> Updating client "${client.businessName}" (${client._id}) from "${client.status}" to "${ClientStatus.APPROACH_CLIENT}"`);
        client.status = ClientStatus.APPROACH_CLIENT;
        await client.save();
        approachCount++;
      } else {
        unchangedCount++;
      }
    } else if (hasSuccessfulPayment && client.status === ClientStatus.APPROACH_CLIENT) {
      console.log(`-> Promoting client "${client.businessName}" (${client._id}) from "${ClientStatus.APPROACH_CLIENT}" to "${ClientStatus.ACTIVE}"`);
      client.status = ClientStatus.ACTIVE;
      await client.save();
      activeCount++;
    } else {
      unchangedCount++;
    }
  }

  console.log(`\nReconciliation Summary:`);
  console.log(`- Updated to Approach Client: ${approachCount}`);
  console.log(`- Promoted to Active: ${activeCount}`);
  console.log(`- Unchanged: ${unchangedCount}`);

  const postStats = await Client.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log('Post-sync Client Statuses in DB:', JSON.stringify(postStats, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
