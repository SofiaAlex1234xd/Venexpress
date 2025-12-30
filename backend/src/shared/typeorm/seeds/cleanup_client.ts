import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '../../../../.env') });

async function cleanup() {
    const ds = new DataSource({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [],
        synchronize: false,
    });

    await ds.initialize();
    const clientId = 4;

    console.log(`🚀 Iniciando limpieza para cliente ID: ${clientId}...`);

    try {
        // 1. Obtener IDs de transacciones asociadas al cliente
        const transactions = await ds.query('SELECT id FROM transactions WHERE "clientPresencialId" = $1', [clientId]);
        const transactionIds = transactions.map((t: any) => t.id);

        if (transactionIds.length > 0) {
            console.log(`📦 Eliminando ${transactionIds.length} historial(es) de transacciones...`);
            await ds.query('DELETE FROM transaction_history WHERE "transactionId" = ANY($1)', [transactionIds]);

            console.log(`💰 Eliminando ${transactionIds.length} transacciones...`);
            await ds.query('DELETE FROM transactions WHERE id = ANY($1)', [transactionIds]);
        }

        // 2. Obtener y eliminar beneficiarios
        const beneficiaries = await ds.query('SELECT id FROM beneficiaries WHERE "clientColombiaId" = $1', [clientId]);
        const beneficiaryIds = beneficiaries.map((b: any) => b.id);

        if (beneficiaryIds.length > 0) {
            console.log(`👤 Eliminando ${beneficiaryIds.length} destinatarios...`);
            await ds.query('DELETE FROM beneficiaries WHERE id = ANY($1)', [beneficiaryIds]);
        }

        // 3. Eliminar al cliente
        console.log(`🏠 Eliminando cliente ID: ${clientId}...`);
        const deleteResult = await ds.query('DELETE FROM clients WHERE id = $1', [clientId]);

        console.log('✅ Limpieza completada con éxito.');
    } catch (error) {
        console.error('❌ Error durante la limpieza:', error);
    } finally {
        await ds.destroy();
    }
}

cleanup();
