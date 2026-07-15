import ipaddr from "ipaddr.js";
import { z } from "zod";
import { ApplicationError } from "../../shared/errors/application-error.js";
import type { IpAddress } from "./ip-intelligence.types.js";

export const lookupRequestSchema = z.object({ ip: z.string() }).strict();

export function parseIpAddress(value: unknown): IpAddress {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input || input.includes("/") || input.includes("%") || !ipaddr.isValid(input)) {
    throw new ApplicationError(400, "INVALID_IP", "Enter a valid IPv4 or IPv6 address.");
  }
  const parsed = ipaddr.parse(input);
  const dottedSuffix = input.slice(input.lastIndexOf(":") + 1);
  const ipv4Text = parsed.kind() === "ipv4" ? input : dottedSuffix;
  if (
    (parsed.kind() === "ipv4" || input.includes(".")) &&
    !ipaddr.IPv4.isValidFourPartDecimal(ipv4Text)
  ) {
    throw new ApplicationError(400, "INVALID_IP", "Enter a valid IPv4 or IPv6 address.");
  }
  return parsed.toString() as IpAddress;
}
