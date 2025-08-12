import { ClipData } from "../../Main/Timeline/Timeline";
import { EnhancedTimelineExample } from './EnhancedTimelineExample';

const clips: ClipData[] = [
  { id: "Clip 1", startFrame: 0, endFrame: 60, track: "A" },
  { id: "Clip 2", startFrame: 70, endFrame: 120, track: "B" },
  { id: "Clip 3", startFrame: 130, endFrame: 220, track: "C" }

];

export default function TimelineSample() {
  return (
    <div className="p-5">
      <EnhancedTimelineExample />
    </div>
  );
}
