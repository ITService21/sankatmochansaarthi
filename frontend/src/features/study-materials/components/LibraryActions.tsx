import { CheckCircle2, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { AppButton, ErrorState } from "../../../shared/components";
import { useMutation } from "../../../shared/hooks/useMutation";
import { Material } from "../../../shared/types";
import { materialsApi } from "../api/study-materials.api";

/**
 * "Download" = add the note to My Downloads (an in-app library). Nothing is saved to the device; the note can only
 * be read inside the secure viewer. Shows "In My Downloads" once added.
 */
export function AddToDownloadsButton({ m, onChanged, size = "md" }: { m: Material; onChanged: () => void; size?: "sm" | "md" }) {
  const add = useMutation(async () => { await materialsApi.addDownload(m.id); onChanged(); });
  if (m.access.is_downloaded) {
    return <Link to="/downloads"><AppButton size={size} variant="secondary" className="!border-emerald-300 !bg-emerald-50 !text-emerald-800"><CheckCircle2 size={16} />In My Downloads</AppButton></Link>;
  }
  return (
    <div>
      <AppButton size={size} loading={add.loading} onClick={() => void add.run()} title="Saved inside the app — files can't be saved to your device"><Download size={16} />Download</AppButton>
      {add.error != null && <div className="mt-2"><ErrorState error={add.error} /></div>}
    </div>
  );
}
