import { test, expect } from "../../auth/tests/fixtures";
import { onboard, write, ceremony } from "./fixtures";

test("color is required, allowlisted and persisted on creation and editing", async ({
  request,
  database,
}) => {
  await onboard(request);
  const withoutColor: Partial<typeof ceremony> = { ...ceremony };
  delete withoutColor.color;
  expect((await write(request, "functions", withoutColor)).status()).toBe(422);
  expect(
    (
      await write(request, "functions", {
        ...ceremony,
        color: "javascript:red",
      })
    ).status(),
  ).toBe(422);
  const created = await write(request, "functions", {
    ...ceremony,
    color: "marigold",
  });
  expect(created.status()).toBe(201);
  const item = (await created.json()).data.function;
  expect(item.color).toBe("marigold");
  const edited = await write(
    request,
    `functions/${item.id}`,
    { ...ceremony, color: "plum", revision: 1 },
    "PATCH",
  );
  expect(edited.status()).toBe(200);
  expect((await edited.json()).data.function.color).toBe("plum");
  expect((await database.collection("functions").findOne({}))!.color).toBe(
    "plum",
  );
});

test("existing colorless records retain the copper accent without a database rewrite", async ({
  request,
  database,
}) => {
  await onboard(request);
  await write(request, "functions", ceremony);
  await database
    .collection("functions")
    .updateOne({}, { $unset: { color: "" } });
  const list = (await (await request.get("/api/v1/functions")).json()).data
    .functions;
  expect(list[0].color).toBe("copper");
  expect(
    (await database.collection("functions").findOne({}))!.color,
  ).toBeUndefined();
});
