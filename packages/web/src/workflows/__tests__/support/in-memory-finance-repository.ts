export interface TestCategory {
  id: string;
  name: string;
  createdAt: string;
}

export interface TestTransaction {
  id: string;
  userId: string;
  name: string;
  amount: number;
  categoryId: string;
  sourceFileId?: string;
}

type RepositoryOperation =
  | "listCategories"
  | "saveCategory"
  | "listTransactions"
  | "findTransactionBySourceFile"
  | "saveTransaction";

export class InMemoryFinanceRepository {
  readonly #categories = new Map<string, Map<string, TestCategory>>();
  readonly #transactions = new Map<string, Map<string, TestTransaction>>();
  readonly #failures = new Map<RepositoryOperation, Error>();

  failNext(operation: RepositoryOperation, error = new Error(`${operation} failed`)): void {
    this.#failures.set(operation, error);
  }

  async listCategories(userId: string): Promise<TestCategory[]> {
    this.throwIfFailed("listCategories");
    return this.cloneValues(this.#categories.get(userId));
  }

  async saveCategory(userId: string, category: TestCategory): Promise<TestCategory> {
    this.throwIfFailed("saveCategory");
    this.userMap(this.#categories, userId).set(category.id, structuredClone(category));
    return structuredClone(category);
  }

  async listTransactions(userId: string): Promise<TestTransaction[]> {
    this.throwIfFailed("listTransactions");
    return this.cloneValues(this.#transactions.get(userId));
  }

  async findTransactionBySourceFile(
    userId: string,
    sourceFileId: string,
  ): Promise<TestTransaction | undefined> {
    this.throwIfFailed("findTransactionBySourceFile");
    const transaction = [...(this.#transactions.get(userId)?.values() ?? [])].find(
      (candidate) => candidate.sourceFileId === sourceFileId,
    );
    return transaction ? structuredClone(transaction) : undefined;
  }

  async saveTransaction(
    userId: string,
    transaction: Omit<TestTransaction, "userId">,
  ): Promise<TestTransaction> {
    this.throwIfFailed("saveTransaction");
    const stored = { ...structuredClone(transaction), userId };
    this.userMap(this.#transactions, userId).set(stored.id, stored);
    return structuredClone(stored);
  }

  clear(): void {
    this.#categories.clear();
    this.#transactions.clear();
    this.#failures.clear();
  }

  private throwIfFailed(operation: RepositoryOperation): void {
    const error = this.#failures.get(operation);
    if (!error) return;
    this.#failures.delete(operation);
    throw error;
  }

  private userMap<Value>(
    storage: Map<string, Map<string, Value>>,
    userId: string,
  ): Map<string, Value> {
    const existing = storage.get(userId);
    if (existing) return existing;
    const created = new Map<string, Value>();
    storage.set(userId, created);
    return created;
  }

  private cloneValues<Value>(values: Map<string, Value> | undefined): Value[] {
    return structuredClone([...(values?.values() ?? [])]);
  }
}
