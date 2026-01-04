export interface Account {
  id: number;
  name: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountTransaction {
  id: number;
  account: Account;
  amount: number;
  type: 'deposit' | 'withdrawal';
  transaction?: {
    id: number;
  };
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

export interface AccountSummary {
  accounts: Account[];
  totalBalance: number;
  recentTransactions: AccountTransaction[];
}

export interface CreateAccountDto {
  name: string;
  initialBalance?: number;
}

export interface AddBalanceDto {
  amount: number;
  description?: string;
}

