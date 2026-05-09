import ProcessTimeline from "@/components/public/ProcessTimeline";
import type { TimelineStep } from "@/components/public/ProcessTimeline";

type PublicProcessTimelineProps = {
  steps: TimelineStep[];
};

export default function PublicProcessTimeline({ steps }: PublicProcessTimelineProps) {
  return <ProcessTimeline steps={steps} />;
}
