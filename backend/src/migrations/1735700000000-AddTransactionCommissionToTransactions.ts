import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTransactionCommissionToTransactions1735700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const transactionsTable = await queryRunner.getTable('transactions');

    if (!transactionsTable.findColumnByName('transaction_commission')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'transaction_commission',
          type: 'decimal',
          precision: 5,
          scale: 2,
          isNullable: true,
          comment: 'Comisión específica de esta transacción (2%, 4%, 5%, etc.)',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const transactionsTable = await queryRunner.getTable('transactions');

    if (transactionsTable.findColumnByName('transaction_commission')) {
      await queryRunner.dropColumn('transactions', 'transaction_commission');
    }
  }
}

