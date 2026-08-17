import {
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentCommandResultSchema,
  PocketMoneyPaymentVoidCommandResultSchema,
  PocketMoneySettingsCommandResultSchema,
  type Payday,
} from '@hearth/shared';

import { demoAdminHeaders, getHearthRuntime, householdApiBase, request } from './core';

export const pocketMoneyApi = {
  getPocketMoney: (
    weekStart = getHearthRuntime().weekStart,
    asOfDate = getHearthRuntime().localDate,
  ) =>
    request(
      `${householdApiBase()}/pocket-money?weekStart=${weekStart}&asOf=${asOfDate}`,
      PocketMoneyOverviewSchema,
    ),
  updatePocketMoneySettings: (
    memberId: string,
    input: {
      requestId: string;
      weeklyAmountCents: number;
      payday: Payday;
      weekStart: string;
      asOfDate: string;
    },
  ) =>
    request(
      `${householdApiBase()}/members/${memberId}/pocket-money-settings`,
      PocketMoneySettingsCommandResultSchema,
      { method: 'PUT', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  recordPocketMoneyPayment: (input: {
    requestId: string;
    memberId: string;
    weekStart: string;
    asOfDate: string;
    amountCents?: number;
    note?: string | null;
  }) =>
    request(`${householdApiBase()}/pocket-money-payments`, PocketMoneyPaymentCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  voidPocketMoneyPayment: (
    paymentId: string,
    input: { requestId: string; asOfDate: string; reason: string },
  ) =>
    request(
      `${householdApiBase()}/pocket-money-payments/${paymentId}/voids`,
      PocketMoneyPaymentVoidCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
};
