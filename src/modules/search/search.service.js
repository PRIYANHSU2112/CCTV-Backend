import { SearchRepository } from './search.repository.js';
import { logger } from '../../shared/utils/logger.js';

const QUICK_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', keywords: ['dashboard', 'home', 'kpi', 'analytics', 'overview'], icon: 'layout-dashboard' },
  { label: 'Clients', path: '/clients', keywords: ['client', 'clients', 'customer', 'business', 'onboard', 'cctv'], icon: 'users' },
  { label: 'Subscriptions & Plans', path: '/subscriptions', keywords: ['subscription', 'subscriptions', 'plan', 'package', 'pricing', 'tier'], icon: 'package' },
  { label: 'Payments Register', path: '/payments', keywords: ['payment', 'payments', 'receipt', 'offline', 'upi', 'cash', 'transaction'], icon: 'credit-card' },
  { label: 'Invoices', path: '/invoices', keywords: ['invoice', 'invoices', 'bill', 'billing', 'gst', 'tax', 'pdf'], icon: 'file-text' },
  { label: 'Payment Reminders', path: '/reminders', keywords: ['reminder', 'reminders', 'whatsapp', 'sms', 'notice', 'due', 'overdue'], icon: 'bell-ring' },
  { label: 'Reports & Revenue', path: '/reports', keywords: ['report', 'reports', 'revenue', 'collection', 'export', 'csv'], icon: 'bar-chart-3' },
  { label: 'Users & Roles', path: '/users', keywords: ['user', 'users', 'staff', 'role', 'roles', 'permission', 'team', 'admin'], icon: 'shield' },
  { label: 'Company Profile', path: '/company', keywords: ['company', 'profile', 'business info', 'gstin', 'bank', 'address'], icon: 'building-2' },
  { label: 'Settings & Appearance', path: '/settings', keywords: ['setting', 'settings', 'appearance', 'theme', 'dark', 'light'], icon: 'settings' },
];

export class SearchService {
  constructor({ searchRepository, redisService = null }) {
    this.searchRepository = searchRepository || new SearchRepository();
    this.redisService = redisService;
  }

  /**
   * High performance Global Search
   */
  async globalSearch({ query, limit = 5, type = 'all' }) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return {
        results: {
          nav: [],
          clients: [],
          invoices: [],
          payments: [],
          subscriptions: [],
          plans: [],
          users: [],
        },
        meta: {
          query: '',
          totalMatches: 0,
          cached: false,
        },
      };
    }

    const cacheKey = `search:${type}:${trimmed.toLowerCase()}:${limit}`;
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          return { ...cached, meta: { ...cached.meta, cached: true } };
        }
      } catch {
        // Cache miss / redis error fallback
      }
    }

    const qLower = trimmed.toLowerCase();

    // 1. Match Navigation Links
    const matchingNav = QUICK_NAV_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(qLower) ||
      item.keywords.some((k) => k.includes(qLower) || qLower.includes(k))
    ).slice(0, 4);

    // 2. Query specific domain entities based on requested type
    let clients = [];
    let invoices = [];
    let payments = [];
    let subscriptions = [];
    let plans = [];
    let users = [];

    const tasks = [];

    if (type === 'all' || type === 'clients') {
      tasks.push(
        this.searchRepository.searchClients(trimmed, limit).then((res) => { clients = res; }).catch((err) => {
          logger.warn(`Search clients error: ${err.message}`);
        })
      );
    }

    if (type === 'all' || type === 'invoices') {
      tasks.push(
        this.searchRepository.searchInvoices(trimmed, limit).then((res) => { invoices = res; }).catch((err) => {
          logger.warn(`Search invoices error: ${err.message}`);
        })
      );
    }

    if (type === 'all' || type === 'payments') {
      tasks.push(
        this.searchRepository.searchPayments(trimmed, limit).then((res) => { payments = res; }).catch((err) => {
          logger.warn(`Search payments error: ${err.message}`);
        })
      );
    }

    if (type === 'all' || type === 'subscriptions') {
      tasks.push(
        this.searchRepository.searchSubscriptions(trimmed, limit).then((res) => {
          subscriptions = res.subscriptions || [];
          plans = res.plans || [];
        }).catch((err) => {
          logger.warn(`Search subscriptions error: ${err.message}`);
        })
      );
    }

    if (type === 'all' || type === 'users') {
      tasks.push(
        this.searchRepository.searchUsers(trimmed, limit).then((res) => { users = res; }).catch((err) => {
          logger.warn(`Search users error: ${err.message}`);
        })
      );
    }

    await Promise.all(tasks);

    // Format & map results with clean display identifiers
    const mappedClients = clients.map((c) => ({
      id: c._id?.toString() || c.id,
      title: c.businessName,
      subtitle: `${c.userId?.name || 'Client'} • ${c.userId?.phone || c.email || 'No Phone'} • ${c.installationAddress?.city || 'Bhopal'}`,
      badge: c.status,
      badgeVariant: c.status === 'Active' ? 'success' : 'warning',
      type: 'client',
      url: `/clients/${c._id?.toString() || c.id}`,
    }));

    const mappedInvoices = invoices.map((inv) => ({
      id: inv._id?.toString() || inv.id,
      title: inv.invoiceNumber,
      subtitle: `${inv.clientId?.businessName || 'Business'} • ₹${(inv.totalAmount || 0).toLocaleString('en-IN')} (${inv.status})`,
      badge: inv.status,
      badgeVariant: inv.status === 'PAID' ? 'success' : (inv.status === 'PARTIALLY_PAID' ? 'warning' : 'destructive'),
      type: 'invoice',
      url: `/invoices`,
      pdfUrl: inv.pdfUrl,
    }));

    const mappedPayments = payments.map((p) => ({
      id: p._id?.toString() || p.id,
      title: p.receiptNo,
      subtitle: `${p.clientId?.businessName || 'Client'} • ₹${(p.amount || 0).toLocaleString('en-IN')} via ${p.method}`,
      badge: p.status,
      badgeVariant: p.status === 'PAID' ? 'success' : 'secondary',
      type: 'payment',
      url: `/payments`,
    }));

    const mappedSubscriptions = subscriptions.map((s) => ({
      id: s._id?.toString() || s.id,
      title: `${s.packageTier} Plan`,
      subtitle: `${s.clientId?.businessName || 'Client'} • ₹${(s.totalPlanPrice || s.monthlyCharge || 0).toLocaleString('en-IN')} (${s.status})`,
      badge: s.status,
      badgeVariant: s.status === 'ACTIVE' ? 'success' : 'secondary',
      type: 'subscription',
      url: `/subscriptions`,
    }));

    const mappedPlans = plans.map((pl) => ({
      id: pl._id?.toString() || pl.id,
      title: `${pl.name} (${pl.code})`,
      subtitle: `₹${(pl.totalPrice || pl.basePrice || 0).toLocaleString('en-IN')}/mo • ${pl.tier}`,
      badge: pl.isActive ? 'Active' : 'Inactive',
      badgeVariant: pl.isActive ? 'success' : 'secondary',
      type: 'plan',
      url: `/subscriptions`,
    }));

    const mappedUsers = users.map((u) => ({
      id: u._id?.toString() || u.id,
      title: u.name,
      subtitle: `${u.email || u.phone || 'No Email'} • ${u.role}`,
      badge: u.role,
      badgeVariant: 'outline',
      type: 'user',
      url: `/users`,
    }));

    const totalMatches =
      matchingNav.length +
      mappedClients.length +
      mappedInvoices.length +
      mappedPayments.length +
      mappedSubscriptions.length +
      mappedPlans.length +
      mappedUsers.length;

    const payload = {
      results: {
        nav: matchingNav.map((n) => ({ ...n, type: 'nav' })),
        clients: mappedClients,
        invoices: mappedInvoices,
        payments: mappedPayments,
        subscriptions: mappedSubscriptions,
        plans: mappedPlans,
        users: mappedUsers,
      },
      meta: {
        query: trimmed,
        totalMatches,
        cached: false,
      },
    };

    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, payload, 30); // 30s TTL
      } catch {
        // Safe cache set error ignored
      }
    }

    return payload;
  }
}
