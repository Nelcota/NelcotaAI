import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MailCheckIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { getNelcotaClient } from "@/shared/nelcota";

import { describeAuthError } from "./auth-error";
import { signUpAccountSchema, type signUpCompanySchema } from "./auth.schemas";
import { refreshCurrentProfile } from "./current-profile.query";
import { registerOrganization } from "./register-organization";
import { SignUpAccountStep } from "./sign-up-account-step";
import { SignUpCompanyStep } from "./sign-up-company-step";
import { type SignUpStep, SignUpSteps } from "./sign-up-steps";

type AccountValues = z.input<typeof signUpAccountSchema>;
type CompanyValues = z.input<typeof signUpCompanySchema>;

// Errors about the e-mail or password are fixed on the first step, so the form goes back there.
const ACCOUNT_ERROR_CODES: ReadonlySet<string> = new Set([
  "user_already_exists",
  "invalid_email",
  "weak_password",
]);

/**
 * Self sign-up in two steps: the person's data, then the company. The account is created only
 * at the end. When Nelcota asks for e-mail confirmation first, the company details travel in
 * the user metadata and the customer finishes the registration after opening the link.
 */
export function SignUpForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<SignUpStep>("account");
  const [account, setAccount] = useState<AccountValues>({ name: "", email: "", password: "" });
  const [company, setCompany] = useState<CompanyValues>({ organizationName: "", document: "" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const stepContainer = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);

  // Keyboard and screen reader users land on the first input of the new step.
  useEffect(() => {
    if (previousStep.current === step) {
      return;
    }
    previousStep.current = step;
    stepContainer.current?.querySelector("input")?.focus();
  }, [step]);

  async function createAccount(companyDetails: z.output<typeof signUpCompanySchema>) {
    setErrorMessage(null);
    const accountDetails = signUpAccountSchema.parse(account);
    const { data, error } = await getNelcotaClient().auth.signUp({
      email: accountDetails.email,
      password: accountDetails.password,
      data: {
        name: accountDetails.name,
        organization_name: companyDetails.organizationName,
        document: companyDetails.document,
      },
    });
    if (error != null) {
      setErrorMessage(describeAuthError(error, "sign_up"));
      if (ACCOUNT_ERROR_CODES.has(error.code)) {
        setStep("account");
      }
      return;
    }
    if (data.session == null) {
      setConfirmationEmail(accountDetails.email);
      return;
    }
    // The login exists now, so a failure here is finished on the dashboard, which asks for
    // the company again with these details filled in.
    const registerError = await registerOrganization({
      name: accountDetails.name,
      ...companyDetails,
    });
    if (registerError != null) {
      toast.error(registerError);
    }
    await refreshCurrentProfile(queryClient);
    await navigate({ to: "/painel" });
  }

  if (confirmationEmail != null) {
    return <ConfirmationSent email={confirmationEmail} />;
  }

  return (
    <div className="flex flex-col gap-7">
      <SignUpSteps current={step} />
      {errorMessage != null && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      <div ref={stepContainer}>
        {step === "account" ? (
          <SignUpAccountStep
            initialValues={account}
            onContinue={(values) => {
              setErrorMessage(null);
              setAccount(values);
              setStep("company");
            }}
          />
        ) : (
          <SignUpCompanyStep
            initialValues={company}
            onBack={(values) => {
              setCompany(values);
              setStep("account");
            }}
            onSubmit={createAccount}
          />
        )}
      </div>
    </div>
  );
}

function ConfirmationSent({ email }: { readonly email: string }) {
  return (
    <div role="status" className="flex flex-col items-start gap-4">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-positive/15 text-positive">
        <MailCheckIcon aria-hidden="true" className="size-6" />
      </span>
      <p className="text-base">
        Enviamos um link de confirmação para <strong>{email}</strong>. Abra o link para concluir o
        cadastro da sua empresa.
      </p>
    </div>
  );
}
