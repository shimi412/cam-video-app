import { withAccess } from "@/lib/access";
import { availableLocalVoices } from "@/lib/concept/local-voice";
import { LOCAL_VOICES } from "@/lib/concept/preview-inputs";
import { isSimulation } from "@/lib/providers/mode";

async function handleGET() {
  return Response.json({ imports: isSimulation(), voices: (await availableLocalVoices()).map((id) => ({ id, label: LOCAL_VOICES[id].label })) });
}

export const GET = withAccess(handleGET);
