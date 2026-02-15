import communicationsService from '../communications/services/communications.service';

async function main() {
  // safe mode
  process.env.TEST_DRY_RUN = 'true';
  const clientId = process.argv[2] || 'client-test-1';
  const template = process.argv[3] || 'subscription_cutoff_day_2v';
  try {
    const res = await communicationsService.send(clientId, template, {
      subscriptionLabel: 'Starlink Basic',
      cutoffDate: '2026-03-01'
    });
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('Error sending test message', err?.message || err);
    process.exit(1);
  }
}

main();
