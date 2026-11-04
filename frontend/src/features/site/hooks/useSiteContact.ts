import { useAsync } from "../../../shared/hooks/useAsync";
import { publicApi } from "../api/public.api";

/** Public contact details (phone, email, address…) managed by the Administrator. */
export function useSiteContact() {
  return useAsync(() => publicApi.contact(), []);
}

/** `tel:` href from a human phone string. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
/** WhatsApp click-to-chat link from a phone string. */
export const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
/** Embeddable Google Maps URL for an address (no API key needed). */
export const mapEmbedHref = (address: string) => `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
