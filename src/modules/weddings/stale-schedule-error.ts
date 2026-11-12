export class StaleWeddingScheduleError extends Error {
  constructor(
    public wedding: {
      revision: number;
      startsOn: string;
      endsOn: string;
      timeZone: string;
      title: string;
    },
  ) {
    super(
      "The wedding dates or time zone changed. Your entries are preserved. Review them against the updated wedding schedule before saving again.",
    );
  }
}
