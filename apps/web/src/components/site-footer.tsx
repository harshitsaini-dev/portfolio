import { Container } from "@/components/ui/container";
import { type } from "@/components/ui/typography";

interface SiteFooterProps {
  siteName: string;
  note: string;
}

export function SiteFooter({ siteName, note }: SiteFooterProps) {
  return (
    <footer className="border-t border-subtle py-12">
      <Container className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={`max-w-2xl ${type.fine}`}>{note}</p>
        <p className="text-sm font-semibold tracking-tight text-fg">
          {siteName}
        </p>
      </Container>
    </footer>
  );
}
