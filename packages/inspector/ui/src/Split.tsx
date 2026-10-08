import type { ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { layoutStorage } from "./layout";

/**
 * `main` over an optional `detail`, with a draggable divider whose position is
 * remembered. `main` stays mounted when `detail` comes and goes, so it keeps its scroll.
 */
export function Split({ id, main, detail }: { id: string; main: ReactNode; detail: ReactNode }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `wolder-inspector:${id}`,
    panelIds: detail ? ["main", "detail"] : ["main"],
    storage: layoutStorage,
  });
  return (
    <Group orientation="vertical" className="split" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      <Panel id="main" minSize={72}>
        {main}
      </Panel>
      {detail && (
        <>
          <Separator className="divider row" />
          <Panel id="detail" minSize={120} defaultSize="60%">
            {detail}
          </Panel>
        </>
      )}
    </Group>
  );
}
