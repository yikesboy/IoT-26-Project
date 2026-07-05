import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { dbURI } from "@/lib/db";

const langchainStore = PostgresStore.fromConnString(dbURI);
await langchainStore.setup();

export default langchainStore;
