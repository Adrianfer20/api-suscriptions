import communicationsService from '../communications/services/communications.service';

async function main() {
  // Modo seguro: no envía mensajes reales
  process.env.TEST_DRY_RUN = 'true';
  const phone = process.argv[2] || '+521234567890';
  const clientId = process.argv[3] || 'client-test-1';
  try {
    const migrated = await communicationsService.migrateMessagesToClient(phone, clientId);
    console.log('Mensajes migrados:', migrated);
    process.exit(0);
  } catch (err: any) {
    console.error('Error en migración:', err?.message || err);
    process.exit(1);
  }
}

main();
