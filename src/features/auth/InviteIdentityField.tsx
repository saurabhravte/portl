import { Field } from "@/components/ui";
import { AuthMethodPicker } from "@/features/auth/AuthMethodPicker";
import type { IdentityType } from "@/features/auth/identity";

export function InviteIdentityField({
  type,
  value,
  onTypeChange,
  onValueChange,
  disabled,
}: {
  type: IdentityType;
  value: string;
  onTypeChange: (type: IdentityType) => void;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <AuthMethodPicker
        value={type}
        onChange={onTypeChange}
        disabled={disabled}
      />
      <Field
        label={type === "phone" ? "Phone number" : "Email"}
        value={value}
        onChangeText={onValueChange}
        editable={!disabled}
        autoCapitalize="none"
        keyboardType={type === "phone" ? "phone-pad" : "email-address"}
        textContentType={type === "phone" ? "telephoneNumber" : "emailAddress"}
        placeholder={type === "phone" ? "+91 98765 43210" : "name@example.com"}
      />
    </>
  );
}
