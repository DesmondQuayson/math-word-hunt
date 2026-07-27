import "server-only";

import { APPROVED_TEST_PLANS, type NormalizedCustomer, type NormalizedPrice, type NormalizedSubscription, type PaidPlanKey } from "./models";

export function validateCustomerOwnership(customer: NormalizedCustomer, ownerReference: string): boolean {
  return !customer.deleted && !customer.livemode && (customer.ownerReference === null || customer.ownerReference === ownerReference);
}

export function validateApprovedPrice(price: NormalizedPrice, planKey: PaidPlanKey, productId: string): boolean {
  const expected = APPROVED_TEST_PLANS[planKey];
  return !price.livemode && price.active && price.productId === productId && price.currency === expected.currency &&
    price.amountMinorUnits === expected.amountMinorUnits && price.interval === expected.interval &&
    price.intervalCount === 1 && price.usageType === "licensed";
}

export function validateSubscription(subscription: NormalizedSubscription, input: Readonly<{ customerId: string; planKey: PaidPlanKey; productId: string }>): boolean {
  return !subscription.livemode && subscription.customerId === input.customerId && subscription.quantity === 1 &&
    subscription.price !== null && validateApprovedPrice(subscription.price, input.planKey, input.productId);
}
