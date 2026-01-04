/**
 * Script para eliminar un vendedor y todos sus datos asociados
 * 
 * Este script elimina:
 * 1. Historial de transacciones (transaction_history) de las transacciones del vendedor
 * 2. Transacciones creadas por el vendedor
 * 3. Beneficiarios asociados a los clientes del vendedor
 * 4. Beneficiarios asociados directamente al vendedor (userApp)
 * 5. Clientes del vendedor
 * 6. El vendedor mismo
 * 
 * USO:
 * npm run script:delete-vendor <vendor-id>
 * o
 * ts-node -r tsconfig-paths/register scripts/delete-vendor.ts <vendor-id>
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/common/enums/user-role.enum';

// Cargar variables de entorno
const envPath = join(process.cwd(), '.env');
config({ path: envPath });

// Parsear DATABASE_URL si existe, sino usar variables individuales
function parseDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port, 10),
        username: url.username,
        password: url.password,
        database: url.pathname.substring(1), // Remover el '/' inicial
      };
    } catch (error) {
      console.error('Error parsing DATABASE_URL:', error);
    }
  }

  // Fallback a variables individuales
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'venexpress',
  };
}

const dbConfig = parseDatabaseUrl();

// Configurar DataSource
const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.database,
  entities: [join(__dirname, '../src/**/*.entity{.ts,.js}')],
  synchronize: false,
  logging: false,
  ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function deleteVendor(vendorId: number) {
  console.log(`\n🔍 Iniciando eliminación del vendedor ID: ${vendorId}\n`);

  try {
    // Inicializar conexión
    await AppDataSource.initialize();
    console.log('✅ Conexión a la base de datos establecida\n');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Verificar que el vendedor existe y es un vendedor
      const vendor = await queryRunner.manager.findOne(User, {
        where: { id: vendorId },
      });

      if (!vendor) {
        throw new Error(`❌ No se encontró un usuario con ID ${vendorId}`);
      }

      if (vendor.role !== UserRole.VENDEDOR) {
        throw new Error(`❌ El usuario con ID ${vendorId} no es un vendedor. Rol actual: ${vendor.role}`);
      }

      console.log(`✅ Vendedor encontrado: ${vendor.name} (${vendor.email})`);
      console.log(`📊 Admin ID: ${vendor.adminId || 'N/A'}\n`);

      // 2. Contar registros asociados antes de eliminar
      const transactions = await queryRunner.query(
        'SELECT id FROM transactions WHERE "createdById" = $1',
        [vendorId]
      );
      const transactionsCount = transactions.length;
      const transactionIds = transactions.map((t: any) => t.id);

      const clients = await queryRunner.query(
        'SELECT id FROM clients WHERE "vendedorId" = $1',
        [vendorId]
      );
      const clientsCount = clients.length;
      const clientIds = clients.map((c: any) => c.id);

      // Contar beneficiarios de clientes
      let beneficiariesFromClientsCount = 0;
      if (clientIds.length > 0) {
        const beneficiariesFromClients = await queryRunner.query(
          'SELECT id FROM beneficiaries WHERE "clientColombiaId" = ANY($1)',
          [clientIds]
        );
        beneficiariesFromClientsCount = beneficiariesFromClients.length;
      }

      // Contar beneficiarios asociados directamente al vendedor (userApp)
      const beneficiariesFromVendor = await queryRunner.query(
        'SELECT id FROM beneficiaries WHERE "userAppId" = $1',
        [vendorId]
      );
      const beneficiariesFromVendorCount = beneficiariesFromVendor.length;

      console.log('📊 Resumen de datos a eliminar:');
      console.log(`   - Transacciones: ${transactionsCount}`);
      console.log(`   - Clientes: ${clientsCount}`);
      console.log(`   - Beneficiarios (de clientes): ${beneficiariesFromClientsCount}`);
      console.log(`   - Beneficiarios (del vendedor): ${beneficiariesFromVendorCount}`);
      console.log(`   - Vendedor: 1\n`);

      // 3. Eliminar AccountTransactions asociadas a las transacciones del vendedor
      if (transactionIds.length > 0) {
        console.log('🗑️  Eliminando transacciones de cuentas...');
        const accountTransactionsCount = await queryRunner.query(
          'SELECT COUNT(*) as count FROM account_transactions WHERE "transactionId" = ANY($1)',
          [transactionIds]
        );
        const count = parseInt(accountTransactionsCount[0].count);
        if (count > 0) {
          await queryRunner.query(
            'DELETE FROM account_transactions WHERE "transactionId" = ANY($1)',
            [transactionIds]
          );
          console.log(`   ✅ ${count} registros de account_transactions eliminados`);
        } else {
          console.log(`   ℹ️  No hay registros de account_transactions para eliminar`);
        }
      }

      // 4. Eliminar TransactionHistory de las transacciones del vendedor
      if (transactionIds.length > 0) {
        console.log('🗑️  Eliminando historial de transacciones...');
        await queryRunner.query(
          'DELETE FROM transaction_history WHERE "transactionId" = ANY($1)',
          [transactionIds]
        );
        console.log(`   ✅ Historial de transacciones eliminado`);
      }

      // 5. Eliminar Transactions creadas por el vendedor
      if (transactionsCount > 0) {
        console.log('🗑️  Eliminando transacciones...');
        await queryRunner.query(
          'DELETE FROM transactions WHERE "createdById" = $1',
          [vendorId]
        );
        console.log(`   ✅ ${transactionsCount} transacciones eliminadas`);
      }

      // 6. Eliminar Beneficiarios asociados a los clientes del vendedor
      if (beneficiariesFromClientsCount > 0 && clientIds.length > 0) {
        console.log('🗑️  Eliminando beneficiarios de clientes...');
        await queryRunner.query(
          'DELETE FROM beneficiaries WHERE "clientColombiaId" = ANY($1)',
          [clientIds]
        );
        console.log(`   ✅ ${beneficiariesFromClientsCount} beneficiarios eliminados`);
      }

      // 7. Eliminar Beneficiarios asociados directamente al vendedor (userApp)
      if (beneficiariesFromVendorCount > 0) {
        console.log('🗑️  Eliminando beneficiarios del vendedor...');
        await queryRunner.query(
          'DELETE FROM beneficiaries WHERE "userAppId" = $1',
          [vendorId]
        );
        console.log(`   ✅ ${beneficiariesFromVendorCount} beneficiarios eliminados`);
      }

      // 8. Eliminar Clientes del vendedor
      if (clientsCount > 0) {
        console.log('🗑️  Eliminando clientes...');
        await queryRunner.query(
          'DELETE FROM clients WHERE "vendedorId" = $1',
          [vendorId]
        );
        console.log(`   ✅ ${clientsCount} clientes eliminados`);
      }

      // 9. Eliminar el Vendedor
      console.log('🗑️  Eliminando vendedor...');
      await queryRunner.query(
        'DELETE FROM users WHERE id = $1',
        [vendorId]
      );
      console.log(`   ✅ Vendedor eliminado\n`);

      // Confirmar transacción
      await queryRunner.commitTransaction();
      console.log('✅ Eliminación completada exitosamente\n');

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

  } catch (error) {
    console.error('\n❌ Error durante la eliminación:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('✅ Conexión cerrada\n');
    }
  }
}

// Ejecutar script
const vendorId = process.argv[2];

if (!vendorId) {
  console.error('❌ Error: Debes proporcionar el ID del vendedor');
  console.error('Uso: npm run script:delete-vendor <vendor-id>');
  console.error('Ejemplo: npm run script:delete-vendor 5');
  process.exit(1);
}

const vendorIdNumber = parseInt(vendorId);

if (isNaN(vendorIdNumber)) {
  console.error('❌ Error: El ID del vendedor debe ser un número');
  process.exit(1);
}

deleteVendor(vendorIdNumber)
  .then(() => {
    console.log('✨ Script finalizado\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:');
    console.error(error);
    process.exit(1);
  });
