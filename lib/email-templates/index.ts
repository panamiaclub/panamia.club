import { profileSubmitted } from './profile-submitted';
import { profilePublished } from './profile-published';
import { profileNotPublished } from './profile-not-published';
import { adminNewsletter } from './admin-newsletter';
import { adminProfile } from './admin-profile';
import { adminAffiliate } from './admin-affiliate';
import { eventRsvpConfirm } from './event-rsvp-confirm';
import { contactReceived } from './contact-received';
import { adminContact } from './admin-contact';
import { listingClaim } from './listing-claim';
import { listingSetup } from './listing-setup';
import { shopOrder } from './shop-order';
import { adminShopOrder } from './admin-shop-order';

export type TemplateId =
  | 'profile.submitted'
  | 'profile.published'
  | 'profile.not_published'
  | 'admin.newsletter_submission'
  | 'admin.profile_submission'
  | 'admin.affiliate_submission'
  | 'admin.contact_submission'
  | 'event.rsvp_confirm'
  | 'contact.received'
  | 'listing.claim'
  | 'listing.setup'
  | 'shop.order'
  | 'admin.shop_order';

type TemplateRenderer = (params: Record<string, unknown>) => {
  subject: string;
  html: string;
  text: string;
};

const templates: Record<TemplateId, TemplateRenderer> = {
  'profile.submitted': profileSubmitted,
  'profile.published': profilePublished,
  'profile.not_published': profileNotPublished,
  'admin.newsletter_submission': adminNewsletter,
  'admin.profile_submission': adminProfile,
  'admin.affiliate_submission': adminAffiliate,
  'admin.contact_submission': adminContact,
  'event.rsvp_confirm': eventRsvpConfirm,
  'contact.received': contactReceived,
  'listing.claim': listingClaim,
  'listing.setup': listingSetup,
  'shop.order': shopOrder,
  'admin.shop_order': adminShopOrder,
};

export function renderTemplate(
  id: TemplateId,
  params: Record<string, unknown>
): { subject: string; html: string; text: string } {
  const renderer = templates[id];
  if (!renderer) {
    throw new Error(`Unknown email template: ${id}`);
  }
  return renderer(params);
}
