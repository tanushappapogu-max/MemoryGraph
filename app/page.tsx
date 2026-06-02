import GraphVisualization from "@/components/GraphVisualization";
import CallCapture from "@/components/CallCapture";
import LivePanel from "@/components/LivePanel";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      <div className="flex-1 relative">
        <GraphVisualization />
      </div>

      <div className="flex w-[560px] flex-shrink-0 flex-col border-l border-zinc-800/50 bg-zinc-950/90 backdrop-blur-xl">
        <div className="flex min-h-0 flex-[1.45] border-b border-zinc-800/50">
          <CallCapture />
        </div>
        <div className="min-h-0 flex-1">
          <LivePanel />
        </div>
      </div>
    </div>
  );
}
