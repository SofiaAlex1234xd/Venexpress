import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCommissionAndAdminIdToUsers1735600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable('users');

    if (!usersTable.findColumnByName('commission')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'commission',
          type: 'int',
          isNullable: true,
          comment: 'Comisión: 2 o 5%',
        }),
      );
    }

    if (!usersTable.findColumnByName('adminId')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'adminId',
          type: 'int',
          isNullable: true,
          comment: 'ID del Admin a quien pertenece este vendedor',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable('users');

    if (usersTable.findColumnByName('commission')) {
      await queryRunner.dropColumn('users', 'commission');
    }

    if (usersTable.findColumnByName('adminId')) {
      await queryRunner.dropColumn('users', 'adminId');
    }
  }
}
