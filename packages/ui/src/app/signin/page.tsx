import { AuthError } from "next-auth";
import { signIn, auth, devLoginEnabled, DEV_LOGIN_PROVIDER_ID } from "@/auth";
import { redirect } from "next/navigation";

type SearchParams = Promise<{ callbackUrl?: string; error?: string }>;

// Only same-origin paths allowed — a leading `/` followed by anything other
// than another `/` (which would be protocol-relative, e.g. `//evil.com`).
function safeCallbackUrl(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { callbackUrl, error } = await searchParams;
  const safeDest = safeCallbackUrl(callbackUrl);

  // If already signed in, bounce straight to the destination.
  const session = await auth();
  if (session?.user) {
    redirect(safeDest);
  }

  const errorMessage = error ? describeError(error) : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface/60 p-8 shadow-xl">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Open Executive</h1>
        <p className="mt-2 text-sm text-fg-muted">Sign in to continue.</p>

        {errorMessage && (
          <p className="mt-4 rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: safeDest });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 transition"
          >
            Sign in with Google
          </button>
        </form>

        {devLoginEnabled && (
          <>
            <div className="mt-6 flex items-center gap-3 text-xs text-fg-muted">
              <span className="h-px flex-1 bg-line" />
              local dev
              <span className="h-px flex-1 bg-line" />
            </div>
            <form
              action={async (formData: FormData) => {
                "use server";
                // Belt-and-suspenders: this action's reference is still
                // registered in a production bundle even though the form is
                // never rendered. Bail before touching NextAuth.
                if (!devLoginEnabled) return;
                const email = String(formData.get("email") ?? "");
                try {
                  await signIn(DEV_LOGIN_PROVIDER_ID, { email, redirectTo: safeDest });
                } catch (err) {
                  // Called from a server action, `signIn` THROWS on a failed
                  // `authorize` instead of redirecting. Turn it into the same
                  // `/signin?error=` redirect the Google flow uses. Anything
                  // else (notably the NEXT_REDIRECT thrown on success) must
                  // propagate.
                  if (err instanceof AuthError) {
                    redirect(
                      `/signin?error=${err.type}&callbackUrl=${encodeURIComponent(safeDest)}`,
                    );
                  }
                  throw err;
                }
              }}
              className="mt-4 space-y-2"
            >
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-fg-muted"
              />
              <button
                type="submit"
                className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface transition"
              >
                Dev login (no password)
              </button>
            </form>
            <p className="mt-2 text-xs text-fg-muted">
              Any address on the allow-list. Disabled unless{" "}
              <code>AUTH_DEV_LOGIN=true</code> and not production.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function describeError(code: string): string {
  switch (code) {
    case "AccessDenied":
      return "Your Google account is not on the allow-list for this workspace. Ask an admin to add you.";
    case "CredentialsSignin":
      // Only reachable via the local dev-login provider (Credentials, gated
      // to non-production), so naming the cause here can't leak roster
      // membership on a real deployment — and it saves a confused dev.
      return "That email isn't allowed. Add it to ALLOWED_EMAILS in your repo-root .env (or the People roster), then restart the dev server.";
    case "Configuration":
      return "Authentication is misconfigured. Contact the administrator.";
    default:
      return "Sign-in failed. Try again, or contact the administrator if this keeps happening.";
  }
}
