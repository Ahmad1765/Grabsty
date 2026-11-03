import { z } from 'zod';
import {
  CoordinatesSchema,
  ShippingAddressSchema,
  CheckoutPayloadSchema,
  type Coordinates,
  type ValidatedShippingAddress,
  type ValidatedCheckoutPayload,
} from '@/types/validation/order';

export const FULFILLMENT_METHODS = ['delivery', 'handshake'] as const;
export const PAYMENT_METHODS = ['cod', 'card'] as const;
export const CheckoutFormSchema = z.object({
  fulfillment: z.enum(FULFILLMENT_METHODS, {
    required_error: 'Please choose a fulfillment method',
  }),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    required_error: 'Please select a payment method',
  }),
});
export {
  CoordinatesSchema,
  ShippingAddressSchema,
  CheckoutPayloadSchema,
  type Coordinates,
  type ValidatedShippingAddress,
  type ValidatedCheckoutPayload,
};
