interface SiteFooterProps {
  siteName: string;
  note: string;
}

export function SiteFooter({ siteName, note }: SiteFooterProps) {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 text-sm text-muted sm:px-6 lg:px-8">
        <p>{note}</p>
        <p>{siteName}</p>
      </div>
    </footer>
  );
}
