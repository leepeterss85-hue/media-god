import React from "react";
import { base44 } from "@/api/base44Client";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { activeHouseholdProfileId } from "@/components/mg/householdProfiles";
import { createLibraryRestore } from "@/components/mg/catalogueFeedback";

export default function useLibraryUndo(entityName, setItems) {
  const { toast } = useToast();
  return (rows) => {
    if (!rows.length) return;
    const restore = createLibraryRestore(base44.entities[entityName], rows);
    const undo = async () => {
      const result = await restore();
      if (!result) return;
      const visible = result.restored.filter(row =>
        (row.profile_id || "main") === activeHouseholdProfileId());
      setItems(current => [...visible, ...current.filter(row =>
        !visible.some(item => item.id === row.id))]);
      toast(result.remaining ? {
        title: "Some titles could not be restored",
        description: "Check your connection and retry.",
        variant: "destructive",
        duration: 20000,
        action: <ToastAction altText="Retry restoring removed titles" onClick={undo} className="min-h-11">Retry</ToastAction>,
      } : { title: "Removal undone" });
    };
    toast({
      title: rows.length === 1 ? "Title removed" : `${rows.length} titles removed`,
      description: rows.length === 1 ? rows[0].title : "You can undo this removal.",
      duration: 15000,
      action: <ToastAction altText="Undo removal of saved titles" onClick={undo} className="min-h-11">Undo</ToastAction>,
    });
  };
}
