// Seed completo para vacear y repoblar la base de datos con datos mínimos
// Ejecutar con: npm run seed

import { DataSource } from 'typeorm';
import { User } from '../../../modules/users/entities/user.entity';
import { Point } from '../../../modules/points/entities/point.entity';
import { Client } from '../../../modules/clients/entities/client.entity';
import { Beneficiary } from '../../../modules/beneficiaries/entities/beneficiary.entity';
import { Transaction } from '../../../modules/transactions/entities/transaction.entity';
import { TransactionHistory } from '../../../modules/transactions/entities/transaction-history.entity';
import { ExchangeRate } from '../../../modules/rates/entities/exchange-rate.entity';
import { VenezuelaPayment } from '../../../modules/transactions/entities/venezuela-payment.entity';
import { UserRole } from '../../../common/enums/user-role.enum';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { join } from 'path';

// Cargar variables de entorno
config({ path: join(__dirname, '../../../../.env') });

// Parsear DATABASE_URL si existe
function parseDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
        const url = new URL(databaseUrl);
        return {
            host: url.hostname,
            port: parseInt(url.port, 10),
            username: url.username,
            password: url.password,
            database: url.pathname.substring(1),
        };
    }

    return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'venexpress',
    };
}

async function seed() {
    const dbConfig = parseDatabaseUrl();

    const dataSource = new DataSource({
        type: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
        entities: [join(__dirname, '/../../../**/*.entity{.ts,.js}')],
        synchronize: true,
    });

    await dataSource.initialize();

    console.log('🧹 Limpiando base de datos...');

    // El orden importa debido a las llaves foráneas
    const tables = [
        'transaction_history',
        'venezuela_payments',
        'transactions',
        'beneficiaries',
        'clients',
        'exchange_rates',
        'users',
        'points'
    ];

    for (const table of tables) {
        await dataSource.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
    }

    console.log('✅ Base de datos vaceada');
    console.log('🌱 Iniciando seed mínimo...\\n');

    // 1. CREAR PUNTO FÍSICO
    console.log('📍 Creando punto físico...');
    const pointRepo = dataSource.getRepository(Point);

    const puntoExpress = pointRepo.create({
        name: 'Punto Express',
        address: 'Calle Principal #123, Bogotá',
        phone: '3001234567',
    });

    await pointRepo.save(puntoExpress);
    console.log('✅ Punto físico creado\\n');

    // 2. CREAR USUARIOS
    console.log('👥 Creando usuarios...');
    const userRepo = dataSource.getRepository(User);
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const adminColombia = userRepo.create({
        name: 'Admin Colombia',
        email: 'adminC@gmail.com',
        phone: '3001111111',
        password: hashedPassword,
        role: UserRole.ADMIN_COLOMBIA,
    });

    const adminVenezuela = userRepo.create({
        name: 'Admin Venezuela',
        email: 'adminV@gmail.com',
        phone: '4121111111',
        password: hashedPassword,
        role: UserRole.ADMIN_VENEZUELA,
    });

    const vendedorCarlos = userRepo.create({
        name: 'Carlos Vendedor',
        email: 'carlos@gmail.com',
        phone: '3002222222',
        password: hashedPassword,
        role: UserRole.VENDEDOR,
        pointId: puntoExpress.id,
    });

    await userRepo.save([adminColombia, adminVenezuela, vendedorCarlos]);
    console.log('✅ 3 usuarios creados (adminC, adminV, carlos)\\n');

    // 3. CREAR TASA DE CAMBIO
    console.log('💱 Creando tasa de cambio...');
    const rateRepo = dataSource.getRepository(ExchangeRate);

    const rate = rateRepo.create({
        saleRate: 7.8,
        createdBy: adminVenezuela,
    });

    await rateRepo.save(rate);
    console.log('✅ Tasa de cambio establecida en 7.8\\n');

    console.log('🎉 Seed completado exitosamente!\\n');
    console.log('📧 CREDENCIALES DE ACCESO:');
    console.log('   ┌─────────────────────────────────────────────────────┐');
    console.log('   │ Admin Colombia: adminC@gmail.com / admin123        │');
    console.log('   │ Admin Venezuela: adminV@gmail.com / admin123       │');
    console.log('   │ Vendedor: carlos@gmail.com / admin123              │');
    console.log('   └─────────────────────────────────────────────────────┘\\n');

    await dataSource.destroy();
}

seed().catch((error) => {
    console.error('❌ Error en seed:', error);
    process.exit(1);
});
