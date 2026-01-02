import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddHasCustomRateToTransactions1735700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('transactions');

        if (!table) {
            return;
        }

        // Check if column already exists
        if (!table.findColumnByName('has_custom_rate')) {
            await queryRunner.addColumn(
                'transactions',
                new TableColumn({
                    name: 'has_custom_rate',
                    type: 'boolean',
                    default: false,
                }),
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('transactions');
        if (table && table.findColumnByName('has_custom_rate')) {
            await queryRunner.dropColumn('transactions', 'has_custom_rate');
        }
    }
}

