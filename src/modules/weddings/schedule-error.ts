export class WeddingScheduleError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string>,
  ) {
    super(message);
  }
}
