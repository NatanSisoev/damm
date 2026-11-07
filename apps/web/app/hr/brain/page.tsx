import { hrBrain } from "@/lib/hr-engine";
import { PageHeader } from "../ui";
import { BrainConsole } from "./brain-console";

export const metadata = { title: "Cervell · Com decideix el motor" };
export const dynamic = "force-dynamic";

export default function BrainPage() {
  const brain = hrBrain();
  return (
    <>
      <PageHeader
        title="Cervell"
        subtitle="Com decideix el motor què pregunta, a qui i quan. Mira els números en què es basa, canvia'n els paràmetres i prova'n l'efecte abans de desar res."
      />
      <BrainConsole initial={brain} />
    </>
  );
}
