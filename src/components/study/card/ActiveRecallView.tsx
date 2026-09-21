import type { ModeViewProps } from "./types";
import { useIsMobile } from "./shared";
import { DesktopActiveRecallView } from "./DesktopActiveRecallView";
import { MobileActiveRecallView } from "./MobileActiveRecallView";

export function ActiveRecallView(props: ModeViewProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileActiveRecallView {...props} /> : <DesktopActiveRecallView {...props} />;
}
