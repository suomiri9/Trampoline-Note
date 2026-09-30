import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { api } from "@shared/routes";
import type { ExecutionSession, TofSession } from "@shared/schema";
import { useRoutines } from "@/hooks/use-routines";
import { useSkills } from "@/hooks/use-skills";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { PageLayout } from "@/components/page-layout";
import { TrackerComparison } from "@/components/tracker-comparison";
import { Button } from "@/components/ui/button";

export default function TrackerComparePage() {
  const [location] = useLocation();
  const tracker = location.startsWith("/execution") ? "execution" : "tof";
  const {
    data: routines,
    isLoading: routinesLoading,
    isError: routinesError,
    error: routinesFetchError,
    refetch: refetchRoutines,
  } = useRoutines();
  const {
    data: allSkills,
    isLoading: skillsLoading,
    isError: skillsError,
    error: skillsFetchError,
    refetch: refetchSkills,
  } = useSkills();
  const tofQuery = useQuery<TofSession[]>({
    queryKey: [api.tofSessions.list.path],
    enabled: tracker === "tof",
  });
  const executionQuery = useQuery<ExecutionSession[]>({
    queryKey: [api.executionSessions.list.path],
    enabled: tracker === "execution",
  });
  const { data: tofSessions, isLoading: tofLoading, isError: tofError, error: tofFetchError, refetch: refetchTof } = tofQuery;
  const {
    data: executionSessions,
    isLoading: executionLoading,
    isError: executionError,
    error: executionFetchError,
    refetch: refetchExecution,
  } = executionQuery;

  const loading =
    routinesLoading ||
    skillsLoading ||
    (tracker === "tof" ? tofLoading : executionLoading);
  const fetchError =
    routinesError
      ? routinesFetchError
      : skillsError
        ? skillsFetchError
        : tracker === "tof"
          ? tofError
            ? tofFetchError
            : null
          : executionError
            ? executionFetchError
            : null;

  const retry = () => {
    void Promise.all([
      refetchRoutines(),
      refetchSkills(),
      tracker === "tof" ? refetchTof() : refetchExecution(),
    ]);
  };

  if (loading) {
    return (
      <PageLayout accent={tracker}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--page-accent)/0.55)]" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout accent={tracker}>
      <PageHeader
        kicker={tracker === "tof" ? "Time of flight · compare" : "Execution · compare"}
        title="Compare graphs"
        accent="graphs"
        subtitle={
          tracker === "tof"
            ? "Overlay recorded attempts by jump position to compare time of flight."
            : "Overlay recorded attempts by jump position to compare execution deductions."
        }
        backLink={
          <BackLink
            to={tracker === "tof" ? "/tof" : "/execution"}
            label={tracker === "tof" ? "ToF Tracker" : "Execution Tracker"}
            testId={`button-back-${tracker}-compare`}
          />
        }
      />
      {fetchError ? (
        <div
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-12 text-center"
          role="alert"
          data-testid={`error-comparison-${tracker}`}
        >
          <h2 className="font-semibold">Couldn&apos;t load comparison data.</h2>
          <p className="text-sm text-muted-foreground/75 mt-1 max-w-md mx-auto">
            {fetchError instanceof Error ? fetchError.message : "The tracker data could not be loaded."}
          </p>
          <Button className="mt-5" onClick={retry} data-testid={`button-retry-comparison-${tracker}`}>
            Retry
          </Button>
        </div>
      ) : (
        <TrackerComparison
          tracker={tracker}
          sessions={tracker === "tof" ? tofSessions : executionSessions}
          routines={routines}
          allSkills={allSkills}
        />
      )}
    </PageLayout>
  );
}
