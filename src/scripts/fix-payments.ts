/**
 * Script para corregir pagos que exceden el límite mensual
 * Uso: npx ts-node src/scripts/fix-payments.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import firebaseAdmin from '../config/firebaseAdmin';

const TEST_SUBSCRIPTION_ID = process.env.TEST_SUBSCRIPTION_ID || 'ZiHw1tCyMnZVucTL3STu';

async function main() {
  console.log('=== Corrección de pagos que exceden el límite ===\n');
  
  if (!firebaseAdmin) {
    console.error('❌ Firebase Admin no inicializado');
    process.exit(1);
  }

  const paymentsCollection = firebaseAdmin.firestore().collection('payments');
  const subscriptionsCollection = firebaseAdmin.firestore().collection('subscriptions');

  // Obtener suscripción
  const subscriptionDoc = await subscriptionsCollection.doc(TEST_SUBSCRIPTION_ID).get();
  const subscription = subscriptionDoc.data();
  const monthlyAmount = parseFloat(subscription?.amount?.replace(/[^0-9.-]/g, '') || '0');
  
  console.log('📋 Suscripción:', TEST_SUBSCRIPTION_ID);
  console.log('💰 Costo mensual:', monthlyAmount);

  // Obtener todos los pagos
  const paymentsSnap = await paymentsCollection
    .where('subscriptionId', '==', TEST_SUBSCRIPTION_ID)
    .orderBy('createdAt', 'desc')
    .get();

  let payments: any[] = paymentsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Calcular total actual
  let currentTotal = 0;
  payments.forEach(p => {
    if (p.status === 'pending' || p.status === 'verified') {
      currentTotal += p.amount || 0;
    }
  });

  console.log('\n📊 Pagos actuales:');
  payments.forEach((p, i) => {
    console.log(`  ${i + 1}. $${p.amount} (${p.status}) - ${p.id}`);
  });
  console.log(`\nTotal: ${currentTotal} / ${monthlyAmount}`);

  // Determinar cuántos pagos eliminar
  const excess = currentTotal - monthlyAmount;
  if (excess <= 0) {
    console.log('\n✅ No hay pagos excesivos. Todo OK!');
    process.exit(0);
  }

  console.log(`\n⚠️ Exceso: $${excess}`);
  console.log('\nPagos a eliminar (los más recientes primero):');

  let toDelete: string[] = [];
  let deletedAmount = 0;

  for (const p of payments) {
    if (deletedAmount >= excess) break;
    
    // Solo eliminar pagos pending o verified
    if (p.status === 'pending' || p.status === 'verified') {
      toDelete.push(p.id);
      deletedAmount += p.amount || 0;
      console.log(`  - $${p.amount} (${p.status}) - ${p.id}`);
    }
  }

  console.log(`\nTotal a eliminar: $${deletedAmount}`);
  console.log(`Quedará: $${currentTotal - deletedAmount}`);

  // Confirmar
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('\n¿Proceder con la eliminación? (yes/no): ', async (answer: string) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      console.log('\n🗑️ Eliminando pagos...');
      
      const batch = firebaseAdmin!.firestore().batch();
      
      for (const id of toDelete) {
        batch.delete(paymentsCollection.doc(id));
      }
      
      await batch.commit();
      
      console.log('✅ Pagos eliminados correctamente!');
      
      // También actualizar el cutDate si el mes quedó pagado
      const remaining = currentTotal - deletedAmount;
      if (remaining >= monthlyAmount) {
        console.log('\n📅 Actualizando cutDate al mes siguiente...');
        const today = new Date();
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const newCutDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
        
        await subscriptionsCollection.doc(TEST_SUBSCRIPTION_ID).update({
          cutDate: newCutDate,
          status: 'active'
        });
        
        console.log(`✅ Nuevo cutDate: ${newCutDate}`);
      }
      
    } else {
      console.log('\n❌ Cancelado');
    }
    
    readline.close();
  });
}

main().catch(console.error);
