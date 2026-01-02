import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVendorPaymentProofUrlToTransactions1735800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');

    if (!table) {
      return;
    }

    // Check if column already exists
    if (!table.findColumnByName('vendor_payment_proof_url')) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'vendor_payment_proof_url',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    if (table && table.findColumnByName('vendor_payment_proof_url')) {
      await queryRunner.dropColumn('transactions', 'vendor_payment_proof_url');
    }
  }
}

