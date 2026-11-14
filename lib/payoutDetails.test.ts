import { describe, expect, it } from 'vitest';
import { accountNumberError, accountTitleError, formatCnic, isValidCnic, normalizeAccountNumber, rejectionReason } from './payoutDetails';

describe('payout details', () => {
  it('accepts IBANs and plain account numbers for banks', () => {
    expect(normalizeAccountNumber('pk36 scbl 0000-0011 2345 6702')).toBe('PK36SCBL0000001123456702');
    expect(accountNumberError('bank', 'pk36 scbl 0000 0011 2345 6702')).toBeNull();
    expect(accountNumberError('bank', '0123 4567 890')).toBeNull();
    expect(accountNumberError('bank', 'PK36SCBL00000011234567')).not.toBeNull();
    expect(accountNumberError('bank', '1234')).not.toBeNull();
  });
  it('requires an 03XXXXXXXXX number for wallets', () => {
    expect(accountNumberError('wallet', '0300-1234567')).toBeNull();
    expect(accountNumberError('wallet', '+92 300 1234567')).toBeNull();
    expect(normalizeAccountNumber('92-300-1234567')).toBe('03001234567');
    expect(accountNumberError('wallet', '9230012345')).not.toBeNull();
  });
  it('requires a real account title', () => {
    expect(accountTitleError('Al')).not.toBeNull();
    expect(accountTitleError(' Ali Khan ')).toBeNull();
  });
});

describe('CNIC', () => {
  it('formats as you type and validates 13 digits', () => {
    expect(formatCnic('35201')).toBe('35201');
    expect(formatCnic('352011234')).toBe('35201-1234');
    expect(formatCnic('3520112345671')).toBe('35201-1234567-1');
    expect(formatCnic('35201-1234567-19')).toBe('35201-1234567-1');
    expect(isValidCnic('35201-1234567-1')).toBe(true);
    expect(isValidCnic('35201-1234567')).toBe(false);
  });
});

describe('cnicFrontPath', () => {
  it('only treats an upload in the user folder as the photo', async () => {
    const { cnicFrontPath } = await import('./payoutDetails');
    expect(cnicFrontPath({ user_id: 'u1', notes: 'u1/abc.jpg' })).toBe('u1/abc.jpg');
    expect(cnicFrontPath({ user_id: 'u1', notes: 'Blurry/unclear photo' })).toBeNull();
    expect(cnicFrontPath({ user_id: 'u1', notes: null })).toBeNull();
  });
});

// ADM-005: the reviewer's note has its own column; notes keeps the CNIC front photo path.
describe('rejectionReason', () => {
  const uid = 'u1';
  it('uses review_notes first', () => {
    expect(rejectionReason({ user_id: uid, notes: `${uid}/front.jpg`, review_notes: 'Photo is blurry' })).toBe('Photo is blurry');
  });
  it('never shows the photo path as a reason', () => {
    expect(rejectionReason({ user_id: uid, notes: `${uid}/front.jpg`, review_notes: null })).toBeNull();
  });
  it('still reads a reason older reviews left in notes', () => {
    expect(rejectionReason({ user_id: uid, notes: 'Name does not match' })).toBe('Name does not match');
  });
});
