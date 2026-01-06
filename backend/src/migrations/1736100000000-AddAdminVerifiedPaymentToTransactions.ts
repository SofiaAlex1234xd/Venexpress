import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAdminVerifiedPaymentToTransactions1736100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const transactionsTable = await queryRunner.getTable('transactions');

    if (!transactionsTable.findColumnByName('admin_verified_payment')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'admin_verified_payment',
          type: 'boolean',
          default: false,
        }),
      );
    }

    if (!transactionsTable.findColumnByName('admin_verified_payment_at')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'admin_verified_payment_at',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const transactionsTable = await queryRunner.getTable('transactions');

    if (transactionsTable.findColumnByName('admin_verified_payment')) {
      await queryRunner.dropColumn('transactions', 'admin_verified_payment');
    }

    if (transactionsTable.findColumnByName('admin_verified_payment_at')) {
      await queryRunner.dropColumn('transactions', 'admin_verified_payment_at');
    }
  }
}

