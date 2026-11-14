export function ActionIcon({ name }: { name: "edit" | "remove" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          name === "edit"
            ? "m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"
            : "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"
        }
      />
    </svg>
  );
}
