import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Fingerprint, Loader2, Nfc, Radio, ShieldAlert, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { checkInWithNfcCard, registerNfcMemberCard, revokeNfcMemberCard } from "@/lib/gym.functions";
import { scanMemberNfcToken, writeMemberNfcToken } from "@/lib/nfc-platform";
type MemberRow = { id: string; member_code: string; status: string; profiles: { display_name: string | null } | null };
type CredentialRow = { id: string; member_id: string; label: string | null; active: boolean; registered_at: string; members: { member_code: string; profiles: { display_name: string | null } | null } | null };

function makeCardToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function NfcAttendanceAdmin() {
  const queryClient = useQueryClient();
  const registerCard = useServerFn(registerNfcMemberCard);
  const revokeCard = useServerFn(revokeNfcMemberCard);
  const checkIn = useServerFn(checkInWithNfcCard);
  const [memberId, setMemberId] = useState("");
  const [label, setLabel] = useState("NFC card");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const members = useQuery({
    queryKey: ["nfc-admin-members"],
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from("members").select("id, member_code, status, profiles(display_name)").order("created_at", { ascending: false });
      if (queryError) throw new Error(queryError.message);
      return (data ?? []) as MemberRow[];
    },
  });
  const credentials = useQuery({
    queryKey: ["nfc-admin-credentials"],
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from("access_credentials")
        .select("id, member_id, label, active, registered_at, members(member_code, profiles(display_name))")
        .eq("credential_type", "nfc").order("registered_at", { ascending: false });
      if (queryError) throw new Error(queryError.message);
      return (data ?? []) as CredentialRow[];
    },
  });

  async function registerNfc() {
    if (!memberId) { setError("Choose a member first."); return; }
    setBusy("register"); setError(""); setMessage("");
    try {
      const token = makeCardToken();
      await writeMemberNfcToken(token);
      await registerCard({ data: { memberId, token, label: label.trim() || "NFC card" } });
      setMessage("NFC card registered. The member can tap it at the gym check-in station.");
      await queryClient.invalidateQueries({ queryKey: ["nfc-admin-credentials"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not register this NFC card.");
    } finally { setBusy(""); }
  }

  async function startScan() {
    setBusy("scan"); setError(""); setMessage("Follow the phone's NFC prompt, then hold the card near the phone to record today's attendance.");
    try {
      const token = await scanMemberNfcToken();
      const result = await checkIn({ data: { token } });
      if (result.decision === "granted") {
        setMessage(result.attendanceRecorded
          ? `Check-in recorded for ${result.memberName || result.memberCode || "member"}.`
          : `${result.memberName || result.memberCode || "Member"}: ${result.reason}`);
      } else setError(`${result.memberName || result.memberCode || "Check-in denied"}: ${result.reason}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the NFC scanner.");
    } finally { setBusy(""); }
  }

  async function revoke(id: string, memberName: string) {
    if (!window.confirm(`Revoke the NFC card for ${memberName}? The card will stop working immediately.`)) return;
    setBusy(`revoke:${id}`); setError(""); setMessage("");
    try {
      await revokeCard({ data: { credentialId: id } });
      setMessage("NFC card revoked.");
      await queryClient.invalidateQueries({ queryKey: ["nfc-admin-credentials"] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke the NFC card."); }
    finally { setBusy(""); }
  }

  const activeMembers = (members.data ?? []).filter((member) => member.status === "active");

  return <div className="space-y-5">
    <section className="panel p-5 md:p-7">
      <div className="mb-5 flex items-start gap-3 border-b border-border pb-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Nfc size={22}/></span>
        <div><h2 className="section-title">Member check-in credentials</h2><p className="section-subtitle">Register NFC cards and scan attendance from a supported NFC-enabled Android browser.</p></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <h3 className="flex items-center gap-2 font-semibold"><CreditCard size={17}/> Register an NFC card</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Select a member, then hold a writable NDEF-compatible NFC card/tag near the Android device when prompted. Registration replaces its current NDEF contents.</p>
          <label className="mt-4 block"><span className="form-label">Member</span><select className="form-input" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            <option value="">Select a member</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{member.profiles?.display_name || "Member"} · {member.member_code}</option>)}
          </select></label>
          <label className="mt-3 block"><span className="form-label">Card label</span><input className="form-input" maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Blue key fob"/></label>
          <Button className="mt-4 w-full" onClick={() => void registerNfc()} disabled={Boolean(busy) || !memberId}>{busy === "register" ? <Loader2 className="animate-spin" size={16}/> : <Nfc size={16}/>}Register card</Button>
          {!activeMembers.length && <p className="mt-2 text-xs text-warning">No active members are available to assign a card.</p>}
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Radio size={17}/> Daily attendance check-in</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Use a supported Android browser and NFC check-in station. A valid member card records one attendance check-in per gym-local day.</p>
          <div className="mt-6 flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 text-center">
            <Nfc size={27} className="text-primary"/>
            <p className="mt-2 text-sm font-medium">{busy === "scan" ? "Ready to scan a card…" : "Tap a member card to check in"}</p>
            {busy === "scan" ? <Button className="mt-3" variant="outline" disabled><Loader2 className="animate-spin" size={16}/>Waiting for card…</Button>
              : <Button className="mt-3" variant="outline" disabled={Boolean(busy)} onClick={() => void startScan()}><Nfc size={16}/>Start NFC scanner</Button>}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldAlert size={15} className="mt-0.5 shrink-0"/>Card contents are a bearer credential. Keep cards supervised; anyone holding a card can present it. Revoking a card disables it immediately.</p>
        </div>
      </div>

      {(error || message) && <p role={error ? "alert" : "status"} className={`mt-4 rounded-lg px-3 py-2 text-sm ${error ? "bg-destructive-soft text-destructive" : "bg-success-soft text-success"}`}>{error || message}</p>}

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="font-semibold">Registered NFC cards</h3>
        {credentials.isError && <p role="alert" className="mt-3 text-sm text-destructive">Could not load NFC credentials: {credentials.error.message}</p>}
        {credentials.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading cards…</p> : credentials.data?.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-y border-border bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Member</th><th className="px-3 py-2">Card</th><th className="px-3 py-2">Registered</th><th className="px-3 py-2">Status</th><th/></tr></thead><tbody className="divide-y divide-border">{credentials.data.map((credential) => {
          const name = credential.members?.profiles?.display_name || credential.members?.member_code || "Member";
          return <tr key={credential.id}><td className="px-3 py-3"><span className="inline-flex items-center gap-2"><UserRound size={15}/>{name}{credential.members?.member_code ? ` · ${credential.members.member_code}` : ""}</span></td><td className="px-3 py-3">{credential.label || "NFC card"}</td><td className="px-3 py-3 text-muted-foreground">{new Date(credential.registered_at).toLocaleDateString()}</td><td className="px-3 py-3"><span className={`status ${credential.active ? "status-active" : "status-muted"}`}>{credential.active ? "Active" : "Revoked"}</span></td><td className="px-3 py-3 text-right">{credential.active && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void revoke(credential.id, name)}>{busy === `revoke:${credential.id}` ? <Loader2 className="animate-spin" size={14}/> : <XCircle size={14}/>}Revoke</Button>}</td></tr>;
        })}</tbody></table></div> : <p className="mt-3 text-sm text-muted-foreground">No NFC cards have been registered.</p>}
      </div>
    </section>

    <section className="panel flex gap-3 p-4 text-sm text-muted-foreground"><Fingerprint size={18} className="mt-0.5 shrink-0 text-primary"/><p><b className="text-foreground">Fingerprint devices:</b> a normal web browser cannot enroll or read raw fingerprints. To use fingerprint check-in, connect a biometric terminal and use its supported SDK/API integration.</p></section>
  </div>;
}
