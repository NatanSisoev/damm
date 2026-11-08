import { EmployeePageSkeleton } from "@/app/(employee)/components/page-skeleton";

/** Shown while this employee page renders on the server. */
export default function Loading() {
  return <EmployeePageSkeleton />;
}
