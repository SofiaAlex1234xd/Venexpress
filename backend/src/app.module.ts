import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/database.config';

// Módulos
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PointsModule } from './modules/points/points.module';
import { ClientsModule } from './modules/clients/clients.module';
import { BeneficiariesModule } from './modules/beneficiaries/beneficiaries.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { RatesModule } from './modules/rates/rates.module';
import { ProofsModule } from './modules/proofs/proofs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AccountsModule } from './modules/accounts/accounts.module';

@Module({
  imports: [
    // Configuración global
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Base de datos
    TypeOrmModule.forRoot(typeOrmConfig),

    // Módulos de la aplicación
    AuthModule,
    UsersModule,
    PointsModule,
    ClientsModule,
    BeneficiariesModule,
    TransactionsModule,
    RatesModule,
    ProofsModule,
    NotificationsModule,
    AccountsModule,
  ],
})
export class AppModule {}

