import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-app min-h-screen w-full overflow-x-hidden text-foreground">
      <main id="main-content" tabIndex={-1}>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl items-stretch justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
