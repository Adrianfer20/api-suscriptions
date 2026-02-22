/**
 * Script de prueba para la lógica de pagos
 * Uso: npx ts-node src/scripts/test-payment-logic.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

console.log('🔍 GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

import firebaseAdmin from '../config/firebaseAdmin';

// ID de suscripción de prueba
const TEST_SUBSCRIPTION_ID = process.env.TEST_SUBSCRIPTION_ID || 'ZiHw1tCyMnZVucTL3STu';

async function main() {
  console.log('\n=== Prueba de lógica de pagos ===\n');
  
  if (!firebaseAdmin) {
    console.error('❌ Firebase Admin no está inicializado');
    console.log('   Verifica que config/firebase.json existe y tiene las credenciales correctas');
    process.exit(1);
  }

  console.log('✅ Firebase Admin inicializado correctamente');

  const paymentsCollection = firebaseAdmin.firestore().collection('payments');
  const subscriptionsCollection = firebaseAdmin.firestore().collection('subscriptions');

  // Obtener información de la suscripción
  const subscriptionDoc = await subscriptionsCollection.doc(TEST_SUBSCRIPTION_ID).get();
  if (!subscriptionDoc.exists) {
    console.error('❌ Suscripción no encontrada:', TEST_SUBSCRIPTION_ID);
    process.exit(1);
  }
  
  const subscription = subscriptionDoc.data();
  const monthlyAmount = parseFloat(subscription?.amount?.replace(/[^0-9.-]/g, '') || '0');
  
  console.log('📋 Suscripción:', TEST_SUBSCRIPTION_ID);
  console.log('💰 Costo mensual:', monthlyAmount);
  console.log('📅 CutDate:', subscription?.cutDate);

  // Obtener pagos existentes
  const paymentsSnap = await paymentsCollection
    .where('subscriptionId', '==', TEST_SUBSCRIPTION_ID)
    .get();
  
  let existingTotal = 0;
  console.log('\n📊 Pagos existentes:');
  paymentsSnap.docs.forEach((doc) => {
    const data = doc.data();
    console.log(`  - $${data.amount} (${data.status})`);
    if (data.status === 'pending' || data.status === 'verified') {
      existingTotal += data.amount || 0;
    }
  });
  
  const maxAllowed = Math.max(0, monthlyAmount - existingTotal);
  
  console.log(`\n📈 Total registrado: ${existingTotal} / ${monthlyAmount}`);
  console.log(`💵 Máximo permitido para nuevo pago: ${maxAllowed}`);
  
  console.log('\n✅ El script funciona correctamente!');
  console.log('\nAhora prueba en el frontend:');
  console.log(`  - Crear pago de ${maxAllowed} -> debe funcionar`);
  console.log(`  - Crear pago de ${maxAllowed + 1} -> debe fallar con error`);
}

main().catch(console.error);
