import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateAccountsTables1735800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const accountsTableExists = await queryRunner.hasTable('accounts');
    
    // Crear tabla accounts si no existe
    if (!accountsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'accounts',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'name',
              type: 'varchar',
            },
            {
              name: 'balance',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
            },
            {
              name: 'ownerId',
              type: 'int',
            },
            {
              name: 'createdAt',
              type: 'timestamptz',
              default: 'now()',
            },
            {
              name: 'updatedAt',
              type: 'timestamptz',
              default: 'now()',
            },
          ],
        }),
        true,
      );

      // Crear foreign key para owner
      await queryRunner.createForeignKey(
        'accounts',
        new TableForeignKey({
          columnNames: ['ownerId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'CASCADE',
        }),
      );
    } else {
      // Si la tabla ya existe, verificar si la foreign key existe
      const accountsTable = await queryRunner.getTable('accounts');
      const ownerForeignKey = accountsTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('ownerId') !== -1,
      );
      if (!ownerForeignKey) {
        await queryRunner.createForeignKey(
          'accounts',
          new TableForeignKey({
            columnNames: ['ownerId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'CASCADE',
          }),
        );
      }
    }

    // Crear tabla account_transactions si no existe
    const accountTransactionsTableExists = await queryRunner.hasTable('account_transactions');
    
    if (!accountTransactionsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'account_transactions',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'accountId',
              type: 'int',
            },
            {
              name: 'amount',
              type: 'decimal',
              precision: 12,
              scale: 2,
            },
            {
              name: 'type',
              type: 'enum',
              enum: ['deposit', 'withdrawal'],
            },
            {
              name: 'transactionId',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'description',
              type: 'varchar',
              isNullable: true,
            },
            {
              name: 'balanceBefore',
              type: 'decimal',
              precision: 12,
              scale: 2,
            },
            {
              name: 'balanceAfter',
              type: 'decimal',
              precision: 12,
              scale: 2,
            },
            {
              name: 'createdAt',
              type: 'timestamptz',
              default: 'now()',
            },
          ],
        }),
        true,
      );

      // Crear foreign keys
      await queryRunner.createForeignKey(
        'account_transactions',
        new TableForeignKey({
          columnNames: ['accountId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'accounts',
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'account_transactions',
        new TableForeignKey({
          columnNames: ['transactionId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'transactions',
          onDelete: 'SET NULL',
        }),
      );
    } else {
      // Si la tabla ya existe, verificar si las foreign keys existen
      const accountTransactionsTable = await queryRunner.getTable('account_transactions');
      
      const accountForeignKey = accountTransactionsTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('accountId') !== -1,
      );
      if (!accountForeignKey) {
        await queryRunner.createForeignKey(
          'account_transactions',
          new TableForeignKey({
            columnNames: ['accountId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'accounts',
            onDelete: 'CASCADE',
          }),
        );
      }

      const transactionForeignKey = accountTransactionsTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('transactionId') !== -1,
      );
      if (!transactionForeignKey) {
        await queryRunner.createForeignKey(
          'account_transactions',
          new TableForeignKey({
            columnNames: ['transactionId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'transactions',
            onDelete: 'SET NULL',
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar foreign keys de account_transactions
    const accountTransactionsTable = await queryRunner.getTable('account_transactions');
    const accountForeignKey = accountTransactionsTable.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('accountId') !== -1,
    );
    const transactionForeignKey = accountTransactionsTable.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('transactionId') !== -1,
    );
    if (accountForeignKey) {
      await queryRunner.dropForeignKey('account_transactions', accountForeignKey);
    }
    if (transactionForeignKey) {
      await queryRunner.dropForeignKey('account_transactions', transactionForeignKey);
    }

    // Eliminar tabla account_transactions
    await queryRunner.dropTable('account_transactions');

    // Eliminar foreign key de accounts
    const accountsTable = await queryRunner.getTable('accounts');
    const ownerForeignKey = accountsTable.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('ownerId') !== -1,
    );
    if (ownerForeignKey) {
      await queryRunner.dropForeignKey('accounts', ownerForeignKey);
    }

    // Eliminar tabla accounts
    await queryRunner.dropTable('accounts');
  }
}

