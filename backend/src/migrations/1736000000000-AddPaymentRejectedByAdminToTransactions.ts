import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPaymentRejectedByAdminToTransactions1736000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');

    if (!table.findColumnByName('payment_rejected_by_admin')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'payment_rejected_by_admin',
          type: 'boolean',
          default: false,
          isNullable: false,
          comment: 'Indica si el pago fue rechazado por el administrador',
        }),
      );
    }

    if (!table.findColumnByName('payment_rejected_at')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'payment_rejected_at',
          type: 'timestamptz',
          isNullable: true,
          comment: 'Fecha en que el administrador rechazó el pago',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    if (table.findColumnByName('payment_rejected_at')) {
      await queryRunner.dropColumn('transactions', 'payment_rejected_at');
    }
    if (table.findColumnByName('payment_rejected_by_admin')) {
      await queryRunner.dropColumn('transactions', 'payment_rejected_by_admin');
    }
  }
}

