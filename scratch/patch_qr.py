import sys

with open('frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """          <div className="flex shrink-0 items-center justify-center gap-3 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm sm:min-w-[200px]">
            <div className="rounded-xl bg-white p-2 shadow-sm">
              <QRCode value={typeof window !== "undefined" ? window.location.origin : "https://example.com"} size={64} />
            </div>
            <div className="text-sm">
              <p className="font-semibold text-foreground">Storefront QR</p>
              <p className="text-xs text-muted-foreground">Scan to visit</p>
            </div>
          </div>"""

replacement = "          <StorefrontQRWidget />"

target_crlf = target.replace('\n', '\r\n')
target_lf = target.replace('\r\n', '\n')

if target_crlf in content:
    print('Found CRLF')
    new_content = content.replace(target_crlf, replacement)
elif target_lf in content:
    print('Found LF')
    new_content = content.replace(target_lf, replacement)
else:
    print('Not found')
    sys.exit(1)

with open('frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('Replaced')
