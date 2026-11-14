export function parseRupees(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a positive amount with up to two decimal places.");
  const [rupees, paise = ""] = value.split(".");
  const amount = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000_000)
    throw new Error("Enter an amount between ₹0.01 and ₹10,00,00,000.");
  return amount;
}
