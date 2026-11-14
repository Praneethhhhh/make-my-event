import type mongoose from "mongoose";
type Totals = { actualPaid: number; outstanding: number };
export function migrate(
  db: mongoose.mongo.Db,
  weddingId: mongoose.Types.ObjectId,
  options?: {
    apply?: boolean;
    revision?: number;
    title?: string;
    backupDir?: string;
  },
): Promise<{
  weddingId: string;
  revision: number;
  counts: Record<string, number>;
  before: Totals;
  after?: Totals;
  apply: boolean;
}>;
