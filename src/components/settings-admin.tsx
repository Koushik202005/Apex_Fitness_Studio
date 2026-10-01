import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, ImagePlus, Loader2, Mail, Save, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGymSettings, saveGymSettings } from "@/lib/gym.functions";
import { CURRENCIES, GYM_COUNTRIES, type CountryCode, type CurrencyCode } from "@/lib/currency";
import { beginGmailOAuth, disconnectGmailOAuth, getGmailOAuthSettings } from "@/lib/gym.functions";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const THEMES = [
  { id: "forge-green", name: "Green", color: "#8bdd20", foreground: "#17200b" },
  { id: "ocean-blue", name: "Ocean Blue", color: "#2875d6", foreground: "#ffffff" },
  { id: "ember-orange", name: "Ember Orange", color: "#d88720", foreground: "#251603" },
  { id: "violet", name: "Violet", color: "#8052cf", foreground: "#ffffff" },
  { id: "rose", name: "Rose", color: "#d33b65", foreground: "#ffffff" },
] as const;
type ThemeId = (typeof THEMES)[number]["id"];

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the logo file."));
    reader.onerror = () => reject(new Error("Could not read the logo file."));
    reader.readAsDataURL(file);
  });
}

export function SettingsAdmin() {
  const queryClient = useQueryClient();
  const loadSettings = useServerFn(getGymSettings);
  const saveSettings = useServerFn(saveGymSettings);
  const settings = useQuery({ queryKey: ["gym-settings"], queryFn: () => loadSettings() });
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [clearLogo, setClearLogo] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>("forge-green");
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>("INR");
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>("IN");
  const [selectedGateway, setSelectedGateway] = useState<"razorpay" | "stripe">("razorpay");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const savedTheme = THEMES.find((theme) => theme.id === settings.data?.color_theme);
    if (savedTheme) setSelectedTheme(savedTheme.id);
  }, [settings.data?.color_theme]);

  useEffect(() => {
    const savedCurrency = CURRENCIES.find((currency) => currency.code === settings.data?.currency);
    if (savedCurrency) setSelectedCurrency(savedCurrency.code);
  }, [settings.data?.currency]);

  useEffect(() => {
    const savedCountry = GYM_COUNTRIES.find((country) => country.code === settings.data?.country_code);
    if (savedCountry) setSelectedCountry(savedCountry.code);
    if (settings.data?.payment_gateway === "stripe" || settings.data?.payment_gateway === "razorpay") {
      setSelectedGateway(settings.data.payment_gateway);
    }
  }, [settings.data?.country_code, settings.data?.payment_gateway]);

  async function pickLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    setMessage("");
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError("The logo must be smaller than 2 MB.");
      return;
    }
    try {
      setLogoDataUrl(await readAsDataUrl(file));
      setClearLogo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the logo file.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveSettings({
        data: {
          gym_name: String(form.get("gymName")),
          app_title: String(form.get("appTitle")),
          color_theme: selectedTheme,
          currency: selectedCurrency,
          country_code: selectedCountry,
          payment_gateway: selectedGateway,
          ...(logoDataUrl ? { logoDataUrl } : {}),
          clearLogo,
        },
      });
      setLogoDataUrl("");
      setClearLogo(false);
      setMessage("Branding settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["gym-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["gym-branding"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  const previewUrl = clearLogo ? "" : logoDataUrl || settings.data?.logo_url || "";

  if (settings.isLoading) {
    return <section className="panel flex min-h-64 items-center justify-center p-6"><Loader2 className="animate-spin text-primary" size={22}/><span className="ml-3 text-sm text-muted-foreground">Loading gym settings…</span></section>;
  }

  if (settings.isError || !settings.data) {
    return <section className="panel p-6"><h2 className="section-title">Gym branding</h2><p className="mt-3 text-sm text-destructive">{settings.error instanceof Error ? settings.error.message : "Could not load gym settings."}</p></section>;
  }

  return <section className="panel max-w-4xl p-5 md:p-7">
    <div className="mb-6 border-b border-border pb-5">
      <h2 className="section-title">Gym branding</h2>
      <p className="section-subtitle">Update the name, logo, browser tab title, colors, and currency presentation used throughout the web app.</p>
    </div>

    <form key={`${settings.data.gym_name}:${settings.data.app_title}:${settings.data.logo_url ?? ""}:${settings.data.color_theme}:${settings.data.currency}:${settings.data.country_code}:${settings.data.payment_gateway}`} onSubmit={submit} className="space-y-6">
      <label className="block">
        <span className="form-label">Gym name</span>
        <input name="gymName" required minLength={2} maxLength={100} defaultValue={settings.data.gym_name} className="form-input" />
        <span className="mt-1 block text-xs text-muted-foreground">Shown in the admin and member app navigation.</span>
      </label>

      <div>
        <span className="form-label">Gym logo</span>
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/30 p-4">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-card">
            {previewUrl ? <img src={previewUrl} alt="Gym logo preview" className="size-full object-contain" /> : <span className="text-center text-[8px] font-extrabold leading-tight text-primary">GYM<br/>MANAGER</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-accent">
              <ImagePlus size={16}/>{previewUrl ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pickLogo} />
            </label>
            {previewUrl && <Button type="button" variant="outline" onClick={() => { setLogoDataUrl(""); setClearLogo(true); }}><Trash2 size={15}/>Remove logo</Button>}
          </div>
          <p className="w-full text-xs text-muted-foreground">PNG, JPG, or WebP. Maximum file size: 2 MB.</p>
        </div>
      </div>

      <fieldset>
        <legend className="form-label">Color theme</legend>
        <p className="mb-3 text-xs text-muted-foreground">Choose the accent colors used across the admin and member app. Changes apply after you save.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Color theme">
          {THEMES.map((theme) => <label key={theme.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${selectedTheme === theme.id ? "border-primary bg-secondary" : "border-border hover:bg-muted/50"}`}>
            <input type="radio" name="colorTheme" value={theme.id} checked={selectedTheme === theme.id} onChange={() => setSelectedTheme(theme.id)} className="peer sr-only" />
            <span className="grid size-9 shrink-0 place-items-center rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-ring" style={{ backgroundColor: theme.color, color: theme.foreground }}><span className="text-sm font-bold">A</span></span>
            <span><span className="block text-sm font-semibold">{theme.name}</span><span className="mt-1 flex gap-1" aria-hidden="true">{[theme.color, theme.foreground, "var(--secondary)"].map((color, index) => <span key={index} className="size-3 rounded-full border border-border/70" style={{ backgroundColor: color }} />)}</span></span>
          </label>)}
        </div>
      </fieldset>

      <label className="block max-w-md">
        <span className="form-label">Gym country</span>
        <select name="country" value={selectedCountry} onChange={(event) => {
          const country = GYM_COUNTRIES.find((item) => item.code === event.target.value);
          if (!country) return;
          setSelectedCountry(country.code);
          setSelectedCurrency(country.currency);
          if (country.code !== "IN" && selectedGateway === "razorpay") setSelectedGateway("stripe");
          if (country.code === "IN" && selectedGateway === "razorpay") setSelectedCurrency("INR");
        }} className="form-input">
          {GYM_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
        </select>
      </label>

      <label className="block max-w-md">
        <span className="form-label">Billing currency</span>
        <select name="currency" value={selectedCurrency} onChange={(event) => setSelectedCurrency(event.target.value as CurrencyCode)} disabled={selectedGateway === "razorpay"} className="form-input">
          {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.name} ({currency.code})</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">New plan prices, coupons, and payments use this currency. Changing it reinterprets existing numeric plan and flat-coupon values without converting them; review prices before switching. Historical payments keep their recorded currency.</span>
      </label>

      <label className="block max-w-md">
        <span className="form-label">Member payment gateway</span>
        <select name="paymentGateway" value={selectedGateway} onChange={(event) => {
          const gateway = event.target.value as "razorpay" | "stripe";
          setSelectedGateway(gateway);
          if (gateway === "razorpay") setSelectedCurrency("INR");
        }} className="form-input">
          <option value="razorpay" disabled={selectedCountry !== "IN"}>Razorpay{selectedCountry === "IN" ? " (recommended for India)" : " (India only; select Stripe outside India)"}</option>
          <option value="stripe">Stripe</option>
        </select>
        {selectedGateway === "stripe" && <span className="mt-1 block text-xs text-muted-foreground">Configure STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and APP_URL in the server environment. Register {"/api/stripe-webhook"} in Stripe for checkout.session.completed and checkout.session.async_payment_succeeded events.</span>}
      </label>

      <label className="block">
        <span className="form-label">Web app title</span>
        <input name="appTitle" required minLength={2} maxLength={100} defaultValue={settings.data.app_title} className="form-input" />
        <span className="mt-1 block text-xs text-muted-foreground">Shown as the browser tab title when an app page is open.</span>
      </label>

      {(error || message) && <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-destructive" : "text-success"}`}>{error || message}</p>}
      <div className="flex justify-end border-t border-border pt-5">
        <Button disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}Save settings</Button>
      </div>
    </form>
    <GmailOAuthSettings />
  </section>;
}

function GmailOAuthSettings() {
  const queryClient = useQueryClient();
  const loadOAuthSettings = useServerFn(getGmailOAuthSettings);
  const beginOAuth = useServerFn(beginGmailOAuth);
  const disconnect = useServerFn(disconnectGmailOAuth);
  const oauthSettings = useQuery({ queryKey: ["gmail-oauth-settings"], queryFn: () => loadOAuthSettings() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("gmailOAuth");
    if (!outcome) return;
    const notices: Record<string, string> = {
      connected: "Gmail connected. Renewal reminders can now be sent from this account.",
      denied: "Google authorization was cancelled. Any previous Gmail connection is unchanged.",
      invalid: "The authorization request was invalid or expired. Start again from Settings.",
      admin_required: "The administrator account could not be confirmed. Sign in again and retry.",
      setup_missing: "OAuth settings were removed before authorization completed. Start again from Settings.",
      exchange_failed: "Google could not exchange the authorization code. Check the OAuth client and callback URL, then retry.",
      scope_missing: "Gmail send permission was not granted. Reconnect and allow the requested permission.",
      email_missing: "Google did not return a verified sender email. Reconnect with a Gmail account.",
      refresh_missing: "Google did not issue an offline refresh token. Reconnect and approve access again.",
      failed: "Gmail could not be connected. Verify Google Cloud OAuth setup and retry.",
    };
    if (outcome === "connected") void queryClient.invalidateQueries({ queryKey: ["gmail-oauth-settings"] });
    setNotice(notices[outcome] || "Gmail OAuth setup finished.");
    const url = new URL(window.location.href);
    url.searchParams.delete("gmailOAuth");
    window.history.replaceState({}, "", url.toString());
  }, [queryClient]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await beginOAuth({ data: { clientId: String(form.get("gmailClientId") || ""), clientSecret: String(form.get("gmailClientSecret") || "") } });
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Gmail authorization.");
      setBusy(false);
    }
  }

  async function disconnectAccount() {
    setBusy(true); setError(""); setNotice("");
    try {
      await disconnect();
      await queryClient.invalidateQueries({ queryKey: ["gmail-oauth-settings"] });
      setNotice("Gmail disconnected. Renewal reminders will remain unsent until an account is connected again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Gmail.");
    } finally { setBusy(false); }
  }

  if (oauthSettings.isLoading) return <div className="mt-8 flex items-center gap-3 border-t border-border pt-6 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={17}/>Loading reminder email settings…</div>;
  if (oauthSettings.isError || !oauthSettings.data) return <div className="mt-8 border-t border-border pt-6"><h3 className="font-semibold">Reminder email sender</h3><p className="mt-2 text-sm text-destructive">{oauthSettings.error instanceof Error ? oauthSettings.error.message : "Could not load Gmail OAuth settings."}</p></div>;

  const current = oauthSettings.data;
  return <div className="mt-8 border-t border-border pt-6">
    <div className="mb-5 flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Mail size={19}/></span>
      <div><h3 className="font-display text-lg font-bold">Membership reminder email</h3><p className="mt-1 text-sm text-muted-foreground">Connect the Gmail account that should send scheduled and manual membership renewal reminders.</p></div>
    </div>
    {current.configured ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-success/30 bg-success-soft px-4 py-3">
      <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="text-success" size={17}/><span><strong>{current.senderEmail}</strong> is connected</span></div>
      <Button type="button" variant="outline" disabled={busy} onClick={disconnectAccount}><Unplug size={15}/>Disconnect</Button>
    </div> : <p className="mb-4 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">No Gmail account is connected. Automatic and manual renewal reminder emails are currently unavailable.</p>}
    <form key={`${current.clientId}:${current.configured}`} onSubmit={connect} className="space-y-4">
      <label className="block max-w-2xl"><span className="form-label">Google OAuth Web client ID</span><input name="gmailClientId" type="text" required maxLength={300} defaultValue={current.clientId} placeholder="...apps.googleusercontent.com" className="form-input" autoComplete="off"/><span className="mt-1 block text-xs text-muted-foreground">Create a Web application OAuth client in Google Cloud and enable the Gmail API.</span></label>
      <label className="block max-w-2xl"><span className="form-label">Google OAuth client secret</span><input name="gmailClientSecret" type="password" maxLength={500} required={!current.clientId} placeholder={current.clientId ? "Leave blank to keep the saved secret" : "Paste the client secret"} className="form-input" autoComplete="new-password"/><span className="mt-1 block text-xs text-muted-foreground">Enter the secret if changing the client ID. The secret and refresh token are encrypted and stored server-side, and are never returned to this page.</span></label>
      <div className="max-w-2xl rounded-md border border-border bg-muted/30 p-4">
        <p className="text-sm font-semibold">Authorized redirect URI</p>
        <code className="mt-2 block break-all text-xs text-foreground">{current.callbackUrl || "Loading callback URL…"}</code>
        <p className="mt-2 text-xs text-muted-foreground">Add this exact URL in Google Cloud Console under your OAuth client’s authorized redirect URIs. Google requires the redirect URI to match exactly.</p>
      </div>
      {(error || notice) && <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-destructive" : "text-success"}`}>{error || notice}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16}/> : <ExternalLink size={16}/>} {current.configured ? "Reconnect Gmail" : "Save credentials and connect Gmail"}</Button>
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:underline">Open Google Cloud credentials <ExternalLink className="inline" size={13}/></a>
      </div>
    </form>
  </div>;
}
