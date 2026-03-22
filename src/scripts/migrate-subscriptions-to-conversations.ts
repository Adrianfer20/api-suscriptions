/**
 * Script de migración para vincular suscripciones existentes a conversaciones
 * 
 * Problema resuelto: Un cliente puede tener múltiples suscripciones (antenas)
 * con el mismo número de teléfono.
 * 
 * Uso: npx ts-node src/scripts/migrate-subscriptions-to-conversations.ts
 * 
 * Este script:
 * 1. Obtiene todos los clientes con teléfono
 * 2. Obtiene todas las suscripciones de cada cliente
 * 3. Vincula todas las suscripciones a la conversación del teléfono
 */

// Cargar variables de entorno primero
import 'dotenv/config';
import firebaseAdmin from '../config/firebaseAdmin';

async function migrate() {
  if (!firebaseAdmin) {
    console.error('Firebase Admin not initialized');
    process.exit(1);
  }

  const db = firebaseAdmin.firestore();
  
  console.log('🔄 Iniciando migración de suscripciones a conversaciones...\n');

  // 1. Obtener todos los clientes
  const clientsSnap = await db.collection('clients').get();
  console.log(`📋 Clientes encontrados: ${clientsSnap.size}`);

  let totalSubscriptionsLinked = 0;
  let conversationsUpdated = 0;

  for (const clientDoc of clientsSnap.docs) {
    const clientData = clientDoc.data();
    const clientPhone = clientData.phone;
    const clientUid = clientData.uid;

    if (!clientPhone) {
      console.log(`  ⚠️ Cliente ${clientDoc.id} sin teléfono, saltando...`);
      continue;
    }

    // 2. Obtener todas las suscripciones de este cliente
    // Buscar tanto por docId como por uid
    let subscriptionsSnap = await db.collection('subscriptions')
      .where('clientId', '==', clientDoc.id)
      .get();
    
    // También buscar por uid si no hay resultados
    if (subscriptionsSnap.empty && clientUid) {
      subscriptionsSnap = await db.collection('subscriptions')
        .where('clientId', '==', clientUid)
        .get();
    }

    if (subscriptionsSnap.empty) {
      console.log(`  ℹ️ Cliente ${clientData.name} sin suscripciones`);
      continue;
    }

    const subscriptionIds = subscriptionsSnap.docs.map(d => d.id);
    console.log(`  📡 Cliente ${clientData.name} (${clientPhone}): ${subscriptionIds.length} suscripciones`);

    // 3. Verificar si la conversación existe
    const conversationRef = db.collection('conversations').doc(clientPhone);
    const conversationDoc = await conversationRef.get();

    let existingSubscriptionIds: string[] = [];
    if (conversationDoc.exists) {
      const convData = conversationDoc.data();
      existingSubscriptionIds = convData?.subscriptionIds || [];
    }

    // 4. Combinar suscripciones existentes con nuevas (sin duplicados)
    const allSubscriptionIds = [...new Set([...existingSubscriptionIds, ...subscriptionIds])];

    // 5. Actualizar la conversación
    await conversationRef.set({
      clientId: clientDoc.id,
      phone: clientPhone,
      name: clientData.name,
      subscriptionIds: allSubscriptionIds,
      prospect: false,
      updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    totalSubscriptionsLinked += subscriptionIds.length;
    conversationsUpdated++;

    console.log(`     ✅ Vinculadas: ${subscriptionIds.length} (Total: ${allSubscriptionIds.length})`);
  }

  // 6. Procesar conversaciones huérfanas (que no tienen cliente vinculado pero tienen suscripciones)
  console.log('\n🔄 Procesando conversaciones sin cliente...\n');
  
  const conversationsSnap = await db.collection('conversations')
    .where('prospect', '==', true)
    .get();

  let orphanProcessed = 0;
  for (const convDoc of conversationsSnap.docs) {
    const convData = convDoc.data();
    const phone = convData.phone;

    // Buscar cliente por teléfono
    const clientSnap = await db.collection('clients')
      .where('phone', '==', phone)
      .limit(1)
      .get();

    if (!clientSnap.empty) {
      const clientDoc = clientSnap.docs[0];
      const clientData = clientDoc.data();

      // Obtener suscripciones
      const subscriptionsSnap = await db.collection('subscriptions')
        .where('clientId', '==', clientDoc.id)
        .get();

      const subscriptionIds = subscriptionsSnap.docs.map(d => d.id);
      const existingSubscriptionIds = convData.subscriptionIds || [];
      const allSubscriptionIds = [...new Set([...existingSubscriptionIds, ...subscriptionIds])];

      // Actualizar conversación
      await convDoc.ref.set({
        clientId: clientDoc.id,
        name: clientData.name,
        subscriptionIds: allSubscriptionIds,
        prospect: false,
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`  ✅ Conversación ${phone} -> Cliente ${clientData.name}: ${subscriptionIds.length} suscripciones`);
      orphanProcessed++;
    }
  }

  console.log('\n✅ Migración completada');
  console.log(`   - Conversaciones actualizadas: ${conversationsUpdated + orphanProcessed}`);
  console.log(`   - Total suscripciones vinculadas: ${totalSubscriptionsLinked}`);
}

// Ejecutar si se llama directamente
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en migración:', err);
      process.exit(1);
    });
}

export default migrate;
