'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Check,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  UserPlus,
  Users,
} from 'lucide-react';

import { signOut } from '@/lib/auth-client';
import { useMyGroups } from '@/lib/query/social';
import { useIdentity, type Identity } from './identity-provider';
import { MenuSurface } from './menu-surface';
import { PanaSites } from './pana-sites';
import styles from './identity.module.css';
import { cn } from '@/lib/utils';

/** Up to two initials, so "Café Curú" reads as CC rather than C. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** First word only — the masthead has room for a name, not a full one. */
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

/**
 * The picture if there is one, initials otherwise.
 *
 * `primaryImageCdn` has been travelling from listAdministeredProfiles through
 * to this component the whole time without ever being drawn, so a member who
 * set a photo in settings still saw their initials here.
 */
function Avatar({
  identity,
  large,
  bare,
}: {
  identity: Identity;
  large?: boolean;
  /** Skip the coloured disc — the tile it sits in already draws one. */
  bare?: boolean;
}) {
  return (
    <span
      className={cn(
        styles.avatar,
        !identity.isPersonal && styles.avatarBusiness,
        large && styles.avatarLg,
        bare && styles.avatarBare
      )}
      aria-hidden="true"
    >
      {identity.primaryImageCdn ? (
        // Plain <img>: the same call directory-suggest makes for these CDN
        // avatars, and next/image would want a configured remote pattern.
        <img
          src={identity.primaryImageCdn}
          alt=""
          className={styles.avatarImg}
        />
      ) : (
        initialsOf(identity.name ?? '?')
      )}
    </span>
  );
}

/**
 * The groups this member runs, and the way to start another.
 *
 * These are links, not identities. The acting-as list above changes whose
 * voice the app speaks in; this does not. A group post is authored by the
 * member and merely attributed to the group, so "acting as a group" is not a
 * state this system has — putting groups in the switcher would promise one.
 *
 * Only groups the member is an admin of are listed, mirroring the business
 * listings above: this section is the set of things you answer for, not
 * everything you belong to. Moderators are deliberately excluded — a
 * moderator approves join requests and removes posts, but cannot change
 * settings, manage roles or delete the group, so the group is not theirs to
 * be listed under. Moderated groups and plain memberships are reached through
 * the Groups tile in the grid below, which leads to /groups and lists every
 * group you are in regardless of role.
 *
 * There is no "All groups" row here any more. It pointed at /groups, which is
 * exactly where the Groups tile below already goes, so the menu offered the
 * same destination twice. It was defensible while /groups was a search box
 * over a flat list and this row was the only way to reach it; now that page
 * opens with your own groups, the row and the tile make the same promise and
 * keep it in the same place.
 *
 * "Start a group" is always here, including for a member who runs none. This
 * block used to render nothing in that case, to avoid a separator with an
 * empty section under it — but that left the menu permanently inviting you to
 * list a business while never once offering to start a group, and sent anyone
 * who wanted one through the Groups tile to find the button on /groups. The
 * heading is what's conditional now: "Groups you run" over an empty list is a
 * claim, where a lone CTA is just an offer.
 */
function MenuGroups({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation('common');
  const { data } = useMyGroups();

  const run = (data?.groups ?? []).filter((group) => group.role === 'admin');

  return (
    <>
      <div className={styles.separator} />

      {run.length > 0 && (
        <div className={styles.menuHeading}>{t('identity.yourGroups')}</div>
      )}
      {run.map((group) => (
        <Link
          key={group.id}
          href={`/g/${group.handle}`}
          role="menuitem"
          data-menu-row
          onClick={onNavigate}
          className={styles.row}
        >
          <span className={styles.addIcon} aria-hidden="true">
            <Users className="h-4 w-4" />
          </span>
          <span className={styles.rowMeta}>
            <span className={styles.rowName}>{group.name}</span>
            <span className={styles.rowHandle}>@{group.handle}</span>
          </span>
        </Link>
      ))}

      {/* Last rather than first: the groups you already run are what you came
          to this block for, and starting another is the afterthought. Matches
          "Get listed", which also sits under the identities it adds to. */}
      <Link
        href="/groups/new"
        role="menuitem"
        data-menu-row
        onClick={onNavigate}
        className={styles.row}
      >
        <span className={styles.addIcon} aria-hidden="true">
          <Plus className="h-4 w-4" />
        </span>
        <span className={styles.rowMeta}>
          <span className={styles.rowName}>{t('identity.startGroup')}</span>
          <span className={styles.rowHandle}>
            {t('identity.startGroupHint')}
          </span>
        </span>
      </Link>
    </>
  );
}

/**
 * The "acting as" menu in the masthead.
 *
 * One login can administer several profiles — the person's own, plus any
 * business listing they own or help run. This is where you choose which of
 * them the rest of the app speaks for, and — below that choice — where the
 * rest of the Pana world is listed.
 *
 * The frame itself (dropdown on desktop, bottom sheet on phones) lives in
 * MenuSurface, which the signed-out menu wears too, so the control a visitor
 * meets before they have an account is the one they keep afterwards.
 */
export function IdentityMenu() {
  const { t } = useTranslation('common');
  const identity = useIdentity();

  const active = identity?.active ?? null;

  /* Only the absence of a provider hides this. It deliberately does *not* bail
     on an empty identity list: a member who has just signed in for the first
     time has no profile yet, and this menu is where Sign Out lives. Hiding it
     from them would leave them with no way out of an account they only just
     created. MainHeader is what keeps it away from signed-out visitors. */
  if (!identity) return null;

  const {
    identities,
    activeId,
    personal,
    invitations,
    switching,
    answering,
    error,
    failed,
    loading,
    switchTo,
    answerInvitation,
    reload,
  } = identity;

  // Only claim the account is unfinished once we have actually heard back.
  const needsSetup = !loading && !failed && identities.length === 0;

  return (
    <MenuSurface
      label={
        active
          ? `${t('identity.switchAccount')} — ${active.name}`
          : t('identity.switchAccount')
      }
      triggerClassName={styles.trigger}
      trigger={
        <>
          {active ? (
            <Avatar identity={active} />
          ) : (
            <span className={styles.avatar} aria-hidden="true">
              ?
            </span>
          )}
          {active && (
            <span className={styles.triggerName}>
              {firstNameOf(active.name ?? '')}
            </span>
          )}
        </>
      }
      /* Pinned rather than last in the list. The account list grows with every
         business a member helps run, and the destination tiles sit above this,
         so on a short phone Sign Out was the row that fell below the fold — on
         the one menu that exists partly to provide it.

         Account settings used to sit here too; it is now the Account tile at
         the head of the grid, which is where the member's own face already is. */
      footer={(close) => (
        <>
          <div className={styles.separator} />

          {/* The one row in this menu you cannot undo by clicking again, so it
              is tinted — a speed bump, not an alarm. */}
          <button
            type="button"
            role="menuitem"
            data-menu-row
            onClick={() => {
              close(false);
              void signOut({ redirect: true, callbackUrl: '/' });
            }}
            className={cn(styles.row, styles.rowQuiet, styles.rowSignOut)}
          >
            <LogOut className="h-4 w-4 opacity-70" aria-hidden="true" />
            <span className={styles.rowMeta}>
              <span className={styles.rowName}>{t('nav.signOut')}</span>
            </span>
          </button>
        </>
      )}
    >
      {(close) => {
        async function onPick(profileId: string) {
          close(false);
          if (profileId !== activeId) await switchTo(profileId);
        }

        return (
          <>
            {/* Above the account list on purpose: it is the only thing in this
                menu asking the member a question, and it disappears the moment
                it is answered. */}
            {invitations.length > 0 && (
              <>
                <div className={styles.menuHeading}>
                  {t('identity.invitationHeading')}
                </div>
                {invitations.map((invite) => (
                  <div key={invite.profileId} className={styles.invite}>
                    <p className={styles.inviteText}>
                      <span className={styles.inviteName}>{invite.name}</span>
                      <span className={styles.inviteHint}>
                        {invite.businessEmail
                          ? t('identity.invitationListedAs', {
                              email: invite.businessEmail,
                            })
                          : t('identity.invitationHint')}
                      </span>
                    </p>
                    <div className={styles.inviteActions}>
                      <button
                        type="button"
                        className={styles.inviteButton}
                        disabled={answering !== null}
                        onClick={() =>
                          void answerInvitation(invite.profileId, 'accept')
                        }
                      >
                        {answering === invite.profileId
                          ? t('identity.invitationWorking')
                          : t('identity.invitationAccept')}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          styles.inviteButton,
                          styles.inviteDecline
                        )}
                        disabled={answering !== null}
                        onClick={() =>
                          void answerInvitation(invite.profileId, 'decline')
                        }
                      >
                        {t('identity.invitationDecline')}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {identities.length > 0 && (
              <div className={styles.menuHeading}>{t('identity.actingAs')}</div>
            )}

            {identities.map((item) => {
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  data-menu-row
                  disabled={switching !== null}
                  onClick={() => onPick(item.id)}
                  className={cn(styles.row, isActive && styles.rowActive)}
                >
                  <Avatar identity={item} />
                  <span className={styles.rowMeta}>
                    <span className={styles.rowName}>{item.name}</span>
                    <span className={styles.rowHandle}>
                      {item.screenname
                        ? `@${item.screenname}`
                        : item.isPersonal
                          ? t('identity.you')
                          : t('identity.directory')}
                    </span>
                  </span>

                  {item.active === false && (
                    <span className={styles.badge}>
                      {item.reviewState === 'pending'
                        ? t('identity.underReview')
                        : t('identity.inactive')}
                    </span>
                  )}
                  {item.isPersonal ? (
                    <span className={styles.badge}>{t('identity.you')}</span>
                  ) : (
                    <span className={styles.badge}>
                      {item.role === 'manager'
                        ? t('identity.manager')
                        : t('identity.owner')}
                    </span>
                  )}

                  {switching === item.id ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : isActive ? (
                    <Check className={styles.check} aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}

            {/* Takes the place of the account list for someone who has signed
                in but never claimed a handle. Without it the menu would open
                on nothing but Sign Out, with no hint as to why the account
                looks empty. */}
            {needsSetup && (
              <Link
                href="/welcome"
                role="menuitem"
                data-menu-row
                onClick={() => close(false)}
                className={styles.row}
              >
                <span className={styles.addIcon} aria-hidden="true">
                  <UserPlus className="h-4 w-4" />
                </span>
                <span className={styles.rowMeta}>
                  <span className={styles.rowName}>
                    {t('onboarding.finishSetup')}
                  </span>
                  <span className={styles.rowHandle}>
                    {t('onboarding.finishSetupHint')}
                  </span>
                </span>
              </Link>
            )}

            {/* The fetch failed and its retries are spent. Saying nothing here
                is what made a dropped connection look like a broken account:
                no rows, no setup nudge, no explanation.

                The button *is* the row rather than sitting inside one: the
                roving arrow-key walk calls focus() on every [data-menu-row],
                so a non-focusable wrapper would swallow a step. */}
            {failed && (
              <button
                type="button"
                role="menuitem"
                data-menu-row
                onClick={() => reload()}
                className={styles.row}
              >
                <span className={styles.addIcon} aria-hidden="true">
                  <RefreshCw className="h-4 w-4" />
                </span>
                <span className={styles.rowMeta}>
                  <span className={styles.rowName}>
                    {t('identity.loadFailed')}
                  </span>
                  <span className={styles.rowHandle}>
                    {t('identity.tryAgain')}
                  </span>
                </span>
              </button>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.separator} />

            <Link
              href="/account/user/edit#referrals"
              role="menuitem"
              data-menu-row
              onClick={() => close(false)}
              className={styles.row}
            >
              <span className={styles.addIcon} aria-hidden="true">
                <Share2 className="h-4 w-4" />
              </span>
              <span className={styles.rowMeta}>
                <span className={styles.rowName}>
                  {t('identity.referralLink')}
                </span>
                <span className={styles.rowHandle}>
                  {t('identity.referralLinkHint')}
                </span>
              </span>
            </Link>

            <Link
              href="/form/get-listed"
              role="menuitem"
              data-menu-row
              onClick={() => close(false)}
              className={styles.row}
            >
              <span className={styles.addIcon} aria-hidden="true">
                <Plus className="h-4 w-4" />
              </span>
              <span className={styles.rowMeta}>
                <span className={styles.rowName}>
                  {t('identity.getListed')}
                </span>
                <span className={styles.rowHandle}>
                  {t('identity.getListedHint')}
                </span>
              </span>
            </Link>

            <MenuGroups onNavigate={() => close(false)} />

            {/* Everything above is "who am I"; everything below is "where am
                I going" — and the member's own account is the first of those
                places, so it leads the grid rather than hiding in the footer. */}
            <PanaSites
              onNavigate={() => close(false)}
              leading={
                <Link
                  href="/account/user/edit"
                  role="menuitem"
                  data-menu-row
                  onClick={() => close(false)}
                  className={styles.tile}
                >
                  <span className={styles.tileIcon} aria-hidden="true">
                    {personal ? (
                      <Avatar identity={personal} bare />
                    ) : (
                      <Settings className="h-[18px] w-[18px]" />
                    )}
                  </span>
                  <span className={styles.tileLabel}>
                    {t('identity.account')}
                  </span>
                </Link>
              }
            />
          </>
        );
      }}
    </MenuSurface>
  );
}
