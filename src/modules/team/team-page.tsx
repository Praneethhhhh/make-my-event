"use client";
import { useWeddingClient } from "@/modules/weddings/wedding-scope";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { WeddingHeader } from "@/modules/weddings/wedding-shell";
import { WorkspaceNav } from "@/modules/weddings/workspace-nav";
import {
  invitationInput,
  type MemberDto,
  type InvitationDto,
} from "./team-validation";
import "@/modules/weddings/wedding.css";
import "./team.css";
type Context = {
  displayName: string;
  userRole: "ADMIN" | "ORGANIZER";
  title: string;
  timeZone: string;
};
export function TeamPage() {
  const { fetch, markClean } = useWeddingClient();
  const router = useRouter();
  const [context, setContext] = useState<Context | null>(null);
  const [members, setMembers] = useState<MemberDto[] | null>(null);
  const [invitations, setInvitations] = useState<InvitationDto[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [role, setRole] = useState("ORGANIZER");
  const [email, setEmail] = useState("");
  const [expiry, setExpiry] = useState("48");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [revoke, setRevoke] = useState<InvitationDto | null>(null);
  const [revokeError, setRevokeError] = useState("");
  const [clock, setClock] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState<"MANUAL" | "EMAIL">(
    "MANUAL",
  );
  const [codeInvitation, setCodeInvitation] = useState<InvitationDto | null>(
    null,
  );
  const [visibleCode, setVisibleCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [replacement, setReplacement] = useState<InvitationDto | null>(null);
  const replacementDialog = useRef<HTMLDialogElement>(null);
  const replacementTrigger = useRef<HTMLButtonElement | null>(null);
  const codeDialog = useRef<HTMLDialogElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const codeTrigger = useRef<HTMLButtonElement | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [composeError, setComposeError] = useState("");
  const composer = useRef<HTMLDialogElement>(null);
  const memberDialog = useRef<HTMLDialogElement>(null);
  const [memberAction, setMemberAction] = useState<{
    member: MemberDto;
    remove: boolean;
  } | null>(null);
  const [memberRole, setMemberRole] = useState<"ADMIN" | "ORGANIZER">(
    "ORGANIZER",
  );
  const [memberError, setMemberError] = useState("");
  const memberTrigger = useRef<HTMLButtonElement | null>(null);
  const lock = useRef(false);
  const requestKey = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const sendButton = useRef<HTMLButtonElement>(null);
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!visibleCode) return;
    const hide = () => {
      setVisibleCode("");
      setCodeNotice("Code hidden for privacy. Show it again if needed.");
    };
    const visibility = () => {
      if (document.hidden) hide();
    };
    const timer = setTimeout(hide, 60000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [visibleCode]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const refreshInvitations = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch("/api/v1/member-invitations", {
        cache: "no-store",
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw new Error();
      const invitations = (await response.json()).data.invitations;
      if (signal?.aborted) return;
      setInvitations(invitations);
      setClock(Date.now());
      setInviteError("");
    },
    [fetch],
  );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const options = {
          cache: "no-store",
          ...(signal ? { signal } : {}),
        } as const;
        const [me, wedding, roster] = await Promise.all([
          fetch("/api/v1/auth/me", options),
          fetch("/api/v1/wedding", options),
          fetch("/api/v1/members", options),
        ]);
        if (signal?.aborted) return;
        if (me.status === 401) return router.replace("/sign-in");
        if (wedding.status === 404) return undefined;
        if (!me.ok || !wedding.ok || !roster.ok) throw new Error();
        const account = (await me.json()).data,
          profile = (await wedding.json()).data;
        const members = (await roster.json()).data.members;
        if (signal?.aborted) return;
        setLoadError("");
        setContext({
          displayName: account.user.displayName,
          userRole: profile.role,
          title: profile.wedding.title,
          timeZone: profile.wedding.timeZone,
        });
        setMembers(members);
        if (profile.role === "ADMIN") {
          try {
            await refreshInvitations(signal);
          } catch {
            if (signal?.aborted) return;
            setInviteError(
              "Couldn’t load invitations. Your team is still available.",
            );
          }
        }
      } catch {
        if (signal?.aborted) return;
        setLoadError("Couldn’t load your team. Please try again.");
      }
    },
    [router, refreshInvitations, fetch],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const pending =
    invitations?.filter(
      (item) => item.status === "PENDING" && Date.parse(item.expiresAt) > clock,
    ) ?? [];
  const roleName = (value: string) =>
    value === "ADMIN" ? "Administrator" : "Organizer";
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: context?.timeZone ?? "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const deliveryLabel = (status: InvitationDto["emailStatus"]) =>
    status === "ACCEPTED"
      ? "Email accepted by Resend · Delivery not confirmed"
      : status === "FAILED"
        ? "Email failed · Revoke before sending a replacement"
        : status === "UNKNOWN" || status === "SENDING"
          ? "Email delivery unconfirmed · Check with the recipient before replacing"
          : "Email not sent";
  async function send(
    event?: FormEvent<HTMLFormElement>,
    target?: { email: string; role: string },
  ) {
    event?.preventDefault();
    if (lock.current || uncertain) return;
    const parsed = invitationInput.safeParse({
      deliveryMethod,
      role: target?.role ?? role,
      expiresInHours: Number(expiry),
      intendedEmail: target?.email ?? email,
      ...(deliveryMethod === "EMAIL" ? { subject, message } : {}),
    });
    if (!parsed.success) {
      setComposeError(
        parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      );
      (
        composer.current?.querySelector("input") as HTMLInputElement | null
      )?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setFormError("");
    setEmailError("");
    setNotice("");
    requestKey.current ??= crypto.randomUUID();
    let submitted = false;
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const token = (await csrf.json()).data.token;
      submitted = true;
      const response = await fetch("/api/v1/member-invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
          "Idempotency-Key": requestKey.current,
        },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json();
      if (!response.ok) {
        if (
          (response.status >= 500 &&
            body.error?.code !== "EMAIL_NOT_CONFIGURED") ||
          body.error?.code === "INVITATION_ALREADY_CREATED"
        )
          setUncertain(true);
        else requestKey.current = null;
        setFormError(
          body.error?.message ??
            "Couldn’t send the invitation. Please try again.",
        );
        return;
      }
      const invitation: InvitationDto = body.data.invitation;
      markClean();
      composer.current?.close();
      sendButton.current?.focus();
      if (deliveryMethod === "MANUAL") {
        setCodeInvitation(invitation);
        setVisibleCode("");
        setCodeError("");
        setCodeNotice("");
        codeDialog.current?.showModal();
      }
      requestKey.current = null;
      setInvitations((current) => [invitation, ...(current ?? [])]);
      setClock(Date.now());
      setNotice(
        invitation.deliveryMethod === "MANUAL"
          ? "Invitation code generated. Email was not requested; reveal and share it privately."
          : invitation.emailStatus === "ACCEPTED"
            ? "Invitation email accepted by Resend. Inbox delivery is not confirmed."
            : "Invitation created, but email delivery was not confirmed. Review its status before sending another.",
      );
      try {
        await refreshInvitations();
      } catch {
        setInviteError(
          "Invitation created, but the list could not refresh. Try again.",
        );
      }
    } catch {
      if (submitted) {
        setUncertain(true);
        setFormError(
          "We couldn’t confirm whether the invitation was sent. Refresh invitations before trying again to avoid duplicates.",
        );
      } else
        setFormError(
          "Couldn’t connect. Your entries are preserved; try sending again.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function reviewEmail(
    event?: FormEvent<HTMLFormElement>,
    replacement?: InvitationDto,
  ) {
    event?.preventDefault();
    if (busy || uncertain) return;
    const recipient = replacement?.intendedEmail ?? email;
    const parsed = invitationInput.safeParse({
      deliveryMethod,
      intendedEmail: recipient,
      role: replacement?.role ?? role,
      expiresInHours: Number(expiry),
    });
    if (!parsed.success) {
      setEmailError(
        parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      );
      emailInput.current?.focus();
      return;
    }
    if (replacement) {
      setEmail(recipient);
      setRole(replacement.role);
    }
    if (deliveryMethod === "MANUAL") {
      void send(undefined, {
        email: recipient,
        role: replacement?.role ?? role,
      });
      return;
    }
    setSubject(
      `Join the organizing team for ${context?.title ?? "our wedding"}`,
    );
    setMessage(
      `Hello,\n\nWe’d love your help planning ${context?.title ?? "our wedding"}. You’re invited to join as ${roleName(replacement?.role ?? role).toLowerCase()}. Together we can coordinate our functions and keep everyone in sync.\n\nLooking forward to planning with you!`,
    );
    setComposeError("");
    setFormError("");
    composer.current?.showModal();
  }
  function closeComposer() {
    if (busy) return;
    composer.current?.close();
    sendButton.current?.focus();
  }
  function closeCode() {
    codeDialog.current?.close();
    setVisibleCode("");
    setCodeInvitation(null);
    setCodeError("");
    setCodeNotice("");
    (codeTrigger.current ?? sendButton.current)?.focus();
  }
  async function revealCode() {
    if (!codeInvitation || lock.current) return;
    lock.current = true;
    setBusy(true);
    setCodeError("");
    setCodeNotice("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(
        `/api/v1/member-invitations/${codeInvitation.id}/reveal`,
        {
          method: "POST",
          headers: { "X-CSRF-Token": (await csrf.json()).data.token },
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setVisibleCode("");
        setCodeError(body.error?.message ?? "Couldn’t reveal this code.");
        return;
      }
      if (!/^[A-Za-z0-9_-]{12}$/.test(body.data.code)) throw new Error();
      setVisibleCode(body.data.code);
    } catch {
      setCodeError("Couldn’t reveal the code. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function copyCode() {
    if (!visibleCode) return;
    try {
      await navigator.clipboard.writeText(visibleCode);
      setCodeNotice(
        "Code copied. Share it privately with the intended recipient.",
      );
    } catch {
      codeInput.current?.focus();
      codeInput.current?.select();
      setCodeNotice(
        "Clipboard unavailable. The code is selected; copy it manually.",
      );
    }
  }
  function closeMember() {
    memberDialog.current?.close();
    setMemberAction(null);
    memberTrigger.current?.focus();
  }
  async function saveMember() {
    if (!memberAction || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMemberError("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(
        `/api/v1/members/${memberAction.member.id}`,
        {
          method: memberAction.remove ? "DELETE" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": (await csrf.json()).data.token,
          },
          body: JSON.stringify({
            revision: memberAction.member.revision,
            ...(!memberAction.remove ? { role: memberRole } : {}),
          }),
        },
      );
      if (!response.ok) {
        setMemberError(
          (await response.json()).error?.message ??
            "Couldn’t update access. Try again.",
        );
        return;
      }
      if (memberAction.member.isYou) {
        markClean();
        router.replace("/weddings");
        return;
      }
      const removed = memberAction.remove;
      closeMember();
      await load();
      setNotice(
        removed
          ? "Access removed for this wedding. Other weddings are unaffected."
          : "Role updated for this wedding.",
      );
    } catch {
      setMemberError(
        "Couldn’t confirm the change. Refresh your team before retrying.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await refreshInvitations();
      const roster = await fetch("/api/v1/members", { cache: "no-store" });
      if (roster.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!roster.ok) throw new Error();
      setMembers((await roster.json()).data.members);
      setUncertain(false);
      requestKey.current = null;
      setFormError("");
      setNotice(
        "Invitations refreshed. Review pending invitations before sending another. Revoke an unsuccessful invitation before sending its replacement.",
      );
    } catch {
      setInviteError("Couldn’t refresh invitations. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function closeRevoke() {
    dialog.current?.close();
    setRevoke(null);
    setRevokeError("");
    revokeTrigger.current?.focus();
  }
  async function confirmRevoke() {
    if (!revoke || lock.current) return;
    lock.current = true;
    setBusy(true);
    setRevokeError("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrf.ok) throw new Error();
      const response = await fetch(`/api/v1/member-invitations/${revoke.id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": (await csrf.json()).data.token },
      });
      if (!response.ok) {
        setRevokeError(
          (await response.json()).error?.message ??
            "Couldn’t revoke this invitation. Please try again.",
        );
        return;
      }
      setInvitations(
        (current) =>
          current?.map((item) =>
            item.id === revoke.id ? { ...item, status: "REVOKED" } : item,
          ) ?? null,
      );
      closeRevoke();
      setNotice("Invitation revoked. It can no longer be accepted.");
      setTimeout(() => sendButton.current?.focus(), 0);
    } catch {
      setRevokeError(
        "Couldn’t confirm revocation. Try again; revoking twice is safe.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!context || !members)
    return (
      <main className="wedding-page">
        <WeddingHeader displayName="Your family" />
        <WorkspaceNav active="team" />
        <div className="team-workspace">
          <h1>Your organizing team</h1>
          {loadError ? (
            <div role="alert" className="team-panel">
              <p>{loadError}</p>
              <button className="primary-action" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : (
            <section
              className="team-panel"
              aria-busy="true"
              aria-label="Loading team"
            >
              <p>Loading your team…</p>
              <div className="team-skeleton" />
              <div className="team-skeleton" />
              <div className="team-skeleton" />
            </section>
          )}
        </div>
      </main>
    );
  return (
    <main className="wedding-page">
      <WeddingHeader displayName={context.displayName} />
      <WorkspaceNav active="team" />
      <div className="team-workspace">
        <header className="team-heading">
          <p>{context.title}</p>
          <h1>Your organizing team</h1>
          <p>Invite trusted family members to plan together.</p>
          <span className="team-count">
            {members.length} active{" "}
            {members.length === 1 ? "member" : "members"}
            {context.userRole === "ADMIN" && invitations && !inviteError
              ? ` · ${pending.length} pending invitations`
              : ""}
          </span>
        </header>
        <div className="team-columns">
          <div>
            <section className="team-panel">
              <h2>Active team members</h2>
              {members.map((member) => (
                <article key={member.id} className="team-member">
                  <span className="team-avatar" aria-hidden="true">
                    {member.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {member.displayName}{" "}
                      {member.isYou && <small className="team-you">You</small>}
                    </strong>
                    <p>{member.email}</p>
                  </div>
                  <span className="team-role">{roleName(member.role)}</span>
                  {context.userRole === "ADMIN" && (
                    <div className="team-member-actions">
                      {([false, true] as const).map((remove) => (
                        <button
                          key={String(remove)}
                          className={`secondary-action ${remove ? "team-danger" : ""}`}
                          disabled={
                            busy ||
                            (member.role === "ADMIN" &&
                              members.filter((m) => m.role === "ADMIN")
                                .length === 1)
                          }
                          aria-label={`${remove ? "Remove access for" : "Change role for"} ${member.displayName}`}
                          onClick={(event) => {
                            memberTrigger.current = event.currentTarget;
                            setMemberAction({ member, remove });
                            setMemberRole(member.role);
                            setMemberError("");
                            memberDialog.current?.showModal();
                          }}
                        >
                          {remove ? "Remove access" : "Change role"}
                        </button>
                      ))}
                      {member.role === "ADMIN" &&
                        members.filter((m) => m.role === "ADMIN").length ===
                          1 && (
                          <small>
                            Last administrator — promote someone else first.
                          </small>
                        )}
                    </div>
                  )}
                </article>
              ))}
              <p className="team-note">
                Everyone shares the same wedding records. Only administrators
                can change access. At least one administrator must remain.
              </p>
            </section>
            {context.userRole === "ADMIN" ? (
              <section className="team-panel">
                <div className="team-section-heading">
                  <h2>Pending invitations</h2>
                  <button
                    className="secondary-action"
                    disabled={busy}
                    onClick={() => void reconcile()}
                  >
                    Refresh invitations
                  </button>
                </div>
                {inviteError ? (
                  <div role="alert">
                    <p>{inviteError}</p>
                    <button
                      className="secondary-action"
                      disabled={busy}
                      onClick={() => void reconcile()}
                    >
                      Try again
                    </button>
                  </div>
                ) : invitations === null ? (
                  <p aria-busy="true">Loading invitations…</p>
                ) : pending.length ? (
                  pending.map((item) => (
                    <article key={item.id} className="team-invitation">
                      <div>
                        <strong>{item.intendedEmail}</strong>
                        <span className="team-role">{roleName(item.role)}</span>
                        <p>Created {formatDate(item.createdAt)}</p>
                        <p>
                          Expires {formatDate(item.expiresAt)} ·{" "}
                          {context.timeZone}
                        </p>
                        <small>Pending acceptance · Single use</small>
                        <p>{deliveryLabel(item.emailStatus)}</p>
                        {item.deliveryMethod === "MANUAL" && (
                          <p>Email not requested · Share code manually</p>
                        )}
                      </div>
                      <button
                        className="secondary-action team-danger"
                        disabled={busy}
                        aria-label={`Revoke invitation for ${item.intendedEmail}`}
                        onClick={(event) => {
                          revokeTrigger.current = event.currentTarget;
                          setRevoke(item);
                          setRevokeError("");
                          dialog.current?.showModal();
                        }}
                      >
                        Revoke
                      </button>
                      <button
                        className="secondary-action"
                        disabled={busy}
                        aria-label={`View code for ${item.intendedEmail}`}
                        onClick={(event) => {
                          codeTrigger.current = event.currentTarget;
                          setCodeInvitation(item);
                          setVisibleCode("");
                          setCodeError("");
                          setCodeNotice("");
                          codeDialog.current?.showModal();
                        }}
                      >
                        View code
                      </button>
                      <button
                        className="secondary-action"
                        disabled={busy || uncertain}
                        onClick={(event) => {
                          replacementTrigger.current = event.currentTarget;
                          setReplacement(item);
                          replacementDialog.current?.showModal();
                        }}
                      >
                        Replace invitation
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="team-empty">
                    <h3>
                      {members.length === 1
                        ? "Planning is better together"
                        : "No pending invitations"}
                    </h3>
                    <p>
                      {members.length === 1
                        ? "Invite a trusted family member to help plan your celebration."
                        : "Existing team members can keep planning."}
                    </p>
                    <button
                      className="secondary-action"
                      onClick={() => emailInput.current?.focus()}
                    >
                      Invite a team member
                    </button>
                  </div>
                )}
                <p className="team-note">
                  An invitation becomes a member only after it is accepted.
                </p>
              </section>
            ) : (
              <section className="team-panel">
                <h2>Plan together</h2>
                <p>
                  Only administrators can invite team members. Your shared
                  planning tools remain available.
                </p>
              </section>
            )}
          </div>
          {context.userRole === "ADMIN" && (
            <aside>
              <form
                className="team-panel team-form"
                onSubmit={reviewEmail}
                noValidate
                aria-busy={busy}
              >
                <h2>Invite a team member</h2>
                <p>
                  Share a private code manually or send a personalized email.
                </p>
                <div className="wedding-field">
                  <label htmlFor="delivery-method">Invitation delivery</label>
                  <select
                    id="delivery-method"
                    value={deliveryMethod}
                    disabled={busy || uncertain}
                    onChange={(event) =>
                      setDeliveryMethod(
                        event.target.value as "MANUAL" | "EMAIL",
                      )
                    }
                  >
                    <option value="MANUAL">Share code manually</option>
                    <option value="EMAIL">Send email</option>
                  </select>
                  <small>
                    Manual codes work without email setup. The recipient must
                    sign in with the invited email.
                  </small>
                </div>
                <fieldset disabled={busy || uncertain}>
                  <legend>Member role</legend>
                  <label className="team-choice">
                    <input
                      type="radio"
                      name="role"
                      value="ORGANIZER"
                      checked={role === "ORGANIZER"}
                      onChange={() => setRole("ORGANIZER")}
                    />
                    <span>
                      <strong>Organizer</strong>
                      <small>Manage shared wedding plans and records.</small>
                    </span>
                  </label>
                  <label className="team-choice">
                    <input
                      type="radio"
                      name="role"
                      value="ADMIN"
                      checked={role === "ADMIN"}
                      onChange={() => setRole("ADMIN")}
                    />
                    <span>
                      <strong>Administrator</strong>
                      <small>Also manage team invitations.</small>
                    </span>
                  </label>
                  <div className="wedding-field">
                    <label htmlFor="invite-email">Recipient email *</label>
                    <input
                      ref={emailInput}
                      id="invite-email"
                      type="email"
                      name="intendedEmail"
                      required
                      value={email}
                      maxLength={254}
                      autoComplete="off"
                      aria-invalid={!!emailError}
                      aria-describedby={
                        emailError ? "invite-email-error" : "invite-email-help"
                      }
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailError("");
                        setFormError("");
                      }}
                    />
                    {emailError && (
                      <small id="invite-email-error" className="wedding-error">
                        {emailError}
                      </small>
                    )}
                    <small id="invite-email-help">
                      The recipient signs in before accepting. Email matching
                      alone does not grant wedding access.
                    </small>
                  </div>
                  <div className="wedding-field">
                    <label htmlFor="invite-expiry">
                      Invitation expires after
                    </label>
                    <select
                      id="invite-expiry"
                      value={expiry}
                      onChange={(event) => setExpiry(event.target.value)}
                    >
                      <option value="24">24 hours</option>
                      <option value="48">48 hours</option>
                      <option value="168">7 days</option>
                    </select>
                  </div>
                </fieldset>
                {formError && (
                  <p role="alert" className="wedding-error">
                    {formError}
                  </p>
                )}
                <button
                  ref={sendButton}
                  type="submit"
                  className="primary-action"
                  disabled={busy || uncertain}
                >
                  {busy
                    ? "Working…"
                    : deliveryMethod === "MANUAL"
                      ? "Generate invitation code"
                      : "Continue to email"}
                </button>
                {uncertain && (
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={busy}
                    onClick={() => void reconcile()}
                  >
                    Refresh invitations before retrying
                  </button>
                )}
                <p className="team-note">
                  {deliveryMethod === "MANUAL"
                    ? "Manual codes work without email. Share only with the intended recipient."
                    : "Personalize the email before sending."}{" "}
                  A replacement invalidates the previous code for this recipient
                  in this wedding.
                </p>
              </form>
            </aside>
          )}
        </div>
        {notice && (
          <p role="status" className="team-notice">
            {notice}
          </p>
        )}
        <dialog
          ref={composer}
          className="team-dialog team-composer"
          aria-labelledby="compose-title"
          onCancel={(event) => {
            event.preventDefault();
            closeComposer();
          }}
        >
          <form onSubmit={send} noValidate aria-busy={busy}>
            <h2 id="compose-title">Personalize your invitation</h2>
            <p>
              {email} · {roleName(role)} ·{" "}
              {expiry === "168" ? "7 days" : `${expiry} hours`}
            </p>
            <div className="wedding-field">
              <label htmlFor="email-subject">Subject</label>
              <input
                id="email-subject"
                autoFocus
                required
                maxLength={160}
                value={subject}
                disabled={busy || uncertain}
                onChange={(event) => {
                  setSubject(event.target.value);
                  setComposeError("");
                }}
              />
            </div>
            <div className="wedding-field">
              <label htmlFor="email-message">Message</label>
              <textarea
                id="email-message"
                required
                rows={8}
                maxLength={4000}
                value={message}
                disabled={busy || uncertain}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setComposeError("");
                }}
              />
            </div>
            <p className="team-note">
              Your secure single-use code, expiry and acceptance instructions
              are added automatically. They cannot be removed. Sending a
              replacement invalidates the old code.
            </p>
            {(composeError || formError) && (
              <p className="wedding-error" role="alert">
                {composeError || formError}
              </p>
            )}
            <div className="team-result-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={busy}
                onClick={closeComposer}
              >
                Cancel
              </button>
              <button
                className="primary-action"
                type="submit"
                disabled={busy || uncertain}
              >
                {busy ? "Sending…" : "Send invitation"}
              </button>
            </div>
            {uncertain && (
              <button
                type="button"
                className="secondary-action"
                disabled={busy}
                onClick={() => void reconcile()}
              >
                Refresh invitations before retrying
              </button>
            )}
          </form>
        </dialog>
        <dialog
          ref={memberDialog}
          className="team-dialog"
          aria-labelledby="member-action-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) closeMember();
          }}
        >
          <h2 id="member-action-title">
            {memberAction?.remove ? "Remove access?" : "Change team role"}
          </h2>
          <p>
            {memberAction?.member.displayName} · {memberAction?.member.email}
          </p>
          <p>
            {memberAction?.remove
              ? "Access to this wedding will be removed. Other weddings and their contributions remain."
              : "Administrators manage membership; organizers manage shared wedding plans. Their other wedding roles remain unchanged."}
          </p>
          {!memberAction?.remove && (
            <div className="wedding-field">
              <label htmlFor="member-role">Role</label>
              <select
                id="member-role"
                value={memberRole}
                disabled={busy}
                onChange={(event) =>
                  setMemberRole(event.target.value as "ADMIN" | "ORGANIZER")
                }
              >
                <option value="ORGANIZER">Organizer</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>
          )}
          {memberError && (
            <p role="alert" className="wedding-error">
              {memberError}
            </p>
          )}
          <div className="team-result-actions">
            <button
              autoFocus
              className="secondary-action"
              disabled={busy}
              onClick={closeMember}
            >
              Cancel
            </button>
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => void saveMember()}
            >
              {busy
                ? "Saving…"
                : memberAction?.remove
                  ? "Remove access"
                  : "Save role"}
            </button>
          </div>
        </dialog>
        <dialog
          ref={replacementDialog}
          className="team-dialog"
          aria-labelledby="replace-title"
          onCancel={(event) => {
            event.preventDefault();
            replacementDialog.current?.close();
            replacementTrigger.current?.focus();
          }}
        >
          <h2 id="replace-title">Replace this invitation?</h2>
          <p>{replacement?.intendedEmail}</p>
          <p>
            If the replacement succeeds, the previous code stops working. The
            recipient will need the new code. Existing wedding members and other
            weddings are unaffected.
          </p>
          <div className="team-result-actions">
            <button
              className="secondary-action"
              autoFocus
              onClick={() => {
                replacementDialog.current?.close();
                replacementTrigger.current?.focus();
              }}
            >
              Cancel
            </button>
            <button
              className="primary-action"
              onClick={() => {
                replacementDialog.current?.close();
                if (replacement) reviewEmail(undefined, replacement);
              }}
            >
              Continue with replacement
            </button>
          </div>
        </dialog>
        <dialog
          ref={codeDialog}
          className="team-dialog"
          aria-labelledby="code-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) closeCode();
          }}
        >
          <h2 id="code-title">Private invitation code</h2>
          <p>
            {codeInvitation?.intendedEmail} ·{" "}
            {roleName(codeInvitation?.role ?? "ORGANIZER")}
          </p>
          <p>
            {codeInvitation
              ? `Expires ${formatDate(codeInvitation.expiresAt)}`
              : ""}
          </p>
          <p className="team-note">
            Share only with this recipient. Showing/copying does not consume or
            extend the code. It hides after one minute or when you leave this
            tab.
          </p>
          <div className="wedding-field">
            <label htmlFor="private-code">Single-use code</label>
            <input
              ref={codeInput}
              id="private-code"
              value={visibleCode || "••••••••••••"}
              readOnly
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {codeError && (
            <p className="wedding-error" role="alert">
              {codeError}
            </p>
          )}
          {codeNotice && <p role="status">{codeNotice}</p>}
          <div className="team-result-actions">
            <button
              className="secondary-action"
              disabled={busy}
              autoFocus
              onClick={closeCode}
            >
              Close
            </button>
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => {
                if (visibleCode) {
                  setVisibleCode("");
                  setCodeNotice("Code hidden.");
                } else void revealCode();
              }}
            >
              {busy ? "Loading…" : visibleCode ? "Hide code" : "Show code"}
            </button>
            <button
              className="secondary-action"
              disabled={!visibleCode || busy}
              onClick={() => void copyCode()}
            >
              Copy code
            </button>
          </div>
        </dialog>
        <dialog
          ref={dialog}
          className="team-dialog"
          aria-labelledby="revoke-title"
          aria-describedby="revoke-description"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) closeRevoke();
          }}
        >
          <h2 id="revoke-title">Revoke invitation?</h2>
          <p id="revoke-description">
            This invitation can no longer be accepted after revocation.{" "}
            {revoke
              ? `${roleName(revoke.role)} invitation for ${revoke.intendedEmail}.`
              : ""}
          </p>
          {revokeError && (
            <p role="alert" className="wedding-error">
              {revokeError}
            </p>
          )}
          <div className="team-result-actions">
            <button
              autoFocus
              className="secondary-action"
              disabled={busy}
              onClick={closeRevoke}
            >
              Cancel
            </button>
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => void confirmRevoke()}
            >
              {busy ? "Revoking…" : "Revoke invitation"}
            </button>
          </div>
        </dialog>
      </div>
    </main>
  );
}
