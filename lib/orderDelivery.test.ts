import { describe, expect, it } from 'vitest';
import { mergeOrderUpdate, withDeliveryContact } from './orderDelivery';

describe('withDeliveryContact', () => {
  it('fills address + note for buyer/admin rows', () => {
    const row = withDeliveryContact({
      id: 'o1',
      shipping_address: { city: 'Lahore' },
      delivery_notes: null,
      order_delivery_contacts: { address: { line1: '9 Canal', city: 'Lahore', phone: '0321' }, delivery_notes: 'Call' },
    });
    expect(row.shipping_address).toEqual({ line1: '9 Canal', city: 'Lahore', phone: '0321' });
    expect(row.delivery_notes).toBe('Call');
    expect('order_delivery_contacts' in row).toBe(false);
  });
  it('leaves a seller row (empty embed) with city only', () => {
    const row = withDeliveryContact({ id: 'o1', shipping_address: { city: 'Lahore' }, order_delivery_contacts: [] });
    expect(row.shipping_address).toEqual({ city: 'Lahore' });
  });
});

describe('mergeOrderUpdate', () => {
  it('keeps the buyer address and seller code when an RPC/realtime row arrives', () => {
    const prev = { id: 'o', status: 'pending', shipping_address: { line1: 'x', city: 'Lahore', phone: '1' }, pickup_code: '123456', listing: { id: 'l' } };
    const next = { id: 'o', status: 'canceled', shipping_address: { city: 'Lahore' }, listing: undefined };
    const m = mergeOrderUpdate(prev as any, next as any);
    expect(m.status).toBe('canceled');
    expect(m.shipping_address).toEqual(prev.shipping_address);
    expect(m.pickup_code).toBe('123456');
    expect(m.listing).toEqual({ id: 'l' });
  });
});
