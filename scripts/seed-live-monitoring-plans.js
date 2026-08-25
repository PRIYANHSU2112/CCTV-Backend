import 'dotenv/config';
import mongoose from 'mongoose';
import { PackageTier, BillingCycle, PlanStatus } from '../src/shared/constants/enum.constant.js';
import { SubscriptionPlanModel } from '../src/modules/subscription/plan.model.js';

const LIVE_MONITORING_PLANS = [
  {
    name: 'Monthly Plan (Live Monitoring)',
    planCode: 'LIVE-MON-MONTHLY',
    description: 'Live Monitoring Services Package (11:30 PM to 6:30 AM). ₹200 per night per camera.',
    packageTier: PackageTier.BASIC,
    billingCycle: BillingCycle.MONTHLY,
    durationInMonths: 1,
    basePrice: 6000,
    gstPercentage: 18,
    maxCameras: 1,
    features: [
      'Live CCTV Monitoring (11:30 PM to 6:30 AM)',
      '₹200 per night (₹6,000 / month per camera)',
      'Activation Cost (One Time): ₹8,000',
      'Extra monitoring: ₹50 / hour',
      'Instant intrusion alerts & rapid response',
      'Lan Wire & Electric Wire Not Included',
    ],
    autoRenewalSupported: true,
    status: PlanStatus.ACTIVE,
  },
  {
    name: 'Quarterly Plan (Live Monitoring)',
    planCode: 'LIVE-MON-QUARTERLY',
    description: 'Pay for 3 Months & Get 1 Month Free (4 Months Total Coverage). Effective ₹4,500/mo (₹150/day).',
    packageTier: PackageTier.STANDARD,
    billingCycle: BillingCycle.QUARTERLY,
    durationInMonths: 4, // 3 months paid + 1 month free
    basePrice: 18000,
    gstPercentage: 18,
    maxCameras: 1,
    features: [
      'Pay for 3 Months & Get 1 Month Free (4 Months Total)',
      'Effective rate: ₹4,500 / month (₹150 / day)',
      'Live CCTV Monitoring (11:30 PM to 6:30 AM)',
      'Discounted Activation Cost (One Time): ₹6,000',
      'Extra monitoring: ₹50 / hour',
      'Instant intrusion alerts & rapid response',
      'Lan Wire & Electric Wire Not Included',
    ],
    autoRenewalSupported: true,
    status: PlanStatus.ACTIVE,
  },
  {
    name: 'Half Yearly Plan (Live Monitoring)',
    planCode: 'LIVE-MON-HALFYEARLY',
    description: 'Pay for 6 Months & Get 3 Months Free (9 Months Total Coverage). Effective ₹4,000/mo (₹133/day).',
    packageTier: PackageTier.PREMIUM,
    billingCycle: BillingCycle.HALF_YEARLY,
    durationInMonths: 9, // 6 months paid + 3 months free
    basePrice: 36000,
    gstPercentage: 18,
    maxCameras: 1,
    features: [
      'Pay for 6 Months & Get 3 Months Free (9 Months Total)',
      'Effective rate: ₹4,000 / month (₹133 / day)',
      'Live CCTV Monitoring (11:30 PM to 6:30 AM)',
      'Discounted Activation Cost (One Time): ₹4,000',
      'Extra monitoring: ₹50 / hour',
      'Instant intrusion alerts & rapid response',
      'Lan Wire & Electric Wire Not Included',
    ],
    autoRenewalSupported: true,
    status: PlanStatus.ACTIVE,
  },
  {
    name: 'Yearly Plan (Live Monitoring)',
    planCode: 'LIVE-MON-YEARLY',
    description: 'Pay for 12 Months & Get 8 Months Free (20 Months Total Coverage). Effective ₹3,600/mo (₹120/day). Free activation.',
    packageTier: PackageTier.ENTERPRISE,
    billingCycle: BillingCycle.YEARLY,
    durationInMonths: 20, // 12 months paid + 8 months free
    basePrice: 72000,
    gstPercentage: 18,
    maxCameras: 1,
    features: [
      'Pay for 12 Months & Get 8 Months Free (20 Months Total)',
      'Effective rate: ₹3,600 / month (₹120 / day)',
      'Live CCTV Monitoring (11:30 PM to 6:30 AM)',
      'FREE Activation Cost (One Time): ₹0',
      'Extra monitoring: ₹50 / hour',
      'Instant intrusion alerts & rapid response',
      'Lan Wire & Electric Wire Not Included',
    ],
    autoRenewalSupported: true,
    status: PlanStatus.ACTIVE,
  },
];

async function seedPlans() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URI;
  if (!uri) {
    console.error('MongoDB URI not found in environment');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected successfully.');

  for (const planData of LIVE_MONITORING_PLANS) {
    const existing = await SubscriptionPlanModel.findOne({ planCode: planData.planCode });
    if (existing) {
      console.log(`Updating existing plan: ${planData.planCode}`);
      Object.assign(existing, planData);
      await existing.save();
    } else {
      console.log(`Creating new plan: ${planData.planCode}`);
      await SubscriptionPlanModel.create(planData);
    }
  }

  const allPlans = await SubscriptionPlanModel.find({ status: PlanStatus.ACTIVE });
  console.log('\n--- Active Live Monitoring Plans in Database ---');
  allPlans.forEach((p) => {
    console.log(
      `✓ [${p.planCode}] ${p.name} | Base: ₹${p.basePrice} | GST: ${p.gstPercentage}% | Total: ₹${p.totalPrice} | Duration: ${p.durationInMonths} mo`
    );
  });

  await mongoose.disconnect();
  console.log('\nDatabase connection closed. Seeding complete.');
}

seedPlans().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
