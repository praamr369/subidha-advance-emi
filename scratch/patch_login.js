const fs = require('fs');
const file = 'frontend/src/app/(auth)/login/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add mfaRequired and mfaCode state
content = content.replace(
    'const [error, setError] = useState<string | null>(null);',
    'const [error, setError] = useState<string | null>(null);\n  const [mfaRequired, setMfaRequired] = useState(false);\n  const [mfaCode, setMfaCode] = useState("");'
);

// Update handleSubmit
content = content.replace(
    '        identifier: identifier.trim(),\n        password,\n      });',
    '        identifier: identifier.trim(),\n        password,\n        mfa_code: mfaRequired ? mfaCode : undefined,\n      });'
);

content = content.replace(
    '    } catch (err) {\n      setError(toMessage(err));',
    '    } catch (err) {\n      const msg = toMessage(err);\n      if (msg === "MFA code is required.") {\n        setMfaRequired(true);\n        setError(null);\n      } else {\n        setError(msg);\n      }'
);

// Add MFA Input UI
content = content.replace(
    '        <div className="space-y-2">',
    `        {mfaRequired ? (
          <div className="space-y-2">
            <label htmlFor="mfaCode" className="text-sm font-medium text-foreground">
              Authenticator Code (MFA)
            </label>
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="mfaCode"
                name="mfaCode"
                type="text"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="6-digit code"
                className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                required
                disabled={submitting}
              />
            </div>
          </div>
        ) : (
          <>
        <div className="space-y-2">`
);

content = content.replace(
    '        {error ? (',
    `          </>\n        )}\n\n        {error ? (`
);

fs.writeFileSync(file, content);
