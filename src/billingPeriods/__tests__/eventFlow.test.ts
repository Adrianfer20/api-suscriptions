import { expect } from 'chai';
import sinon from 'sinon';
import eventBus from '../../events/eventBus';
import {
  EVENT_PAYMENT_VERIFIED,
  EVENT_BILLING_PERIOD_PAID,
  EVENT_BILLING_PERIOD_OVERDUE
} from '../../events/domainEvents';
import billingPeriodService from '../services/billingPeriod.service';
import communicationsService from '../../communications/services/communications.service';

describe('Event-driven flow integration', () => {
  let applyPaymentStub: sinon.SinonStub;
  let notifyPaidStub: sinon.SinonStub;
  let notifyOverdueStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.restore();
    // Stub the communications notifiers
    notifyPaidStub = sinon.stub(communicationsService, 'notifyBillingPeriodPaid').resolves({ ok: true } as any);
    notifyOverdueStub = sinon.stub(communicationsService, 'notifyBillingPeriodOverdue').resolves({ ok: true } as any);

    // Stub billingPeriodService.applyPayment to simulate emission of events
    applyPaymentStub = sinon.stub(billingPeriodService as any, 'applyPayment').callsFake(async (payment: any) => {
      if (payment && payment.simulate === 'paid') {
        // Emit paid event
        eventBus.emit(EVENT_BILLING_PERIOD_PAID, { period: { id: 'p1', subscriptionId: 's1', amount: 100 } });
        return { payment, billingPeriod: { id: 'p1', status: 'paid' }, nextPeriod: undefined };
      }

      if (payment && payment.simulate === 'overdue') {
        eventBus.emit(EVENT_BILLING_PERIOD_OVERDUE, { period: { id: 'p2', subscriptionId: 's2', daysLate: 10 } });
        return { payment, billingPeriod: { id: 'p2', status: 'overdue' }, nextPeriod: undefined };
      }

      return { payment, billingPeriod: null, nextPeriod: undefined };
    });
  });

  afterEach(() => sinon.restore());

  it('should handle PAYMENT_VERIFIED -> applyPayment -> BILLING_PERIOD_PAID -> notifyBillingPeriodPaid', async () => {
    const fakePayment = { id: 'pay-1', billingPeriodId: 'p1', simulate: 'paid' };

    // Emit the payment verified event
    eventBus.emit(EVENT_PAYMENT_VERIFIED, { payment: fakePayment });

    // wait for async listeners
    await new Promise((r) => setTimeout(r, 50));

    expect(applyPaymentStub.calledOnce).to.be.true;
    expect(applyPaymentStub.calledWithExactly(fakePayment)).to.be.true;
    expect(notifyPaidStub.calledOnce).to.be.true;
  });

  it('should handle PAYMENT_VERIFIED -> applyPayment -> BILLING_PERIOD_OVERDUE -> notifyBillingPeriodOverdue', async () => {
    const fakePayment = { id: 'pay-2', billingPeriodId: 'p2', simulate: 'overdue' };

    eventBus.emit(EVENT_PAYMENT_VERIFIED, { payment: fakePayment });

    await new Promise((r) => setTimeout(r, 50));

    expect(applyPaymentStub.calledOnce).to.be.true;
    expect(notifyOverdueStub.calledOnce).to.be.true;
  });
});
