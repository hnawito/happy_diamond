// Shared pure filtering logic for the complete admin order list.
export function filterOrders(orders, customers, filters = {}) {
  const min = filters.minTotal === '' || filters.minTotal == null ? null : Number(filters.minTotal);
  const max = filters.maxTotal === '' || filters.maxTotal == null ? null : Number(filters.maxTotal);
  if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) return { orders: [], error: 'Enter valid non-negative order totals.' };
  if (filters.from && filters.to && filters.from > filters.to) return { orders: [], error: 'From date must be on or before To date.' };
  if (min !== null && max !== null && min > max) return { orders: [], error: 'Minimum total must be less than or equal to Maximum total.' };
  const query = (filters.search || '').trim().toLowerCase();
  const customerMap = new Map(customers.map(c => [c.id, c]));
  const matches = orders.filter(order => {
    const customer = customerMap.get(order.customerId);
    const day = order.createdAt.slice(0, 10);
    const searchable = [order.id, customer?.name, customer?.email, customer?.phone, ...Object.values(order.address || {}), order.note, ...order.items.flatMap(item => [item.name, item.nameAr || ''])].join(' ').toLowerCase();
    return (!query || searchable.includes(query))
      && (!filters.customerId || order.customerId === filters.customerId)
      && (!filters.status || order.status === filters.status)
      && (!filters.from || day >= filters.from)
      && (!filters.to || day <= filters.to)
      && (min === null || order.total >= min)
      && (max === null || order.total <= max);
  });
  const newest = (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  const comparators = { newest, oldest: (a,b) => -newest(a,b), highest: (a,b) => b.total-a.total || newest(a,b), lowest: (a,b) => a.total-b.total || newest(a,b) };
  return { orders: matches.sort(comparators[filters.sort] || newest), error: '' };
}
