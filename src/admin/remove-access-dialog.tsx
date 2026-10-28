import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserMinusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { describeApiError } from "@/shared/api-error";
import { getNelcotaClient } from "@/shared/nelcota";

import { REMOVE_ACCESS_ERRORS } from "./admin-errors";
import { ADMIN_QUERY_KEY } from "./admin.queries";

interface RemoveAccessDialogProps {
  readonly userId: string;
  readonly personName: string;
}

/** Asks for confirmation, then unlinks the person from the organization. */
export function RemoveAccessDialog({ userId, personName }: RemoveAccessDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await getNelcotaClient().rpc("admin_unlink_user", { p_user_id: userId });
      if (error != null) {
        throw error;
      }
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success(`${personName} não tem mais acesso a esta empresa.`);
      await queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Remover acesso de ${personName}`}>
          <UserMinusIcon data-icon="inline-start" />
          Remover acesso
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeading
          title="Remover acesso"
          description={`${personName} deixa de ver esta empresa. O login continua existindo e pode ser vinculado de novo depois.`}
        />
        {remove.error != null && (
          <Alert variant="destructive">
            <AlertDescription>
              {describeApiError(remove.error, REMOVE_ACCESS_ERRORS)}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button className="h-11 rounded-xl px-5" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            className="h-11 rounded-xl px-5"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending && <Spinner data-icon="inline-start" />}
            Remover acesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
