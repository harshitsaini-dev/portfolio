import { FormLoading } from "@/components/loading/collection-loading";

/** Shown while this route's server component reads D1. See the list route. */
export default function Loading() {
  return <FormLoading fields={7} />;
}
