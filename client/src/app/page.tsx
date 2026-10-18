import { Blobs } from "@/components/atmosphere";
import { Meta } from "@/components/ui";

// People arrive through a personal link from their agent (/u/<id>); this is what anyone else sees.
export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col justify-end gap-6 overflow-hidden px-7 pb-16">
      <Blobs
        blobs={[
          { color: "ochre", x: "40%", y: "45%", size: 280, opacity: 0.7, blur: 50 },
          { color: "periwinkle", x: "85%", y: "60%", size: 200, opacity: 0.5, blur: 50 },
        ]}
      />
      <Meta className="relative">unif.ai</Meta>
      <h1 className="relative max-w-[280px] text-[24px] leading-9 font-light tracking-label">
        your agent meets people, so you don&apos;t have to start cold
      </h1>
      <p className="relative text-body font-light tracking-body text-ink-muted">
        Open the link your agent texted you to see how your group is coming together.
      </p>
    </main>
  );
}
