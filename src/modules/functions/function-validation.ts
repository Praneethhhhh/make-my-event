import { z } from "zod";
import { colorValues } from "./function-colors";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .refine(
      (value) => !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\r\n\t]/g, "")),
      "Remove control characters.",
    );
const instant = z.iso.datetime({ offset: true });
export const functionInput = z
  .strictObject({
    name: text(120).min(1, "Enter a function name."),
    color: z.enum(colorValues, { error: "Choose a function color." }),
    description: text(2000).default(""),
    startsAt: instant,
    endsAt: instant.nullable().default(null),
    venue: z
      .strictObject({
        name: text(160).default(""),
        address: text(500).default(""),
        city: text(120).default(""),
        state: text(120).default(""),
        latitude: z
          .number({ error: "Enter a valid latitude." })
          .min(-90, "Latitude must be between -90 and 90.")
          .max(90, "Latitude must be between -90 and 90.")
          .nullable()
          .default(null),
        longitude: z
          .number({ error: "Enter a valid longitude." })
          .min(-180, "Longitude must be between -180 and 180.")
          .max(180, "Longitude must be between -180 and 180.")
          .nullable()
          .default(null),
        mapUrl: z
          .union([
            z.literal(""),
            z
              .url()
              .max(2000)
              .refine((value) => {
                const url = new URL(value);
                return (
                  url.protocol === "https:" &&
                  (url.hostname === "maps.app.goo.gl" ||
                    url.hostname === "maps.google.com" ||
                    url.hostname === "www.google.com" ||
                    url.hostname === "google.com")
                );
              }, "Use an HTTPS Google Maps URL."),
          ])
          .default(""),
        directionsNotes: text(1000).default(""),
      })
      .default({
        name: "",
        address: "",
        city: "",
        state: "",
        latitude: null,
        longitude: null,
        mapUrl: "",
        directionsNotes: "",
      }),
    dressCode: text(300).default(""),
    guestInstructions: text(2000).default(""),
  })
  .superRefine((value, context) => {
    if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt))
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after the start time.",
      });
    if ((value.venue.latitude === null) !== (value.venue.longitude === null))
      context.addIssue({
        code: "custom",
        path: ["venue.latitude"],
        message: "Enter both latitude and longitude, or leave both empty.",
      });
  });
export type FunctionInput = z.infer<typeof functionInput>;
export const functionMutationInput = functionInput.safeExtend({
  weddingRevision: z.number().int().min(1),
});
export type FunctionDto = FunctionInput & {
  id: string;
  revision: number;
  status: "ACTIVE";
};
