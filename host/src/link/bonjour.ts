import { networkInterfaces } from "node:os";
import { Bonjour } from "bonjour-service";

/** The Bonjour service type the phone looks for. */
export const SERVICE_TYPE = "openfantasia";

/**
 * Tells phones on the same network where this Mac is (openspec mac-link: The phone finds the Mac on the network
 * they share). The Mac's id goes in the TXT record, so a phone finds the Mac it paired with and no other.
 */
export function advertise(hostId: string, hostName: string, port: number): () => void {
  const bonjour = new Bonjour();
  bonjour.publish({ name: `Open Fantasia on ${hostName}`, type: SERVICE_TYPE, port, txt: { id: hostId } });
  return () => {
    bonjour.unpublishAll(() => bonjour.destroy());
  };
}

/** The Mac's IPv4 addresses on its networks, for the pairing QR code. */
export function localAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap(addresses => addresses ?? [])
    .filter(address => address.family === "IPv4" && !address.internal)
    .map(address => address.address);
}
